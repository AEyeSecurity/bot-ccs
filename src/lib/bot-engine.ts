import crypto from "crypto";
import { insertConversationEvent } from "./api-helpers";
import { evaluateInboundTurn, getDocumentValidationRequestsForTurn } from "./bot-core";
import { validateDocumentMedia } from "./document-validation";
import { createAdminSupabaseClient } from "./supabase";
import { getPublishedCatalog } from "./catalog-store";
import { getServerEnv } from "./env";
import type {
  BotMessageDraft,
  CaseSnapshot,
  ConversationSnapshot,
  NormalizedInbound,
  PersistedCaseState,
} from "./bot-types";

export type { NormalizedInbound } from "./bot-types";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

const inboundQueues = new Map<string, Promise<void>>();

function normalizePhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function processInboundSerially<T>(phone: string, operation: () => Promise<T>) {
  const previous = inboundQueues.get(phone) || Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const completion = result.then(
    () => undefined,
    () => undefined,
  );

  inboundQueues.set(phone, completion);
  void completion.finally(() => {
    if (inboundQueues.get(phone) === completion) inboundQueues.delete(phone);
  });

  return result;
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addHours(hours: number, from = new Date()) {
  const next = new Date(from);
  next.setHours(next.getHours() + hours);
  return next;
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mediaHash(payload: NormalizedInbound) {
  const base = [payload.messageSid || "", ...payload.mediaContentTypes].join("|");
  return base ? hashValue(base) : null;
}

async function attachDocumentValidations(
  payload: NormalizedInbound,
  conversation: ConversationSnapshot,
  openCase: CaseSnapshot | null,
) {
  const requests = getDocumentValidationRequestsForTurn({ payload, conversation, openCase });
  if (!requests.length) return payload;

  const validations = await Promise.all(
    requests.map(async (request) => [request.field, await validateDocumentMedia(payload, request)] as const),
  );

  return {
    ...payload,
    documentValidations: {
      ...(payload.documentValidations || {}),
      ...Object.fromEntries(validations),
    },
  };
}

async function findDuplicateMessage(supabase: SupabaseAdmin, messageSid: string | null) {
  if (!messageSid) return null;
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id")
    .eq("twilio_message_sid", messageSid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function findOrCreateContact(supabase: SupabaseAdmin, payload: NormalizedInbound) {
  const whatsapp = normalizePhone(payload.from);
  if (!whatsapp) throw new Error("Inbound payload does not include a valid From number");

  const patch = {
    whatsapp_number: whatsapp,
    whatsapp_number_hash: hashValue(whatsapp),
    display_name: payload.profileName || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("contacts")
    .upsert(patch, { onConflict: "whatsapp_number" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function createConversation(supabase: SupabaseAdmin, contactId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      contact_id: contactId,
      status: "bot_active",
      last_activity_at: now,
      created_at: now,
      updated_at: now,
      expires_at: addDays(getServerEnv().retentionMessagesDays),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function latestConversation(supabase: SupabaseAdmin, contactId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ConversationSnapshot | null;
}

async function expireTakeoverIfNeeded(supabase: SupabaseAdmin, conversation: ConversationSnapshot) {
  if (conversation.status !== "human_takeover" || !conversation.bot_paused_until) {
    return conversation;
  }

  const pausedUntil = new Date(conversation.bot_paused_until);
  if (Number.isNaN(pausedUntil.getTime()) || pausedUntil.getTime() > Date.now()) {
    return conversation;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("conversations")
    .update({
      status: "takeover_expired",
      assigned_operator_id: null,
      bot_paused_until: null,
      updated_at: now,
    })
    .eq("id", conversation.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationSnapshot;
}

function shouldResetConversation(conversation: ConversationSnapshot) {
  const base = conversation.last_activity_at || conversation.updated_at || conversation.created_at;
  if (!base) return false;
  const lastActivity = new Date(base);
  if (Number.isNaN(lastActivity.getTime())) return false;
  return lastActivity.getTime() <= addHours(-24).getTime();
}

async function resetConversationForInactivity(supabase: SupabaseAdmin, conversation: ConversationSnapshot) {
  const now = new Date().toISOString();
  const { data: openCases, error: casesError } = await supabase
    .from("cases")
    .select("id,status,intent_key")
    .eq("conversation_id", conversation.id)
    .in("status", ["in_progress", "waiting_operator"]);
  if (casesError) throw new Error(casesError.message);

  if (openCases?.length) {
    const ids = openCases.map((item) => item.id);
    const { error: updateCasesError } = await supabase
      .from("cases")
      .update({
        status: "cancelled",
        current_step: null,
        completed_at: now,
        updated_at: now,
      })
      .in("id", ids);
    if (updateCasesError) throw new Error(updateCasesError.message);
  }

  const { error: conversationError } = await supabase
    .from("conversations")
    .update({
      status: "closed",
      current_intent: null,
      current_step: null,
      assigned_operator_id: null,
      bot_paused_until: null,
      unanswered_release_at: null,
      unread_count: 0,
      updated_at: now,
    })
    .eq("id", conversation.id);
  if (conversationError) throw new Error(conversationError.message);

  await insertConversationEvent(supabase, String(conversation.id), "conversation_reset_due_inactivity", "system", null, {
    inactive_hours: 24,
    previous_status: conversation.status,
    previous_intent: conversation.current_intent,
    cancelled_cases: openCases?.map((item) => item.intent_key) || [],
  });
}

async function prepareConversation(supabase: SupabaseAdmin, contactId: string) {
  const latest = await latestConversation(supabase, contactId);
  if (!latest) return createConversation(supabase, contactId);

  if (latest.status !== "closed" && shouldResetConversation(latest)) {
    await resetConversationForInactivity(supabase, latest);
    return createConversation(supabase, contactId);
  }

  if (latest.status === "closed") {
    return createConversation(supabase, contactId);
  }

  return expireTakeoverIfNeeded(supabase, latest);
}

async function openCaseForConversation(supabase: SupabaseAdmin, conversationId: string) {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CaseSnapshot | null) || null;
}

async function insertInboundMessage(
  supabase: SupabaseAdmin,
  payload: NormalizedInbound,
  contactId: string,
  conversationId: string,
  intent: string | null,
  confidence: number | null,
) {
  const env = getServerEnv();
  const mediaReceived = payload.numMedia > 0;
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "inbound",
      sender_type: "patient",
      body: payload.body || null,
      normalized_body: normalizeText(payload.body),
      twilio_message_sid: payload.messageSid,
      media_received: mediaReceived,
      media_count: payload.numMedia,
      media_content_types: payload.mediaContentTypes,
      media_reference_hash: mediaReceived ? mediaHash(payload) : null,
      media_metadata_expires_at: mediaReceived ? addDays(env.retentionMediaMetadataDays) : null,
      intent_detected: intent,
      confidence,
      needs_manual_review: false,
      raw_payload: payload.rawPayload || null,
      expires_at: addDays(env.retentionMessagesDays),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function createBotOutbound(
  supabase: SupabaseAdmin,
  conversationId: string,
  contactId: string,
  message: BotMessageDraft,
  intent: string | null,
  confidence: number | null,
) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "outbound",
      sender_type: "bot",
      body: message.text,
      twilio_status: "queued",
      intent_detected: intent,
      confidence,
      raw_payload: message.kind === "media" ? { mediaKind: message.mediaKind, mediaUrls: message.mediaUrls } : null,
      expires_at: addDays(getServerEnv().retentionMessagesDays),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateContactPatch(supabase: SupabaseAdmin, contactId: string, patch: Record<string, unknown> | null) {
  if (!patch || !Object.keys(patch).length) return;
  const { error } = await supabase
    .from("contacts")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
  if (error) throw new Error(error.message);
}

async function persistCaseState(
  supabase: SupabaseAdmin,
  contactId: string,
  conversationId: string,
  existingCase: CaseSnapshot | null,
  caseState: PersistedCaseState | null,
) {
  if (!caseState) return;

  const payload = {
    conversation_id: conversationId,
    contact_id: contactId,
    intent_key: caseState.intentKey,
    status: caseState.status,
    current_step: caseState.currentStep,
    required_fields_status: caseState.requiredFieldsStatus,
    case_data: caseState.caseData,
    completed_at: caseState.completedAt || null,
    updated_at: new Date().toISOString(),
    expires_at: addDays(getServerEnv().retentionMessagesDays),
  };

  if (!existingCase?.id) {
    const { error } = await supabase.from("cases").insert({
      ...payload,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("cases").update(payload).eq("id", existingCase.id);
  if (error) throw new Error(error.message);
}

async function updateConversationAfterInbound(
  supabase: SupabaseAdmin,
  conversationId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

async function processInboundForContact(payload: NormalizedInbound) {
  await getPublishedCatalog();
  const supabase = createAdminSupabaseClient();
  const duplicate = await findDuplicateMessage(supabase, payload.messageSid);
  if (duplicate) {
    return { shouldReply: false, reason: "duplicate", conversationId: duplicate.conversation_id };
  }

  const contact = await findOrCreateContact(supabase, payload);
  const conversation = (await prepareConversation(supabase, contact.id)) as ConversationSnapshot;

  if (conversation.status === "human_takeover" && (!conversation.bot_paused_until || new Date(conversation.bot_paused_until).getTime() > Date.now())) {
    await insertInboundMessage(supabase, payload, contact.id, String(conversation.id), conversation.current_intent, null);
    await updateConversationAfterInbound(supabase, String(conversation.id), {
      unread_count: Number(conversation.unread_count || 0) + 1,
      unanswered_release_at: null,
      last_inbound_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { shouldReply: false, reason: "human_takeover", conversationId: conversation.id };
  }

  const openCase = await openCaseForConversation(supabase, String(conversation.id));
  const payloadWithValidations = await attachDocumentValidations(payload, conversation, openCase);
  const result = evaluateInboundTurn({
    payload: payloadWithValidations,
    conversation,
    openCase,
    options: {
      contactCardBaseUrl: getServerEnv().vcardPublicBaseUrl,
    },
  });

  await insertInboundMessage(supabase, payloadWithValidations, contact.id, String(conversation.id), result.intent, result.confidence);

  if (!result.shouldReply) {
    await updateConversationAfterInbound(supabase, String(conversation.id), {
      status: result.status,
      current_intent: result.currentIntent,
      current_step: result.currentStep,
      unread_count: Number(conversation.unread_count || 0) + 1,
      unanswered_release_at: null,
      last_inbound_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { shouldReply: false, reason: result.reason, conversationId: conversation.id };
  }

  await updateContactPatch(supabase, contact.id, result.contactPatch);
  await persistCaseState(supabase, contact.id, String(conversation.id), openCase, result.caseState);
  const outbound = await createBotOutbound(
    supabase,
    String(conversation.id),
    contact.id,
    result.reply!,
    result.intent,
    result.confidence,
  );

  await updateConversationAfterInbound(supabase, String(conversation.id), {
    status: result.status,
    current_intent: result.currentIntent,
    current_step: result.currentStep,
    last_inbound_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    unread_count: result.status === "waiting_operator" ? Number(conversation.unread_count || 0) + 1 : 0,
    unanswered_release_at: null,
    updated_at: new Date().toISOString(),
  });

  return {
    shouldReply: true,
    replyText: result.reply!.text,
    toNumber: contact.whatsapp_number,
    conversationId: conversation.id,
    contactId: contact.id,
    outboundMessageId: outbound.id,
    intent: result.intent,
    confidence: result.confidence,
    media:
      result.reply!.kind === "media"
        ? {
            kind: result.reply!.mediaKind,
            urls: result.reply!.mediaUrls,
          }
        : null,
  };
}

export function processInbound(payload: NormalizedInbound) {
  return processInboundSerially(normalizePhone(payload.from), () => processInboundForContact(payload));
}

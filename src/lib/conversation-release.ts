import { insertConversationEvent } from "./api-helpers";
import { createAdminSupabaseClient } from "./supabase";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

type ReleasableConversation = {
  id: string;
  status: string;
  last_inbound_at: string | null;
};

async function closeExpiredRelease(
  supabase: SupabaseAdmin,
  conversation: ReleasableConversation,
  operatorId: string,
  now: string,
) {
  const { error: casesError } = await supabase
    .from("cases")
    .update({ status: "cancelled", current_step: null, completed_at: now, updated_at: now })
    .eq("conversation_id", conversation.id)
    .in("status", ["in_progress", "waiting_operator"]);
  if (casesError) throw new Error(casesError.message);

  const { data, error } = await supabase
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
    .eq("id", conversation.id)
    .neq("status", "closed")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  await insertConversationEvent(
    supabase,
    conversation.id,
    "conversation_closed_after_unanswered_release",
    "operator",
    operatorId,
    { last_inbound_at: conversation.last_inbound_at, inactive_hours: 24 },
  );
  return data;
}

export async function releaseConversation(
  supabase: SupabaseAdmin,
  conversation: ReleasableConversation,
  operatorId: string,
  nowDate = new Date(),
) {
  if (conversation.status === "closed") return { conversation, closed: true };
  const now = nowDate.toISOString();
  const lastInboundAt = conversation.last_inbound_at ? new Date(conversation.last_inbound_at) : null;

  let operatorReplied = false;
  if (lastInboundAt && !Number.isNaN(lastInboundAt.getTime())) {
    const { data, error } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("sender_type", "operator")
      .gt("created_at", conversation.last_inbound_at)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    operatorReplied = Boolean(data);
  }

  if (!operatorReplied && lastInboundAt && lastInboundAt.getTime() <= nowDate.getTime() - 24 * 60 * 60 * 1000) {
    const closed = await closeExpiredRelease(supabase, conversation, operatorId, now);
    return { conversation: closed || conversation, closed: Boolean(closed) };
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({
      status: "bot_active",
      assigned_operator_id: null,
      bot_paused_until: null,
      unanswered_release_at: !operatorReplied && lastInboundAt ? now : null,
      updated_at: now,
    })
    .eq("id", conversation.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await insertConversationEvent(supabase, conversation.id, "bot_released", "operator", operatorId, {
    unanswered_release_at: !operatorReplied && lastInboundAt ? now : null,
    last_inbound_at: conversation.last_inbound_at,
    operator_replied: operatorReplied,
  });
  return { conversation: data, closed: false };
}

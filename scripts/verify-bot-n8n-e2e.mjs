import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const reportDir = path.join(process.cwd(), "test-reports");
fs.mkdirSync(reportDir, { recursive: true });

const webhookUrl = process.env.N8N_WEBHOOK_BOT_CCS_URL || process.env.TWILIO_WEBHOOK_URL;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (!webhookUrl) {
  throw new Error("Missing N8N webhook URL");
}

function uniquePhone(seed) {
  return `whatsapp:+54922${seed.toString().padStart(8, "0")}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postTwilioWebhook(from, body, overrides = {}) {
  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", "whatsapp:+5493516424148");
  params.set("Body", body);
  params.set("ProfileName", "N8N E2E");
  params.set("MessageSid", overrides.messageSid || `SM-N8N-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  params.set("NumMedia", String(overrides.numMedia || 0));

  const mediaContentTypes = overrides.mediaContentTypes || [];
  mediaContentTypes.forEach((contentType, index) => {
    params.set(`MediaContentType${index}`, contentType);
  });
  const mediaUrls = overrides.mediaUrls || [];
  mediaUrls.forEach((url, index) => {
    params.set(`MediaUrl${index}`, url);
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`n8n webhook HTTP ${response.status}: ${text}`);
  }

  return {
    messageSid: params.get("MessageSid"),
    status: response.status,
    body: text,
  };
}

async function loadConversationBundle(from) {
  const normalized = `+${String(from).replace(/\D/g, "")}`;

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,whatsapp_number")
    .eq("whatsapp_number", normalized)
    .maybeSingle();
  if (contactError) throw new Error(contactError.message);
  if (!contact?.id) return null;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id,status,current_intent,current_step,last_activity_at")
    .eq("contact_id", contact.id)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation?.id) return null;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id,direction,sender_type,body,twilio_message_sid,twilio_status,raw_payload,created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });
  if (messagesError) throw new Error(messagesError.message);

  const { data: botCase, error: caseError } = await supabase
    .from("cases")
    .select("id,intent_key,status,current_step,case_data,required_fields_status")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (caseError) throw new Error(caseError.message);

  return { contact, conversation, messages: messages || [], case: botCase || null };
}

async function waitForConversation(from, predicate, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const intervalMs = options.intervalMs || 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const bundle = await loadConversationBundle(from);
    if (bundle && predicate(bundle)) {
      return bundle;
    }
    await delay(intervalMs);
  }

  const snapshot = await loadConversationBundle(from);
  throw new Error(`Timed out waiting for condition. Snapshot: ${JSON.stringify(snapshot, null, 2)}`);
}

function latestOutbound(bundle) {
  return [...bundle.messages].reverse().find((message) => message.direction === "outbound" && message.sender_type === "bot") || null;
}

const checks = [];

async function runCheck(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function main() {
  const seed = Date.now() % 100000000;

  await runCheck("texto simple via n8n", async () => {
    const from = uniquePhone(seed + 1);
    const webhook = await postTwilioWebhook(from, "hola");
    const bundle = await waitForConversation(
      from,
      (item) => {
        const outbound = latestOutbound(item);
        return Boolean(
            outbound &&
            item.conversation.current_intent === "OPENING" &&
            String(outbound.body || "").includes("Gracias por comunicarse con Clínica Cruz del Sur") &&
            outbound.raw_payload !== null,
        );
      },
    );

    const outbound = latestOutbound(bundle);
    assert(outbound, "Missing outbound bot message");
    assert(!outbound.raw_payload?.interactive, "Legacy interactive payload should not be present");
    return {
      webhook,
      conversationId: bundle.conversation.id,
      twilioStatus: outbound.twilio_status,
    };
  });

  await runCheck("vcard via n8n", async () => {
    const from = uniquePhone(seed + 2);
    await postTwilioWebhook(from, "laboratorio");
    const bundle = await waitForConversation(
      from,
      (item) => {
        const outbound = latestOutbound(item);
        return Boolean(outbound?.raw_payload?.media?.kind === "vcard");
      },
    );

    const outbound = latestOutbound(bundle);
    assert(outbound, "Missing outbound vCard message");
    assert(Array.isArray(outbound.raw_payload?.media?.urls), "Expected media urls");
    return {
      conversationId: bundle.conversation.id,
      twilioStatus: outbound.twilio_status,
      media: outbound.raw_payload.media,
    };
  });

  await runCheck("imágenes deriva a recepción via n8n", async () => {
    const from = uniquePhone(seed + 3);
    const webhook = await postTwilioWebhook(from, "Necesito turno para una resonancia");
    const bundle = await waitForConversation(
      from,
      (item) =>
        item.conversation.status === "closed" &&
        String(latestOutbound(item)?.body || "").includes("+5492976211361"),
    );
    const latest = latestOutbound(bundle);
    assert(latest, "Missing outbound imaging message");
    assert(bundle.conversation.current_intent === "IMAGENES_RESONANCIA_MAGNETICA", "Unexpected imaging intent");
    assert(bundle.conversation.status === "closed", "Imaging conversation should close after derivation");
    return {
      webhook,
      conversationId: bundle.conversation.id,
      caseId: bundle.case?.id || null,
      twilioStatus: latest.twilio_status,
    };
  });

  await runCheck("profesión humana via n8n", async () => {
    const from = uniquePhone(seed + 5);
    const webhook = await postTwilioWebhook(from, "Necesito un turno con un CARDIOLOGO");
    const bundle = await waitForConversation(
      from,
      (item) =>
        item.conversation.current_intent === "TURNOS_MEDICOS_ATENCION_MEDICA" &&
        item.conversation.current_step === "patient_identity" &&
        String(latestOutbound(item)?.body || "").includes("El Dr. Segovia Néstor atiende"),
    );
    const latest = latestOutbound(bundle);
    assert(latest, "Missing full Cardiology response");
    return {
      webhook,
      conversationId: bundle.conversation.id,
      currentStep: bundle.conversation.current_step,
      twilioStatus: latest.twilio_status,
    };
  });

  await runCheck("ecodopler via n8n", async () => {
    const from = uniquePhone(seed + 6);
    const webhook = await postTwilioWebhook(from, "Necesito hacerme un ecodopler");
    const bundle = await waitForConversation(
      from,
      (item) =>
        item.conversation.current_intent === "IMAGENES_ECOGRAFIA_DOPPLER" &&
        item.conversation.status === "closed",
    );
    const latest = latestOutbound(bundle);
    assert(latest, "Missing Doppler response");
    assert(!String(latest.body || "").includes("ecocardiograma Doppler color"), "Unexpected cardiac Doppler response");
    return {
      webhook,
      conversationId: bundle.conversation.id,
      twilioStatus: latest.twilio_status,
    };
  });

  await runCheck("cirugía por subespecialidad via n8n", async () => {
    const from = uniquePhone(seed + 7);
    await postTwilioWebhook(from, "Necesito turno con un cirujano");
    const selector = await waitForConversation(
      from,
      (item) =>
        item.conversation.current_intent === "TURNOS_MEDICOS_SELECTOR" &&
        String(latestOutbound(item)?.body || "").includes("cirugía general, maxilofacial o estética y plástica"),
    );
    const outboundCount = selector.messages.filter((message) => message.direction === "outbound").length;

    await postTwilioWebhook(from, "maxilofacial");
    const resolved = await waitForConversation(
      from,
      (item) => {
        const body = String(latestOutbound(item)?.body || "");
        return (
          item.messages.filter((message) => message.direction === "outbound").length > outboundCount &&
          item.conversation.current_intent === "TURNOS_MEDICOS_ATENCION_MEDICA" &&
          item.conversation.current_step === "patient_identity" &&
          body.includes("Cardoso Martin") &&
          body.includes("Francalancia Gustavo") &&
          !body.includes("Cardoso Atilio")
        );
      },
    );
    return {
      conversationId: resolved.conversation.id,
      currentIntent: resolved.conversation.current_intent,
      currentStep: resolved.conversation.current_step,
    };
  });

  await runCheck("obra social aceptada via n8n", async () => {
    const from = uniquePhone(seed + 8);
    const webhook = await postTwilioWebhook(from, "¿Aceptan CSS?");
    const bundle = await waitForConversation(
      from,
      (item) =>
        item.conversation.status === "bot_active" &&
        String(latestOutbound(item)?.body || "").includes("Sí, trabajamos con CAJA DE SERVICIOS SOCIALES SANTA CRUZ."),
    );
    assert(bundle.case === null, "Coverage inquiry should not create a case");
    return { webhook, conversationId: bundle.conversation.id, status: bundle.conversation.status };
  });

  await runCheck("servicio no disponible via n8n", async () => {
    const from = uniquePhone(seed + 9);
    const webhook = await postTwilioWebhook(from, "Quiero un turno con kinesiología");
    const bundle = await waitForConversation(
      from,
      (item) =>
        item.conversation.status === "bot_active" &&
        item.conversation.current_intent === "SERVICIO_NO_DISPONIBLE" &&
        String(latestOutbound(item)?.body || "") ===
          "Gracias por comunicarse con Clínica Cruz del Sur, por el momento no contamos con el servicio solicitado. Sepa disculpar ¿Podemos ayudarle en algo más?",
    );
    return { webhook, conversationId: bundle.conversation.id, status: bundle.conversation.status };
  });

  await runCheck("derivacion operador via n8n", async () => {
    const from = uniquePhone(seed + 4);
    const webhook = await postTwilioWebhook(from, "Tengo un problema administrativo con mi obra social");
    const bundle = await waitForConversation(
      from,
      (item) => {
        return (
          item.conversation.status === "waiting_operator" &&
          item.case?.status === "waiting_operator" &&
          String(latestOutbound(item)?.body || "") ===
            "Gracias por comunicarse con Clínica Cruz del Sur.\n\nGracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades."
        );
      },
    );

    const latest = latestOutbound(bundle);
    assert(latest, "Missing handoff outbound message");
    return {
      webhook,
      conversationId: bundle.conversation.id,
      caseId: bundle.case?.id || null,
      conversationStatus: bundle.conversation.status,
      caseStatus: bundle.case?.status || null,
      twilioStatus: latest.twilio_status,
    };
  });

  const failed = checks.filter((check) => !check.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    webhookUrl,
    failed,
    passed: checks.length - failed,
    checks,
  };

  fs.writeFileSync(path.join(reportDir, "bot-n8n-e2e.latest.json"), JSON.stringify(report, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();

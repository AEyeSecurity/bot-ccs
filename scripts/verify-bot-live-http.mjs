import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const reportDir = path.join(process.cwd(), "test-reports");
fs.mkdirSync(reportDir, { recursive: true });

const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3010";
const secret = process.env.BOT_CCS_WEBHOOK_SECRET || "";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function uniquePhone(seed) {
  return `whatsapp:+54911${seed.toString().padStart(8, "0")}`;
}

async function postInbound(from, body, overrides = {}) {
  const payload = {
    from,
    to: "whatsapp:+5493516424148",
    body,
    messageSid: overrides.messageSid || `SM-LIVE-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    profileName: "Live Test",
    numMedia: overrides.numMedia || 0,
    mediaContentTypes: overrides.mediaContentTypes || [],
    rawPayload: {},
    geminiClassification: null,
  };

  const response = await fetch(`${baseUrl}/api/bot/inbound`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bot-ccs-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function latestConversationId(from) {
  const normalized = `+${String(from).replace(/\D/g, "")}`;
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("whatsapp_number", normalized)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contactError) throw new Error(contactError.message);
  if (!contact?.id) return null;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id,last_activity_at,status")
    .eq("contact_id", contact.id)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  return conversation || null;
}

async function latestCaseForConversation(conversationId) {
  const { data: botCase, error } = await supabase
    .from("cases")
    .select("id,intent_key,status,current_step,case_data")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return botCase || null;
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
      detail: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function main() {
  const seed = Date.now() % 100000000;

  await runCheck("greeting", async () => {
    const from = uniquePhone(seed + 1);
    const result = await postInbound(from, "hola");
    if (result.intent !== "OPENING") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("Gracias por comunicarse con Clínica Cruz del Sur")) {
      throw new Error("Greeting text missing");
    }
    return { intent: result.intent, conversationId: result.conversationId };
  });

  await runCheck("laboratorio contact vcard", async () => {
    const from = uniquePhone(seed + 2);
    const result = await postInbound(from, "laboratorio");
    if (result.intent !== "LABORATORIO_CLINICO") throw new Error(`Unexpected intent ${result.intent}`);
    if (result.media?.kind !== "vcard") throw new Error("Expected vCard media");
    if (String(result.replyText || "").includes("¿En qué podemos ayudarle?")) {
      throw new Error("Resolved initial request repeated the generic question");
    }
    return { intent: result.intent, media: result.media };
  });

  await runCheck("turnos atención rejects unvalidated media", async () => {
    const from = uniquePhone(seed + 3);
    const first = await postInbound(from, "Quiero un turno con Cardiología");
    const second = await postInbound(from, "Juan Perez\nAfiliado 123456", {
      numMedia: 2,
      mediaContentTypes: ["image/jpeg", "image/jpeg"],
    });

    if (!String(first.replyText || "").includes("nombre completo del paciente")) {
      throw new Error("Expected patient identity prompt");
    }
    if (String(first.replyText || "").includes("¿En qué podemos ayudarle?")) {
      throw new Error("Resolved appointment repeated the generic question");
    }
    if (!String(second.replyText || "").includes("No pude validar")) {
      throw new Error("Expected document validation rejection");
    }
    const latest = await latestConversationId(from);
    const { data: botCase, error } = await supabase
      .from("cases")
      .select("current_step,case_data")
      .eq("conversation_id", latest.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (botCase?.current_step !== "patient_identity") {
      throw new Error(`Expected patient_identity step, got ${botCase?.current_step}`);
    }
    if (botCase?.case_data?.dniMedia) {
      throw new Error("DNI media should not be marked as valid without OCR");
    }
    return { conversationId: second.conversationId, currentStep: botCase?.current_step || null };
  });

  await runCheck("turno abierto reclasifica a laboratorio", async () => {
    const from = uniquePhone(seed + 7);
    const first = await postInbound(from, "quiero un turno");
    if (first.intent !== "TURNOS_MEDICOS_SELECTOR") throw new Error(`Unexpected intent ${first.intent}`);
    if (String(first.replyText || "") !== "Gracias por comunicarse con Clínica Cruz del Sur.\n\nIndíqueme, por favor, el profesional o servicio que necesita.") {
      throw new Error("Unexpected open service prompt");
    }

    const second = await postInbound(from, "laboratorio");
    if (second.intent !== "LABORATORIO_CLINICO") throw new Error(`Unexpected reclassified intent ${second.intent}`);
    if (second.media?.kind !== "vcard") throw new Error("Expected laboratory vCard after reclassification");
    return { firstIntent: first.intent, secondIntent: second.intent };
  });

  await runCheck("profesional exacto no se consume como paciente", async () => {
    const from = uniquePhone(seed + 8);
    const result = await postInbound(from, "Quiero turno con Cardoso Atilio");
    if (result.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("El Dr. Cardoso Atilio atiende")) {
      throw new Error("Exact professional block missing");
    }
    if (String(result.replyText || "").includes("Cardoso Martin especialista")) {
      throw new Error("Unrequested professional block was emitted");
    }
    const latest = await latestConversationId(from);
    const { data: botCase, error } = await supabase
      .from("cases")
      .select("current_step,case_data")
      .eq("conversation_id", latest.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (botCase?.current_step !== "patient_identity") throw new Error(`Unexpected step ${botCase?.current_step}`);
    if (botCase?.case_data?.patientFullName) throw new Error("Professional name was stored as patient name");
    return { intent: result.intent, currentStep: botCase.current_step };
  });

  await runCheck("apellido ambiguo solicita elección", async () => {
    const from = uniquePhone(seed + 9);
    const first = await postInbound(from, "Turno con Cardoso");
    if (first.intent !== "TURNOS_MEDICOS_SELECTOR") throw new Error(`Unexpected intent ${first.intent}`);
    if (!String(first.replyText || "").includes("Muy bien, para corroborar la información enviada puede indicarnos si desea una consulta con cirugía general o maxilofacial")) {
      throw new Error("Unexpected Cardoso ambiguity prompt");
    }
    const second = await postInbound(from, "Martin Cardoso");
    if (second.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Unexpected resolved intent ${second.intent}`);
    if (!String(second.replyText || "").includes("Cardoso Martin especialista")) {
      throw new Error("Resolved professional block missing");
    }
    return { firstIntent: first.intent, secondIntent: second.intent };
  });

  await runCheck("profesión devuelve ficha completa", async () => {
    const from = uniquePhone(seed + 10);
    const result = await postInbound(from, "Hola, necesito turno con un CARDIOLOGO");
    if (result.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("El Dr. Segovia Néstor atiende")) {
      throw new Error("Full Cardiology response missing");
    }
    if (!String(result.replyText || "").includes("nombre completo del paciente")) {
      throw new Error("Patient identity prompt missing");
    }
    return { intent: result.intent, currentStep: result.currentStep };
  });

  await runCheck("título y error declarado resuelven profesional", async () => {
    const from = uniquePhone(seed + 11);
    const result = await postInbound(from, "Dr. Ismael del Carpio");
    if (result.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("Dr. del Carpio Ysmael atiende")) {
      throw new Error("Del Carpio professional response missing");
    }
    if (String(result.replyText || "").includes("Cardoso Atilio atiende")) {
      throw new Error("Unrequested Surgery response was emitted");
    }
    return { intent: result.intent, currentStep: result.currentStep };
  });

  await runCheck("Cardozo conserva ambigüedad", async () => {
    const from = uniquePhone(seed + 12);
    const result = await postInbound(from, "Doc Cardozo");
    if (result.intent !== "TURNOS_MEDICOS_SELECTOR") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("Muy bien, para corroborar la información enviada puede indicarnos si desea una consulta con cirugía general o maxilofacial")) {
      throw new Error("Unexpected Cardozo ambiguity prompt");
    }
    return { intent: result.intent, currentStep: result.currentStep };
  });

  await runCheck("cirugía selecciona subespecialidad", async () => {
    const from = uniquePhone(seed + 14);
    const first = await postInbound(from, "Necesito turno con un cirujano");
    if (first.intent !== "TURNOS_MEDICOS_SELECTOR") throw new Error(`Unexpected intent ${first.intent}`);
    if (!String(first.replyText || "").includes("cirugía general, maxilofacial o estética y plástica")) {
      throw new Error("Surgery selector prompt missing");
    }

    const second = await postInbound(from, "general");
    const body = String(second.replyText || "");
    if (second.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Unexpected intent ${second.intent}`);
    for (const expected of ["del Carpio Ysmael", "Cardoso Atilio", "Luciano Heredia", "Luján del Bueno"]) {
      if (!body.includes(expected)) throw new Error(`Missing general surgery block: ${expected}`);
    }
    if (body.includes("Cardoso Martin") || body.includes("Goldenberg Gustavo")) {
      throw new Error("Surgery response leaked another sub-specialty");
    }
    return { firstIntent: first.intent, secondIntent: second.intent, currentStep: second.currentStep };
  });

  await runCheck("obras sociales aceptada y rechazada", async () => {
    const acceptedFrom = uniquePhone(seed + 15);
    const accepted = await postInbound(acceptedFrom, "¿Aceptan OSDE 210?");
    if (!String(accepted.replyText || "").includes("Sí, trabajamos con OSDE.")) {
      throw new Error("Accepted insurance response missing");
    }

    const rejectedFrom = uniquePhone(seed + 16);
    const rejected = await postInbound(rejectedFrom, "¿Trabajan con Federada Salud?");
    if (!String(rejected.replyText || "").includes("no contamos con convenio vigente con Federada Salud")) {
      throw new Error("Rejected insurance response missing");
    }
    return { acceptedIntent: accepted.intent, rejectedIntent: rejected.intent };
  });

  await runCheck("obra social no altera turno abierto", async () => {
    const from = uniquePhone(seed + 17);
    await postInbound(from, "Necesito un turno con Cardiología");
    const beforeConversation = await latestConversationId(from);
    const beforeCase = await latestCaseForConversation(beforeConversation.id);
    const second = await postInbound(from, "¿Aceptan Sancor Salud?");
    const afterCase = await latestCaseForConversation(beforeConversation.id);
    if (!String(second.replyText || "").includes("Sí, trabajamos con SANCOR.")) {
      throw new Error("Insurance response missing inside appointment");
    }
    if (!String(second.replyText || "").includes("nombre completo del paciente")) {
      throw new Error("Pending appointment prompt was not repeated");
    }
    if (beforeCase?.current_step !== "patient_identity" || afterCase?.current_step !== "patient_identity") {
      throw new Error(`Appointment step changed: ${beforeCase?.current_step} -> ${afterCase?.current_step}`);
    }
    if (JSON.stringify(beforeCase?.case_data) !== JSON.stringify(afterCase?.case_data)) {
      throw new Error("Appointment data changed during insurance inquiry");
    }
    return { intent: second.intent, currentStep: afterCase.current_step };
  });

  await runCheck("servicio no disponible permite recuperación", async () => {
    const from = uniquePhone(seed + 18);
    const first = await postInbound(from, "Quiero un turno con kinesiología");
    if (first.intent !== "SERVICIO_NO_DISPONIBLE") throw new Error(`Unexpected intent ${first.intent}`);
    if (String(first.replyText || "") !== "Gracias por comunicarse con Clínica Cruz del Sur, por el momento no contamos con el servicio solicitado. Sepa disculpar ¿Podemos ayudarle en algo más?") {
      throw new Error("Unavailable service message mismatch");
    }
    const second = await postInbound(from, "Cardiología");
    if (second.intent !== "TURNOS_MEDICOS_ATENCION_MEDICA") throw new Error(`Recovery failed: ${second.intent}`);
    if (!String(second.replyText || "").includes("Segovia Néstor")) throw new Error("Recovered specialty body missing");
    return { firstIntent: first.intent, secondIntent: second.intent };
  });

  await runCheck("ecodopler deriva solamente a Doppler", async () => {
    const from = uniquePhone(seed + 13);
    const result = await postInbound(from, "Necesito hacerme un ecodopler");
    if (result.intent !== "IMAGENES_ECOGRAFIA_DOPPLER") throw new Error(`Unexpected intent ${result.intent}`);
    if (String(result.replyText || "").includes("ecocardiograma Doppler color")) {
      throw new Error("Ecodopler was routed to cardiac Doppler");
    }
    return { intent: result.intent, conversationId: result.conversationId };
  });

  await runCheck("imágenes deriva a su recepción", async () => {
    const from = uniquePhone(seed + 6);
    const result = await postInbound(from, "Necesito un turno para una resonancia");
    if (result.intent !== "IMAGENES_RESONANCIA_MAGNETICA") throw new Error(`Unexpected intent ${result.intent}`);
    if (!String(result.replyText || "").includes("+5492976211361")) {
      throw new Error("Expected normalized imaging reception phone");
    }
    const latest = await latestConversationId(from);
    if (latest?.status !== "closed") throw new Error(`Expected closed conversation, got ${latest?.status}`);
    return { intent: result.intent, conversationId: result.conversationId, status: latest.status };
  });

  await runCheck("telemedicina remote", async () => {
    const from = uniquePhone(seed + 4);
    const first = await postInbound(from, "Telemedicina");
    const second = await postInbound(from, "Soy de Las Heras");
    if (!String(first.replyText || "").includes("localidad")) {
      throw new Error("Expected locality prompt");
    }
    if (second.media?.kind !== "vcard") {
      throw new Error("Expected telemedicine vCard");
    }
    return { conversationId: second.conversationId, media: second.media };
  });

  await runCheck("reset after 24h", async () => {
    const from = uniquePhone(seed + 5);
    await postInbound(from, "hola");
    const latest = await latestConversationId(from);
    if (!latest?.id) throw new Error("Missing initial conversation");
    const oldActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("conversations")
      .update({ last_activity_at: oldActivity })
      .eq("id", latest.id);
    if (error) throw new Error(error.message);

    const second = await postInbound(from, "hola");
    if (second.conversationId === latest.id) {
      throw new Error("Conversation did not reset");
    }
    return { previousConversationId: latest.id, newConversationId: second.conversationId };
  });

  const failed = checks.filter((check) => !check.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    failed,
    passed: checks.length - failed,
    checks,
  };

  fs.writeFileSync(path.join(reportDir, "bot-live-http.latest.json"), JSON.stringify(report, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

if (process.env.BOT_CCS_TEST_INSTANCE !== "1" || process.env.TWILIO_TRANSPORT !== "mock") {
  throw new Error("HTTP matrix requires an isolated mock instance");
}
const readiness = await fetch(`${baseUrl}/api/health/ready`).then((response) => response.json());
if (!readiness.testInstance) throw new Error("Target is not an isolated mock instance");
await main();

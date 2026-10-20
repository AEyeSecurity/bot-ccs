import { getServerEnv } from "./env";

export type GeminiIntentClassification = {
  intent_key: string;
  confidence: number;
  needs_operator: boolean;
  reason?: string;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const CLASSIFY_TIMEOUT_MS = 5000;

const INTENT_PROMPT = [
  "Sos un clasificador de intención para el WhatsApp de Clínica Cruz del Sur.",
  "REGLAS OBLIGATORIAS:",
  "- Devolvé únicamente JSON válido, sin markdown.",
  "- No redactes respuestas finales al paciente.",
  "- No des indicaciones médicas.",
  "- Elegí solo una de estas intenciones: OPENING, TURNOS_MEDICOS_SELECTOR, TURNOS_MEDICOS_ATENCION_MEDICA, TURNOS_MEDICOS_IMAGENES_MEDICAS, LABORATORIO_CLINICO, INFORMES_MEDICOS_IMAGENES_MEDICAS, INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA, INFORMES_MEDICOS_LABORATORIO_CLINICO, RECETAS_MEDICAS, NUESTROS_EDIFICIOS, INTERNACION, OBRAS_SOCIALES, MEDICOS_CLINICOS, OTRAS_CONSULTAS, TELEMEDICINA_DRA_ESTRADA, FUERA_ALCANCE_MEDICO.",
  "- Si el texto menciona síntomas, diagnóstico, medicación, interpretación de estudios, urgencias, emergencias o recomendaciones clínicas, devolvé FUERA_ALCANCE_MEDICO.",
  "- Si menciona telemedicina o Dra. Estrada, priorizá TELEMEDICINA_DRA_ESTRADA.",
  "- Si menciona Clínica Médica como especialidad, usá TURNOS_MEDICOS_ATENCION_MEDICA.",
  "- Si menciona médico clínico o médicos clínicos como atención por orden de llegada, usá MEDICOS_CLINICOS.",
  "- Si hay duda, devolvé OTRAS_CONSULTAS con needs_operator=true.",
  'Formato exacto: {"intent_key":"OTRAS_CONSULTAS","confidence":0.75,"needs_operator":false,"reason":"breve"}',
].join("\n");

function extractJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Partial<GeminiIntentClassification>;
  } catch {
    return null;
  }
}

export async function classifyIntentWithGemini(text: string): Promise<GeminiIntentClassification | null> {
  const env = getServerEnv();
  if (!env.geminiApiKey) return null;
  const model = env.geminiIntentModel.replace(/^models\//, "");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${INTENT_PROMPT}\n\nMensaje del paciente:\n${text}` }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) return null;
    const json = (await response.json()) as GeminiResponse;
    const raw = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed.intent_key !== "string" || !parsed.intent_key) return null;
    return {
      intent_key: parsed.intent_key,
      confidence: Number(parsed.confidence || 0),
      needs_operator: Boolean(parsed.needs_operator),
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

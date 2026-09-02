import crypto from "crypto";
import { getDocumentFingerprintSecret, getServerEnv } from "./env";
import type {
  DocumentMediaField,
  DocumentValidationReason,
  DocumentValidationResult,
  NormalizedInbound,
} from "./bot-types";

type GeminiDocumentResponse = {
  document_type?: string;
  valid_document?: boolean;
  has_front?: boolean;
  has_back?: boolean;
  name?: string;
  document_number?: string;
  useful_data_visible?: boolean;
  medical_practice_visible?: boolean;
  confidence?: number;
  reason?: string;
};

type ValidationRequest = {
  field: DocumentMediaField;
  expectedName?: string | null;
};

const MEDIA_FIELDS = new Set<DocumentMediaField>(["dniMedia", "insuranceCredentialMedia", "medicalOrderMedia"]);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MIN_DNI_SIDE_CONFIDENCE = 0.4;
const MIN_DOCUMENT_CONFIDENCE = 0.55;

function normalizeName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 1)
    .sort()
    .join(" ");
}

function normalizeDocumentNumber(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 9 ? digits : "";
}

function fingerprint(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function namesMatch(expectedName: string | null | undefined, documentName: string | null | undefined) {
  const expected = normalizeName(expectedName);
  const actual = normalizeName(documentName);
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  const expectedParts = new Set(expected.split(" "));
  const actualParts = new Set(actual.split(" "));
  const common = [...expectedParts].filter((part) => actualParts.has(part)).length;
  return common >= Math.min(expectedParts.size, actualParts.size) && common >= 2;
}

function invalidResult(
  field: DocumentMediaField,
  reason: DocumentValidationReason,
  confidence = 0,
  technicalError = false,
): DocumentValidationResult {
  return {
    field,
    valid: false,
    reason,
    confidence,
    technicalError,
    documentType: "unknown",
  };
}

function validResult(
  field: DocumentMediaField,
  confidence: number,
  documentType: NonNullable<DocumentValidationResult["documentType"]>,
): DocumentValidationResult {
  return {
    field,
    valid: true,
    reason: "valid",
    confidence,
    documentType,
  };
}

function promptFor(field: DocumentMediaField, expectedName?: string | null) {
  if (field === "dniMedia") {
    return [
      "Analizá estas imágenes como verificador documental para una clínica argentina.",
      "Respondé únicamente JSON válido, sin markdown.",
      "Necesito validar un DNI argentino del paciente.",
      "Cada adjunto puede contener frente, dorso o ambas caras. Una foto aislada y legible del frente o del dorso sigue siendo válida para identificar esa cara.",
      "Si la imagen corresponde a un DNI argentino, document_type debe ser 'dni' aunque solo se vea una cara. Indicá has_front y has_back de forma independiente.",
      "Usá valid_document=true cuando la cara visible sea realmente un DNI legible. No reduzcas la confianza solo porque falte la otra cara.",
      "Extraé el nombre completo y el número de documento desde cada cara. En el dorso, leelos de la zona MRZ si no están impresos por separado.",
      expectedName ? `Nombre informado por el paciente: ${expectedName}.` : "No hay nombre informado.",
      'Formato exacto: {"document_type":"dni|other","valid_document":true,"has_front":true,"has_back":true,"name":"Nombre Apellido","document_number":"12345678","confidence":0.0,"reason":"breve"}',
    ].join("\n");
  }

  if (field === "insuranceCredentialMedia") {
    return [
      "Analizá estas imágenes como verificador documental para una clínica argentina.",
      "Respondé únicamente JSON válido, sin markdown.",
      "Necesito validar que la imagen sea una credencial o carnet de obra social o prepaga.",
      "Debe verse algún dato útil: afiliado, credencial, plan, DNI, obra social, prepaga o nombre.",
      "No aceptes publicidades, fotos genéricas, tickets, comidas u objetos.",
      'Formato exacto: {"document_type":"insurance_credential|other","valid_document":true,"useful_data_visible":true,"confidence":0.0,"reason":"breve"}',
    ].join("\n");
  }

  return [
    "Analizá estas imágenes como verificador documental para una clínica argentina.",
    "Respondé únicamente JSON válido, sin markdown.",
    "Necesito validar que la imagen sea un pedido, orden o prescripción médica.",
    "Debe mencionar una práctica, estudio o indicación médica. No interpretes diagnóstico ni des indicaciones clínicas.",
    "No aceptes publicidades, fotos genéricas, tickets, comidas u objetos.",
    'Formato exacto: {"document_type":"medical_order|other","valid_document":true,"medical_practice_visible":true,"confidence":0.0,"reason":"breve"}',
  ].join("\n");
}

function extractJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as GeminiDocumentResponse;
  } catch {
    return null;
  }
}

async function fetchTwilioMedia(url: string, fallbackContentType: string | undefined, authHeader: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
    },
  });
  if (!response.ok) throw new Error(`Twilio media fetch failed with ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackContentType || "";
  if (!ALLOWED_MEDIA.has(contentType)) {
    throw new Error(`Unsupported media type: ${contentType || "unknown"}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("Media file is too large");
  }

  return {
    mimeType: contentType,
    data: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function callGemini(field: DocumentMediaField, expectedName: string | null | undefined, mediaParts: Array<{ mimeType: string; data: string }>) {
  const env = getServerEnv();
  if (!env.geminiApiKey) throw new Error("Missing GEMINI_API_KEY");
  const model = env.geminiVisionModel.replace(/^models\//, "");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: promptFor(field, expectedName) },
            ...mediaParts.map((part) => ({
              inlineData: {
                mimeType: part.mimeType,
                data: part.data,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) throw new Error(`Gemini validation failed with ${response.status}`);
  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("Gemini returned invalid JSON");
  return parsed;
}

function mapGeminiResult(
  field: DocumentMediaField,
  expectedName: string | null | undefined,
  parsed: GeminiDocumentResponse,
): DocumentValidationResult {
  const confidence = Number(parsed.confidence || 0);
  const documentType = String(parsed.document_type || "other").toLowerCase();

  if (field === "dniMedia") {
    const hasFront = Boolean(parsed.has_front);
    const hasBack = Boolean(parsed.has_back);
    if (documentType !== "dni") {
      return confidence >= MIN_DOCUMENT_CONFIDENCE
        ? invalidResult(field, "not_document", confidence)
        : invalidResult(field, "low_confidence", confidence);
    }
    if (!hasFront && !hasBack) return invalidResult(field, "low_confidence", confidence);
    if (confidence < MIN_DNI_SIDE_CONFIDENCE) return invalidResult(field, "low_confidence", confidence);
    const documentNumber = normalizeDocumentNumber(parsed.document_number);
    const documentName = normalizeName(parsed.name);
    if (!documentNumber || !documentName) return invalidResult(field, "low_confidence", confidence);
    const nameMatches = hasFront ? namesMatch(expectedName, parsed.name) : false;
    const fingerprintSecret = getDocumentFingerprintSecret();
    const documentFingerprint = fingerprint(`dni-number:${documentNumber}`, fingerprintSecret);
    const nameFingerprint = fingerprint(`dni-name:${documentName}`, fingerprintSecret);
    if (hasFront && !nameMatches) {
      return {
        ...invalidResult(field, "name_mismatch", confidence),
        documentType: "dni",
        dniHasFront: hasFront,
        dniHasBack: hasBack,
        dniNameMatches: false,
        dniDocumentFingerprint: documentFingerprint,
        dniNameFingerprint: nameFingerprint,
      };
    }
    if (!hasFront || !hasBack) {
      return {
        ...invalidResult(field, "missing_dni_side", confidence),
        documentType: "dni",
        dniHasFront: hasFront,
        dniHasBack: hasBack,
        dniNameMatches: nameMatches,
        dniDocumentFingerprint: documentFingerprint,
        dniNameFingerprint: nameFingerprint,
      };
    }
    return {
      ...validResult(field, confidence, "dni"),
      dniHasFront: true,
      dniHasBack: true,
      dniNameMatches: true,
      dniDocumentFingerprint: documentFingerprint,
      dniNameFingerprint: nameFingerprint,
    };
  }

  if (confidence < MIN_DOCUMENT_CONFIDENCE) return invalidResult(field, "low_confidence", confidence);

  if (field === "insuranceCredentialMedia") {
    if (documentType !== "insurance_credential" || !parsed.valid_document || !parsed.useful_data_visible) {
      return invalidResult(field, "not_document", confidence);
    }
    return validResult(field, confidence, "insurance_credential");
  }

  if (documentType !== "medical_order" || !parsed.valid_document || !parsed.medical_practice_visible) {
    return invalidResult(field, "not_document", confidence);
  }
  return validResult(field, confidence, "medical_order");
}

export async function validateDocumentMedia(
  payload: NormalizedInbound,
  request: ValidationRequest,
): Promise<DocumentValidationResult> {
  if (!MEDIA_FIELDS.has(request.field)) return invalidResult(request.field, "technical_error", 0, true);
  if (!payload.numMedia || !payload.mediaUrls?.length) return invalidResult(request.field, "missing_media");

  try {
    const env = getServerEnv();
    const authHeader = `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`;
    const mediaParts = await Promise.all(
      payload.mediaUrls.map((url, index) => fetchTwilioMedia(url, payload.mediaContentTypes[index], authHeader)),
    );
    const parsed = await callGemini(request.field, request.expectedName, mediaParts);
    return mapGeminiResult(request.field, request.expectedName, parsed);
  } catch {
    return invalidResult(request.field, "technical_error", 0, true);
  }
}

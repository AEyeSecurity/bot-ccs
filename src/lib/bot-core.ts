import {
  BOT_THANK_YOU,
  CARDOSO_SELECTION_PROMPT,
  FLOWS,
  IMAGING_STUDIES,
  INSURANCE_PLANS,
  MEDICAL_SERVICES,
  OPENING_INTENT,
  PROFESSIONALS,
  PROFESSIONAL_RESPONSE_GROUPS,
  PROFESSIONAL_SUBSERVICE_ALIASES,
  REMOTE_CITY_EXAMPLES,
  SURGERY_SELECTION_PROMPT,
  TELEMEDICINA_INTENT,
  TURNOS_MEDICOS_SELECTOR_INTENT,
  UNAVAILABLE_SERVICE_INTENT,
  UNKNOWN_SERVICE_PROMPT,
  buildCaseFinalState,
  buildOpeningMessage,
  buildStepStatusMap,
  formatContactIntro,
  formatReply,
  getFlow,
  isIntentAvailable,
  type CaseDefinition,
  type CaseStepDefinition,
  type ProfessionalDetection,
  type StepRequirement,
} from "./bot-catalog";
import { classifyIntentWithGemini } from "./intent-classifier";
import type {
  BotCaseData,
  BotFieldKey,
  BotMessageDraft,
  CaseSnapshot,
  ConversationSnapshot,
  CoreTurnResult,
  DocumentMediaField,
  DocumentValidationResult,
  NormalizedInbound,
  PersistedCaseState,
} from "./bot-types";

export type CoreOptions = {
  contactCardBaseUrl: string;
};

const GREETINGS = new Set(["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches"]);

export { CARDOSO_SELECTION_PROMPT, SURGERY_SELECTION_PROMPT } from "./bot-catalog";

const SURGERY_CHOICES = ["Cirugía general", "Cirugía maxilofacial", "Cirugías estéticas y plásticas"] as const;
const CARDOSO_NAMES = ["Cardoso Atilio", "Cardoso Martin"] as const;

export type InsuranceDetection =
  | { kind: "none" }
  | { kind: "generic" }
  | { kind: "accepted"; planName: string }
  | { kind: "rejected"; planName: string };

const IMAGE_GENERIC_TERMS = [
  "imagenes",
  "imagenes medicas",
  "diagnostico por imagenes",
  "ecografia",
  "resonancia",
  "mamografia",
  "tomografia",
  "radiografia",
  "ecg",
  "electrocardiograma",
  "ecocardiograma",
  "espinograma",
];

const BUILDING_HINTS = [
  "direccion",
  "edificio",
  "sector",
  "ubicacion",
  "donde queda",
  "donde esta",
  "consultorios externos",
  "pasaje tamarisco",
  "9 de julio",
  "recepcion principal",
  "centro materno infantil",
];

const GENERIC_OPERATOR_REASONS = new Set([
  "obra social",
  "obras sociales",
  "otras consultas",
  "otra consulta",
  "consulta",
]);

const NAME_STOPWORDS = new Set([
  "necesito",
  "quiero",
  "informe",
  "informes",
  "imagenes",
  "imagen",
  "turno",
  "turnos",
  "telemedicina",
  "obra",
  "social",
  "laboratorio",
  "patologia",
  "consulta",
  "consulta",
  "resultados",
  "internacion",
  "receta",
]);

const GENERIC_SERVICE_REQUESTS = new Set([
  "turno",
  "quiero un turno",
  "quiero un turno medico",
  "quiero un turno médico",
  "necesito un turno",
  "necesito un turno medico",
  "necesito un turno médico",
  "turnos",
  "atencion medica",
  "atención médica",
  "consulta medica",
  "consulta médica",
]);

const CLINICAL_RISK_TERMS = [
  "sintoma",
  "sintomas",
  "dolor",
  "diagnostico",
  "medicacion",
  "medicamento",
  "que puedo tomar",
  "que tomo",
  "urgencia",
  "urgencias",
  "emergencia",
  "emergencias",
  "interpretar",
  "interpretacion",
  "receta para",
];

const TEXT_FIELD_ORDER: BotFieldKey[] = [
  "imagingStudy",
  "professionalOrService",
  "patientFullName",
  "insuranceMemberNumber",
  "availability",
  "studyAndDate",
  "operatorReason",
  "city",
];

const CONTACT_FIELD_MAP: Partial<Record<BotFieldKey, string>> = {
  patientFullName: "patient_full_name",
  insuranceMemberNumber: "insurance_member_number",
};

const MEDIA_FIELDS = new Set<BotFieldKey>(["dniMedia", "insuranceCredentialMedia", "medicalOrderMedia"]);

const NON_CATALOG_PROFESSIONAL_NAMES = ["Núñez Cervantes", "Cervantes Núñez"];

export function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeMatchText(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:doctor|doctora|doc|dr|dra|d\s+r(?:\s+a)?|licenciado|licenciada|lic)\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function phrasePositions(textTokens: string[], phrase: string) {
  const phraseTokens = normalizeMatchText(phrase).split(" ").filter(Boolean);
  if (!phraseTokens.length || phraseTokens.length > textTokens.length) return [];
  const positions: Array<{ start: number; end: number }> = [];
  for (let start = 0; start <= textTokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => textTokens[start + offset] === token)) {
      positions.push({ start, end: start + phraseTokens.length });
    }
  }
  return positions;
}

function containsDeclaredPhrase(text: string, phrase: string) {
  const textTokens = normalizeMatchText(text).split(" ").filter(Boolean);
  return phrasePositions(textTokens, phrase).length > 0;
}

export function detectProfessional(text: string): ProfessionalDetection {
  const textTokens = normalizeMatchText(text).split(" ").filter(Boolean);
  if (!textTokens.length) return { kind: "none" };

  const excludedSpans = NON_CATALOG_PROFESSIONAL_NAMES.flatMap((name) => phrasePositions(textTokens, name));

  const spans = new Map<string, { start: number; end: number; professionalIndexes: Set<number> }>();
  PROFESSIONALS.forEach((professional, professionalIndex) => {
    for (const alias of professional.aliases) {
      for (const position of phrasePositions(textTokens, alias)) {
        if (excludedSpans.some((excluded) => position.start < excluded.end && excluded.start < position.end)) continue;
        const key = `${position.start}:${position.end}`;
        const span = spans.get(key) || { ...position, professionalIndexes: new Set<number>() };
        span.professionalIndexes.add(professionalIndex);
        spans.set(key, span);
      }
    }
  });

  const selectedSpans: Array<{ start: number; end: number; professionalIndexes: Set<number> }> = [];
  for (const span of [...spans.values()].sort((left, right) => (right.end - right.start) - (left.end - left.start))) {
    const overlapsLonger = selectedSpans.some(
      (selected) => span.start < selected.end && selected.start < span.end,
    );
    if (!overlapsLonger) selectedSpans.push(span);
  }

  const matchedProfessionals = [...new Set(selectedSpans.flatMap((span) => [...span.professionalIndexes]))]
    .map((index) => PROFESSIONALS[index]);
  if (!matchedProfessionals.length) return { kind: "none" };

  const responseGroupIds = [...new Set(matchedProfessionals.map((professional) => professional.responseGroupId))];
  const professionalNames = matchedProfessionals.map((professional) => professional.name);
  if (responseGroupIds.length > 1) {
    return { kind: "ambiguous", candidates: professionalNames };
  }

  return {
    kind: "match",
    label: professionalNames.join(", "),
    specialty: matchedProfessionals[0].specialty,
    responseGroupIds,
    professionalNames,
    available:
      matchedProfessionals.some((professional) => professional.available) &&
      PROFESSIONAL_RESPONSE_GROUPS.some((group) => responseGroupIds.includes(group.id) && group.available),
  };
}

export function detectProfessionalSubservice(text: string): ProfessionalDetection {
  const entries = new Map<string, { title: string; matchers: Set<string>; groupIds: Set<string>; professionalNames: Set<string> }>();
  for (const group of PROFESSIONAL_RESPONSE_GROUPS) {
    for (const subservice of group.subservices) {
      const key = normalizeMatchText(subservice);
      const entry = entries.get(key) || {
        title: subservice,
        matchers: new Set<string>(),
        groupIds: new Set<string>(),
        professionalNames: new Set<string>(),
      };
      entry.matchers.add(subservice);
      for (const alias of PROFESSIONAL_SUBSERVICE_ALIASES[subservice] || []) entry.matchers.add(alias);
      entry.groupIds.add(group.id);
      PROFESSIONALS.filter((professional) => professional.responseGroupId === group.id)
        .forEach((professional) => entry.professionalNames.add(professional.name));
      entries.set(key, entry);
    }
  }

  const matches = [...entries.values()].filter((entry) =>
    [...entry.matchers].some((matcher) => containsDeclaredPhrase(text, matcher)),
  );
  if (!matches.length) return { kind: "none" };
  if (matches.length > 1) {
    return { kind: "ambiguous", candidates: matches.map((entry) => entry.title) };
  }

  const match = matches[0];
  const responseGroupIds = [...match.groupIds];
  const professionalNames = [...match.professionalNames];
  const firstGroup = PROFESSIONAL_RESPONSE_GROUPS.find((group) => group.id === responseGroupIds[0]);
  return {
    kind: "match",
    label: match.title,
    specialty: firstGroup?.specialty || "",
    responseGroupIds,
    professionalNames,
    available: responseGroupIds.some((groupId) =>
      PROFESSIONAL_RESPONSE_GROUPS.some((group) => group.id === groupId && group.available),
    ),
  };
}

function sameNormalizedValues(actual: readonly string[], expected: readonly string[]) {
  const actualValues = [...new Set(actual.map(normalizeMatchText))].sort();
  const expectedValues = [...new Set(expected.map(normalizeMatchText))].sort();
  return actualValues.length === expectedValues.length && actualValues.every((value, index) => value === expectedValues[index]);
}

function narrowProfessionalAmbiguity(
  professional: Extract<ProfessionalDetection, { kind: "ambiguous" }>,
  subservice: ProfessionalDetection,
): ProfessionalDetection {
  if (subservice.kind !== "match") return professional;
  const candidates = PROFESSIONALS.filter(
    (item) => professional.candidates.includes(item.name) && subservice.responseGroupIds.includes(item.responseGroupId),
  );
  if (candidates.length !== 1) return professional;
  return {
    kind: "match",
    label: candidates[0].name,
    specialty: candidates[0].specialty,
    responseGroupIds: [candidates[0].responseGroupId],
    professionalNames: [candidates[0].name],
    available:
      candidates[0].available &&
      PROFESSIONAL_RESPONSE_GROUPS.some(
        (group) => group.id === candidates[0].responseGroupId && group.available,
      ),
  };
}

function detectMedicalSelection(text: string): ProfessionalDetection {
  const professional = detectProfessional(text);
  const subservice = detectProfessionalSubservice(text);
  if (professional.kind === "match") return professional;
  if (professional.kind === "ambiguous") return narrowProfessionalAmbiguity(professional, subservice);
  if (subservice.kind !== "none") return subservice;
  const specialty = detectSpecialty(text);
  if (!specialty) return { kind: "none" };
  if (specialty.title === "Cirugía") {
    return { kind: "ambiguous", candidates: SURGERY_CHOICES };
  }
  return {
    kind: "match",
    label: specialty.title,
    specialty: specialty.title,
    responseGroupIds: [],
    professionalNames: [],
    available: specialty.available && Boolean(specialty.body),
  };
}

function detectSurgeryContextSelection(text: string, context: string): ProfessionalDetection {
  const normalized = normalizeMatchText(text);
  let subservice: string | null = null;
  if (/\b(?:maxilo|maxilofacial|bucomaxilofacial)\b/.test(normalized)) subservice = "Cirugía maxilofacial";
  else if (/\bgeneral\b/.test(normalized)) subservice = "Cirugía general";
  else if (context === "surgery" && /\b(?:estetica|esteticas|plastica|plasticas)\b/.test(normalized)) {
    subservice = "Cirugías estéticas y plásticas";
  } else if (context === "surgery" && /\bvascular\b/.test(normalized)) subservice = "Cirugía vascular";
  return subservice ? detectProfessionalSubservice(subservice) : { kind: "none" };
}

function ambiguityContext(candidates: readonly string[]) {
  if (sameNormalizedValues(candidates, CARDOSO_NAMES)) return "cardoso";
  if (sameNormalizedValues(candidates, SURGERY_CHOICES)) return "surgery";
  return null;
}

function medicalSelectionSeed(selection: Extract<ProfessionalDetection, { kind: "match" }>): BotCaseData {
  return {
    professionalOrService: selection.label,
    professionalResponseGroupIds: [...selection.responseGroupIds],
  };
}

export function isGreeting(value: string) {
  return GREETINGS.has(normalizeText(value));
}

export function containsClinicalRisk(text: string) {
  const normalized = normalizeText(text);
  return CLINICAL_RISK_TERMS.some((term) => normalized.includes(term));
}

export function detectImagingStudy(text: string) {
  return (
    [...IMAGING_STUDIES]
      .sort(
        (left, right) =>
          Math.max(...right.matchers.map((matcher) => normalizeText(matcher).length)) -
          Math.max(...left.matchers.map((matcher) => normalizeText(matcher).length)),
      )
      .find((study) => study.matchers.some((matcher) => containsDeclaredPhrase(text, matcher))) || null
  );
}

export function detectSpecialty(text: string) {
  return MEDICAL_SERVICES.find((service) => service.matchers.some((matcher) => containsDeclaredPhrase(text, matcher))) || null;
}

function hasInsuranceContext(text: string) {
  const normalized = normalizeMatchText(text);
  return [
    /\btrabajan\b/,
    /\baceptan\b/,
    /\batienden\b/,
    /\bconvenio\b/,
    /\bobra social\b/,
    /\bobras sociales\b/,
    /\bcobertura\b/,
    /\bprepaga\b/,
    /\btengo\b/,
    /\btienen\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isGenericInsuranceQuestion(text: string) {
  const normalized = normalizeMatchText(text);
  if (["obra social", "obras sociales", "cobertura", "coberturas", "prepaga", "prepagas"].includes(normalized)) {
    return true;
  }
  return (
    /\b(?:que|cuales)\b.*\b(?:obra social|obras sociales|cobertura|coberturas|prepaga|prepagas)\b/.test(normalized) ||
    /\b(?:obra social|obras sociales|cobertura|coberturas|prepaga|prepagas)\b.*\b(?:aceptan|trabajan|tienen)\b/.test(normalized)
  );
}

function isBareInsurancePlanRequest(text: string, alias: string) {
  const normalizedText = normalizeMatchText(text);
  const normalizedAlias = normalizeMatchText(alias);
  if (normalizedText === normalizedAlias) return true;
  if (!normalizedText.startsWith(`${normalizedAlias} `)) return false;
  const remainder = normalizedText.slice(normalizedAlias.length).trim();
  return /^\d{2,3}$/.test(remainder);
}

function extractUnknownInsuranceName(text: string) {
  const cleaned = text.trim().replace(/^¿+/, "").replace(/[?!.;,]+$/g, "").trim();
  const patterns = [
    /(?:trabajan|trabaja|aceptan|acepta|atienden|atiende)\s*(?:con|por)?\s*(?:la|el)?\s*(?:obra social|cobertura|prepaga)?\s+(.+)$/i,
    /(?:tienen|tiene|hay)\s+convenio\s+con\s+(.+)$/i,
    /(?:obra social|cobertura|prepaga)\s*(?:es|de|con)?\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const candidate = match?.[1]?.trim().replace(/\s+/g, " ");
    if (candidate) return candidate;
  }
  return null;
}

export function detectInsuranceInquiry(text: string): InsuranceDetection {
  const explicitContext = hasInsuranceContext(text);
  for (const plan of INSURANCE_PLANS) {
    const alias = [...plan.aliases]
      .sort((left, right) => normalizeMatchText(right).length - normalizeMatchText(left).length)
      .find((candidate) => containsDeclaredPhrase(text, candidate));
    if (alias && (explicitContext || isBareInsurancePlanRequest(text, alias))) {
      return plan.available
        ? { kind: "accepted", planName: plan.name }
        : { kind: "rejected", planName: plan.name };
    }
  }

  if (isGenericInsuranceQuestion(text)) return { kind: "generic" };
  if (!explicitContext) return { kind: "none" };
  const planName = extractUnknownInsuranceName(text);
  return planName ? { kind: "rejected", planName } : { kind: "generic" };
}

function isInsuranceAdministrativeIssue(text: string) {
  const normalized = normalizeMatchText(text);
  return /\b(?:autorizacion|reintegro|facturacion|afiliacion|auditoria|tramite|problema|inconveniente)\b/.test(normalized);
}

export function detectCity(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (normalized.includes("caleta olivia")) return "Caleta Olivia";
  for (const example of REMOTE_CITY_EXAMPLES) {
    if (normalized.includes(normalizeText(example))) {
      return example
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }

  const patterns = [
    /(?:soy de|vivo en|resido en|estoy en|desde)\s+([a-zñ\s]{3,40})/i,
    /(?:localidad|ciudad)\s+de\s+([a-zñ\s]{3,40})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    return match[1].trim().replace(/\s+/g, " ");
  }

  return null;
}

export function isRemoteCity(city: string | null) {
  return Boolean(city && normalizeText(city) !== "caleta olivia");
}

function looksLikeUsefulSentence(text: string) {
  const normalized = normalizeText(text);
  if (!normalized || GREETINGS.has(normalized)) return false;
  if (normalized.length < 4) return false;
  return true;
}

function extractPatientFullName(text: string) {
  const firstLine = text.split(/\r?\n|,/)[0] || text;
  const cleaned = firstLine.replace(/[0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(" ").filter((part) => /[a-záéíóúñ]/i.test(part));
  if (parts.length < 2 || parts.length > 4) return null;
  if (parts.some((part) => part.length < 2)) return null;
  if (parts.some((part) => NAME_STOPWORDS.has(normalizeText(part)))) return null;
  return parts.join(" ");
}

function extractInsuranceMemberNumber(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/(?:afiliad[oa]|credencial)?\s*[:#-]?\s*([A-Z0-9\-]{4,})/i);
    if (match?.[1] && /\d/.test(match[1])) return match[1];
  }

  const compact = text.replace(/\s+/g, "");
  const fallback = compact.match(/[A-Z0-9\-]{4,}/i)?.[0] || null;
  return fallback && /\d/.test(fallback) ? fallback : null;
}

function extractProfessionalOrService(text: string) {
  const normalized = normalizeText(text);
  if (!looksLikeUsefulSentence(text)) return null;
  if (GENERIC_SERVICE_REQUESTS.has(normalized)) return null;
  if (normalized.includes("turno") && (normalized.includes("medico") || normalized.includes("medica"))) return null;
  const selection = detectMedicalSelection(text);
  return selection.kind === "match" ? selection.label : null;
}

function extractAvailability(text: string) {
  const normalized = normalizeText(text);
  const hints = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
    "manana",
    "mañana",
    "tarde",
    "horario",
    "horarios",
    "dias",
    "días",
  ];
  return looksLikeUsefulSentence(text) && hints.some((hint) => normalized.includes(normalizeText(hint))) ? text.trim() : null;
}

function extractStudyAndDate(text: string) {
  const normalized = normalizeText(text);
  const dateLike = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(text) || /\b20\d{2}\b/.test(text);
  const studyHints = ["estudio", "resonancia", "ecografia", "tomografia", "radiografia", "mamografia", "analisis"];
  return looksLikeUsefulSentence(text) && (dateLike || studyHints.some((hint) => normalized.includes(hint))) ? text.trim() : null;
}

function extractImagingStudy(text: string) {
  const normalized = normalizeText(text);
  if (!looksLikeUsefulSentence(text)) return null;
  if (normalized === "imagenes" || normalized === "imagenes medicas" || normalized === "turno imagenes") return null;
  return detectImagingStudy(text)?.title || null;
}

function extractOperatorReason(text: string) {
  const normalized = normalizeText(text);
  if (!looksLikeUsefulSentence(text)) return null;
  if (GENERIC_OPERATOR_REASONS.has(normalized)) return null;
  return text.trim();
}

function isExplicitUnknownAppointment(text: string) {
  const normalized = normalizeMatchText(text);
  if (GENERIC_SERVICE_REQUESTS.has(normalizeText(text))) return false;
  const match = normalized.match(/\b(?:turno|consulta)\s+(?:con|para)\s+(?:el|la|un|una)?\s*(.+)$/);
  if (!match?.[1]) return false;
  const candidate = match[1].trim();
  if (!candidate) return false;
  const nonService = new Set([
    "manana",
    "hoy",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
    "mi hijo",
    "mi hija",
    "un medico",
    "una medica",
  ]);
  return !nonService.has(candidate);
}

function extractFieldValue(field: BotFieldKey, payload: NormalizedInbound) {
  const text = payload.body.trim();
  switch (field) {
    case "imagingStudy":
      return extractImagingStudy(text);
    case "professionalOrService":
      return extractProfessionalOrService(text);
    case "patientFullName":
      return extractPatientFullName(text);
    case "dniMedia":
      return payload.documentValidations?.dniMedia?.valid ? true : null;
    case "insuranceMemberNumber":
      return extractInsuranceMemberNumber(text);
    case "insuranceCredentialMedia":
      return payload.documentValidations?.insuranceCredentialMedia?.valid ? true : null;
    case "availability":
      return extractAvailability(text);
    case "medicalOrderMedia":
      return payload.documentValidations?.medicalOrderMedia?.valid ? true : null;
    case "studyAndDate":
      return extractStudyAndDate(text);
    case "operatorReason":
      return extractOperatorReason(text);
    case "city": {
      const city = detectCity(text);
      return city;
    }
    default:
      return null;
  }
}

function buildContactPatch(caseData: BotCaseData) {
  const patch: Record<string, unknown> = {};
  for (const field of TEXT_FIELD_ORDER) {
    const contactField = CONTACT_FIELD_MAP[field];
    if (contactField && caseData[field]) {
      patch[contactField] = caseData[field];
    }
  }
  if (caseData.dniMedia) patch.dni_received = true;
  if (caseData.insuranceCredentialMedia) patch.insurance_card_received = true;
  return Object.keys(patch).length ? patch : null;
}

function buildMediaMessage(text: string, mediaUrl: string): BotMessageDraft {
  return {
    kind: "media",
    text,
    mediaKind: "vcard",
    mediaUrls: [mediaUrl],
  };
}

function buildTextMessage(text: string): BotMessageDraft {
  return { kind: "text", text };
}

function buildContactCardUrl(baseUrl: string, fileName: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${fileName.replace(/^\/+/, "")}`;
}

function buildGreetingWith(text: string) {
  return formatReply([BOT_THANK_YOU, text]);
}

function buildIntroWithPrompt(intro: string, prompt: string) {
  return formatReply([BOT_THANK_YOU, intro, prompt]);
}

function buildMaybeGreetingWith(text: string, includeGreeting: boolean) {
  return includeGreeting ? buildGreetingWith(text) : text;
}

function buildMaybeIntroWithPrompt(intro: string, prompt: string, includeGreeting: boolean) {
  return includeGreeting ? buildIntroWithPrompt(intro, prompt) : formatReply([intro, prompt]);
}

function shouldIncludeGreeting(conversation: ConversationSnapshot) {
  return !conversation.current_intent && !conversation.current_step;
}

function requirementSatisfied(requirement: StepRequirement, caseData: BotCaseData) {
  return requirement.mode === "allOf"
    ? requirement.fields.every((field) => Boolean(caseData[field]))
    : requirement.fields.some((field) => Boolean(caseData[field]));
}

function stepComplete(step: CaseStepDefinition, caseData: BotCaseData) {
  return step.requirements.every((requirement) => requirementSatisfied(requirement, caseData));
}

function firstIncompleteStep(flow: CaseDefinition, caseData: BotCaseData) {
  return flow.steps.find((step) => !stepComplete(step, caseData)) || null;
}

function missingRequirementLabels(step: CaseStepDefinition, caseData: BotCaseData) {
  return step.requirements.filter((requirement) => !requirementSatisfied(requirement, caseData)).map((requirement) => requirement.label);
}

function formatMissingLabels(labels: string[]) {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

function isDocumentMediaField(field: BotFieldKey): field is DocumentMediaField {
  return MEDIA_FIELDS.has(field);
}

function validationStatusKey(field: DocumentMediaField) {
  return `${field}OcrStatus`;
}

function validationReasonKey(field: DocumentMediaField) {
  return `${field}OcrReason`;
}

function dniFrontKey(field: DocumentMediaField) {
  return `${field}FrontSeen`;
}

function dniBackKey(field: DocumentMediaField) {
  return `${field}BackSeen`;
}

function dniNameMatchedKey(field: DocumentMediaField) {
  return `${field}NameMatched`;
}

function dniDocumentFingerprintKey(field: DocumentMediaField, side: "Front" | "Back") {
  return `${field}${side}DocumentFingerprint`;
}

function dniNameFingerprintKey(field: DocumentMediaField, side: "Front" | "Back") {
  return `${field}${side}NameFingerprint`;
}

function clearDniFingerprints(caseData: BotCaseData, field: DocumentMediaField) {
  delete caseData[dniDocumentFingerprintKey(field, "Front")];
  delete caseData[dniDocumentFingerprintKey(field, "Back")];
  delete caseData[dniNameFingerprintKey(field, "Front")];
  delete caseData[dniNameFingerprintKey(field, "Back")];
}

function applyDocumentValidationResult(
  caseData: BotCaseData,
  field: DocumentMediaField,
  validation: DocumentValidationResult,
) {
  caseData[validationStatusKey(field)] = validation.valid
    ? "valid"
    : validation.reason === "not_document"
      ? "rejected"
      : "pending";
  caseData[validationReasonKey(field)] = validation.reason;

  if (field === "dniMedia" && validation.documentType === "dni") {
    if (validation.dniHasFront && validation.dniNameMatches) {
      caseData[dniFrontKey(field)] = true;
      caseData[dniNameMatchedKey(field)] = true;
      caseData[dniDocumentFingerprintKey(field, "Front")] = validation.dniDocumentFingerprint;
      caseData[dniNameFingerprintKey(field, "Front")] = validation.dniNameFingerprint;
    }
    if (validation.dniHasBack) {
      caseData[dniBackKey(field)] = true;
      caseData[dniDocumentFingerprintKey(field, "Back")] = validation.dniDocumentFingerprint;
      caseData[dniNameFingerprintKey(field, "Back")] = validation.dniNameFingerprint;
    }
    if (caseData[dniFrontKey(field)] && caseData[dniBackKey(field)] && caseData[dniNameMatchedKey(field)]) {
      const documentsMatch =
        caseData[dniDocumentFingerprintKey(field, "Front")] === caseData[dniDocumentFingerprintKey(field, "Back")];
      const namesMatch = caseData[dniNameFingerprintKey(field, "Front")] === caseData[dniNameFingerprintKey(field, "Back")];
      if (documentsMatch && namesMatch) {
        caseData[field] = true;
        caseData[validationStatusKey(field)] = "valid";
        caseData[validationReasonKey(field)] = "valid";
        clearDniFingerprints(caseData, field);
        return;
      }

      delete caseData[dniFrontKey(field)];
      delete caseData[dniBackKey(field)];
      delete caseData[dniNameMatchedKey(field)];
      clearDniFingerprints(caseData, field);
      caseData[validationStatusKey(field)] = "pending";
      caseData[validationReasonKey(field)] = "dni_data_mismatch";
      return;
    }
  }

  if (validation.valid) {
    caseData[field] = true;
  }
}

function documentValidationForActiveStep(payload: NormalizedInbound, activeFields: Set<BotFieldKey>) {
  const validations = payload.documentValidations || {};
  return [...activeFields]
    .filter(isDocumentMediaField)
    .map((field) => validations[field])
    .filter(Boolean) as DocumentValidationResult[];
}

function rejectionMessageFor(field: DocumentMediaField, reason: DocumentValidationResult["reason"]) {
  if (field === "dniMedia") {
    if (reason === "name_mismatch") {
      return "El nombre informado no coincide con el DNI recibido. Para continuar, corrija el nombre del paciente o envíe nuevamente una foto clara del DNI, frente y dorso.";
    }
    if (reason === "missing_dni_side") {
      return "Para continuar, necesito una foto clara del DNI donde se vea frente y dorso.";
    }
    if (reason === "low_confidence") {
      return "No pude identificar con certeza la cara del DNI recibida. Para continuar, envíe nuevamente una foto clara del DNI.";
    }
    if (reason === "technical_error") {
      return "No pude validar el DNI en este momento. Para continuar, envíe nuevamente una foto clara del DNI.";
    }
    return "No pude validar que la imagen corresponda al DNI del paciente. Para continuar, envíe una foto clara del DNI, frente y dorso.";
  }

  if (field === "insuranceCredentialMedia") {
    return "No pude validar que la imagen corresponda a una credencial de obra social o prepaga. Para continuar, envíe una foto clara de la credencial o indíqueme el número de afiliado.";
  }

  return "No pude validar que la imagen corresponda a un pedido médico. Para continuar, envíe una foto clara del pedido médico.";
}

function buildDocumentValidationReply(step: CaseStepDefinition, caseData: BotCaseData, validations: DocumentValidationResult[]) {
  const invalid = validations.find((validation) => !validation.valid && !caseData[validation.field]);
  if (!invalid) return buildStepReprompt(step, caseData);
  if (invalid.field === "dniMedia" && caseData[validationReasonKey(invalid.field)] === "dni_data_mismatch") {
    return "El frente y el dorso no corresponden al mismo DNI. Para continuar, envíe nuevamente ambas fotos claras del DNI.";
  }
  if (
    invalid.field === "dniMedia" &&
    ["missing_dni_side", "low_confidence", "technical_error"].includes(invalid.reason) &&
    (caseData[dniFrontKey(invalid.field)] || caseData[dniBackKey(invalid.field)])
  ) {
    if (caseData[dniFrontKey(invalid.field)] && !caseData[dniBackKey(invalid.field)]) {
      return "Ya recibí el frente del DNI. Para continuar, envíe también una foto clara del dorso.";
    }
    if (!caseData[dniFrontKey(invalid.field)] && caseData[dniBackKey(invalid.field)]) {
      return "Ya recibí el dorso del DNI. Para continuar, envíe también una foto clara del frente.";
    }
  }
  return rejectionMessageFor(invalid.field, invalid.reason);
}

function buildStepReprompt(step: CaseStepDefinition, caseData: BotCaseData) {
  const labels = missingRequirementLabels(step, caseData);
  if (!labels.length) return step.prompt;
  return `Para continuar, necesito ${formatMissingLabels(labels)}.`;
}

function stepFieldSet(step: CaseStepDefinition) {
  return new Set(step.requirements.flatMap((requirement) => requirement.fields));
}

function mergeCaseData(
  flow: CaseDefinition,
  payload: NormalizedInbound,
  existingCaseData: BotCaseData,
  seededData: BotCaseData,
  activeStep: CaseStepDefinition,
) {
  const nextCaseData: BotCaseData = { ...existingCaseData, ...seededData };
  const touched = new Set<BotFieldKey>();
  const fieldKeys = new Set<BotFieldKey>();
  const activeFields = stepFieldSet(activeStep);

  for (const step of flow.steps) {
    for (const requirement of step.requirements) {
      for (const field of requirement.fields) {
        fieldKeys.add(field);
      }
    }
  }

  for (const field of fieldKeys) {
    if (nextCaseData[field]) continue;
    if (field === "patientFullName" && !activeFields.has(field)) {
      continue;
    }
    if (
      isDocumentMediaField(field) &&
      !activeFields.has(field)
    ) {
      continue;
    }
    if (isDocumentMediaField(field)) {
      const validation = payload.documentValidations?.[field];
      if (validation) {
        applyDocumentValidationResult(nextCaseData, field, validation);
        if (validation.valid) touched.add(field);
        continue;
      }
    }
    const value = seededData[field] ?? extractFieldValue(field, payload);
    if (value == null || value === "") continue;
    nextCaseData[field] = value;
    touched.add(field);
  }

  return { nextCaseData, touched };
}

function buildCaseState(flow: CaseDefinition, caseData: BotCaseData): PersistedCaseState {
  const currentStep = firstIncompleteStep(flow, caseData);
  const requiredFieldsStatus = buildStepStatusMap(flow, caseData);
  return {
    intentKey: flow.intent,
    status: currentStep ? "in_progress" : "waiting_operator",
    currentStep: currentStep?.key || null,
    caseData,
    requiredFieldsStatus,
    completedAt: currentStep ? null : new Date().toISOString(),
  };
}

function buildClosedCaseState(flow: CaseDefinition, caseData: BotCaseData): PersistedCaseState {
  return {
    intentKey: flow.intent,
    status: "closed",
    currentStep: null,
    caseData,
    requiredFieldsStatus: buildStepStatusMap(flow, caseData),
    completedAt: new Date().toISOString(),
  };
}

function buildFlowMessage(flowIntent: string, options: CoreOptions, includeGreeting: boolean) {
  const flow = getFlow(flowIntent);
  if (!flow) {
    return buildTextMessage(buildOpeningMessage());
  }

  if (flow.kind === "case") {
    return buildTextMessage(buildMaybeIntroWithPrompt(flow.intro, flow.steps[0]?.prompt || "", includeGreeting));
  }

  if (flow.kind === "contact") {
    if (flow.vcardFile) {
      const mediaUrl = buildContactCardUrl(options.contactCardBaseUrl, flow.vcardFile);
      return buildMediaMessage(
        formatContactIntro(buildMaybeGreetingWith(flow.body, includeGreeting), true),
        mediaUrl,
      );
    }
    return buildTextMessage(buildMaybeGreetingWith(flow.body, includeGreeting));
  }

  return buildTextMessage(
    flow.intent === UNAVAILABLE_SERVICE_INTENT ? flow.body : buildMaybeGreetingWith(flow.body, includeGreeting),
  );
}

export async function detectIntent(
  payload: NormalizedInbound,
  conversation: ConversationSnapshot | null,
): Promise<{
  intent: string;
  confidence: number;
  seededData: BotCaseData;
  ambiguity?: readonly string[];
}> {
  const text = payload.body.trim();
  const normalized = normalizeText(text);
  const seededData: BotCaseData = {};

  if (!normalized || isGreeting(normalized)) {
    return { intent: OPENING_INTENT, confidence: 1, seededData };
  }

  if (containsClinicalRisk(text)) {
    return { intent: "FUERA_ALCANCE_MEDICO", confidence: 1, seededData };
  }

  if (normalized.includes("telemedicina") || normalized.includes("dra estrada") || normalized.includes("doctora estrada")) {
    const city = detectCity(text);
    if (city) seededData.city = city;
    return { intent: TELEMEDICINA_INTENT, confidence: 1, seededData };
  }

  if (
    normalized.includes("trabajo") ||
    normalized.includes("trabajar") ||
    normalized.includes("laboral") ||
    normalized.includes("empleo") ||
    normalized.includes("curriculum") ||
    normalized.includes("cv")
  ) {
    return { intent: "BUSQUEDA_LABORAL", confidence: 1, seededData };
  }

  if (normalized.includes("guardia")) {
    return { intent: "GUARDIA", confidence: 1, seededData };
  }

  const looksLikeBuildingQuestion = BUILDING_HINTS.some((hint) => normalized.includes(hint));
  if (looksLikeBuildingQuestion) {
    return { intent: "NUESTROS_EDIFICIOS", confidence: 0.95, seededData };
  }

  if (normalized.includes("medico clinico") || normalized.includes("medicos clinicos")) {
    return { intent: "MEDICOS_CLINICOS", confidence: 1, seededData };
  }

  if (normalized.includes("obra social") || normalized.includes("obras sociales")) {
    return { intent: "OBRAS_SOCIALES", confidence: 1, seededData };
  }

  if (normalized.includes("receta")) {
    return { intent: "RECETAS_MEDICAS", confidence: 1, seededData };
  }

  if (normalized.includes("internacion") || normalized.includes("admision")) {
    return { intent: "INTERNACION", confidence: 1, seededData };
  }

  if (normalized.includes("laboratorio")) {
    if (normalized.includes("informe") || normalized.includes("resultado") || normalized.includes("analisis")) {
      return { intent: "INFORMES_MEDICOS_LABORATORIO_CLINICO", confidence: 1, seededData };
    }
    return { intent: "LABORATORIO_CLINICO", confidence: 1, seededData };
  }

  if ((normalized.includes("informe") || normalized.includes("resultado")) && (normalized.includes("patologia") || normalized.includes("biopsia"))) {
    return { intent: "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA", confidence: 1, seededData };
  }

  const imagingStudy = detectImagingStudy(text);
  if (imagingStudy) {
    return {
      intent: imagingStudy.available ? imagingStudy.intent : UNAVAILABLE_SERVICE_INTENT,
      confidence: 1,
      seededData,
    };
  }

  if (normalized.includes("patologia") || normalized.includes("biopsia")) {
    return { intent: "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA", confidence: 1, seededData };
  }

  if (normalized.includes("informe") || normalized.includes("informe medico") || normalized.includes("informe médico")) {
    return { intent: "INFORMES_MEDICOS_IMAGENES_MEDICAS", confidence: 0.9, seededData };
  }

  const medicalSelection = detectMedicalSelection(text);
  if (medicalSelection.kind === "ambiguous") {
    return {
      intent: TURNOS_MEDICOS_SELECTOR_INTENT,
      confidence: 1,
      seededData,
      ambiguity: medicalSelection.candidates,
    };
  }
  if (medicalSelection.kind === "match" && !looksLikeBuildingQuestion) {
    if (!medicalSelection.available) {
      return { intent: UNAVAILABLE_SERVICE_INTENT, confidence: 1, seededData };
    }
    Object.assign(seededData, medicalSelectionSeed(medicalSelection));
    return { intent: "TURNOS_MEDICOS_ATENCION_MEDICA", confidence: 0.95, seededData };
  }

  if (IMAGE_GENERIC_TERMS.some((term) => normalized.includes(term))) {
    const detectedStudy = extractImagingStudy(text);
    if (detectedStudy) seededData.imagingStudy = detectedStudy;
    return { intent: "TURNOS_MEDICOS_IMAGENES_MEDICAS", confidence: 0.9, seededData };
  }

  if (GENERIC_SERVICE_REQUESTS.has(normalized)) {
    return { intent: TURNOS_MEDICOS_SELECTOR_INTENT, confidence: 0.9, seededData };
  }

  if (isExplicitUnknownAppointment(text)) {
    return { intent: UNAVAILABLE_SERVICE_INTENT, confidence: 1, seededData };
  }

  if (normalized.includes("turno") || normalized.includes("agenda")) {
    return { intent: TURNOS_MEDICOS_SELECTOR_INTENT, confidence: 0.85, seededData };
  }

  if (["otra consulta", "otras consultas"].includes(normalized)) {
    return { intent: "OTRAS_CONSULTAS", confidence: 1, seededData };
  }

  if (normalized.includes("edificio") || normalized.includes("guardia") || normalized.includes("direccion") || normalized.includes("ubicacion")) {
    return { intent: "NUESTROS_EDIFICIOS", confidence: 0.85, seededData };
  }

  const classification = await classifyIntentWithGemini(text);
  const geminiIntent = classification?.intent_key || "";
  if (geminiIntent && FLOWS[geminiIntent]) {
    return {
      intent: isIntentAvailable(geminiIntent) ? geminiIntent : UNAVAILABLE_SERVICE_INTENT,
      confidence: Number(classification?.confidence || 0),
      seededData,
    };
  }

  if (conversation?.current_intent === OPENING_INTENT) {
    return { intent: "OTRAS_CONSULTAS", confidence: 0.6, seededData };
  }

  return { intent: "OTRAS_CONSULTAS", confidence: 0.4, seededData };
}

function muteWhileWaitingOperator(conversation: ConversationSnapshot, openCase: CaseSnapshot | null): CoreTurnResult | null {
  if (conversation.status !== "waiting_operator") return null;
  if (openCase?.status === "in_progress") return null;

  return {
    shouldReply: false,
    reason: "waiting_operator",
    intent: conversation.current_intent,
    confidence: 1,
    status: conversation.status,
    currentIntent: conversation.current_intent,
    currentStep: conversation.current_step,
    reply: null,
    caseState: null,
    contactPatch: null,
  };
}

function selectedMedicalBody(caseData: BotCaseData) {
  const responseGroupIds = Array.isArray(caseData.professionalResponseGroupIds)
    ? caseData.professionalResponseGroupIds.filter((value): value is string => typeof value === "string")
    : [];
  if (responseGroupIds.length) {
    const groups = PROFESSIONAL_RESPONSE_GROUPS
      .filter((group) => responseGroupIds.includes(group.id))
      .sort((left, right) => left.order - right.order);
    const service = MEDICAL_SERVICES.find((item) => item.title === groups[0]?.specialty);
    const includeGeneral = groups.some((group) => group.includeServiceGeneral);
    return formatReply([includeGeneral ? service?.generalBody || "" : "", ...groups.map((group) => group.body)]);
  }
  const specialty = detectSpecialty(String(caseData.professionalOrService || ""));
  return specialty?.body || "";
}

function handleCaseTurn(
  flow: CaseDefinition,
  payload: NormalizedInbound,
  existingCase: CaseSnapshot | null,
  seededData: BotCaseData,
  options: CoreOptions,
  startingFlow: boolean,
  includeGreeting: boolean,
): CoreTurnResult {
  const selectionStarted =
    flow.intent === "TURNOS_MEDICOS_ATENCION_MEDICA" &&
    !existingCase?.case_data?.professionalOrService &&
    Boolean(seededData.professionalOrService);
  const effectivePayload = selectionStarted
    ? { ...payload, body: "", numMedia: 0, mediaContentTypes: [], mediaUrls: [], documentValidations: {} }
    : payload;
  const activeStep =
    firstIncompleteStep(flow, { ...(existingCase?.case_data || {}), ...seededData }) || flow.steps[0];
  const { nextCaseData } = mergeCaseData(flow, effectivePayload, existingCase?.case_data || {}, seededData, activeStep);

  if (flow.intent === "TURNOS_MEDICOS_IMAGENES_MEDICAS" && nextCaseData.imagingStudy) {
    const imagingStudy = detectImagingStudy(String(nextCaseData.imagingStudy));
    if (imagingStudy) {
      const replyText = buildMaybeGreetingWith(imagingStudy.body, includeGreeting);
      return {
        shouldReply: true,
        reason: "bot_reply",
        intent: imagingStudy.intent,
        confidence: 1,
        status: "closed",
        currentIntent: imagingStudy.intent,
        currentStep: null,
        reply: buildTextMessage(replyText),
        caseState: buildClosedCaseState(flow, nextCaseData),
        contactPatch: buildContactPatch(nextCaseData),
      };
    }
  }

  const activeValidations = documentValidationForActiveStep(effectivePayload, stepFieldSet(activeStep));
  const caseState = buildCaseState(flow, nextCaseData);
  const contactPatch = buildContactPatch(nextCaseData);

  if (caseState.status === "waiting_operator") {
    const finalAction = buildCaseFinalState(flow.intent, caseState);
    const reply =
      finalAction.kind === "contact" && finalAction.vcardFile
        ? buildMediaMessage(
            formatContactIntro(
              startingFlow ? buildMaybeGreetingWith(finalAction.text, includeGreeting) : finalAction.text,
              true,
            ),
            buildContactCardUrl(options.contactCardBaseUrl, finalAction.vcardFile),
          )
        : buildTextMessage(startingFlow ? buildMaybeGreetingWith(finalAction.text, includeGreeting) : finalAction.text);

    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: flow.intent,
      confidence: 1,
      status: finalAction.status,
      currentIntent: flow.intent,
      currentStep: null,
      reply,
      caseState,
      contactPatch,
    };
  }

  const currentStep = flow.steps.find((step) => step.key === caseState.currentStep) || flow.steps[0];
  const prompt = activeValidations.some((validation) => !validation.valid)
    ? buildDocumentValidationReply(currentStep, nextCaseData, activeValidations)
    : startingFlow
      ? buildMaybeIntroWithPrompt(flow.intro, currentStep.prompt, includeGreeting)
      : buildStepReprompt(currentStep, nextCaseData);
  const selectionBody = selectionStarted ? selectedMedicalBody(nextCaseData) : "";
  const replyText = selectionBody
    ? formatReply([buildMaybeGreetingWith(selectionBody, includeGreeting), currentStep.prompt])
    : prompt;

  return {
    shouldReply: true,
    reason: "bot_reply",
    intent: flow.intent,
    confidence: 1,
    status: "bot_active",
    currentIntent: flow.intent,
    currentStep: currentStep.key,
    reply: buildTextMessage(replyText),
    caseState,
    contactPatch,
  };
}

function insuranceReply(detection: Exclude<InsuranceDetection, { kind: "none" }>) {
  if (detection.kind === "accepted") {
    return `Sí, trabajamos con ${detection.planName}. ¿Podemos ayudarle en algo más?`;
  }
  if (detection.kind === "rejected") {
    return `Por el momento no contamos con convenio vigente con ${detection.planName}. ¿Podemos ayudarle en algo más?`;
  }
  const flow = getFlow("OBRAS_SOCIALES");
  if (!flow || flow.kind !== "case") throw new Error("Missing social insurance flow");
  return formatReply([flow.intro, "¿Podemos ayudarle en algo más?"]);
}

function pendingPromptFor(openCase: CaseSnapshot) {
  if (openCase.intent_key === TURNOS_MEDICOS_SELECTOR_INTENT) {
    const context = String(openCase.case_data?.selectionContext || "");
    if (context === "cardoso") return CARDOSO_SELECTION_PROMPT;
    if (context === "surgery") return SURGERY_SELECTION_PROMPT;
    return FLOWS.TURNOS_MEDICOS_SELECTOR.kind === "case"
      ? FLOWS.TURNOS_MEDICOS_SELECTOR.steps[0].prompt
      : "Indíqueme, por favor, el profesional o servicio que necesita.";
  }
  const flow = getFlow(openCase.intent_key);
  if (!flow || flow.kind !== "case") return "";
  const step = flow.steps.find((item) => item.key === openCase.current_step) || flow.steps[0];
  return step ? buildStepReprompt(step, openCase.case_data || {}) : "";
}

function buildInsuranceResult(
  detection: Exclude<InsuranceDetection, { kind: "none" }>,
  conversation: ConversationSnapshot,
  openCase: CaseSnapshot | null,
): CoreTurnResult {
  const baseReply = buildMaybeGreetingWith(insuranceReply(detection), shouldIncludeGreeting(conversation));
  if (openCase?.status === "in_progress") {
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: "OBRAS_SOCIALES",
      confidence: 1,
      status: "bot_active",
      currentIntent: openCase.intent_key,
      currentStep: openCase.current_step,
      reply: buildTextMessage(formatReply([baseReply, pendingPromptFor(openCase)])),
      caseState: {
        intentKey: openCase.intent_key,
        status: "in_progress",
        currentStep: openCase.current_step,
        caseData: openCase.case_data || {},
        requiredFieldsStatus: openCase.required_fields_status || {},
        completedAt: null,
      },
      contactPatch: null,
    };
  }
  return {
    shouldReply: true,
    reason: "bot_reply",
    intent: "OBRAS_SOCIALES",
    confidence: 1,
    status: "bot_active",
    currentIntent: "OBRAS_SOCIALES",
    currentStep: null,
    reply: buildTextMessage(baseReply),
    caseState: null,
    contactPatch: null,
  };
}

function ambiguityPrompt(candidates: readonly string[]) {
  if (sameNormalizedValues(candidates, CARDOSO_NAMES)) return CARDOSO_SELECTION_PROMPT;
  if (sameNormalizedValues(candidates, SURGERY_CHOICES)) return SURGERY_SELECTION_PROMPT;
  return `Encontré más de un profesional o servicio: ${candidates.join(", ")}. Indíqueme cuál necesita.`;
}

function selectorCaseState(caseData: BotCaseData, status: "in_progress" | "closed" = "in_progress"): PersistedCaseState {
  const inProgress = status === "in_progress";
  return {
    intentKey: TURNOS_MEDICOS_SELECTOR_INTENT,
    status,
    currentStep: inProgress ? "professional_or_service" : null,
    caseData,
    requiredFieldsStatus: { professional_or_service: false },
    completedAt: inProgress ? null : new Date().toISOString(),
  };
}

function buildSelectorPromptResult(
  text: string,
  caseData: BotCaseData,
  includeGreeting: boolean,
): CoreTurnResult {
  return {
    shouldReply: true,
    reason: "bot_reply",
    intent: TURNOS_MEDICOS_SELECTOR_INTENT,
    confidence: 1,
    status: "bot_active",
    currentIntent: TURNOS_MEDICOS_SELECTOR_INTENT,
    currentStep: "professional_or_service",
    reply: buildTextMessage(buildMaybeGreetingWith(text, includeGreeting)),
    caseState: selectorCaseState(caseData),
    contactPatch: null,
  };
}

async function handleTurnosMedicosSelectorTurn(
  payload: NormalizedInbound,
  openCase: CaseSnapshot,
  options: CoreOptions,
): Promise<CoreTurnResult> {
  const selectionContext = String(openCase.case_data?.selectionContext || "");
  if (selectionContext === "surgery" || selectionContext === "cardoso") {
    const contextualSelection = detectSurgeryContextSelection(payload.body, selectionContext);
    if (contextualSelection.kind === "match") {
      if (!contextualSelection.available) {
        const unavailableFlow = getFlow(UNAVAILABLE_SERVICE_INTENT);
        if (!unavailableFlow || unavailableFlow.kind !== "info") throw new Error("Missing unavailable service flow");
        return {
          shouldReply: true,
          reason: "bot_reply",
          intent: UNAVAILABLE_SERVICE_INTENT,
          confidence: 1,
          status: "bot_active",
          currentIntent: UNAVAILABLE_SERVICE_INTENT,
          currentStep: null,
          reply: buildTextMessage(unavailableFlow.body),
          caseState: selectorCaseState(openCase.case_data || {}, "closed"),
          contactPatch: null,
        };
      }
      const targetFlow = getFlow("TURNOS_MEDICOS_ATENCION_MEDICA");
      if (targetFlow?.kind !== "case") throw new Error("Missing medical appointment flow");
      return handleCaseTurn(targetFlow, payload, null, medicalSelectionSeed(contextualSelection), options, true, false);
    }
  }

  const detected = await detectIntent(payload, null);
  if (detected.intent !== UNAVAILABLE_SERVICE_INTENT && !isIntentAvailable(detected.intent)) {
    detected.intent = UNAVAILABLE_SERVICE_INTENT;
    detected.seededData = {};
    delete detected.ambiguity;
  }
  if (detected.ambiguity?.length) {
    const context = ambiguityContext(detected.ambiguity);
    return buildSelectorPromptResult(
      ambiguityPrompt(detected.ambiguity),
      context ? { ...(openCase.case_data || {}), selectionContext: context } : openCase.case_data || {},
      false,
    );
  }

  if (detected.intent === OPENING_INTENT || detected.intent === TURNOS_MEDICOS_SELECTOR_INTENT) {
    const prompt = selectionContext === "cardoso"
      ? CARDOSO_SELECTION_PROMPT
      : selectionContext === "surgery"
        ? SURGERY_SELECTION_PROMPT
        : UNKNOWN_SERVICE_PROMPT;
    return buildSelectorPromptResult(prompt, openCase.case_data || {}, false);
  }

  if (detected.intent === "OTRAS_CONSULTAS" && detected.confidence < 0.9) {
    if (selectionContext === "cardoso" || selectionContext === "surgery") {
      return buildSelectorPromptResult(
        selectionContext === "cardoso" ? CARDOSO_SELECTION_PROMPT : SURGERY_SELECTION_PROMPT,
        openCase.case_data || {},
        false,
      );
    }
    const unavailableFlow = getFlow(UNAVAILABLE_SERVICE_INTENT);
    if (!unavailableFlow || unavailableFlow.kind !== "info") throw new Error("Missing unavailable service flow");
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: UNAVAILABLE_SERVICE_INTENT,
      confidence: 1,
      status: "bot_active",
      currentIntent: UNAVAILABLE_SERVICE_INTENT,
      currentStep: null,
      reply: buildTextMessage(unavailableFlow.body),
      caseState: selectorCaseState(openCase.case_data || {}, "closed"),
      contactPatch: null,
    };
  }

  const targetFlow = getFlow(detected.intent);
  if (targetFlow?.kind === "case") {
    return handleCaseTurn(targetFlow, payload, null, detected.seededData, options, true, false);
  }
  if (targetFlow) {
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: targetFlow.intent,
      confidence: detected.confidence,
      status: targetFlow.status,
      currentIntent: targetFlow.intent,
      currentStep: null,
      reply: buildFlowMessage(targetFlow.intent, options, false),
      caseState: selectorCaseState(openCase.case_data || {}, "closed"),
      contactPatch: null,
    };
  }

  return buildSelectorPromptResult(UNKNOWN_SERVICE_PROMPT, openCase.case_data || {}, false);
}

function buildInitialAmbiguityResult(candidates: readonly string[], includeGreeting: boolean): CoreTurnResult {
  const context = ambiguityContext(candidates);
  return buildSelectorPromptResult(
    ambiguityPrompt(candidates),
    context ? { selectionContext: context } : {},
    includeGreeting,
  );
}

function validationRequestsForCaseTurn(
  flow: CaseDefinition,
  payload: NormalizedInbound,
  existingCase: CaseSnapshot | null,
  seededData: BotCaseData,
) {
  if (!payload.numMedia) return [];
  const activeStep =
    firstIncompleteStep(flow, { ...(existingCase?.case_data || {}), ...seededData }) || flow.steps[0];
  const { nextCaseData } = mergeCaseData(flow, payload, existingCase?.case_data || {}, seededData, activeStep);
  const activeFields = stepFieldSet(activeStep);

  return [...activeFields]
    .filter(isDocumentMediaField)
    .filter((field) => {
      if (nextCaseData[field]) return false;
      if (field === "dniMedia" && !nextCaseData.patientFullName) return false;
      if (field === "insuranceCredentialMedia" && nextCaseData.insuranceMemberNumber) return false;
      return true;
    })
    .map((field) => ({
      field,
      expectedName: field === "dniMedia" ? String(nextCaseData.patientFullName || "") || null : null,
    }));
}

export async function getDocumentValidationRequestsForTurn(args: {
  payload: NormalizedInbound;
  conversation: ConversationSnapshot;
  openCase: CaseSnapshot | null;
}) {
  const { payload, conversation, openCase } = args;
  if (!payload.numMedia) return [];
  if (conversation.status === "waiting_operator" || conversation.status === "human_takeover") return [];

  if (openCase?.status === "in_progress") {
    if (openCase.intent_key === TURNOS_MEDICOS_SELECTOR_INTENT) {
      return [];
    }

    const flow = getFlow(openCase.intent_key);
    return flow?.kind === "case" ? validationRequestsForCaseTurn(flow, payload, openCase, {}) : [];
  }

  const detected = await detectIntent(payload, conversation);
  if (detected.intent !== UNAVAILABLE_SERVICE_INTENT && !isIntentAvailable(detected.intent)) return [];
  const flow = getFlow(detected.intent);
  return flow?.kind === "case" ? validationRequestsForCaseTurn(flow, payload, null, detected.seededData) : [];
}

export async function evaluateInboundTurn(args: {
  payload: NormalizedInbound;
  conversation: ConversationSnapshot;
  openCase: CaseSnapshot | null;
  options: CoreOptions;
}): Promise<CoreTurnResult> {
  const { payload, conversation, openCase, options } = args;

  const muted = muteWhileWaitingOperator(conversation, openCase);
  if (muted) return muted;

  if (!payload.numMedia && !isInsuranceAdministrativeIssue(payload.body)) {
    const insurance = detectInsuranceInquiry(payload.body);
    if (insurance.kind !== "none") return buildInsuranceResult(insurance, conversation, openCase);
  }

  if (openCase?.status === "in_progress") {
    if (openCase.intent_key === TURNOS_MEDICOS_SELECTOR_INTENT) {
      return await handleTurnosMedicosSelectorTurn(payload, openCase, options);
    }

    const flow = getFlow(openCase.intent_key);
    if (flow?.kind === "case") {
      if (
        flow.intent === "TURNOS_MEDICOS_ATENCION_MEDICA" &&
        !openCase.case_data.professionalOrService &&
        ["professional_or_service", "appointment_area"].includes(openCase.current_step || "")
      ) {
        const selection = detectMedicalSelection(payload.body);
        if (selection.kind === "ambiguous") {
          return {
            shouldReply: true,
            reason: "bot_reply",
            intent: flow.intent,
            confidence: 1,
            status: "bot_active",
            currentIntent: flow.intent,
            currentStep: "professional_or_service",
            reply: buildTextMessage(ambiguityPrompt(selection.candidates)),
            caseState: {
              intentKey: flow.intent,
              status: "in_progress",
              currentStep: "professional_or_service",
              caseData: openCase.case_data,
              requiredFieldsStatus: buildStepStatusMap(flow, openCase.case_data),
              completedAt: null,
            },
            contactPatch: null,
          };
        }
        if (selection.kind === "match") {
          if (!selection.available) {
            const unavailableFlow = getFlow(UNAVAILABLE_SERVICE_INTENT);
            if (!unavailableFlow || unavailableFlow.kind !== "info") throw new Error("Missing unavailable service flow");
            return {
              shouldReply: true,
              reason: "bot_reply",
              intent: UNAVAILABLE_SERVICE_INTENT,
              confidence: 1,
              status: "bot_active",
              currentIntent: UNAVAILABLE_SERVICE_INTENT,
              currentStep: null,
              reply: buildTextMessage(unavailableFlow.body),
              caseState: buildClosedCaseState(flow, openCase.case_data || {}),
              contactPatch: null,
            };
          }
          return handleCaseTurn(flow, payload, openCase, medicalSelectionSeed(selection), options, false, false);
        }
      }
      return handleCaseTurn(flow, payload, openCase, {}, options, false, false);
    }
  }

  const detected = await detectIntent(payload, conversation);
  if (detected.intent !== UNAVAILABLE_SERVICE_INTENT && !isIntentAvailable(detected.intent)) {
    detected.intent = UNAVAILABLE_SERVICE_INTENT;
    detected.seededData = {};
    delete detected.ambiguity;
  }
  const includeGreeting = shouldIncludeGreeting(conversation);
  if (detected.ambiguity?.length) {
    return buildInitialAmbiguityResult(detected.ambiguity, includeGreeting);
  }
  if (detected.intent === OPENING_INTENT) {
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: OPENING_INTENT,
      confidence: detected.confidence,
      status: "bot_active",
      currentIntent: OPENING_INTENT,
      currentStep: null,
      reply: buildTextMessage(buildOpeningMessage()),
      caseState: null,
      contactPatch: null,
    };
  }

  const flow = getFlow(detected.intent);
  if (!flow) {
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: "OTRAS_CONSULTAS",
      confidence: 0,
      status: "bot_active",
      currentIntent: OPENING_INTENT,
      currentStep: null,
      reply: buildTextMessage(buildOpeningMessage()),
      caseState: null,
      contactPatch: null,
    };
  }

  if (flow.kind === "case") {
    return handleCaseTurn(flow, payload, null, detected.seededData, options, true, includeGreeting);
  }

  if (flow.kind === "contact") {
    const withGreeting = buildFlowMessage(flow.intent, options, includeGreeting);
    return {
      shouldReply: true,
      reason: "bot_reply",
      intent: flow.intent,
      confidence: detected.confidence,
      status: flow.status,
      currentIntent: flow.intent,
      currentStep: null,
      reply: withGreeting,
      caseState: null,
      contactPatch: null,
    };
  }

  const replyText = flow.intent === UNAVAILABLE_SERVICE_INTENT
    ? flow.body
    : buildMaybeGreetingWith(flow.body, includeGreeting);

  return {
    shouldReply: true,
    reason: "bot_reply",
    intent: flow.intent,
    confidence: detected.confidence,
    status: flow.status,
    currentIntent: flow.intent,
    currentStep: null,
    reply: buildTextMessage(replyText),
    caseState: null,
    contactPatch: null,
  };
}

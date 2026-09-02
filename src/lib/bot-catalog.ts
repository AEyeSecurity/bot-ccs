import type { BotCaseData, BotFieldKey, PersistedCaseState } from "./bot-types";
import type { ManagedCatalog } from "./managed-catalog";

export let BOT_GREETING = "";
export let BOT_THANK_YOU = "";
export let SURGERY_SELECTION_PROMPT = "";
export let CARDOSO_SELECTION_PROMPT = "";
export let UNKNOWN_SERVICE_PROMPT = "";

export const OPENING_INTENT = "OPENING";
export const TELEMEDICINA_INTENT = "TELEMEDICINA_DRA_ESTRADA";
export const TURNOS_MEDICOS_SELECTOR_INTENT = "TURNOS_MEDICOS_SELECTOR";
export const UNAVAILABLE_SERVICE_INTENT = "SERVICIO_NO_DISPONIBLE";

export const REMOTE_CITY_EXAMPLES = ["pico truncado", "las heras"];

export const PROFESSIONAL_SUBSERVICE_ALIASES: Record<string, readonly string[]> = {
  "Cirugía general": ["cirujano general", "cirujana general"],
  "Cirugía maxilofacial": ["maxilofacial", "cirujano maxilofacial", "cirujana maxilofacial", "cirugía bucomaxilofacial", "bucomaxilofacial"],
  "Cirugías estéticas y plásticas": [
    "cirugía estética",
    "cirugías estéticas",
    "cirugía plástica",
    "cirugías plásticas",
    "cirugía estética y plástica",
    "cirugías estéticas y plásticas",
    "estética y plástica",
  ],
  "Cirugía vascular": ["cirujano vascular", "cirujana vascular"],
};

export type MedicalService = ManagedCatalog["medicalServices"][number] & { body: string };
export type ImagingStudy = ManagedCatalog["imagingStudies"][number];
export type Professional = ManagedCatalog["professionals"][number];
export type ProfessionalResponseGroup = ManagedCatalog["professionalResponseGroups"][number];
export type InsurancePlan = ManagedCatalog["insurancePlans"][number];
export type ProfessionalDetection =
  | { kind: "none" }
  | {
      kind: "match";
      label: string;
      specialty: string;
      responseGroupIds: readonly string[];
      professionalNames: readonly string[];
      available: boolean;
    }
  | { kind: "ambiguous"; candidates: readonly string[] };

export let MEDICAL_SERVICES: readonly MedicalService[] = [];
export let IMAGING_STUDIES: readonly ImagingStudy[] = [];
export let PROFESSIONAL_RESPONSE_GROUPS: readonly ProfessionalResponseGroup[] = [];
export let PROFESSIONALS: readonly Professional[] = [];
export let INSURANCE_PLANS: readonly InsurancePlan[] = [];
export let SPECIALTIES: readonly string[] = [];
let FLOW_AVAILABILITY: Readonly<Record<string, boolean>> = {};

const BASE_VISIBLE_BRANCHES = [
  "TURNOS_MEDICOS",
  TURNOS_MEDICOS_SELECTOR_INTENT,
  "LABORATORIO_CLINICO",
  "INFORMES_MEDICOS",
  "RECETAS_MEDICAS",
  "NUESTROS_EDIFICIOS",
  "INTERNACION",
  "GUARDIA",
  "BUSQUEDA_LABORAL",
  "OBRAS_SOCIALES",
  "MEDICOS_CLINICOS",
  "OTRAS_CONSULTAS",
  "TURNOS_MEDICOS_ATENCION_MEDICA",
  "TURNOS_MEDICOS_IMAGENES_MEDICAS",
  "INFORMES_MEDICOS_IMAGENES_MEDICAS",
  "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA",
  "INFORMES_MEDICOS_LABORATORIO_CLINICO",
  TELEMEDICINA_INTENT,
  UNAVAILABLE_SERVICE_INTENT,
] as const;
export let SHEET_VISIBLE_BRANCHES: readonly string[] = BASE_VISIBLE_BRANCHES;

export type StepRequirement = {
  label: string;
  mode: "allOf" | "oneOf";
  fields: BotFieldKey[];
};

export type CaseStepDefinition = {
  key: string;
  prompt: string;
  requirements: StepRequirement[];
};

export type FinalAction =
  | {
      kind: "handoff";
      text: string;
      status: "waiting_operator";
    }
  | {
      kind: "contact";
      text: string;
      status: "closed" | "bot_active";
      numbers: string[];
      vcardFile?: string;
    }
  | {
      kind: "info";
      text: string;
      status: "bot_active" | "closed";
    };

export type ContactDefinition = {
  intent: string;
  kind: "contact";
  title: string;
  numbers: string[];
  body: string;
  vcardFile?: string;
  status: "closed" | "bot_active";
};

export type InfoDefinition = {
  intent: string;
  kind: "info";
  title: string;
  body: string;
  status: "bot_active" | "closed" | "waiting_operator";
};

export type CaseDefinition = {
  intent: string;
  kind: "case";
  title: string;
  intro: string;
  steps: CaseStepDefinition[];
  finalize: (args: { caseData: BotCaseData }) => FinalAction;
};

export type FlowDefinition = ContactDefinition | InfoDefinition | CaseDefinition;

export const CONTACT_CARD_FILES = {
  LABORATORIO_CLINICO: "ccs-laboratorio-clinico.vcf",
  INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA: "ccs-estudios-patologia.vcf",
  INFORMES_MEDICOS_LABORATORIO_CLINICO: "ccs-laboratorio-clinico.vcf",
  RECETAS_MEDICAS: "ccs-recetas-medicas.vcf",
  TELEMEDICINA_DRA_ESTRADA: "ccs-telemedicina-dra-estrada.vcf",
} as const;

export function buildOpeningMessage(): string {
  return BOT_GREETING;
}

export function formatReply(parts: string[]) {
  return parts.filter(Boolean).join("\n\n");
}

export function formatContactIntro(body: string, vcardAttached: boolean) {
  return vcardAttached ? `${body}\n\nLe comparto la tarjeta de contacto por este medio.` : body;
}

function buildFlows(catalog: ManagedCatalog): Record<string, FlowDefinition> {
  const direct = (key: string) => {
    const entry = catalog.direct[key];
    if (!entry) throw new Error(`Missing direct catalog entry: ${key}`);
    return entry;
  };
  const message = (key: string) => {
    const entry = catalog.messages[key];
    if (!entry) throw new Error(`Missing catalog message: ${key}`);
    return entry.body;
  };

  return {
  TURNOS_MEDICOS_SELECTOR: {
    intent: TURNOS_MEDICOS_SELECTOR_INTENT,
    kind: "case",
    title: "Turnos médicos",
    intro: "",
    steps: [
      {
        key: "professional_or_service",
        prompt: message("turnServicePrompt"),
        requirements: [{ label: "el profesional o servicio que necesita", mode: "allOf", fields: ["professionalOrService"] }],
      },
    ],
    finalize: () => ({
      kind: "info",
      status: "bot_active",
      text: "Gracias. Continúo con su solicitud.",
    }),
  },
  LABORATORIO_CLINICO: {
    intent: "LABORATORIO_CLINICO",
    kind: "contact",
    title: "Laboratorio clínico",
    numbers: [...direct("laboratory").phones],
    vcardFile: CONTACT_CARD_FILES.LABORATORIO_CLINICO,
    body: direct("laboratory").body,
    status: "closed",
  },
  INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA: {
    intent: "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA",
    kind: "contact",
    title: "Informes médicos - Estudios de Patología",
    numbers: [...direct("reportsPathology").phones],
    vcardFile: CONTACT_CARD_FILES.INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA,
    body: direct("reportsPathology").body,
    status: "closed",
  },
  INFORMES_MEDICOS_LABORATORIO_CLINICO: {
    intent: "INFORMES_MEDICOS_LABORATORIO_CLINICO",
    kind: "contact",
    title: "Informes médicos - Laboratorio clínico",
    numbers: [...direct("reportsLaboratory").phones],
    vcardFile: CONTACT_CARD_FILES.INFORMES_MEDICOS_LABORATORIO_CLINICO,
    body: direct("reportsLaboratory").body,
    status: "closed",
  },
  RECETAS_MEDICAS: {
    intent: "RECETAS_MEDICAS",
    kind: "contact",
    title: "Recetas médicas",
    numbers: [...direct("prescriptions").phones],
    vcardFile: CONTACT_CARD_FILES.RECETAS_MEDICAS,
    body: direct("prescriptions").body,
    status: "closed",
  },
  INTERNACION: {
    intent: "INTERNACION",
    kind: "contact",
    title: "Internación",
    numbers: [...direct("hospitalization").phones],
    body: direct("hospitalization").body,
    status: "closed",
  },
  GUARDIA: {
    intent: "GUARDIA",
    kind: "info",
    title: "Guardia",
    body: direct("guard").body,
    status: "bot_active",
  },
  BUSQUEDA_LABORAL: {
    intent: "BUSQUEDA_LABORAL",
    kind: "info",
    title: "Búsqueda laboral",
    body: direct("employment").body,
    status: "bot_active",
  },
  MEDICOS_CLINICOS: {
    intent: "MEDICOS_CLINICOS",
    kind: "info",
    title: "Médicos clínicos",
    body: direct("clinicalMedicine").body,
    status: "bot_active",
  },
  NUESTROS_EDIFICIOS: {
    intent: "NUESTROS_EDIFICIOS",
    kind: "info",
    title: "Nuestros edificios",
    body: direct("buildings").body,
    status: "bot_active",
  },
  TELEMEDICINA_DRA_ESTRADA: {
    intent: TELEMEDICINA_INTENT,
    kind: "case",
    title: "Telemedicina - Dra. Estrada",
    intro: message("telemedicineIntro"),
    steps: [
      {
        key: "city",
        prompt: message("telemedicineCityPrompt"),
        requirements: [{ label: "la localidad desde la que nos escribe", mode: "allOf", fields: ["city"] }],
      },
    ],
    finalize: ({ caseData }) => {
      const city = String(caseData.city || "").trim().toLowerCase();
      if (city && city !== "caleta olivia") {
        return {
          kind: "contact",
          status: "closed",
          numbers: [...direct("buildings").phones],
          vcardFile: CONTACT_CARD_FILES.TELEMEDICINA_DRA_ESTRADA,
          text: direct("telemedicine").body,
        };
      }

      return {
        kind: "info",
        status: "bot_active",
        text:
          direct("buildings").body,
      };
    },
  },
  TURNOS_MEDICOS_ATENCION_MEDICA: {
    intent: "TURNOS_MEDICOS_ATENCION_MEDICA",
    kind: "case",
    title: "Turnos médicos - Atención médica",
    intro: message("medicalAppointmentIntro"),
    steps: [
      {
        key: "professional_or_service",
        prompt: message("turnServicePrompt"),
        requirements: [{ label: "el profesional o servicio que necesita", mode: "allOf", fields: ["professionalOrService"] }],
      },
      {
        key: "patient_identity",
        prompt: message("patientIdentityPrompt"),
        requirements: [
          { label: "el nombre completo del paciente", mode: "allOf", fields: ["patientFullName"] },
          { label: "una foto clara del DNI, frente y dorso", mode: "allOf", fields: ["dniMedia"] },
        ],
      },
      {
        key: "insurance",
        prompt: message("insurancePrompt"),
        requirements: [
          {
            label: "el número de afiliado de la obra social o una foto clara de la credencial",
            mode: "oneOf",
            fields: ["insuranceMemberNumber", "insuranceCredentialMedia"],
          },
        ],
      },
      {
        key: "availability",
        prompt: message("availabilityPrompt"),
        requirements: [{ label: "la disponibilidad para asistir, con días y horarios", mode: "allOf", fields: ["availability"] }],
      },
    ],
    finalize: () => ({
      kind: "handoff",
      status: "waiting_operator",
      text: message("medicalAppointmentHandoff"),
    }),
  },
  TURNOS_MEDICOS_IMAGENES_MEDICAS: {
    intent: "TURNOS_MEDICOS_IMAGENES_MEDICAS",
    kind: "case",
    title: "Turnos médicos - Imágenes médicas",
    intro: message("imagingAppointmentIntro"),
    steps: [
      {
        key: "imaging_study",
        prompt: message("imagingStudyPrompt"),
        requirements: [{ label: "el estudio de imágenes que necesita", mode: "allOf", fields: ["imagingStudy"] }],
      },
      {
        key: "patient_identity",
        prompt: "Necesito el nombre completo del paciente y una foto clara del DNI, frente y dorso.",
        requirements: [
          { label: "el nombre completo del paciente", mode: "allOf", fields: ["patientFullName"] },
          { label: "una foto clara del DNI, frente y dorso", mode: "allOf", fields: ["dniMedia"] },
        ],
      },
      {
        key: "medical_order",
        prompt: "Ahora envíeme una foto clara del pedido médico.",
        requirements: [{ label: "una foto clara del pedido médico", mode: "allOf", fields: ["medicalOrderMedia"] }],
      },
      {
        key: "insurance",
        prompt: "Por último, indíqueme el número de afiliado de la obra social.",
        requirements: [{ label: "el número de afiliado de la obra social", mode: "allOf", fields: ["insuranceMemberNumber"] }],
      },
    ],
    finalize: () => ({
      kind: "handoff",
      status: "waiting_operator",
      text: message("imagingAppointmentHandoff"),
    }),
  },
  INFORMES_MEDICOS_IMAGENES_MEDICAS: {
    intent: "INFORMES_MEDICOS_IMAGENES_MEDICAS",
    kind: "case",
    title: "Informes médicos - Imágenes médicas",
    intro: direct("reportsImages").body,
    steps: [
      {
        key: "patient_name",
        prompt: message("reportsPatientPrompt"),
        requirements: [{ label: "el nombre completo del paciente", mode: "allOf", fields: ["patientFullName"] }],
      },
      {
        key: "dni",
        prompt: message("reportsDniPrompt"),
        requirements: [{ label: "una foto clara del DNI, frente y dorso", mode: "allOf", fields: ["dniMedia"] }],
      },
      {
        key: "study_and_date",
        prompt: message("reportsStudyDatePrompt"),
        requirements: [{ label: "el estudio y la fecha estimada de realización", mode: "allOf", fields: ["studyAndDate"] }],
      },
    ],
    finalize: () => ({
      kind: "handoff",
      status: "waiting_operator",
      text: message("reportsHandoff"),
    }),
  },
  OBRAS_SOCIALES: {
    intent: "OBRAS_SOCIALES",
    kind: "case",
    title: "Obras sociales",
    intro: formatReply([
      direct("socialInsurance").body,
      INSURANCE_PLANS.filter((plan) => plan.available).map((plan) => plan.name).join("\n"),
    ]),
    steps: [
      {
        key: "reason",
        prompt: message("insuranceReasonPrompt"),
        requirements: [{ label: "el motivo de su consulta", mode: "allOf", fields: ["operatorReason"] }],
      },
    ],
    finalize: () => ({
      kind: "handoff",
      status: "waiting_operator",
      text: message("insuranceHandoff"),
    }),
  },
  OTRAS_CONSULTAS: {
    intent: "OTRAS_CONSULTAS",
    kind: "case",
    title: "Otras consultas",
    intro: message("otherConsultIntro"),
    steps: [
      {
        key: "reason",
        prompt: message("otherConsultPrompt"),
        requirements: [{ label: "el motivo de su consulta", mode: "allOf", fields: ["operatorReason"] }],
      },
    ],
    finalize: () => ({
      kind: "handoff",
      status: "waiting_operator",
      text: message("otherConsultHandoff"),
    }),
  },
  SERVICIO_NO_DISPONIBLE: {
    intent: UNAVAILABLE_SERVICE_INTENT,
    kind: "info",
    title: "Servicio no disponible",
    body: message("unavailableService"),
    status: "bot_active",
  },
  FUERA_ALCANCE_MEDICO: {
    intent: "FUERA_ALCANCE_MEDICO",
    kind: "info",
    title: "Fuera de alcance médico",
    body: message("outOfScope"),
    status: "waiting_operator",
  },
  ...Object.fromEntries(
    IMAGING_STUDIES.map((study) => [
      study.intent,
      {
        intent: study.intent,
        kind: "info",
        title: study.title,
        body: study.body,
        status: "closed",
      } satisfies InfoDefinition,
    ]),
  ),
  };
}

export let FLOWS: Record<string, FlowDefinition> = {};

export function activateCatalog(catalog: ManagedCatalog) {
  BOT_GREETING = catalog.messages.greetingQuestion.body;
  BOT_THANK_YOU = catalog.messages.greetingThanks.body;
  SURGERY_SELECTION_PROMPT = catalog.messages.surgerySelector.body;
  CARDOSO_SELECTION_PROMPT = catalog.messages.cardosoSelector.body;
  UNKNOWN_SERVICE_PROMPT = catalog.messages.unknownServicePrompt.body;
  PROFESSIONALS = catalog.professionals;
  PROFESSIONAL_RESPONSE_GROUPS = catalog.professionalResponseGroups.map((group) => ({
    ...group,
    available:
      group.available &&
      catalog.professionals.some(
        (professional) => professional.responseGroupId === group.id && professional.available,
      ),
  }));
  MEDICAL_SERVICES = catalog.medicalServices.map((service) => {
    const groups = PROFESSIONAL_RESPONSE_GROUPS
      .filter((group) => group.specialty === service.title && group.available)
      .sort((left, right) => left.order - right.order);
    return {
      ...service,
      body: formatReply([service.generalBody, ...groups.map((group) => group.body)]),
    };
  });
  IMAGING_STUDIES = catalog.imagingStudies;
  INSURANCE_PLANS = catalog.insurancePlans;
  SPECIALTIES = MEDICAL_SERVICES.map((service) => service.title);
  SHEET_VISIBLE_BRANCHES = [...BASE_VISIBLE_BRANCHES, ...IMAGING_STUDIES.map((item) => item.intent)];
  FLOWS = buildFlows(catalog);
  FLOW_AVAILABILITY = {
    LABORATORIO_CLINICO: catalog.direct.laboratory.available,
    INFORMES_MEDICOS_IMAGENES_MEDICAS: catalog.direct.reportsImages.available,
    INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA: catalog.direct.reportsPathology.available,
    INFORMES_MEDICOS_LABORATORIO_CLINICO: catalog.direct.reportsLaboratory.available,
    RECETAS_MEDICAS: catalog.direct.prescriptions.available,
    NUESTROS_EDIFICIOS: catalog.direct.buildings.available,
    INTERNACION: catalog.direct.hospitalization.available,
    GUARDIA: catalog.direct.guard.available,
    BUSQUEDA_LABORAL: catalog.direct.employment.available,
    MEDICOS_CLINICOS: catalog.direct.clinicalMedicine.available,
    [TELEMEDICINA_INTENT]: catalog.direct.telemedicine.available,
    OBRAS_SOCIALES: catalog.direct.socialInsurance.available,
    ...Object.fromEntries(catalog.imagingStudies.map((study) => [study.intent, study.available])),
  };
}

export function hasActiveCatalog() {
  return Boolean(BOT_GREETING && MEDICAL_SERVICES.length && IMAGING_STUDIES.length && Object.keys(FLOWS).length);
}

export function getFlow(intent: string): FlowDefinition | null {
  return FLOWS[intent] || null;
}

export function isIntentAvailable(intent: string) {
  return FLOW_AVAILABILITY[intent] !== false;
}

export function buildCaseFinalState(intent: string, caseState: PersistedCaseState): FinalAction {
  const flow = getFlow(intent);
  if (!flow || flow.kind !== "case") {
    throw new Error(`Flow ${intent} is not a case`);
  }
  return flow.finalize({ caseData: caseState.caseData });
}

export function buildStepStatusMap(flow: CaseDefinition, caseData: BotCaseData) {
  const map: Record<string, boolean> = {};
  for (const step of flow.steps) {
    map[step.key] = step.requirements.every((requirement) =>
      requirement.mode === "allOf"
        ? requirement.fields.every((field) => Boolean(caseData[field]))
        : requirement.fields.some((field) => Boolean(caseData[field])),
    );
  }
  return map;
}

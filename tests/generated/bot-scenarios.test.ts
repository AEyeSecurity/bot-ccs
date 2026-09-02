import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  FLOWS,
  IMAGING_STUDIES,
  INSURANCE_PLANS,
  MEDICAL_SERVICES,
  PROFESSIONALS,
  PROFESSIONAL_RESPONSE_GROUPS,
  SHEET_VISIBLE_BRANCHES,
} from "@/lib/bot-catalog";
import { BOT_2026_DATA } from "@/lib/bot-2026-data";
import { CARDOSO_SELECTION_PROMPT, SURGERY_SELECTION_PROMPT } from "@/lib/bot-core";
import { createFakeSupabaseClient, type FakeSupabaseClient } from "../helpers/fake-supabase";

const supabaseHolder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

const documentValidationHolder = vi.hoisted(() => ({
  validate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createAdminSupabaseClient: () => supabaseHolder.client,
}));

vi.mock("@/lib/document-validation", () => ({
  validateDocumentMedia: documentValidationHolder.validate,
}));

const coveredBranches = new Set<string>();
const coveredTransitions = new Set<string>();
const executedScenarios: Array<{ name: string; branches: string[] }> = [];

const PROFESSION_ALIASES: Record<string, readonly string[]> = {
  Cardiología: ["cardiólogo", "cardióloga"],
  Cirugía: ["cirujano", "cirujana"],
  "Clínica Médica": ["médico generalista", "médica generalista", "generalista"],
  Dermatología: ["dermatólogo", "dermatóloga"],
  Diabetología: ["diabetólogo", "diabetóloga"],
  Gastroenterología: ["gastroenterólogo", "gastroenteróloga"],
  "Ginecología y Obstetricia": ["ginecólogo", "ginecóloga", "obstetra"],
  Nefrología: ["nefrólogo", "nefróloga"],
  Neurología: ["neurólogo", "neuróloga"],
  Nutrición: ["nutricionista"],
  Oncología: ["oncólogo", "oncóloga"],
  Psicología: ["psicólogo", "psicóloga"],
  Pediatría: ["pediatra"],
  Psiquiatría: ["psiquiatra"],
  Reumatología: ["reumatólogo", "reumatóloga"],
  Traumatología: ["traumatólogo", "traumatóloga"],
  Urología: ["urólogo", "uróloga"],
  Infectología: ["infectólogo", "infectóloga"],
};

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inbound(from: string, body: string, overrides: Record<string, unknown> = {}) {
  const count = supabaseHolder.client.table("messages").length + 1;
  const numMedia = Number(overrides.numMedia || 0);
  return {
    from,
    to: "whatsapp:+5493516424148",
    body,
    messageSid: String(overrides.messageSid || `SM-SCENARIO-${count}`),
    profileName: "Paciente Escenario",
    numMedia,
    mediaContentTypes: (overrides.mediaContentTypes as string[]) || [],
    mediaUrls:
      (overrides.mediaUrls as string[]) ||
      Array.from({ length: numMedia }).map((_, index) => `mock://valid-${index}`),
    rawPayload: {},
    geminiClassification: null,
  };
}

function normalizePhone(value: string) {
  return `+${value.replace(/\D/g, "")}`;
}

function latestConversationFor(client: FakeSupabaseClient, from: string) {
  const normalized = normalizePhone(from);
  const contact = client.table("contacts").find((item) => item.whatsapp_number === normalized);
  if (!contact) return null;
  return [...client.table("conversations")]
    .filter((item) => item.contact_id === contact.id)
    .sort((left, right) => String(right.last_activity_at || "").localeCompare(String(left.last_activity_at || "")))[0] || null;
}

function recordScenario(name: string, branches: string[]) {
  executedScenarios.push({ name, branches });
  branches.forEach((branch) => coveredBranches.add(branch));
}

function assertNoLegacyMenu(text: string | null | undefined) {
  if (!text) return;
  expect(text.toLowerCase()).not.toContain("elija una opción");
  expect(text.toLowerCase()).not.toContain("list-picker");
  expect(text).not.toMatch(/\n\s*\d+\./);
}

function latestCaseFor(client: FakeSupabaseClient, from: string) {
  const conversation = latestConversationFor(client, from);
  if (!conversation?.id) return null;
  return [...client.table("cases")]
    .filter((item) => item.conversation_id === conversation.id)
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0] || null;
}

const CASE_STARTERS: Record<string, { body: string; overrides?: Record<string, unknown> }> = {
  TURNOS_MEDICOS_SELECTOR: { body: "quiero un turno medico" },
  TURNOS_MEDICOS_ATENCION_MEDICA: { body: "Cardiología" },
  TURNOS_MEDICOS_IMAGENES_MEDICAS: { body: "imágenes médicas" },
  INFORMES_MEDICOS_IMAGENES_MEDICAS: { body: "Necesito un informe de imágenes" },
  OBRAS_SOCIALES: { body: "Tengo un problema administrativo con mi obra social" },
  OTRAS_CONSULTAS: { body: "otra consulta" },
  TELEMEDICINA_DRA_ESTRADA: { body: "Telemedicina" },
};

function validAnswerForStep(stepKey: string) {
  switch (stepKey) {
    case "imaging_study":
      return { body: "resonancia" };
    case "professional_or_service":
      return { body: "Cardiología" };
    case "patient_identity":
      return {
        body: "Juan Perez",
        overrides: { numMedia: 2, mediaContentTypes: ["image/jpeg", "image/jpeg"] },
      };
    case "insurance":
      return { body: "123456" };
    case "availability":
      return { body: "Lunes por la tarde" };
    case "medical_order":
      return {
        body: "Adjunto pedido",
        overrides: { numMedia: 1, mediaContentTypes: ["image/jpeg"] },
      };
    case "patient_name":
      return { body: "Juan Perez" };
    case "dni":
      return {
        body: "Adjunto DNI",
        overrides: { numMedia: 2, mediaContentTypes: ["image/jpeg", "image/jpeg"] },
      };
    case "study_and_date":
      return { body: "Tomografía del 12/06/2026" };
    case "reason":
      return { body: "Necesito saber si aceptan OSDE 210" };
    case "city":
      return { body: "Las Heras" };
    default:
      throw new Error(`No valid answer defined for ${stepKey}`);
  }
}

function partialOrInvalidAnswerForStep(stepKey: string) {
  switch (stepKey) {
    case "imaging_study":
      return { body: "hola" };
    case "patient_identity":
      return { body: "Juan Perez" };
    case "insurance":
      return { body: "No lo tengo todavía" };
    case "availability":
      return { body: "hola" };
    case "medical_order":
      return { body: "Todavía no lo tengo" };
    case "patient_name":
      return { body: "hola" };
    case "dni":
      return { body: "Todavía no lo tengo" };
    case "study_and_date":
      return { body: "mañana" };
    case "reason":
      return { body: "consulta" };
    case "city":
      return { body: "me interesa" };
    case "professional_or_service":
      return { body: "hola" };
    default:
      throw new Error(`No partial answer defined for ${stepKey}`);
  }
}

describe("generated bot scenario matrix", () => {
  let processInbound: typeof import("@/lib/bot-engine").processInbound;

  beforeAll(async () => {
    supabaseHolder.client = createFakeSupabaseClient();
    ({ processInbound } = await import("@/lib/bot-engine"));
  });

  beforeEach(() => {
    supabaseHolder.client = createFakeSupabaseClient();
    documentValidationHolder.validate.mockReset();
    documentValidationHolder.validate.mockImplementation(async (_payload, request) => ({
      field: request.field,
      valid: true,
      reason: "valid",
      confidence: 0.96,
      documentType:
        request.field === "dniMedia"
          ? "dni"
          : request.field === "insuranceCredentialMedia"
            ? "insurance_credential"
            : "medical_order",
    }));
  });

  async function applyTurn(
    from: string,
    body: string,
    overrides: Record<string, unknown> = {},
  ) {
    const previous = latestConversationFor(supabaseHolder.client, from);
    const result = await processInbound(inbound(from, body, overrides));
    assertNoLegacyMenu(result.replyText);
    const next = latestConversationFor(supabaseHolder.client, from);
    coveredTransitions.add(
      `${previous?.status || "none"}:${previous?.current_step || "-"}->${next?.status || "none"}:${next?.current_step || "-"}`,
    );
    return { result, next };
  }

  async function progressCaseToStep(from: string, flowIntent: string, targetStepIndex: number) {
    const flow = FLOWS[flowIntent];
    if (!flow || flow.kind !== "case") {
      throw new Error(`Flow ${flowIntent} is not a case`);
    }

    const starter = CASE_STARTERS[flowIntent];
    if (!starter) {
      throw new Error(`No starter defined for ${flowIntent}`);
    }

    const starterStepIndex = flowIntent === "TURNOS_MEDICOS_ATENCION_MEDICA" ? 1 : 0;
    if (targetStepIndex < starterStepIndex) {
      throw new Error(`Step ${flow.steps[targetStepIndex]?.key} is only reachable through the open selector`);
    }

    let current = await applyTurn(from, starter.body, starter.overrides || {});
    let latestCase = latestCaseFor(supabaseHolder.client, from);
    expect(latestCase?.current_step).toBe(flow.steps[starterStepIndex]?.key || null);

    for (let stepIndex = starterStepIndex; stepIndex < targetStepIndex; stepIndex += 1) {
      const answer = validAnswerForStep(flow.steps[stepIndex].key);
      current = await applyTurn(from, answer.body, answer.overrides || {});
      latestCase = latestCaseFor(supabaseHolder.client, from);
      expect(latestCase?.current_step).toBe(flow.steps[stepIndex + 1]?.key || null);
    }

    latestCase = latestCaseFor(supabaseHolder.client, from);
    expect(latestCase?.current_step).toBe(flow.steps[targetStepIndex]?.key || null);
    return { current, flow, latestCase };
  }

  const directInfoScenarios = [
    {
      name: "laboratorio directo",
      intent: "LABORATORIO_CLINICO",
      message: "Laboratorio",
      expect: "orden de llegada",
      expectsVcard: true,
    },
    {
      name: "patología directo",
      intent: "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA",
      message: "Necesito un informe de patología",
      expect: "patología",
      expectsVcard: true,
    },
    {
      name: "informes laboratorio directo",
      intent: "INFORMES_MEDICOS_LABORATORIO_CLINICO",
      message: "Quiero resultados de laboratorio",
      expect: "resultados de sus análisis",
      expectsVcard: true,
    },
    {
      name: "recetas directo",
      intent: "RECETAS_MEDICAS",
      message: "Necesito una receta",
      expect: "receta médica",
      expectsVcard: true,
    },
    {
      name: "internación directo",
      intent: "INTERNACION",
      message: "Consulta de internación",
      expect: "admisión e internación",
    },
    {
      name: "médicos clínicos directo",
      intent: "MEDICOS_CLINICOS",
      message: "Médicos clínicos",
      expect: "orden de llegada",
    },
    {
      name: "edificios directo",
      intent: "NUESTROS_EDIFICIOS",
      message: "¿Dónde queda cardiología?",
      expect: "Sector A",
    },
    {
      name: "guardia directo",
      intent: "GUARDIA",
      message: "¿Dónde está la guardia?",
      expect: "atención médica las 24 horas",
    },
    {
      name: "búsqueda laboral directa",
      intent: "BUSQUEDA_LABORAL",
      message: "Quiero enviar mi CV para trabajar",
      expect: "gestiondepersonal@clinicacruzdelsur.com.ar",
    },
  ] as const;

  for (const scenario of directInfoScenarios) {
    test(scenario.name, async () => {
      const from = `whatsapp:+5491200${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const { result } = await applyTurn(from, scenario.message);
      expect(result.intent).toBe(scenario.intent);
      expect(result.replyText).toContain(scenario.expect);
      expect(result.replyText).toContain("Gracias por comunicarse con Clínica Cruz del Sur.");
      expect(result.replyText).not.toContain("¿En qué podemos ayudarle?");
      if (scenario.expectsVcard) {
        expect(result.media?.kind).toBe("vcard");
      } else {
        expect(result.media).toBeNull();
      }
      recordScenario(scenario.name, [scenario.intent]);
    });

    test(`${scenario.name} vía saludo`, async () => {
      const from = `whatsapp:+5491300${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const opening = await applyTurn(from, "hola");
      expect(opening.result.intent).toBe("OPENING");
      const resolved = await applyTurn(from, scenario.message);
      expect(resolved.result.intent).toBe(scenario.intent);
      if (scenario.expectsVcard) {
        expect(resolved.result.media?.kind).toBe("vcard");
      } else {
        expect(resolved.result.media).toBeNull();
      }
      recordScenario(`${scenario.name} vía saludo`, [scenario.intent, "OPENING"]);
    });

    test(`${scenario.name} desde solicitud abierta`, async () => {
      const from = `whatsapp:+5491350${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const opened = await applyTurn(from, "quiero un turno");
      expect(opened.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
      const resolved = await applyTurn(from, scenario.message);
      expect(resolved.result.intent).toBe(scenario.intent);
      expect(resolved.result.replyText).toContain(scenario.expect);
      expect(latestCaseFor(supabaseHolder.client, from)?.status).not.toBe("in_progress");
      recordScenario(`${scenario.name} desde solicitud abierta`, ["TURNOS_MEDICOS_SELECTOR", scenario.intent]);
    });
  }

  test("apellido ambiguo solicita una elección y luego resuelve el bloque exacto", async () => {
    const from = "whatsapp:+5491360000001";
    const ambiguous = await applyTurn(from, "Quiero turno con Cardoso");
    expect(ambiguous.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(ambiguous.result.replyText).toContain(CARDOSO_SELECTION_PROMPT);

    const resolved = await applyTurn(from, "Atilio Cardoso");
    const group = PROFESSIONAL_RESPONSE_GROUPS.find((item) => item.id === "cirugia_cardoso_atilio");
    expect(resolved.result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(resolved.result.replyText).toContain(group?.body);
    expect(resolved.result.replyText).not.toContain("Cardoso Martin especialista");
  });

  test("varias menciones de bloques individualizados requieren aclaración", async () => {
    const from = "whatsapp:+5491360000002";
    const result = await applyTurn(from, "Quiero turno con Longo y Castro");
    expect(result.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(result.result.replyText).toContain("Longo José Luis");
    expect(result.result.replyText).toContain("Castro Germán");
  });

  test("varias menciones de grupos diferentes requieren aclaración", async () => {
    const from = "whatsapp:+5491360000003";
    const result = await applyTurn(from, "Quiero turno con Cardoso Atilio y Heredia");
    expect(result.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(result.result.replyText).toContain("Cardoso Atilio");
    expect(result.result.replyText).toContain("Heredia Luciano");
  });

  for (const study of IMAGING_STUDIES) {
    test(`imagen ${study.title}`, async () => {
      const from = `whatsapp:+5491400${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const { result, next } = await applyTurn(from, study.matchers[0]);
      expect(result.intent).toBe(study.intent);
      expect(next?.status).toBe("closed");
      expect(result.replyText).toContain(study.body);
      expect(result.replyText).toContain("Gracias por comunicarse con Clínica Cruz del Sur.");
      expect(result.replyText).not.toContain("¿En qué podemos ayudarle?");
      recordScenario(`imagen ${study.title}`, [study.intent]);
    });
  }

  for (const specialty of MEDICAL_SERVICES) {
    test(`especialidad ${specialty.title}`, async () => {
      const from = `whatsapp:+5491500${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const { result } = await applyTurn(from, specialty.title);
      expect(result.replyText).not.toContain("¿En qué podemos ayudarle?");
      if (specialty.title === "Cirugía") {
        expect(result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
        expect(result.replyText).toContain(SURGERY_SELECTION_PROMPT);
        recordScenario(`especialidad ${specialty.title}`, ["TURNOS_MEDICOS_SELECTOR"]);
        return;
      }
      expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
      expect(result.replyText).toContain(specialty.body);
      expect(result.replyText).not.toContain(`${specialty.title}\n\n${specialty.body}`);
      expect(result.replyText).toContain("nombre completo del paciente");
      recordScenario(`especialidad ${specialty.title}`, [specialty.intent, "TURNOS_MEDICOS_ATENCION_MEDICA"]);
    });
  }

  for (const [specialtyTitle, aliases] of Object.entries(PROFESSION_ALIASES)) {
    for (const alias of aliases) {
      test(`profesión ${alias}`, async () => {
        const specialty = MEDICAL_SERVICES.find((item) => item.title === specialtyTitle);
        expect(specialty).toBeDefined();
        if (!specialty) throw new Error(`Missing specialty ${specialtyTitle}`);

        const variants = new Set([alias, alias.toUpperCase(), withoutAccents(alias), withoutAccents(alias).toUpperCase()]);
        for (const variant of variants) {
          const from = `whatsapp:+5491530${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
          const { result } = await applyTurn(from, `Hola, necesito sacar un turno con ${variant}, por favor`);
          if (specialtyTitle === "Cirugía") {
            expect(result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
            expect(result.replyText).toContain(SURGERY_SELECTION_PROMPT);
            continue;
          }
          expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
          expect(result.replyText).toContain(specialty.body);
          expect(result.replyText).toContain("nombre completo del paciente");
          expect(latestCaseFor(supabaseHolder.client, from)?.current_step).toBe("patient_identity");
        }
        recordScenario(
          `profesión ${alias}`,
          [specialtyTitle === "Cirugía" ? "TURNOS_MEDICOS_SELECTOR" : "TURNOS_MEDICOS_ATENCION_MEDICA"],
        );
      });
    }
  }

  const humanProfessionalScenarios = [
    { message: "Doc Cardozo", intent: "TURNOS_MEDICOS_SELECTOR", expect: CARDOSO_SELECTION_PROMPT },
    { message: "Dr. Ismael del Carpio", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "cirugia_del_carpio" },
    { message: "Dra, Sedan", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "diabetologia_sedan" },
    { message: "D.R. Nuñez", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "traumatologia_nunes" },
    { message: "DOC; Zeballos", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "pediatria_ceballos" },
    { message: "Cardozo Atilio", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "cirugia_cardoso_atilio" },
    { message: "Martin Cardozo", intent: "TURNOS_MEDICOS_ATENCION_MEDICA", group: "cirugia_cardoso_martin" },
  ] as const;

  for (const scenario of humanProfessionalScenarios) {
    test(`variante humana ${scenario.message}`, async () => {
      const from = `whatsapp:+5491540${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      const { result } = await applyTurn(from, scenario.message);
      expect(result.intent).toBe(scenario.intent);
      if ("expect" in scenario) expect(result.replyText).toContain(scenario.expect);
      if ("group" in scenario) {
        const group = PROFESSIONAL_RESPONSE_GROUPS.find((item) => item.id === scenario.group);
        expect(group).toBeDefined();
        expect(result.replyText).toContain(group?.body);
      }
      recordScenario(`variante humana ${scenario.message}`, [scenario.intent]);
    });
  }

  const surgeryGroupScenarios = [
    {
      message: "cirujano general",
      groups: ["cirugia_del_carpio", "cirugia_cardoso_atilio", "cirugia_heredia", "cirugia_del_bueno"],
      excluded: "Cardoso Martin especialista",
    },
    {
      message: "maxilofacial",
      groups: ["cirugia_cardoso_martin", "cirugia_francalancia"],
      excluded: "Cardoso Atilio atiende",
    },
    {
      message: "cirugía plástica",
      groups: ["cirugia_soulergues", "cirugia_goldenberg"],
      excluded: "Cardoso Atilio atiende",
    },
    {
      message: "cirugía vascular",
      groups: ["cirugia_soulergues"],
      excluded: "Goldenberg Gustavo",
    },
  ] as const;

  for (const scenario of surgeryGroupScenarios) {
    test(`subespecialidad quirúrgica ${scenario.message}`, async () => {
      const from = `whatsapp:+5491560${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      const { result } = await applyTurn(from, scenario.message);
      expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
      for (const groupId of scenario.groups) {
        const group = PROFESSIONAL_RESPONSE_GROUPS.find((item) => item.id === groupId);
        expect(group).toBeDefined();
        expect(result.replyText).toContain(group?.body);
      }
      expect(result.replyText).not.toContain(scenario.excluded);
      expect(result.replyText).not.toMatch(/Cirug(?:ía|ías) (?:general|maxilofacial|estéticas y plásticas)\n/);
      expect(latestCaseFor(supabaseHolder.client, from)?.current_step).toBe("patient_identity");
      recordScenario(`subespecialidad quirúrgica ${scenario.message}`, ["TURNOS_MEDICOS_ATENCION_MEDICA"]);
    });
  }

  test("selector quirúrgico acepta una respuesta breve", async () => {
    const from = "whatsapp:+5491560000001";
    const first = await applyTurn(from, "Necesito un cirujano");
    expect(first.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(first.result.replyText).toContain(SURGERY_SELECTION_PROMPT);
    expect(latestCaseFor(supabaseHolder.client, from)?.case_data?.selectionContext).toBe("surgery");

    const second = await applyTurn(from, "estética");
    expect(second.result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(second.result.replyText).toContain("Soulergues Federico");
    expect(second.result.replyText).toContain("Goldenberg Gustavo");
    expect(latestCaseFor(supabaseHolder.client, from)?.current_step).toBe("patient_identity");
    recordScenario("selector quirúrgico breve", ["TURNOS_MEDICOS_SELECTOR", "TURNOS_MEDICOS_ATENCION_MEDICA"]);
  });

  test("Cardoso se desambigua por subespecialidad en el mismo mensaje", async () => {
    const martin = await applyTurn("whatsapp:+5491560000002", "Cardozo maxilofacial");
    expect(martin.result.replyText).toContain("Cardoso Martin especialista");
    expect(martin.result.replyText).not.toContain("Cardoso Atilio atiende");

    const atilio = await applyTurn("whatsapp:+5491560000003", "Cardoso cirugía general");
    expect(atilio.result.replyText).toContain("Cardoso Atilio atiende");
    expect(atilio.result.replyText).not.toContain("Cardoso Martin especialista");
    recordScenario("Cardoso con subespecialidad", ["TURNOS_MEDICOS_ATENCION_MEDICA"]);
  });

  for (const plan of INSURANCE_PLANS) {
    test(`obra social aceptada ${plan.name}`, async () => {
      const from = `whatsapp:+5491570${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      const { result, next } = await applyTurn(from, plan.name);
      expect(result.intent).toBe("OBRAS_SOCIALES");
      expect(result.replyText).toContain(`Sí, trabajamos con ${plan.name}.`);
      expect(result.replyText).toContain("¿Podemos ayudarle en algo más?");
      expect(next?.status).toBe("bot_active");
      expect(latestCaseFor(supabaseHolder.client, from)).toBeNull();
      recordScenario(`obra social aceptada ${plan.name}`, ["OBRAS_SOCIALES"]);
    });
  }

  test("obra social genérica y rechazada permanecen activas", async () => {
    const generic = await applyTurn("whatsapp:+5491570000001", "¿Qué obras sociales aceptan?");
    expect(generic.result.replyText).toContain("AVALIAN");
    expect(generic.result.replyText).toContain("PAMI");
    expect(generic.next?.status).toBe("bot_active");

    const rejected = await applyTurn("whatsapp:+5491570000002", "¿Trabajan con Federada Salud?");
    expect(rejected.result.replyText).toContain("no contamos con convenio vigente con Federada Salud");
    expect(rejected.next?.status).toBe("bot_active");

    const isolated = await applyTurn("whatsapp:+5491570000003", "Federada Salud");
    expect(isolated.result.intent).toBe("OTRAS_CONSULTAS");
    expect(isolated.result.replyText).not.toContain("no contamos con convenio");
    recordScenario("consultas de obra social", ["OBRAS_SOCIALES", "OTRAS_CONSULTAS"]);
  });

  for (const [stepIndex, stepKey] of ["patient_identity", "insurance", "availability"].entries()) {
    test(`consulta de obra social conserva turno en ${stepKey}`, async () => {
      const from = `whatsapp:+5491580${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      await progressCaseToStep(from, "TURNOS_MEDICOS_ATENCION_MEDICA", stepIndex + 1);
      const before = latestCaseFor(supabaseHolder.client, from);
      const { result } = await applyTurn(from, "¿Aceptan OSDE 210?");
      const after = latestCaseFor(supabaseHolder.client, from);
      expect(result.replyText).toContain("Sí, trabajamos con OSDE.");
      expect(after?.current_step).toBe(stepKey);
      expect(after?.case_data).toEqual(before?.case_data);
      recordScenario(`obra social durante ${stepKey}`, ["TURNOS_MEDICOS_ATENCION_MEDICA", "OBRAS_SOCIALES"]);
    });
  }

  test("servicio desconocido cierra selector y permite recuperar la conversación", async () => {
    const from = "whatsapp:+5491590000001";
    const first = await applyTurn(from, "quiero un turno");
    expect(first.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    const second = await applyTurn(from, "kinesiología");
    expect(second.result.intent).toBe("SERVICIO_NO_DISPONIBLE");
    expect(second.result.replyText).toBe(BOT_2026_DATA.direct.unavailableService.body);
    expect(latestCaseFor(supabaseHolder.client, from)?.status).toBe("closed");
    const third = await applyTurn(from, "Cardiología");
    expect(third.result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(third.result.replyText).toContain("Segovia Néstor");
    recordScenario("recuperación tras servicio no disponible", [
      "TURNOS_MEDICOS_SELECTOR",
      "SERVICIO_NO_DISPONIBLE",
      "TURNOS_MEDICOS_ATENCION_MEDICA",
    ]);
  });

  test("pedido explícito de turno desconocido usa el mensaje del banco", async () => {
    const from = "whatsapp:+5491590000002";
    const { result, next } = await applyTurn(from, "Quiero un turno con kinesiología");
    expect(result.intent).toBe("SERVICIO_NO_DISPONIBLE");
    expect(result.replyText).toBe(BOT_2026_DATA.direct.unavailableService.body);
    expect(result.replyText.match(/Gracias por comunicarse/g)).toHaveLength(1);
    expect(next?.status).toBe("bot_active");
    recordScenario("turno no disponible directo", ["SERVICIO_NO_DISPONIBLE"]);
  });

  for (const alias of ["ecodoppler", "ecodopler"]) {
    test(`imagen ${alias}`, async () => {
      const from = `whatsapp:+5491550${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      const { result, next } = await applyTurn(from, `Necesito un turno para ${alias}`);
      const study = IMAGING_STUDIES.find((item) => item.title === "Ecografía Doppler");
      expect(study).toBeDefined();
      expect(result.intent).toBe("IMAGENES_ECOGRAFIA_DOPPLER");
      expect(result.replyText).toContain(study?.body);
      expect(next?.status).toBe("closed");
      recordScenario(`imagen ${alias}`, ["IMAGENES_ECOGRAFIA_DOPPLER"]);
    });
  }

  for (const [professionalIndex, professional] of PROFESSIONALS.entries()) {
    test(`profesional y alias ${professional.name}`, async () => {
      const group = PROFESSIONAL_RESPONSE_GROUPS.find((item) => item.id === professional.responseGroupId);
      expect(group).toBeDefined();
      if (!group) throw new Error(`Missing response group ${professional.responseGroupId}`);

      for (const [aliasIndex, alias] of professional.aliases.entries()) {
        if (
          alias.split(/\s+/).length === 1 &&
          PROFESSIONALS.filter((item) => item.aliases.some((candidate) => candidate === alias)).length > 1
        ) {
          continue;
        }
        const from = `whatsapp:+5491151${professionalIndex.toString().padStart(2, "0")}${aliasIndex.toString().padStart(4, "0")}`;
        const { result } = await applyTurn(from, `Turno con ${alias}`);
        expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
        expect(result.replyText).toContain(group.body);
        expect(result.replyText).toContain("nombre completo del paciente");
        expect(result.replyText).not.toContain("¿En qué podemos ayudarle?");
      }
      recordScenario(`profesional ${professional.name}`, ["TURNOS_MEDICOS_ATENCION_MEDICA"]);
    });
  }

  for (const subservice of [...new Set(PROFESSIONAL_RESPONSE_GROUPS.flatMap((group) => group.subservices))]) {
    test(`subservicio ${subservice}`, async () => {
      const from = `whatsapp:+5491520${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
      const { result } = await applyTurn(from, subservice);
      const expectedGroups = PROFESSIONAL_RESPONSE_GROUPS.filter((group) => group.subservices.includes(subservice));
      expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
      for (const group of expectedGroups) expect(result.replyText).toContain(group.body);
      expect(result.replyText).toContain("nombre completo del paciente");
      recordScenario(`subservicio ${subservice}`, ["TURNOS_MEDICOS_ATENCION_MEDICA"]);
    });
  }

  const caseScenarios = [
    {
      name: "turnos médicos selector feliz",
      branches: ["TURNOS_MEDICOS_SELECTOR"],
      run: async (from: string) => {
        const first = await applyTurn(from, "quiero un turno medico");
        expect(first.result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
        expect(first.result.replyText).toContain("profesional o servicio");
        expect(first.result.replyText).not.toContain("¿En qué podemos ayudarle?");
        const second = await applyTurn(from, "Cardiología");
        expect(second.result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
        expect(second.result.replyText).toContain("Segovia Néstor");
        expect(second.result.replyText).toContain("nombre completo del paciente");
      },
    },
    {
      name: "turnos atención feliz",
      branches: ["TURNOS_MEDICOS_ATENCION_MEDICA"],
      run: async (from: string) => {
        const first = await applyTurn(from, "Quiero un turno con Cardiología");
        expect(first.result.replyText).toContain("nombre completo del paciente");
        const second = await applyTurn(from, "Juan Perez", {
          numMedia: 2,
          mediaContentTypes: ["image/jpeg", "image/jpeg"],
        });
        expect(second.result.replyText).toContain("afiliado");
        const third = await applyTurn(from, "123456");
        expect(third.result.replyText).toContain("disponibilidad");
        const fourth = await applyTurn(from, "Lunes por la tarde");
        expect(fourth.result.replyText).toContain("registramos su solicitud");
      },
    },
    {
      name: "turnos imágenes deriva a recepción",
      branches: ["TURNOS_MEDICOS_IMAGENES_MEDICAS"],
      run: async (from: string) => {
        const first = await applyTurn(from, "Necesito turno para una resonancia");
        expect(first.next?.status).toBe("closed");
        expect(first.result.replyText).toContain("+5492976211361");
        expect(first.result.replyText).not.toContain("nombre completo del paciente");
      },
    },
    {
      name: "informes imágenes feliz",
      branches: ["INFORMES_MEDICOS_IMAGENES_MEDICAS"],
      run: async (from: string) => {
        const first = await applyTurn(from, "Necesito un informe de imágenes");
        expect(first.result.replyText).toContain("nombre completo del paciente");
        const second = await applyTurn(from, "Juan Perez");
        expect(second.result.replyText).toContain("DNI");
        const third = await applyTurn(from, "Adjunto DNI", {
          numMedia: 2,
          mediaContentTypes: ["image/jpeg", "image/jpeg"],
        });
        expect(third.result.replyText).toContain("fecha estimada");
        const fourth = await applyTurn(from, "Tomografía del 12/06/2026");
        expect(fourth.result.replyText).toContain("registramos su solicitud");
      },
    },
    {
      name: "obras sociales feliz",
      branches: ["OBRAS_SOCIALES"],
      run: async (from: string) => {
        const first = await applyTurn(from, "Tengo un problema administrativo con mi obra social");
        expect(first.result.replyText).toContain(
          "Gracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades.",
        );
        expect(first.next?.status).toBe("waiting_operator");
      },
    },
    {
      name: "otras consultas feliz",
      branches: ["OTRAS_CONSULTAS"],
      run: async (from: string) => {
        const first = await applyTurn(from, "otra consulta");
        expect(first.result.replyText).toContain("Cuénteme");
        const second = await applyTurn(from, "Necesito un comprobante");
        expect(second.result.replyText).toBe(
          "Gracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades.",
        );
      },
    },
    {
      name: "telemedicina feliz",
      branches: ["TELEMEDICINA_DRA_ESTRADA"],
      run: async (from: string) => {
        const first = await applyTurn(from, "Telemedicina");
        expect(first.result.replyText).toContain("localidad");
        const second = await applyTurn(from, "Las Heras");
        expect(second.result.media?.kind).toBe("vcard");
      },
    },
  ] as const;

  for (const scenario of caseScenarios) {
    test(scenario.name, async () => {
      const from = `whatsapp:+5491600${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      await scenario.run(from);
      recordScenario(scenario.name, [...scenario.branches]);
    });

    test(`${scenario.name} vía saludo`, async () => {
      const from = `whatsapp:+5491700${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const opening = await applyTurn(from, "hola");
      expect(opening.result.intent).toBe("OPENING");
      await scenario.run(from);
      recordScenario(`${scenario.name} vía saludo`, [...scenario.branches, "OPENING"]);
    });
  }

  const irrelevantScenarios = [
    {
      intent: "TURNOS_MEDICOS_SELECTOR",
      start: "quiero un turno medico",
      expectedPrompt: "profesional o servicio",
    },
    {
      intent: "TURNOS_MEDICOS_ATENCION_MEDICA",
      start: "Cardiología",
      expectedPrompt: "nombre completo del paciente",
    },
    {
      intent: "TURNOS_MEDICOS_IMAGENES_MEDICAS",
      start: "Necesito un turno de imágenes",
      expectedPrompt: "estudio de imágenes que necesita",
    },
    {
      intent: "INFORMES_MEDICOS_IMAGENES_MEDICAS",
      start: "Necesito informe de imágenes",
      expectedPrompt: "nombre completo del paciente",
    },
    {
      intent: "OTRAS_CONSULTAS",
      start: "otra consulta",
      expectedPrompt: "motivo de su consulta",
    },
    {
      intent: "TELEMEDICINA_DRA_ESTRADA",
      start: "Telemedicina",
      expectedPrompt: "localidad",
    },
  ] as const;

  for (const scenario of irrelevantScenarios) {
    test(`repregunta si la respuesta no sirve en ${scenario.intent}`, async () => {
      const from = `whatsapp:+5491800${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`;
      const first = await applyTurn(from, scenario.start);
      expect(first.result.intent).toBe(scenario.intent);
      const second = await applyTurn(from, "hola");
      expect(second.result.replyText).toContain(scenario.expectedPrompt);
      const latestCase = supabaseHolder.client.table("cases")[0];
      expect(latestCase?.current_step).toBeTruthy();
      recordScenario(`repregunta ${scenario.intent}`, [scenario.intent]);
    });
  }

  const exhaustiveCaseFlows = Object.values(FLOWS).filter(
    (flow) =>
      flow.kind === "case" &&
      flow.intent !== "TURNOS_MEDICOS_IMAGENES_MEDICAS" &&
      flow.intent !== "OBRAS_SOCIALES",
  );

  for (const flow of exhaustiveCaseFlows) {
    for (const [stepIndex, step] of flow.steps.entries()) {
      if (flow.intent === "TURNOS_MEDICOS_ATENCION_MEDICA" && step.key === "professional_or_service") continue;
      test(`no avanza con desvío en ${flow.intent}/${step.key}`, async () => {
        const from = `whatsapp:+5491900${Math.floor(Math.random() * 100000)
          .toString()
          .padStart(5, "0")}`;
        await progressCaseToStep(from, flow.intent, stepIndex);
        const invalid = partialOrInvalidAnswerForStep(step.key);
        const result = await applyTurn(from, invalid.body, invalid.overrides || {});
        const latestCase = latestCaseFor(supabaseHolder.client, from);
        expect(result.result.shouldReply).toBe(true);
        expect(latestCase?.current_step).toBe(step.key);
        recordScenario(`desvío ${flow.intent}/${step.key}`, [flow.intent]);
      });

      test(`reinicia limpio por 24h en ${flow.intent}/${step.key}`, async () => {
        const from = `whatsapp:+5491950${Math.floor(Math.random() * 100000)
          .toString()
          .padStart(5, "0")}`;
        await progressCaseToStep(from, flow.intent, stepIndex);
        const previousConversation = latestConversationFor(supabaseHolder.client, from);
        const previousCase = latestCaseFor(supabaseHolder.client, from);
        expect(previousConversation?.id).toBeTruthy();
        expect(previousCase?.id).toBeTruthy();
        if (!previousConversation || !previousCase) {
          throw new Error("Missing previous conversation or case");
        }

        previousConversation.last_activity_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

        const reset = await applyTurn(from, "hola", {
          messageSid: `SM-RESET-${flow.intent}-${step.key}`,
        });
        const nextConversation = latestConversationFor(supabaseHolder.client, from);
        const cancelledCase = supabaseHolder.client.table("cases").find((item) => item.id === previousCase.id);

        expect(reset.result.intent).toBe("OPENING");
        expect(nextConversation?.id).not.toBe(previousConversation.id);
        expect(cancelledCase?.status).toBe("cancelled");
        recordScenario(`reset ${flow.intent}/${step.key}`, [flow.intent, "OPENING"]);
      });
    }
  }
});

afterAll(() => {
  const reportDir = path.join(process.cwd(), "test-reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(reportDir, "bot-scenario-coverage.latest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalScenarios: executedScenarios.length,
        coveredBranches: [...coveredBranches].sort(),
        coveredBranchCount: coveredBranches.size,
        coveredTransitions: [...coveredTransitions].sort(),
        coveredTransitionCount: coveredTransitions.size,
        missingVisibleBranches: SHEET_VISIBLE_BRANCHES.filter(
          (branch) => branch !== "TURNOS_MEDICOS" && branch !== "INFORMES_MEDICOS" && !coveredBranches.has(branch),
        ),
        executedScenarios,
      },
      null,
      2,
    ),
  );
});

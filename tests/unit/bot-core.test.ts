import {
  FLOWS,
  IMAGING_STUDIES,
  INSURANCE_PLANS,
  MEDICAL_SERVICES,
  OPENING_INTENT,
  PROFESSIONALS,
  PROFESSIONAL_RESPONSE_GROUPS,
  SHEET_VISIBLE_BRANCHES,
  SPECIALTIES,
} from "@/lib/bot-catalog";
import {
  CARDOSO_SELECTION_PROMPT,
  SURGERY_SELECTION_PROMPT,
  containsClinicalRisk,
  detectCity,
  detectImagingStudy,
  detectInsuranceInquiry,
  detectIntent,
  detectProfessional,
  detectProfessionalSubservice,
  detectSpecialty,
  evaluateInboundTurn,
  isRemoteCity,
} from "@/lib/bot-core";
import { namesMatch } from "@/lib/document-validation";
import { BOT_2026_DATA } from "@/lib/bot-2026-data";
import type { ConversationSnapshot, NormalizedInbound } from "@/lib/bot-types";

function payload(body: string, overrides: Partial<NormalizedInbound> = {}): NormalizedInbound {
  return {
    from: "whatsapp:+5491110000001",
    to: "whatsapp:+5493516424148",
    body,
    messageSid: overrides.messageSid || `SM-${Math.random().toString(16).slice(2)}`,
    profileName: null,
    numMedia: 0,
    mediaContentTypes: [],
    rawPayload: {},
    ...overrides,
  };
}

function conversation(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    id: "conversation-1",
    status: "bot_active",
    current_intent: null,
    current_step: null,
    last_activity_at: new Date().toISOString(),
    unread_count: 0,
    ...overrides,
  };
}

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

describe("bot core detection", () => {
  test("generic greeting opens a natural prompt without numeric menus", async () => {
    const result = await evaluateInboundTurn({
      payload: payload("hola"),
      conversation: conversation(),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });

    expect(result.intent).toBe(OPENING_INTENT);
    expect(result.reply?.text).toBe(BOT_2026_DATA.greeting);
    expect(result.reply?.text.toLowerCase()).not.toContain("elija una opción");
    expect(result.reply?.text).not.toMatch(/\n\s*1\./);
  });

  test("does not repeat the greeting after the conversation was already opened", async () => {
    const result = await evaluateInboundTurn({
      payload: payload("quiero un turno medico"),
      conversation: conversation({ current_intent: OPENING_INTENT }),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });

    expect(result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(result.reply?.text).not.toContain("Hola, soy");
    expect(result.reply?.text).toBe("Indíqueme, por favor, el profesional o servicio que necesita.");
    expect(result.currentStep).toBe("professional_or_service");
  });

  test("reclassifies the open appointment request without repeating the greeting", async () => {
    const selectorCase = {
      intent_key: "TURNOS_MEDICOS_SELECTOR",
      status: "in_progress" as const,
      current_step: "professional_or_service",
      required_fields_status: { professional_or_service: false },
      case_data: {},
    };

    const attention = await evaluateInboundTurn({
      payload: payload("Cardiología"),
      conversation: conversation({ current_intent: "TURNOS_MEDICOS_SELECTOR", current_step: "professional_or_service" }),
      openCase: selectorCase,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(attention.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(attention.reply?.text).toContain("Segovia Néstor");
    expect(attention.reply?.text).toContain("nombre completo del paciente");
    expect(attention.currentStep).toBe("patient_identity");

    const imaging = await evaluateInboundTurn({
      payload: payload("Resonancia"),
      conversation: conversation({ current_intent: "TURNOS_MEDICOS_SELECTOR", current_step: "professional_or_service" }),
      openCase: selectorCase,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(imaging.intent).toBe("IMAGENES_RESONANCIA_MAGNETICA");
    expect(imaging.status).toBe("closed");
    expect(imaging.reply?.text).not.toContain("Resonancia Magnética\n");
    expect(imaging.reply?.text).toContain("+5492976211361");
  });

  test("closes the selector with the unavailable-service message", async () => {
    const result = await evaluateInboundTurn({
      payload: payload("servicio inventado"),
      conversation: conversation({ current_intent: "TURNOS_MEDICOS_SELECTOR", current_step: "professional_or_service" }),
      openCase: {
        intent_key: "TURNOS_MEDICOS_SELECTOR",
        status: "in_progress",
        current_step: "professional_or_service",
        required_fields_status: { professional_or_service: false },
        case_data: {},
      },
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });

    expect(result.intent).toBe("SERVICIO_NO_DISPONIBLE");
    expect(result.currentStep).toBeNull();
    expect(result.status).toBe("bot_active");
    expect(result.caseState?.status).toBe("closed");
    expect(result.reply?.text).toBe(BOT_2026_DATA.direct.unavailableService.body);
  });

  test("detects all specialties as medical appointment requests", async () => {
    for (const specialty of MEDICAL_SERVICES) {
      expect(detectSpecialty(specialty.title)?.title).toBe(specialty.title);
      const result = await detectIntent(payload(specialty.title), conversation({ current_intent: OPENING_INTENT }),);
      if (specialty.title === "Cirugía") {
        expect(result.intent).toBe("TURNOS_MEDICOS_SELECTOR");
        expect(result.ambiguity).toEqual(expect.arrayContaining(["Cirugía general", "Cirugía maxilofacial"]));
        continue;
      }
      expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
      expect(result.seededData.professionalOrService).toBe(specialty.title);
    }
  });

  test("ecografía genérica abre el selector de tipo y deriva al estudio elegido", async () => {
    const initial = await evaluateInboundTurn({
      payload: payload("necesito una ecografía"),
      conversation: conversation(),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(initial.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(initial.reply?.text).toContain("¿Qué tipo de ecografía necesita?");

    const selectorCase = {
      intent_key: "TURNOS_MEDICOS_SELECTOR",
      status: "in_progress" as const,
      current_step: "professional_or_service",
      required_fields_status: { professional_or_service: false },
      case_data: { selectionContext: "ecografia" },
    };
    const resolved = await evaluateInboundTurn({
      payload: payload("abdominal"),
      conversation: conversation({ current_intent: "TURNOS_MEDICOS_SELECTOR", current_step: "professional_or_service" }),
      openCase: selectorCase,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(resolved.intent).toBe("IMAGENES_ECOGRAFIA_ABDOMINAL");
    expect(resolved.status).toBe("closed");
  });

  test("detecta los servicios nuevos con su intención", async () => {
    const cases = [
      ["medicina laboral", "MEDICINA_LABORAL"],
      ["hemoterapia", "HEMOTERAPIA"],
      ["flebología", "FLEBOLOGIA"],
      ["facturación", "FACTURACION"],
      ["quirófano", "QUIROFANOS"],
      ["terapia intensiva", "TERAPIA_INTENSIVA"],
      ["radiología", "RADIOLOGIA"],
    ] as const;
    for (const [text, intent] of cases) {
      const result = await evaluateInboundTurn({
        payload: payload(text),
        conversation: conversation(),
        openCase: null,
        options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
      });
      expect(result.intent).toBe(intent);
    }
  });

  test("routes every declared profession variant to the full specialty response", async () => {
    for (const [specialtyTitle, aliases] of Object.entries(PROFESSION_ALIASES)) {
      if (specialtyTitle === "Cirugía") continue;
      const specialty = MEDICAL_SERVICES.find((item) => item.title === specialtyTitle);
      expect(specialty).toBeDefined();
      if (!specialty) continue;

      for (const alias of aliases) {
        const variants = new Set([alias, alias.toUpperCase(), withoutAccents(alias), withoutAccents(alias).toUpperCase()]);
        for (const variant of variants) {
          const text = `Hola, necesito sacar un turno con ${variant}, por favor`;
          expect(detectSpecialty(text)?.title).toBe(specialtyTitle);

          const result = await evaluateInboundTurn({
            payload: payload(text),
            conversation: conversation(),
            openCase: null,
            options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
          });
          expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
          expect(result.reply?.text).toContain(specialty.body);
          expect(result.reply?.text).toContain("nombre completo del paciente");
          expect(result.currentStep).toBe("patient_identity");
        }
      }
    }
  });

  test("routes surgery through explicit sub-specialties without emitting titles", async () => {
    const initial = await evaluateInboundTurn({
      payload: payload("Necesito un cirujano"),
      conversation: conversation(),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(initial.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(initial.reply?.text).toContain(SURGERY_SELECTION_PROMPT);
    expect(initial.caseState?.caseData.selectionContext).toBe("surgery");

    const expectedGroups = {
      "cirujano general": ["cirugia_del_carpio", "cirugia_cardoso_atilio", "cirugia_heredia", "cirugia_del_bueno"],
      maxilofacial: ["cirugia_cardoso_martin", "cirugia_francalancia"],
      "cirugía plástica": ["cirugia_soulergues", "cirugia_goldenberg"],
      "cirugía vascular": ["cirugia_soulergues"],
    } as const;
    for (const [message, groupIds] of Object.entries(expectedGroups)) {
      const result = await detectIntent(payload(message), conversation());
      expect(result.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
      expect(new Set(result.seededData.professionalResponseGroupIds as string[])).toEqual(new Set(groupIds));
    }

    const general = await evaluateInboundTurn({
      payload: payload("general"),
      conversation: conversation({ current_intent: "TURNOS_MEDICOS_SELECTOR", current_step: "professional_or_service" }),
      openCase: {
        intent_key: "TURNOS_MEDICOS_SELECTOR",
        status: "in_progress",
        current_step: "professional_or_service",
        required_fields_status: { professional_or_service: false },
        case_data: { selectionContext: "surgery" },
      },
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(general.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(general.currentStep).toBe("patient_identity");
    for (const groupId of expectedGroups["cirujano general"]) {
      const body = PROFESSIONAL_RESPONSE_GROUPS.find((group) => group.id === groupId)?.body;
      expect(general.reply?.text).toContain(body);
    }
    expect(general.reply?.text).not.toContain("Cirugía general\n");
    expect(general.reply?.text).not.toContain("Cardoso Martin especialista");
  });

  test("uses the Cardoso prompt and resolves surname plus sub-specialty", async () => {
    const ambiguous = await evaluateInboundTurn({
      payload: payload("Doc Cardozo"),
      conversation: conversation(),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(ambiguous.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(ambiguous.reply?.text).toContain(CARDOSO_SELECTION_PROMPT);
    expect(ambiguous.reply?.text).not.toContain("Cardoso Atilio, Cardoso Martin");
    expect(ambiguous.caseState?.caseData.selectionContext).toBe("cardoso");

    expect((await detectIntent(payload("Cardoso maxilofacial"), conversation())).seededData.professionalResponseGroupIds)
      .toEqual(["cirugia_cardoso_martin"]);
    expect((await detectIntent(payload("Cardozo cirugía general"), conversation())).seededData.professionalResponseGroupIds)
      .toEqual(["cirugia_cardoso_atilio"]);
  });

  test("detects every accepted insurance plan and only rejects names with explicit context", () => {
    expect(INSURANCE_PLANS).toHaveLength(16);
    for (const plan of INSURANCE_PLANS) {
      expect(detectInsuranceInquiry(plan.name)).toEqual({ kind: "accepted", planName: plan.name });
      for (const alias of plan.aliases) {
        expect(detectInsuranceInquiry(`¿Trabajan con ${alias.toLowerCase()}?`)).toEqual({
          kind: "accepted",
          planName: plan.name,
        });
      }
    }
    expect(detectInsuranceInquiry("OSDE 210")).toEqual({ kind: "accepted", planName: "OSDE" });
    expect(detectInsuranceInquiry("¿Trabajan con Federada Salud?")).toEqual({
      kind: "rejected",
      planName: "Federada Salud",
    });
    expect(detectInsuranceInquiry("Federada Salud")).toEqual({ kind: "none" });
    expect(detectInsuranceInquiry("¿Qué obras sociales aceptan?")).toEqual({ kind: "generic" });
  });

  test("answers insurance questions during an active case without changing its state", async () => {
    const openCase = {
      intent_key: "TURNOS_MEDICOS_ATENCION_MEDICA",
      status: "in_progress" as const,
      current_step: "patient_identity",
      required_fields_status: { professional_or_service: true, patient_identity: false },
      case_data: { professionalOrService: "Cardiología" },
    };
    const result = await evaluateInboundTurn({
      payload: payload("¿Aceptan OSDE 210?"),
      conversation: conversation({ current_intent: openCase.intent_key, current_step: openCase.current_step }),
      openCase,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(result.intent).toBe("OBRAS_SOCIALES");
    expect(result.reply?.text).toContain("Sí, trabajamos con OSDE.");
    expect(result.reply?.text).toContain("nombre completo del paciente");
    expect(result.currentIntent).toBe(openCase.intent_key);
    expect(result.currentStep).toBe(openCase.current_step);
    expect(result.caseState?.caseData).toEqual(openCase.case_data);
  });

  test("uses the unavailable-service copy only for explicit unknown appointments", async () => {
    const unavailable = await evaluateInboundTurn({
      payload: payload("Quiero un turno con kinesiología"),
      conversation: conversation(),
      openCase: null,
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });
    expect(unavailable.intent).toBe("SERVICIO_NO_DISPONIBLE");
    expect(unavailable.reply?.text).toBe(BOT_2026_DATA.direct.unavailableService.body);
    expect(unavailable.reply?.text.match(/Gracias por comunicarse/g)).toHaveLength(1);
    expect((await detectIntent(payload("Necesito un certificado"), conversation())).intent).toBe("OTRAS_CONSULTAS");
  });

  test("detects every declared professional alias and preserves response groups", () => {
    for (const professional of PROFESSIONALS) {
      for (const alias of professional.aliases) {
        if (alias.split(/\s+/).length === 1 && PROFESSIONALS.filter((item) => item.aliases.includes(alias)).length > 1) {
          continue;
        }
        const detected = detectProfessional(`Turno con Dra. ${alias}`);
        expect(detected.kind).toBe("match");
        if (detected.kind === "match") {
          expect(detected.responseGroupIds).toContain(professional.responseGroupId);
        }
      }
    }
  });

  test("handles declared ambiguities, individual groups and name-order normalization", () => {
    expect(detectProfessional("Cardoso")).toMatchObject({
      kind: "ambiguous",
      candidates: expect.arrayContaining(["Cardoso Atilio", "Cardoso Martin"]),
    });
    expect(detectProfessional("Dr. Atilio Cardoso")).toMatchObject({
      kind: "match",
      responseGroupIds: ["cirugia_cardoso_atilio"],
    });
    expect(detectProfessional("Longo y Castro")).toMatchObject({ kind: "ambiguous" });
    expect(detectProfessional("Vinicio Albino")).toMatchObject({
      kind: "match",
      responseGroupIds: ["neurologia_albino"],
    });
    expect(detectProfessional("Núñes Gaspar")).toMatchObject({
      kind: "match",
      responseGroupIds: ["traumatologia_nunes"],
    });
    expect(detectProfessional("Núñez Cervantes").kind).toBe("none");
  });

  test("accepts optional doctor titles and only the declared professional misspellings", () => {
    for (const title of ["Doctor", "Doctora", "Doc", "Dr", "Dra", "Dr.", "Dra,", "Doc;", "D.R.", "D R A"]) {
      expect(detectProfessional(`${title} Ismael del Carpio`)).toMatchObject({
        kind: "match",
        responseGroupIds: ["cirugia_del_carpio"],
      });
    }
    expect(detectProfessional("Doc Cardozo")).toMatchObject({
      kind: "ambiguous",
      candidates: expect.arrayContaining(["Cardoso Atilio", "Cardoso Martin"]),
    });
    expect(detectProfessional("Dr. Ismael del Carpio")).toMatchObject({
      kind: "match",
      responseGroupIds: ["cirugia_del_carpio"],
    });
    expect(detectProfessional("Dra, Sedan")).toMatchObject({
      kind: "match",
      responseGroupIds: ["diabetologia_sedan"],
    });
    expect(detectProfessional("D.R. Nuñez")).toMatchObject({
      kind: "match",
      responseGroupIds: ["traumatologia_nunes"],
    });
    expect(detectProfessional("DOC; Zeballos")).toMatchObject({
      kind: "match",
      responseGroupIds: ["pediatria_ceballos"],
    });
    expect(detectProfessional("Cardozo Atilio")).toMatchObject({
      kind: "match",
      responseGroupIds: ["cirugia_cardoso_atilio"],
    });
    expect(detectProfessional("Martin Cardozo")).toMatchObject({
      kind: "match",
      responseGroupIds: ["cirugia_cardoso_martin"],
    });
    expect(detectProfessional("Cardozzo").kind).toBe("none");
  });

  test("routes every declared subservice to its exact professional block or blocks", () => {
    const expected = new Map<string, Set<string>>();
    for (const group of PROFESSIONAL_RESPONSE_GROUPS) {
      for (const subservice of group.subservices) {
        const ids = expected.get(subservice) || new Set<string>();
        ids.add(group.id);
        expected.set(subservice, ids);
      }
    }

    for (const [subservice, groupIds] of expected) {
      const detected = detectProfessionalSubservice(subservice);
      expect(detected.kind).toBe("match");
      if (detected.kind === "match") {
        expect(new Set(detected.responseGroupIds)).toEqual(groupIds);
      }
    }
  });

  test("distinguishes clínica médica specialty from médicos clínicos walk-in information", async () => {
    expect((await detectIntent(payload("Clínica Médica"), conversation())).intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect((await detectIntent(payload("médicos clínicos"), conversation())).intent).toBe("MEDICOS_CLINICOS");
  });

  test("detects remote versus local city for telemedicine", () => {
    expect(detectCity("Soy de Pico Truncado")).toBe("Pico Truncado");
    expect(isRemoteCity(detectCity("Soy de Pico Truncado"))).toBe(true);
    expect(detectCity("Vivo en Caleta Olivia")).toBe("Caleta Olivia");
    expect(isRemoteCity(detectCity("Vivo en Caleta Olivia"))).toBe(false);
  });

  test("detects every imaging study explicitly listed in the catalog", () => {
    expect(IMAGING_STUDIES).toHaveLength(19);
    for (const study of IMAGING_STUDIES) {
      for (const matcher of study.matchers) {
        expect(detectImagingStudy(matcher)?.intent).toBe(study.intent);
      }
    }
  });

  test("maps ecodoppler spellings only to Ecografía Doppler", () => {
    for (const alias of ["ecodoppler", "ecodopler"]) {
      const detected = detectImagingStudy(`Necesito un turno para ${alias}`);
      expect(detected?.title).toBe("Ecografía Doppler");
      expect(detected?.intent).toBe("IMAGENES_ECOGRAFIA_DOPPLER");
      expect(detected?.title).not.toBe("Ecografía Doppler Cardíaca");
    }
  });

  test("flags clinical risk prompts out of scope", async () => {
    expect(containsClinicalRisk("Tengo dolor y quiero saber qué medicación tomar")).toBe(true);
    expect((await detectIntent(payload("Tengo dolor y quiero saber qué medicación tomar"), conversation())).intent).toBe(
      "FUERA_ALCANCE_MEDICO",
    );
  });

  test("normalizes patient names for DNI matching", () => {
    expect(namesMatch("Guillermo Fernandez", "FERNANDEZ GUILLERMO")).toBe(true);
    expect(namesMatch("María del Carmen Perez", "PEREZ MARIA CARMEN")).toBe(true);
    expect(namesMatch("Guillermo Fernandez", "Juan Perez")).toBe(false);
  });

  test("does not satisfy DNI media with numMedia alone", async () => {
    const result = await evaluateInboundTurn({
      payload: payload("Juan Perez", {
        numMedia: 2,
        mediaContentTypes: ["image/jpeg", "image/jpeg"],
      }),
      conversation: conversation({
        current_intent: "TURNOS_MEDICOS_ATENCION_MEDICA",
        current_step: "patient_identity",
      }),
      openCase: {
        intent_key: "TURNOS_MEDICOS_ATENCION_MEDICA",
        status: "in_progress",
        current_step: "patient_identity",
        required_fields_status: { patient_identity: false },
        case_data: { professionalOrService: "Cardiología" },
      },
      options: { contactCardBaseUrl: "https://vcards.aeye.com.ar" },
    });

    expect(result.currentStep).toBe("patient_identity");
    expect(result.caseState?.caseData.dniMedia).toBeUndefined();
    expect(result.reply?.text).toContain("DNI");
  });

  test("catalog covers every visible branch from the imported content", () => {
    expect(SPECIALTIES).toEqual(MEDICAL_SERVICES.map((service) => service.title));
    for (const key of SHEET_VISIBLE_BRANCHES) {
      if (key === "TURNOS_MEDICOS" || key === "INFORMES_MEDICOS") continue;
      expect(FLOWS[key]).toBeDefined();
    }
  });

  test("calls Gemini lazily only when deterministic rules miss and honors its classification", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"intent_key":"LABORATORIO_CLINICO","confidence":0.8,"needs_operator":false,"reason":"prueba"}' }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    try {
      const result = await detectIntent(payload("un texto que no coincide con ninguna regla"), conversation());
      expect(result.intent).toBe("LABORATORIO_CLINICO");
      expect(result.confidence).toBe(0.8);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.GEMINI_API_KEY;
      fetchMock.mockRestore();
    }
  });

  test("falls through to OTRAS_CONSULTAS when the lazy classifier fails", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    try {
      const result = await detectIntent(payload("otro texto sin regla"), conversation());
      expect(result.intent).toBe("OTRAS_CONSULTAS");
    } finally {
      delete process.env.GEMINI_API_KEY;
      fetchMock.mockRestore();
    }
  });
});

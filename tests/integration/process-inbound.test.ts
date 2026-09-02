import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { BOT_2026_DATA } from "@/lib/bot-2026-data";
import { createFakeSupabaseClient } from "../helpers/fake-supabase";

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

function inbound(from: string, body: string, overrides: Record<string, unknown> = {}) {
  const count = supabaseHolder.client.table("messages").length + 1;
  const numMedia = Number(overrides.numMedia || 0);
  return {
    from,
    to: "whatsapp:+5493516424148",
    body,
    messageSid: String(overrides.messageSid || `SM-TEST-${count}`),
    profileName: "Paciente Test",
    numMedia,
    mediaContentTypes: (overrides.mediaContentTypes as string[]) || [],
    mediaUrls:
      (overrides.mediaUrls as string[]) ||
      Array.from({ length: numMedia }).map((_, index) => `mock://valid-${index}`),
    rawPayload: {},
    geminiClassification: null,
  };
}

describe("processInbound integration", () => {
  let processInbound: typeof import("@/lib/bot-engine").processInbound;

  beforeAll(async () => {
    supabaseHolder.client = createFakeSupabaseClient();
    ({ processInbound } = await import("@/lib/bot-engine"));
  });

  beforeEach(() => {
    supabaseHolder.client = createFakeSupabaseClient();
    documentValidationHolder.validate.mockReset();
    documentValidationHolder.validate.mockImplementation(async (payload, request) => {
      const urls = payload.mediaUrls || [];
      if (urls.some((url: string) => url.includes("error"))) {
        return {
          field: request.field,
          valid: false,
          reason: "technical_error",
          confidence: 0,
          technicalError: true,
          documentType: "unknown",
        };
      }
      if (urls.some((url: string) => url.includes("invalid"))) {
        return {
          field: request.field,
          valid: false,
          reason: "not_document",
          confidence: 0.2,
          documentType: "unknown",
        };
      }
      if (urls.some((url: string) => url.includes("uncertain"))) {
        return {
          field: request.field,
          valid: false,
          reason: "low_confidence",
          confidence: 0.45,
          documentType: "unknown",
        };
      }
      if (urls.some((url: string) => url.includes("name-mismatch"))) {
        return {
          field: request.field,
          valid: false,
          reason: "name_mismatch",
          confidence: 0.91,
          documentType: "dni",
          dniHasFront: true,
          dniHasBack: false,
          dniNameMatches: false,
          dniDocumentFingerprint: "dni-document-mismatch",
          dniNameFingerprint: "dni-name-mismatch",
        };
      }
      if (request.field === "dniMedia" && urls.some((url: string) => url.includes("front-only"))) {
        return {
          field: request.field,
          valid: false,
          reason: "missing_dni_side",
          confidence: 0.91,
          documentType: "dni",
          dniHasFront: true,
          dniHasBack: false,
          dniNameMatches: true,
          dniDocumentFingerprint: "dni-document-1",
          dniNameFingerprint: "dni-name-1",
        };
      }
      if (request.field === "dniMedia" && urls.some((url: string) => url.includes("back-only"))) {
        return {
          field: request.field,
          valid: false,
          reason: "missing_dni_side",
          confidence: 0.91,
          documentType: "dni",
          dniHasFront: false,
          dniHasBack: true,
          dniNameMatches: false,
          dniDocumentFingerprint: "dni-document-1",
          dniNameFingerprint: "dni-name-1",
        };
      }
      if (request.field === "dniMedia" && urls.some((url: string) => url.includes("back-mismatch"))) {
        return {
          field: request.field,
          valid: false,
          reason: "missing_dni_side",
          confidence: 0.91,
          documentType: "dni",
          dniHasFront: false,
          dniHasBack: true,
          dniNameMatches: false,
          dniDocumentFingerprint: "dni-document-2",
          dniNameFingerprint: "dni-name-2",
        };
      }
      return {
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
      };
    });
  });

  test("captures future fields and skips already completed steps", async () => {
    const from = "whatsapp:+5491110000001";

    const first = await processInbound(inbound(from, "Cardiología"));
    expect(first.shouldReply).toBe(true);
    expect(first.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(first.replyText).toContain("nombre completo del paciente");

    const second = await processInbound(
      inbound(from, "Juan Perez\nAfiliado 123456", {
        numMedia: 2,
        mediaContentTypes: ["image/jpeg", "image/jpeg"],
      }),
    );
    expect(second.shouldReply).toBe(true);
    expect(second.replyText).toContain("disponibilidad");

    const third = await processInbound(inbound(from, "Lunes y miércoles por la tarde"));
    expect(third.shouldReply).toBe(true);
    expect(third.replyText).toContain("registramos su solicitud");

    const cases = supabaseHolder.client.table("cases");
    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe("waiting_operator");
    expect(cases[0].case_data.insuranceMemberNumber).toBe("123456");
    expect(cases[0].case_data.dniMedia).toBe(true);
  });

  test("does not capture the appointment area answer as patient name", async () => {
    const from = "whatsapp:+5491110000013";

    await processInbound(inbound(from, "hola"));
    await processInbound(inbound(from, "quiero un turno medico"));
    const attention = await processInbound(inbound(from, "atencion medica"));

    expect(attention.replyText).toContain("profesional o servicio");
    const cases = supabaseHolder.client.table("cases");
    expect(cases[0].case_data.patientFullName).toBeUndefined();
  });

  test("accepts DNI front and back sent in separate messages", async () => {
    const from = "whatsapp:+5491110000014";

    await processInbound(inbound(from, "Cardiología"));
    const front = await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://front-only"],
      }),
    );
    expect(front.replyText).toContain("frente del DNI");
    expect(front.replyText).toContain("dorso");

    const afterFront = supabaseHolder.client.table("cases")[0];
    expect(afterFront.current_step).toBe("patient_identity");
    expect(afterFront.case_data.dniMedia).toBeUndefined();
    expect(afterFront.case_data.dniMediaFrontSeen).toBe(true);

    const back = await processInbound(
      inbound(from, "", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://back-only"],
      }),
    );

    expect(back.replyText).toContain("afiliado");
    const completed = supabaseHolder.client.table("cases")[0];
    expect(completed.current_step).toBe("insurance");
    expect(completed.case_data.dniMedia).toBe(true);
    expect(completed.case_data.dniMediaBackSeen).toBe(true);
  });

  test("serializes simultaneous DNI front and back messages from the same patient", async () => {
    const from = "whatsapp:+5491110000015";

    await processInbound(inbound(from, "Cardiología"));
    const [front, back] = await Promise.all([
      processInbound(
        inbound(from, "Juan Perez", {
          messageSid: "SM-DNI-FRONT-CONCURRENT",
          numMedia: 1,
          mediaContentTypes: ["image/jpeg"],
          mediaUrls: ["mock://front-only"],
        }),
      ),
      processInbound(
        inbound(from, "", {
          messageSid: "SM-DNI-BACK-CONCURRENT",
          numMedia: 1,
          mediaContentTypes: ["image/jpeg"],
          mediaUrls: ["mock://back-only"],
        }),
      ),
    ]);

    expect(front.replyText).toContain("dorso");
    expect(back.replyText).toContain("afiliado");
    const completed = supabaseHolder.client.table("cases")[0];
    expect(completed.current_step).toBe("insurance");
    expect(completed.case_data.dniMedia).toBe(true);
  });

  test("requires both sides again when the DNI data does not match", async () => {
    const from = "whatsapp:+5491110000018";

    await processInbound(inbound(from, "Cardiología"));
    await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://front-only"],
      }),
    );
    const result = await processInbound(
      inbound(from, "", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://back-mismatch"],
      }),
    );

    expect(result.replyText).toContain("no corresponden al mismo DNI");
    const conversation = supabaseHolder.client.table("conversations")[0];
    const currentCase = supabaseHolder.client.table("cases")[0];
    expect(conversation.status).toBe("bot_active");
    expect(currentCase.case_data.dniMedia).toBeUndefined();
    expect(currentCase.case_data.dniMediaFrontSeen).toBeUndefined();
    expect(currentCase.case_data.dniMediaBackSeen).toBeUndefined();
    expect(currentCase.case_data.dniMediaFrontDocumentFingerprint).toBeUndefined();
    expect(currentCase.case_data.dniMediaBackDocumentFingerprint).toBeUndefined();
  });

  test("does not advance when DNI media is not a valid document", async () => {
    const from = "whatsapp:+5491110000010";

    const first = await processInbound(inbound(from, "Cardiología"));
    expect(first.replyText).toContain("nombre completo del paciente");

    const second = await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://invalid-meat-offer"],
      }),
    );
    expect(second.shouldReply).toBe(true);
    expect(second.replyText).toContain("No pude validar");
    expect(second.replyText).toContain("DNI");

    const cases = supabaseHolder.client.table("cases");
    expect(cases[0].current_step).toBe("patient_identity");
    expect(cases[0].case_data.dniMedia).toBeUndefined();
  });

  test("does not count an uncertain DNI side as a rejected document", async () => {
    const from = "whatsapp:+5491110000016";

    await processInbound(inbound(from, "Cardiología"));
    await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://invalid-photo"],
      }),
    );
    await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://front-only"],
      }),
    );
    const uncertainBack = await processInbound(
      inbound(from, "", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://uncertain-back"],
      }),
    );

    expect(uncertainBack.replyText).toContain("dorso");
    const conversation = supabaseHolder.client.table("conversations")[0];
    const currentCase = supabaseHolder.client.table("cases")[0];
    expect(conversation.status).toBe("bot_active");
    expect(currentCase.case_data.dniMediaFrontSeen).toBe(true);
  });

  test("does not complete a DNI when the name on the front differs from the informed name", async () => {
    const from = "whatsapp:+5491110000017";

    await processInbound(inbound(from, "Cardiología"));
    const result = await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://name-mismatch"],
      }),
    );

    expect(result.replyText).toContain("nombre informado no coincide");
    const currentCase = supabaseHolder.client.table("cases")[0];
    expect(currentCase.case_data.dniMedia).toBeUndefined();
  });

  test("keeps the case active after repeated non-document images", async () => {
    const from = "whatsapp:+5491110000011";

    await processInbound(inbound(from, "Cardiología"));
    await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://invalid-first"],
      }),
    );
    const secondReject = await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://invalid-second"],
      }),
    );

    expect(secondReject.shouldReply).toBe(true);
    expect(secondReject.replyText).toContain("No pude validar");

    const conversation = supabaseHolder.client.table("conversations")[0];
    const cases = supabaseHolder.client.table("cases");
    expect(conversation.status).toBe("bot_active");
    expect(cases[0].status).toBe("in_progress");
  });

  test("keeps the case active when document validation has a technical error", async () => {
    const from = "whatsapp:+5491110000012";

    await processInbound(inbound(from, "Cardiología"));
    const result = await processInbound(
      inbound(from, "Juan Perez", {
        numMedia: 1,
        mediaContentTypes: ["image/jpeg"],
        mediaUrls: ["mock://error"],
      }),
    );

    expect(result.shouldReply).toBe(true);
    expect(result.replyText).toContain("No pude validar el DNI en este momento");
    expect(supabaseHolder.client.table("conversations")[0].status).toBe("bot_active");
    expect(supabaseHolder.client.table("cases")[0].case_data.dniMediaOcrStatus).toBe("pending");
  });

  test("keeps generic medical appointment requests in the Turnos Médicos selector", async () => {
    const from = "whatsapp:+5491110000009";

    const opening = await processInbound(inbound(from, "hola"));
    expect(opening.replyText).toBe(BOT_2026_DATA.greeting);

    const selector = await processInbound(inbound(from, "quiero un turno medico"));
    expect(selector.shouldReply).toBe(true);
    expect(selector.intent).toBe("TURNOS_MEDICOS_SELECTOR");
    expect(selector.replyText).not.toContain("Hola, soy");
    expect(selector.replyText).toContain("profesional o servicio");

    const attention = await processInbound(inbound(from, "Cardiología"));
    expect(attention.shouldReply).toBe(true);
    expect(attention.intent).toBe("TURNOS_MEDICOS_ATENCION_MEDICA");
    expect(attention.replyText).not.toContain("Hola, soy");
    expect(attention.replyText).toContain("Segovia Néstor");
    expect(attention.replyText).toContain("nombre completo del paciente");
  });

  test("ignores duplicated inbound messageSid without creating extra rows", async () => {
    const from = "whatsapp:+5491110000002";
    const first = await processInbound(inbound(from, "hola", { messageSid: "SM-DUPLICATE-1" }));
    expect(first.shouldReply).toBe(true);

    const beforeMessages = supabaseHolder.client.table("messages").length;
    const duplicate = await processInbound(inbound(from, "hola", { messageSid: "SM-DUPLICATE-1" }));
    expect(duplicate.shouldReply).toBe(false);
    expect(duplicate.reason).toBe("duplicate");
    expect(supabaseHolder.client.table("messages")).toHaveLength(beforeMessages);
  });

  test("resets the conversation after 24 hours of inactivity and starts a clean chat", async () => {
    const from = "whatsapp:+5491110000003";
    const first = await processInbound(inbound(from, "hola"));
    expect(first.shouldReply).toBe(true);

    const previousConversation = supabaseHolder.client.table("conversations")[0];
    previousConversation.last_activity_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    const second = await processInbound(inbound(from, "hola", { messageSid: "SM-RESET-2" }));
    expect(second.shouldReply).toBe(true);
    expect(second.conversationId).not.toBe(previousConversation.id);

    const conversations = supabaseHolder.client.table("conversations");
    expect(conversations).toHaveLength(2);
    expect(conversations.find((row) => row.id === previousConversation.id)?.status).toBe("closed");
    expect(supabaseHolder.client.table("conversation_events")[0]?.event_type).toBe("conversation_reset_due_inactivity");
  });

  test("stops replying while waiting for operator after the case is handed off", async () => {
    const from = "whatsapp:+5491110000004";
    const first = await processInbound(inbound(from, "Tengo un problema administrativo con mi obra social"));
    expect(first.shouldReply).toBe(true);
    expect(first.replyText).toContain(
      "Gracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades.",
    );

    const second = await processInbound(inbound(from, "Le agrego más detalle"));
    expect(second.shouldReply).toBe(false);
    expect(second.reason).toBe("waiting_operator");
  });

  test("derives imaging appointments to their specific reception without collecting documents", async () => {
    const from = "whatsapp:+5491110000005";
    const first = await processInbound(inbound(from, "Necesito un turno para una resonancia"));
    expect(first.replyText).toContain("+5492976211361");
    expect(first.replyText).not.toContain("nombre completo del paciente");
    expect(supabaseHolder.client.table("conversations")[0].status).toBe("closed");
  });

  test("telemedicina asks for city and then shares vCard only for remote localities", async () => {
    const remoteFrom = "whatsapp:+5491110000006";
    const first = await processInbound(inbound(remoteFrom, "Necesito telemedicina"));
    expect(first.replyText).toContain("localidad");

    const second = await processInbound(inbound(remoteFrom, "Soy de Pico Truncado"));
    expect(second.shouldReply).toBe(true);
    expect(second.media?.kind).toBe("vcard");
    expect(second.media?.urls[0]).toContain("ccs-telemedicina-dra-estrada.vcf");

    const localFrom = "whatsapp:+5491110000007";
    await processInbound(inbound(localFrom, "Telemedicina"));
    const local = await processInbound(inbound(localFrom, "Vivo en Caleta Olivia"));
    expect(local.shouldReply).toBe(true);
    expect(local.media).toBeNull();
    expect(local.replyText).toContain(BOT_2026_DATA.direct.buildings.body);
  });

  test("mutes the bot during active human takeover and keeps unread messages", async () => {
    const from = "whatsapp:+5491110000008";
    await processInbound(inbound(from, "hola"));
    const conversation = supabaseHolder.client.table("conversations")[0];
    conversation.status = "human_takeover";
    conversation.bot_paused_until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    conversation.unanswered_release_at = new Date().toISOString();
    conversation.unread_count = 0;

    const result = await processInbound(inbound(from, "Necesito ayuda humana"));
    expect(result.shouldReply).toBe(false);
    expect(result.reason).toBe("human_takeover");
    expect(supabaseHolder.client.table("conversations")[0].unread_count).toBe(1);
    expect(supabaseHolder.client.table("conversations")[0].unanswered_release_at).toBeNull();
  });
});

afterAll(() => {
  const reportDir = path.join(process.cwd(), "test-reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(reportDir, "bot-process-inbound.integration.latest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        conversations: supabaseHolder.client.table("conversations").length,
        cases: supabaseHolder.client.table("cases").length,
        messages: supabaseHolder.client.table("messages").length,
      },
      null,
      2,
    ),
  );
});

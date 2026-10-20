import initialCatalog from "../../data/bot-catalog-initial.json";
import { activateCatalog } from "@/lib/bot-catalog";
import { evaluateInboundTurn } from "@/lib/bot-core";
import { managedCatalogSchema, validateManagedCatalog } from "@/lib/managed-catalog";
import type { ConversationSnapshot, NormalizedInbound } from "@/lib/bot-types";

const baseline = managedCatalogSchema.parse(initialCatalog);

function cloneCatalog() {
  return structuredClone(baseline);
}

async function evaluate(body: string) {
  const payload: NormalizedInbound = {
    from: "whatsapp:+5491110000001",
    to: "whatsapp:+5493516424148",
    body,
    messageSid: `SM-${Math.random()}`,
    profileName: null,
    numMedia: 0,
    mediaContentTypes: [],
    rawPayload: {},
  };
  const conversation: ConversationSnapshot = {
    id: "conversation-1",
    status: "bot_active",
    current_intent: null,
    current_step: null,
    last_activity_at: new Date().toISOString(),
    unread_count: 0,
  };
  return evaluateInboundTurn({ payload, conversation, openCase: null, options: { contactCardBaseUrl: "https://example.com" } });
}

afterEach(() => activateCatalog(baseline));

describe("managed catalog runtime", () => {
  test("uses the short acknowledgement for every resolved initial request", async () => {
    for (const body of ["arteriografía", "cardiología", "Dr. Segovia", "laboratorio", "¿Aceptan OSDE?"]) {
      const result = await evaluate(body);
      expect(result.reply?.text).toContain("Gracias por comunicarse con Clínica Cruz del Sur.");
      expect(result.reply?.text).not.toContain("¿En qué podemos ayudarle?");
    }
    expect((await evaluate("hola")).reply?.text).toContain("¿En qué podemos ayudarle?");
  });

  test("recognizes disabled specialty, professional, study, direct service and insurance", async () => {
    const unavailable = baseline.messages.unavailableService.body;

    const specialtyCatalog = cloneCatalog();
    specialtyCatalog.medicalServices.find((item) => item.title === "Cardiología")!.available = false;
    activateCatalog(specialtyCatalog);
    expect(await evaluate("cardiólogo")).toMatchObject({ intent: "SERVICIO_NO_DISPONIBLE", reply: { text: unavailable } });

    const professionalCatalog = cloneCatalog();
    professionalCatalog.professionals.find((item) => item.name === "Segovia Néstor")!.available = false;
    activateCatalog(professionalCatalog);
    expect(await evaluate("Dr Segovia")).toMatchObject({ intent: "SERVICIO_NO_DISPONIBLE", reply: { text: unavailable } });

    const studyCatalog = cloneCatalog();
    studyCatalog.imagingStudies.find((item) => item.title === "Arteriografía")!.available = false;
    activateCatalog(studyCatalog);
    expect(await evaluate("arteriografía")).toMatchObject({ intent: "SERVICIO_NO_DISPONIBLE", reply: { text: unavailable } });

    const directCatalog = cloneCatalog();
    directCatalog.direct.laboratory.available = false;
    activateCatalog(directCatalog);
    expect(await evaluate("laboratorio")).toMatchObject({ intent: "SERVICIO_NO_DISPONIBLE", reply: { text: unavailable } });

    const insuranceCatalog = cloneCatalog();
    insuranceCatalog.insurancePlans.find((item) => item.name === "OSDE")!.available = false;
    activateCatalog(insuranceCatalog);
    expect((await evaluate("¿Aceptan OSDE?")).reply?.text).toContain("no contamos con convenio vigente con OSDE");
  });

  test("uses a specialty custom body instead of assembling its professional blocks", async () => {
    const custom = cloneCatalog();
    const cardio = custom.medicalServices.find((item) => item.title === "Cardiología")!;
    cardio.customBody = "Cardiología atiende con turno previo. Envíenos un WhatsApp al +5491111111111.";
    activateCatalog(custom);

    const result = await evaluate("cardiología");
    expect(result.reply?.text).toContain("Cardiología atiende con turno previo");
    expect(result.reply?.text).not.toContain("Segovia");
  });

  test("blocks publication validation for pending records and malformed phone metadata", () => {
    const pending = cloneCatalog();
    pending.imagingStudies[0].reviewStatus = "pending";
    expect(validateManagedCatalog(pending, { requireReviewed: true }).errors).toContain(
      "Hay 1 registros pendientes de revisión",
    );

    const mismatched = cloneCatalog();
    mismatched.imagingStudies[0].phones = [];
    expect(validateManagedCatalog(mismatched).errors.some((error) => error.includes("lista de teléfonos"))).toBe(true);
  });
});

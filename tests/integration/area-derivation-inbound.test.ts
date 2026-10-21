import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

const CARDIOLOGIA = "area-cardiologia";
const PASAJE = "area-pasaje";

function inbound(from: string, body: string, messageSid: string) {
  return {
    from,
    to: "whatsapp:+5493516424148",
    body,
    messageSid,
    profileName: "Paciente Test",
    numMedia: 0,
    mediaContentTypes: [],
    mediaUrls: [],
    rawPayload: {},
  };
}

function conversationFor(phone: string) {
  const contact = holder.client.table("contacts").find((row) => row.whatsapp_number === phone);
  return holder.client.table("conversations").find((row) => row.contact_id === contact?.id);
}

describe("derivación de área al procesar mensajes entrantes", () => {
  let processInbound: typeof import("@/lib/bot-engine").processInbound;

  beforeAll(async () => {
    ({ processInbound } = await import("@/lib/bot-engine"));
  });

  beforeEach(() => {
    holder.client = createFakeSupabaseClient({
      areas: [
        { id: CARDIOLOGIA, name: "Cardiología", is_active: true },
        { id: PASAJE, name: "Pasaje", is_active: true },
      ],
      area_rules: [
        { area_id: CARDIOLOGIA, intent_key: "ATENCION_MEDICA_CARDIOLOGIA", response_group_id: null, is_active: true },
        { area_id: CARDIOLOGIA, intent_key: "IMAGENES_ELECTROCARDIOGRAMA_ECG", response_group_id: null, is_active: true },
        { area_id: PASAJE, intent_key: "ATENCION_MEDICA_CIRUGIA", response_group_id: "cirugia_cardoso_atilio", is_active: true },
        { area_id: PASAJE, intent_key: "ATENCION_MEDICA_CIRUGIA", response_group_id: "cirugia_cardoso_martin", is_active: true },
      ],
    });
  });

  test("cardiología deriva la conversación a Cardiología", async () => {
    await processInbound(inbound("+5493510000001", "Hola, quiero turno con cardiología", "SM-A1"));
    expect(conversationFor("+5493510000001")?.area_ids).toEqual([CARDIOLOGIA]);
  });

  test("un electrocardiograma también deriva a Cardiología", async () => {
    await processInbound(inbound("+5493510000002", "Quiero hacerme un electrocardiograma", "SM-B1"));
    expect(conversationFor("+5493510000002")?.area_ids).toEqual([CARDIOLOGIA]);
  });

  test("un saludo no cambia la área de una conversación ya derivada", async () => {
    await processInbound(inbound("+5493510000003", "Quiero hacerme un electrocardiograma", "SM-C1"));
    const before = conversationFor("+5493510000003")?.area_ids;
    expect(before).toEqual([CARDIOLOGIA]);
    await processInbound(inbound("+5493510000003", "Gracias", "SM-C2"));
    expect(conversationFor("+5493510000003")?.area_ids).toEqual(before);
  });
});

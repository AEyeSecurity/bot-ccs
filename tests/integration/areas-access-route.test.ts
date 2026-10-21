import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { GET as listConversations } from "@/app/api/conversations/route";
import { POST as takeover } from "@/app/api/conversations/[id]/takeover/route";
import { POST as close } from "@/app/api/conversations/[id]/close/route";
import { GET as messages } from "@/app/api/conversations/[id]/messages/route";

const CARDIOLOGIA = "area-cardiologia";
const TAC = "area-tac";

function request(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  }) as never;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function seed() {
  holder.client = createFakeSupabaseClient({
    areas: [
      { id: CARDIOLOGIA, name: "Cardiología", is_active: true },
      { id: TAC, name: "TAC", is_active: true },
    ],
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true },
      { id: "op-antonela", auth_user_id: "auth-antonela", name: "Antonela", email: "antonela@bot-ccs.local", role: "operator", is_active: true },
      { id: "op-tac", auth_user_id: "auth-tac", name: "TAC", email: "tac@bot-ccs.local", role: "operator", is_active: true },
      { id: "op-admin", auth_user_id: "auth-admin", name: "Admin", email: "admin@bot-ccs.local", role: "admin", is_active: true },
    ],
    operator_areas: [
      { operator_id: "op-carla", area_id: CARDIOLOGIA },
      { operator_id: "op-antonela", area_id: CARDIOLOGIA },
      { operator_id: "op-tac", area_id: TAC },
    ],
    conversations: [
      {
        id: "conv-cardio", contact_id: "c1", status: "human_takeover", assigned_operator_id: "op-carla",
        area_ids: [CARDIOLOGIA], bot_paused_until: null, last_activity_at: "2026-10-20T10:00:00.000Z", unread_count: 0,
      },
      {
        id: "conv-tac", contact_id: "c2", status: "waiting_operator", assigned_operator_id: null,
        area_ids: [TAC], bot_paused_until: null, last_activity_at: "2026-10-20T09:00:00.000Z", unread_count: 1,
      },
      {
        id: "conv-sin-area", contact_id: "c3", status: "waiting_operator", assigned_operator_id: null,
        area_ids: [], bot_paused_until: null, last_activity_at: "2026-10-20T08:00:00.000Z", unread_count: 1,
      },
    ],
    contacts: [
      { id: "c1", whatsapp_number: "+5490000000001" },
      { id: "c2", whatsapp_number: "+5490000000002" },
      { id: "c3", whatsapp_number: "+5490000000003" },
    ],
    cases: [],
    messages: [],
  });
}

function setup() {
  seed();
  holder.client.auth.getUser = async (token: string) => ({
    data: { user: { id: token.replace("token-", "") } },
    error: null,
  });
}

beforeEach(setup);

async function listedIds(token: string) {
  const response = await listConversations(request("/api/conversations", token));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversations: Array<{ id: string }> };
  return body.conversations.map((item) => item.id).sort();
}

describe("visibilidad por área en el listado", () => {
  test("cada operador ve solo las conversaciones de su área", async () => {
    expect(await listedIds("token-auth-carla")).toEqual(["conv-cardio"]);
    expect(await listedIds("token-auth-antonela")).toEqual(["conv-cardio"]);
    expect(await listedIds("token-auth-tac")).toEqual(["conv-tac"]);
  });

  test("admin ve todas, incluidas las que no tienen área", async () => {
    expect(await listedIds("token-auth-admin")).toEqual(["conv-cardio", "conv-sin-area", "conv-tac"]);
  });
});

describe("acciones por área", () => {
  test("un compañero de la misma área puede tomar la conversación y queda registrado el anterior", async () => {
    const response = await takeover(request("/api/conversations/conv-cardio/takeover", "token-auth-antonela", { method: "POST" }), params("conv-cardio"));
    expect(response.status).toBe(200);
    const conversation = holder.client.table("conversations").find((row) => row.id === "conv-cardio");
    expect(conversation?.assigned_operator_id).toBe("op-antonela");
    const event = holder.client.table("conversation_events").find((row) => row.event_type === "human_takeover_started");
    expect((event?.payload as Record<string, unknown>).previous_operator_id).toBe("op-carla");
  });

  test("un operador de otra área no puede tomar la conversación", async () => {
    const response = await takeover(request("/api/conversations/conv-cardio/takeover", "token-auth-tac", { method: "POST" }), params("conv-cardio"));
    expect(response.status).toBe(403);
    expect(holder.client.table("conversations").find((row) => row.id === "conv-cardio")?.assigned_operator_id).toBe("op-carla");
  });

  test("no se puede leer el detalle de una conversación de otra área", async () => {
    expect((await messages(request("/api/conversations/conv-tac/messages", "token-auth-carla"), params("conv-tac"))).status).toBe(403);
    expect((await messages(request("/api/conversations/conv-tac/messages", "token-auth-tac"), params("conv-tac"))).status).toBe(200);
  });

  test("cerrar una conversación ajena dentro del área está bloqueado; el admin puede cerrar cualquiera", async () => {
    await takeover(request("/api/conversations/conv-cardio/takeover", "token-auth-antonela", { method: "POST" }), params("conv-cardio"));
    expect((await close(request("/api/conversations/conv-cardio/close", "token-auth-carla", { method: "POST" }), params("conv-cardio"))).status).toBe(403);

    expect((await close(request("/api/conversations/conv-sin-area/close", "token-auth-carla", { method: "POST" }), params("conv-sin-area"))).status).toBe(403);
    expect((await close(request("/api/conversations/conv-sin-area/close", "token-auth-admin", { method: "POST" }), params("conv-sin-area"))).status).toBe(200);
  });
});

import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { POST as close } from "@/app/api/conversations/[id]/close/route";
import { POST as setResolution } from "@/app/api/conversations/[id]/resolution/route";

const CARDIOLOGIA = "area-cardiologia";

function request(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  }) as never;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function seed() {
  holder.client = createFakeSupabaseClient({
    areas: [{ id: CARDIOLOGIA, name: "Cardiología", is_active: true }],
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true },
      { id: "op-admin", auth_user_id: "auth-admin", name: "Admin", email: "admin@bot-ccs.local", role: "admin", is_active: true },
    ],
    operator_areas: [{ operator_id: "op-carla", area_id: CARDIOLOGIA }],
    conversations: [
      {
        id: "conv-1", contact_id: "c1", status: "human_takeover", assigned_operator_id: "op-carla",
        area_ids: [CARDIOLOGIA], bot_paused_until: null, last_activity_at: "2026-10-20T10:00:00.000Z",
        unread_count: 0, resolution_status: "abierta",
      },
    ],
    contacts: [{ id: "c1", whatsapp_number: "+5490000000001" }],
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

const conversation = () => holder.client.table("conversations")[0];

describe("estado de resolución", () => {
  test("cambia el estado de resolución manualmente y registra el evento", async () => {
    const response = await setResolution(
      request("/api/conversations/conv-1/resolution", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ resolution_status: "resuelta" }),
      }),
      params("conv-1"),
    );
    expect(response.status).toBe(200);
    expect(conversation()).toMatchObject({ resolution_status: "resuelta", resolved_by: "op-carla" });
    expect(conversation().resolved_at).toBeTruthy();
    const event = holder.client.table("conversation_events").find((row) => row.event_type === "resolution_status_changed");
    expect((event?.payload as Record<string, unknown>).resolution_status).toBe("resuelta");
  });

  test("volver de resuelta a pendiente limpia resolved_at y resolved_by", async () => {
    await setResolution(
      request("/api/conversations/conv-1/resolution", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ resolution_status: "resuelta" }),
      }),
      params("conv-1"),
    );
    await setResolution(
      request("/api/conversations/conv-1/resolution", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ resolution_status: "pendiente" }),
      }),
      params("conv-1"),
    );
    expect(conversation()).toMatchObject({ resolution_status: "pendiente", resolved_at: null, resolved_by: null });
  });

  test("rechaza un estado de resolución inválido", async () => {
    const response = await setResolution(
      request("/api/conversations/conv-1/resolution", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ resolution_status: "inexistente" }),
      }),
      params("conv-1"),
    );
    expect(response.status).toBe(400);
  });
});

describe("cierre con resolución", () => {
  test("cerrar con mark_resolved deja resuelta", async () => {
    const response = await close(
      request("/api/conversations/conv-1/close", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ mark_resolved: true }),
      }),
      params("conv-1"),
    );
    expect(response.status).toBe(200);
    expect(conversation()).toMatchObject({ status: "closed", resolution_status: "resuelta", resolved_by: "op-carla" });
  });

  test("cerrar sin mark_resolved conserva el estado anterior", async () => {
    await setResolution(
      request("/api/conversations/conv-1/resolution", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ resolution_status: "pendiente" }),
      }),
      params("conv-1"),
    );
    const response = await close(
      request("/api/conversations/conv-1/close", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ mark_resolved: false }),
      }),
      params("conv-1"),
    );
    expect(response.status).toBe(200);
    expect(conversation()).toMatchObject({ status: "closed", resolution_status: "pendiente" });
  });

  test("cerrar sin body conserva el estado (compatibilidad)", async () => {
    const response = await close(
      request("/api/conversations/conv-1/close", "token-auth-carla", { method: "POST" }),
      params("conv-1"),
    );
    expect(response.status).toBe(200);
    expect(conversation()).toMatchObject({ status: "closed", resolution_status: "abierta" });
  });
});

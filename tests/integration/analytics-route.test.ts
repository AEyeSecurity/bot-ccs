import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { GET } from "@/app/api/admin/analytics/route";

function request(path: string, token: string) {
  return new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } }) as never;
}

function setup() {
  holder.client = createFakeSupabaseClient({
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", role: "operator", is_active: true, last_seen_at: "2026-10-20T12:00:00.000Z" },
      { id: "op-admin", auth_user_id: "auth-admin", name: "Admin", email: "admin@bot-ccs.local", role: "admin", is_active: true },
    ],
    areas: [{ id: "area-1", name: "Cardiología", is_active: true }],
    conversations: [
      { id: "c1", status: "closed", resolution_status: "resuelta", area_ids: ["area-1"], current_intent: "TURNOS_MEDICOS_ATENCION_MEDICA", assigned_operator_id: "op-carla", created_at: "2026-10-20T10:00:00.000Z", updated_at: "2026-10-20T10:45:00.000Z", last_activity_at: "2026-10-20T10:40:00.000Z" },
    ],
    messages: [
      { conversation_id: "c1", direction: "inbound", sender_type: "patient", operator_id: null, created_at: "2026-10-20T10:00:00.000Z" },
      { conversation_id: "c1", direction: "outbound", sender_type: "operator", operator_id: "op-carla", created_at: "2026-10-20T10:05:00.000Z" },
    ],
    conversation_events: [
      { conversation_id: "c1", event_type: "human_takeover_started", actor_id: "op-carla", created_at: "2026-10-20T10:03:00.000Z" },
    ],
  });
  holder.client.auth.getUser = async (token: string) => ({
    data: { user: { id: token.replace("token-", "") } },
    error: null,
  });
}

beforeEach(setup);

describe("panel de datos (admin)", () => {
  test("admin recibe reporte y selector sin admins", async () => {
    const response = await GET(request("/api/admin/analytics?from=2026-10-20&to=2026-10-20", "token-auth-admin"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { report: { volume: { total: number } }; operators: Array<{ id: string }> };
    expect(body.report.volume.total).toBe(1);
    expect(body.operators.map((operator) => operator.id)).toEqual(["op-carla"]);
  });

  test("un operador no admin recibe 403", async () => {
    expect((await GET(request("/api/admin/analytics", "token-auth-carla"))).status).toBe(403);
  });

  test("un admin que no está en la lista permitida recibe 403", async () => {
    holder.client.table("operators").find((row) => row.id === "op-admin").email = "otroadmin@bot-ccs.local";
    expect((await GET(request("/api/admin/analytics", "token-auth-admin"))).status).toBe(403);
  });
});

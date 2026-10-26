import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { POST as presence } from "@/app/api/presence/route";

function request(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  }) as never;
}

function setup() {
  holder.client = createFakeSupabaseClient({
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true },
    ],
  });
  holder.client.auth.getUser = async (token: string) => ({
    data: { user: { id: token.replace("token-", "") } },
    error: null,
  });
}

beforeEach(setup);

describe("presencia", () => {
  test("actualiza last_seen_at del operador", async () => {
    const response = await presence(request("/api/presence", "token-auth-carla", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(holder.client.table("operators")[0].last_seen_at).toBeTruthy();
  });

  test("rechaza un operador no registrado", async () => {
    const response = await presence(request("/api/presence", "token-desconocido", { method: "POST" }));
    expect(response.status).toBe(403);
  });
});

import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { POST } from "@/app/api/me/password/route";

function request(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  }) as never;
}

function setup() {
  holder.client = createFakeSupabaseClient({
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true, password_change_required: true },
    ],
    operator_areas: [],
    auth_users: [{ id: "auth-carla", email: "cardiologia@bot-ccs.local", password: "Vieja1234" }],
  });
  holder.client.auth.getUser = async (token: string) => ({
    data: { user: { id: token.replace("token-", "") } },
    error: null,
  });
}

beforeEach(setup);

describe("cambio de contraseña propia", () => {
  test("actualiza la contraseña y limpia el flag", async () => {
    const response = await POST(
      request("/api/me/password", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ password: "Nueva1234" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(holder.client.table("auth_users").find((user) => user.id === "auth-carla")?.password).toBe("Nueva1234");
    expect(holder.client.table("operators").find((row) => row.id === "op-carla")?.password_change_required).toBe(false);
  });

  test("rechaza una contraseña débil", async () => {
    const response = await POST(
      request("/api/me/password", "token-auth-carla", {
        method: "POST",
        body: JSON.stringify({ password: "abc" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rechaza una petición sin token", async () => {
    const response = await POST(
      request("/api/me/password", "", {
        method: "POST",
        body: JSON.stringify({ password: "Nueva1234" }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

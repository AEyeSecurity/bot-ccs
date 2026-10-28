import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { POST } from "@/app/api/admin/catalog/restore/route";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, init) as never;
}

function setAuthenticated(email: string) {
  holder.client.auth.getUser = async () => ({ data: { user: { id: "auth-1" } }, error: null });
  holder.client.table("operators").push({
    id: "op-1", auth_user_id: "auth-1", name: "Admin", email, role: "admin", is_active: true,
  });
}

beforeEach(() => {
  holder.client = createFakeSupabaseClient({
    bot_catalog_versions: [
      {
        id: VERSION_ID, version: 1, status: "published", payload: {}, revision: 1,
        created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z", published_at: "2026-08-01T00:00:00.000Z",
      },
    ],
  });
});

describe("restauración de versiones (solo admindev)", () => {
  test("un admin común recibe 403", async () => {
    setAuthenticated("admin@bot-ccs.local");
    const response = await POST(request("/api/admin/catalog/restore", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ versionId: VERSION_ID }),
    }));
    expect(response.status).toBe(403);
  });

  test("admindev puede restaurar una versión", async () => {
    setAuthenticated("admindev@bot-ccs.local");
    const response = await POST(request("/api/admin/catalog/restore", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ versionId: VERSION_ID }),
    }));
    expect(response.status).toBe(200);
  });
});

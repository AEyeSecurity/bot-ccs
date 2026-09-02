import initialCatalog from "../../data/bot-catalog-initial.json";
import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { GET } from "@/app/api/admin/catalog/route";
import { PUT } from "@/app/api/admin/catalog/draft/route";
import { POST as publish } from "@/app/api/admin/catalog/publish/route";

const published = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  status: "published",
  payload: initialCatalog,
  revision: 1,
  created_by: "admin-1",
  updated_by: "admin-1",
  published_by: "admin-1",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  published_at: "2026-08-01T00:00:00.000Z",
};

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, init) as never;
}

function setAuthenticated(role: "admin" | "operator") {
  holder.client.auth.getUser = async () => ({ data: { user: { id: "auth-1" } }, error: null });
  holder.client.table("operators").push({
    id: `${role}-1`, auth_user_id: "auth-1", name: role, email: `${role}@example.com`, role, is_active: true,
  });
}

beforeEach(() => {
  holder.client = createFakeSupabaseClient({ bot_catalog_versions: [structuredClone(published)] });
});

describe("admin catalog API", () => {
  test("returns 401 without a session and 403 for a normal operator", async () => {
    expect((await GET(request("/api/admin/catalog"))).status).toBe(401);
    setAuthenticated("operator");
    expect((await GET(request("/api/admin/catalog", { headers: { authorization: "Bearer token" } }))).status).toBe(403);
  });

  test("allows an admin to read and save a draft without changing production", async () => {
    setAuthenticated("admin");
    const headers = { authorization: "Bearer token", "content-type": "application/json" };
    const readResponse = await GET(request("/api/admin/catalog", { headers }));
    expect(readResponse.status).toBe(200);

    const payload = structuredClone(initialCatalog);
    payload.messages.greetingThanks.body = "Gracias por escribir a Clínica Cruz del Sur.";
    payload.messages.greetingThanks.reviewStatus = "reviewed";
    const saveResponse = await PUT(request("/api/admin/catalog/draft", {
      method: "PUT", headers, body: JSON.stringify({ payload, revision: null }),
    }));
    expect(saveResponse.status).toBe(200);
    expect(holder.client.table("bot_catalog_versions").find((row) => row.status === "published")?.payload).toEqual(initialCatalog);
    const storedDraft = holder.client.table("bot_catalog_versions").find((row) => row.status === "draft");
    expect(storedDraft?.revision).toBe(1);
    expect((storedDraft?.payload as typeof initialCatalog).messages.greetingThanks.reviewStatus).toBe("pending");

    const conflict = await PUT(request("/api/admin/catalog/draft", {
      method: "PUT", headers, body: JSON.stringify({ payload, revision: null }),
    }));
    expect(conflict.status).toBe(409);
  });

  test("blocks pending publication and publishes a reviewed draft atomically", async () => {
    setAuthenticated("admin");
    const headers = { authorization: "Bearer token", "content-type": "application/json" };
    const pendingPayload = structuredClone(initialCatalog);
    pendingPayload.messages.greetingThanks.body = "Gracias por escribir a Clínica Cruz del Sur.";
    pendingPayload.messages.greetingThanks.reviewStatus = "pending";
    await PUT(request("/api/admin/catalog/draft", {
      method: "PUT", headers, body: JSON.stringify({ payload: pendingPayload, revision: null }),
    }));
    const draft = holder.client.table("bot_catalog_versions").find((row) => row.status === "draft")!;
    const blocked = await publish(request("/api/admin/catalog/publish", {
      method: "POST", headers, body: JSON.stringify({ draftId: draft.id, revision: draft.revision }),
    }));
    expect(blocked.status).toBe(400);

    pendingPayload.messages.greetingThanks.reviewStatus = "reviewed";
    await PUT(request("/api/admin/catalog/draft", {
      method: "PUT", headers, body: JSON.stringify({ payload: pendingPayload, revision: 1 }),
    }));
    const updatedDraft = holder.client.table("bot_catalog_versions").find((row) => row.status === "draft")!;
    const response = await publish(request("/api/admin/catalog/publish", {
      method: "POST", headers, body: JSON.stringify({ draftId: updatedDraft.id, revision: updatedDraft.revision }),
    }));
    expect(response.status).toBe(200);
    expect(holder.client.table("bot_catalog_versions").filter((row) => row.status === "published")).toHaveLength(1);
    expect(holder.client.table("bot_catalog_versions").filter((row) => row.status === "archived")).toHaveLength(1);
  });
});

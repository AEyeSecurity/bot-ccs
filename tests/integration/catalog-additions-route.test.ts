import initialCatalog from "../../data/bot-catalog-initial.json";
import { createFakeSupabaseClient } from "../helpers/fake-supabase";
import {
  addImagingStudyToCatalog,
  addInsurancePlanToCatalog,
  addMedicalServiceToCatalog,
} from "@/lib/catalog-editor";
import type { ManagedCatalog } from "@/lib/managed-catalog";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { PUT } from "@/app/api/admin/catalog/draft/route";

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

const headers = { authorization: "Bearer token", "content-type": "application/json" };

function save(payload: unknown) {
  return PUT(new Request("http://localhost/api/admin/catalog/draft", {
    method: "PUT", headers, body: JSON.stringify({ payload, revision: null }),
  }) as never);
}

function login(role: "admin" | "operator") {
  holder.client.auth.getUser = async () => ({ data: { user: { id: "auth-1" } }, error: null });
  holder.client.table("operators").push({
    id: `${role}-1`, auth_user_id: "auth-1", name: role, email: `${role}@example.com`, role, is_active: true,
  });
}

const fresh = () => structuredClone(initialCatalog) as unknown as ManagedCatalog;

beforeEach(() => {
  holder.client = createFakeSupabaseClient({ bot_catalog_versions: [structuredClone(published)] });
});

describe("altas del banco de respuestas (solo admin)", () => {
  test("el admin guarda obra social, estudio y especialidad nuevos como pendientes", async () => {
    login("admin");
    const payload = fresh();
    addInsurancePlanToCatalog(payload, { name: "Salud Patagónica" });
    addImagingStudyToCatalog(payload, { title: "Capilaroscopía", body: "Con turno previo." });
    addMedicalServiceToCatalog(payload, { title: "Oftalmología", body: "Atención con turno previo." });

    const response = await save(payload);
    expect(response.status).toBe(200);
    const draft = holder.client.table("bot_catalog_versions").find((row) => row.status === "draft")!.payload as ManagedCatalog;
    expect(draft.insurancePlans.at(-1)).toMatchObject({ name: "Salud Patagónica", reviewStatus: "pending" });
    expect(draft.imagingStudies.at(-1)).toMatchObject({ title: "Capilaroscopía", reviewStatus: "pending" });
    expect(draft.medicalServices.at(-1)).toMatchObject({ title: "Oftalmología", reviewStatus: "pending" });
  });

  test("un operador no admin recibe 403", async () => {
    login("operator");
    const payload = fresh();
    addInsurancePlanToCatalog(payload, { name: "Salud Patagónica" });
    expect((await save(payload)).status).toBe(403);
  });

  test("sigue rechazando borrar o reordenar lo ya publicado", async () => {
    login("admin");
    const removed = fresh();
    removed.insurancePlans.pop();
    expect((await save(removed)).status).toBe(400);

    const reordered = fresh();
    reordered.medicalServices.reverse();
    expect((await save(reordered)).status).toBe(400);

    const changedIntent = fresh();
    changedIntent.imagingStudies[0].intent = "OTRO_INTENT";
    expect((await save(changedIntent)).status).toBe(400);
  });
});

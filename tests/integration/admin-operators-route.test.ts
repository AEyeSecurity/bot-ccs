import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { DELETE, GET, POST, PATCH } from "@/app/api/admin/operators/route";

const CARDIOLOGIA = "area-cardiologia";
const TAC = "area-tac";

function request(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  }) as never;
}

function setup() {
  holder.client = createFakeSupabaseClient({
    areas: [
      { id: CARDIOLOGIA, name: "Cardiología", is_active: true },
      { id: TAC, name: "TAC", is_active: true },
    ],
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true, password_change_required: false },
      { id: "op-admin", auth_user_id: "auth-admin", name: "Admin", email: "admin@bot-ccs.local", role: "admin", is_active: true },
    ],
    operator_areas: [{ operator_id: "op-carla", area_id: CARDIOLOGIA }],
    auth_users: [{ id: "auth-carla", email: "cardiologia@bot-ccs.local", password: "Vieja1234" }],
  });
  holder.client.auth.getUser = async (token: string) => ({
    data: { user: { id: token.replace("token-", "") } },
    error: null,
  });
}

beforeEach(setup);

describe("listado de usuarios (admin)", () => {
  test("admin ve operadores con sus áreas y el listado de áreas", async () => {
    const response = await GET(request("/api/admin/operators", "token-auth-admin"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { operators: Array<{ id: string; area_ids: string[] }>; areas: Array<{ id: string }> };
    expect(body.areas.map((area) => area.id)).toEqual(expect.arrayContaining([CARDIOLOGIA, TAC]));
    const carla = body.operators.find((operator) => operator.id === "op-carla");
    expect(carla?.area_ids).toEqual([CARDIOLOGIA]);
  });

  test("un operador no admin recibe 403", async () => {
    expect((await GET(request("/api/admin/operators", "token-auth-carla"))).status).toBe(403);
  });
});

describe("alta y edición de usuarios", () => {
  test("crea un operador con contraseña y áreas", async () => {
    const response = await POST(
      request("/api/admin/operators", "token-auth-admin", {
        method: "POST",
        body: JSON.stringify({ username: "nueva", name: "Nueva Operadora", password: "Nueva1234", role: "operator", areas: ["Cardiología", "TAC"] }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { operator: { id: string; email: string; area_ids: string[] } };
    expect(body.operator.email).toBe("nueva@bot-ccs.local");
    expect(body.operator.area_ids).toEqual(expect.arrayContaining([CARDIOLOGIA, TAC]));
    const createdAuth = holder.client.table("auth_users").find((user) => user.email === "nueva@bot-ccs.local");
    expect(createdAuth?.password).toBe("Nueva1234");
    expect(holder.client.table("operators").find((row) => row.id === body.operator.id)?.password_change_required).toBe(true);
  });

  test("rechaza una contraseña débil", async () => {
    const response = await POST(
      request("/api/admin/operators", "token-auth-admin", {
        method: "POST",
        body: JSON.stringify({ username: "debil", name: "Contraseña Débil", password: "abc", role: "operator", areas: ["Cardiología"] }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rechaza un nombre de usuario duplicado", async () => {
    const response = await POST(
      request("/api/admin/operators", "token-auth-admin", {
        method: "POST",
        body: JSON.stringify({ username: "cardiologia", name: "Otra Persona", password: "Nueva1234", role: "operator", areas: ["Cardiología"] }),
      }),
    );
    expect(response.status).toBe(409);
  });

  test("rechaza un operador sin áreas", async () => {
    const response = await POST(
      request("/api/admin/operators", "token-auth-admin", {
        method: "POST",
        body: JSON.stringify({ username: "sinarea", name: "Sin área", password: "Nueva1234", role: "operator", areas: [] }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("resetea la contraseña con una nueva y marca cambio requerido", async () => {
    const response = await PATCH(
      request("/api/admin/operators", "token-auth-admin", {
        method: "PATCH",
        body: JSON.stringify({ id: "op-carla", name: "Carla", role: "operator", areas: ["Cardiología"], is_active: true, reset_password: true, password: "Nueva1234" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(holder.client.table("auth_users").find((user) => user.id === "auth-carla")?.password).toBe("Nueva1234");
    expect(holder.client.table("operators").find((row) => row.id === "op-carla")?.password_change_required).toBe(true);
  });

  test("rechaza el reset sin contraseña nueva", async () => {
    const response = await PATCH(
      request("/api/admin/operators", "token-auth-admin", {
        method: "PATCH",
        body: JSON.stringify({ id: "op-carla", name: "Carla", role: "operator", areas: ["Cardiología"], is_active: true, reset_password: true }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("desactiva una cuenta", async () => {
    const response = await PATCH(
      request("/api/admin/operators", "token-auth-admin", {
        method: "PATCH",
        body: JSON.stringify({ id: "op-carla", name: "Carla", role: "operator", areas: ["Cardiología"], is_active: false }),
      }),
    );
    expect(response.status).toBe(200);
    expect(holder.client.table("operators").find((operator) => operator.id === "op-carla")?.is_active).toBe(false);
  });

  test("cambiar a admin limpia las áreas", async () => {
    const response = await PATCH(
      request("/api/admin/operators", "token-auth-admin", {
        method: "PATCH",
        body: JSON.stringify({ id: "op-carla", name: "Carla", role: "admin", areas: [], is_active: true }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { operator: { area_ids: string[] } };
    expect(body.operator.area_ids).toEqual([]);
  });
});

describe("eliminación de usuarios", () => {
  test("elimina un usuario y su cuenta de autenticación", async () => {
    const response = await DELETE(
      request("/api/admin/operators", "token-auth-admin", {
        method: "DELETE",
        body: JSON.stringify({ id: "op-carla" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(holder.client.table("operators").find((row) => row.id === "op-carla")).toBeUndefined();
    expect(holder.client.table("auth_users").find((user) => user.id === "auth-carla")).toBeUndefined();
  });

  test("no permite eliminar la propia cuenta", async () => {
    const response = await DELETE(
      request("/api/admin/operators", "token-auth-admin", {
        method: "DELETE",
        body: JSON.stringify({ id: "op-admin" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("un usuario inexistente devuelve 404", async () => {
    const response = await DELETE(
      request("/api/admin/operators", "token-auth-admin", {
        method: "DELETE",
        body: JSON.stringify({ id: "no-existe" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});

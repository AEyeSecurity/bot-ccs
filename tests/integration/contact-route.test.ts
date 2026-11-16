import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const holder = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createFakeSupabaseClient>,
}));

vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));

import { PATCH as patchContact } from "@/app/api/conversations/[id]/contact/route";

const CARDIOLOGIA = "area-cardiologia";
const OTRA = "area-otra";

function request(token: string, body: unknown) {
  return new Request("http://localhost/api/conversations/conv-1/contact", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const params = Promise.resolve({ id: "conv-1" });

beforeEach(() => {
  holder.client = createFakeSupabaseClient({
    areas: [
      { id: CARDIOLOGIA, name: "Cardiología", is_active: true },
      { id: OTRA, name: "Otra", is_active: true },
    ],
    operators: [
      { id: "op-carla", auth_user_id: "auth-carla", name: "Carla", email: "cardiologia@bot-ccs.local", role: "operator", is_active: true },
      { id: "op-otra", auth_user_id: "auth-otra", name: "Otra", email: "otra@bot-ccs.local", role: "operator", is_active: true },
    ],
    operator_areas: [
      { operator_id: "op-carla", area_id: CARDIOLOGIA },
      { operator_id: "op-otra", area_id: OTRA },
    ],
    conversations: [
      {
        id: "conv-1", contact_id: "c1", status: "human_takeover", assigned_operator_id: "op-otra",
        area_ids: [CARDIOLOGIA], last_activity_at: "2026-10-20T10:00:00.000Z", unread_count: 0, resolution_status: "abierta",
      },
    ],
    contacts: [{ id: "c1", whatsapp_number: "+5490000000001", display_name: "Perfil WA", manual_fields: [] }],
    conversation_events: [],
  });
  holder.client.auth.getUser = async (token: string) => ({ data: { user: { id: token.replace("token-", "") } }, error: null });
});

const contact = () => holder.client.table("contacts")[0];

describe("ficha del paciente editable", () => {
  test("una operadora del área corrige nombre, DNI y obra social aunque la conversación no sea suya", async () => {
    const response = await patchContact(
      request("token-auth-carla", { patient_full_name: " María Pérez ", dni_number: "30.123.456", insurance_name: "OSDE" }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(contact()).toMatchObject({ patient_full_name: "María Pérez", dni_number: "30123456", insurance_name: "OSDE" });
    expect(contact().manual_fields).toEqual(expect.arrayContaining(["patient_full_name", "dni_number", "insurance_name"]));
    const event = holder.client.table("conversation_events").find((row) => row.event_type === "contact_updated");
    expect(event?.payload).toEqual({ fields: ["patient_full_name", "dni_number", "insurance_name"] });
    expect(JSON.stringify(event)).not.toContain("30123456");
  });

  test("un valor vacío borra el dato", async () => {
    await patchContact(request("token-auth-carla", { insurance_name: "OSDE" }), { params });
    await patchContact(request("token-auth-carla", { insurance_name: "" }), { params });
    expect(contact().insurance_name).toBeNull();
  });

  test("rechaza un DNI inválido y un cuerpo vacío", async () => {
    expect((await patchContact(request("token-auth-carla", { dni_number: "abc" }), { params })).status).toBe(400);
    expect((await patchContact(request("token-auth-carla", {}), { params })).status).toBe(400);
  });

  test("un operador de otra área recibe 403", async () => {
    const response = await patchContact(request("token-auth-otra", { dni_number: "30123456" }), { params });
    expect(response.status).toBe(403);
    expect(contact().dni_number).toBeUndefined();
  });
});

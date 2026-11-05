import { createFakeSupabaseClient } from "../helpers/fake-supabase";
const holder = vi.hoisted(() => ({ client: null as unknown as ReturnType<typeof createFakeSupabaseClient>, send: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createAdminSupabaseClient: () => holder.client }));
vi.mock("@/lib/twilio", () => ({ sendWhatsappMessage: holder.send }));
import { POST as send } from "@/app/api/conversations/[id]/send/route";
import { POST as resolve } from "@/app/api/conversations/[id]/resolution/route";
import { processInbound } from "@/lib/bot-engine";

const phone = "+5490000000001";
const params = { params: Promise.resolve({ id: "conv" }) };
function request(body: unknown, user = "one") {
  return new Request("http://localhost", { method: "POST", headers: { authorization: `Bearer ${user}` }, body: JSON.stringify(body) }) as never;
}
const reply = (user = "one") => send(request({ body: "Hola, te atendemos desde el sector" }, user), params);
const resolution = (status: string) => resolve(request({ resolution_status: status }), params);
const row = () => holder.client.table("conversations")[0];
beforeEach(() => {
  holder.client = createFakeSupabaseClient({
    operators: [
      { id: "one", auth_user_id: "one", role: "operator", is_active: true },
      { id: "two", auth_user_id: "two", role: "operator", is_active: true },
      { id: "other", auth_user_id: "other", role: "operator", is_active: true },
    ],
    operator_areas: [{ operator_id: "one", area_id: "area" }, { operator_id: "two", area_id: "area" }, { operator_id: "other", area_id: "other-area" }],
    contacts: [{ id: "contact", whatsapp_number: phone }],
    conversations: [{ id: "conv", contact_id: "contact", contact: { whatsapp_number: phone }, area_ids: ["area"], status: "waiting_operator", resolution_status: "abierta", assigned_operator_id: null, bot_paused_until: null, unanswered_release_at: null, last_activity_at: new Date().toISOString() }],
  });
  holder.client.auth.getUser = async (token: string) => ({ data: { user: { id: token } }, error: null });
  holder.send.mockReset().mockResolvedValue({ sid: "SMmock", status: "queued" });
});

test.each(["bot_active", "waiting_operator", "takeover_expired"])("el primer envío desde %s pausa y asigna antes de WhatsApp", async (status) => {
  row().status = status;
  holder.send.mockImplementation(async () => {
    expect(row()).toMatchObject({ status: "human_takeover", assigned_operator_id: "one" });
    expect(new Date(String(row().bot_paused_until)).getTime()).toBeGreaterThan(Date.now());
    return { sid: "SMmock", status: "queued" };
  });
  expect((await reply()).status).toBe(200);
  expect(holder.client.table("messages")[0]).toMatchObject({ operator_id: "one", sender_type: "operator" });
});

test("otro sector no puede enviar ni tomar control", async () => {
  expect((await reply("other")).status).toBe(403);
  expect(holder.send).not.toHaveBeenCalled();
  expect(row().status).toBe("waiting_operator");
});

test("un compañero del área puede asumir automáticamente al responder", async () => {
  await reply();
  expect((await reply("two")).status).toBe(200);
  expect(row().assigned_operator_id).toBe("two");
});

test("renueva control vencido y reabre resolución resuelta al responder", async () => {
  Object.assign(row(), { status: "human_takeover", bot_paused_until: "2020-01-01T00:00:00Z", resolution_status: "resuelta", resolved_by: "one", resolved_at: "2020-01-01T00:00:00Z" });
  expect((await reply()).status).toBe(200);
  expect(row()).toMatchObject({ status: "human_takeover", resolution_status: "abierta", resolved_at: null, resolved_by: null });
});

test("un envío rechazado por WhatsApp restaura el estado y no registra respuesta", async () => {
  const previous = { ...row() };
  holder.send.mockRejectedValue(new Error("Envío rechazado"));
  expect((await reply()).status).toBe(500);
  expect(row()).toMatchObject(previous);
  expect(holder.client.table("messages")).toHaveLength(0);
});

test("archivada no admite envío ni se reabre al resolver", async () => {
  row().status = "closed";
  expect((await reply()).status).toBe(409);
  expect(holder.send).not.toHaveBeenCalled();
  expect((await resolution("resuelta")).status).toBe(200);
  expect(row().status).toBe("closed");
});

test("Pendiente conserva pausa y Resuelta libera; inbound vuelve a responder", async () => {
  await reply();
  const until = row().bot_paused_until;
  expect((await resolution("pendiente")).status).toBe(200);
  expect(row()).toMatchObject({ status: "human_takeover", bot_paused_until: until, assigned_operator_id: "one" });
  const inbound = { from: phone, to: "+5490000000002", body: "hola", messageSid: "SMin1", profileName: "Prueba", numMedia: 0, mediaContentTypes: [], mediaUrls: [] };
  expect(await processInbound(inbound)).toMatchObject({ shouldReply: false, reason: "human_takeover" });
  expect((await resolution("resuelta")).status).toBe(200);
  expect(row()).toMatchObject({ status: "bot_active", resolution_status: "resuelta", assigned_operator_id: null, bot_paused_until: null, unanswered_release_at: null });
  expect(await processInbound({ ...inbound, messageSid: "SMin2" })).toMatchObject({ shouldReply: true });
});

test("inbound y Resuelta esperan a que termine un envío humano en curso", async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const pending = new Promise<void>((r) => { finish = r; });
  holder.send.mockImplementation(async () => { entered(); await pending; return { sid: "SMmock", status: "queued" }; });
  const sending = reply();
  await started;
  let inboundDone = false;
  const inbound = processInbound({ from: phone, to: phone, body: "hola", messageSid: "SMduring", numMedia: 0, mediaContentTypes: [], mediaUrls: [] }).then((result) => { inboundDone = true; return result; });
  const resolving = resolution("resuelta");
  await Promise.resolve();
  expect(inboundDone).toBe(false);
  finish();
  expect((await sending).status).toBe(200);
  expect(await inbound).toMatchObject({ shouldReply: false });
  expect((await resolving).status).toBe(200);
  expect(row()).toMatchObject({ status: "bot_active", resolution_status: "resuelta" });
});

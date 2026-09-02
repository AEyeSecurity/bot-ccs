import { releaseConversation } from "@/lib/conversation-release";
import { createFakeSupabaseClient } from "../helpers/fake-supabase";

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1",
    status: "human_takeover",
    last_inbound_at: "2026-08-01T12:00:00.000Z",
    current_intent: "TURNOS_MEDICOS_ATENCION_MEDICA",
    current_step: "patient_identity",
    assigned_operator_id: "operator-1",
    bot_paused_until: null,
    unanswered_release_at: null,
    unread_count: 1,
    ...overrides,
  };
}

describe("conversation release expiration", () => {
  test("does not mark a release after a human response", async () => {
    const row = conversation();
    const client = createFakeSupabaseClient({
      conversations: [row],
      messages: [{ id: "message-1", conversation_id: row.id, sender_type: "operator", created_at: "2026-08-01T12:05:00.000Z" }],
    });
    const result = await releaseConversation(client as never, row, "operator-1", new Date("2026-08-01T13:00:00.000Z"));
    expect(result.closed).toBe(false);
    expect(client.table("conversations")[0]).toMatchObject({ status: "bot_active", unanswered_release_at: null });
  });

  test("marks an unanswered release before 24 hours", async () => {
    const row = conversation();
    const client = createFakeSupabaseClient({ conversations: [row] });
    await releaseConversation(client as never, row, "operator-1", new Date("2026-08-02T11:59:59.000Z"));
    expect(client.table("conversations")[0].unanswered_release_at).toBe("2026-08-02T11:59:59.000Z");
    expect(client.table("conversations")[0].status).toBe("bot_active");
  });

  test("closes at exactly 24 hours, cancels cases and emits one event without a message", async () => {
    const row = conversation();
    const client = createFakeSupabaseClient({
      conversations: [row],
      cases: [{ id: "case-1", conversation_id: row.id, status: "waiting_operator", current_step: "patient_identity" }],
    });
    const result = await releaseConversation(client as never, row, "operator-1", new Date("2026-08-02T12:00:00.000Z"));
    expect(result.closed).toBe(true);
    expect(client.table("conversations")[0]).toMatchObject({
      status: "closed", current_intent: null, current_step: null, assigned_operator_id: null, unanswered_release_at: null,
    });
    expect(client.table("cases")[0]).toMatchObject({ status: "cancelled", current_step: null });
    expect(client.table("conversation_events").filter((event) => event.event_type === "conversation_closed_after_unanswered_release")).toHaveLength(1);
    expect(client.table("messages")).toHaveLength(0);

    await releaseConversation(client as never, client.table("conversations")[0] as never, "operator-1", new Date("2026-08-02T12:01:00.000Z"));
    expect(client.table("conversation_events").filter((event) => event.event_type === "conversation_closed_after_unanswered_release")).toHaveLength(1);
  });
});

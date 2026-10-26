import { buildAnalyticsReport } from "@/lib/analytics";

const from = "2026-10-20T00:00:00.000Z";
const to = "2026-10-20T23:59:59.999Z";

const conversations = [
  { id: "c1", status: "closed", resolution_status: "resuelta", area_ids: ["a1"], current_intent: "TURNOS_MEDICOS_ATENCION_MEDICA", assigned_operator_id: "op1", created_at: "2026-10-20T10:00:00.000Z", updated_at: "2026-10-20T10:45:00.000Z", last_activity_at: "2026-10-20T10:40:00.000Z" },
  { id: "c2", status: "human_takeover", resolution_status: "pendiente", area_ids: [], current_intent: null, assigned_operator_id: "op2", created_at: "2026-10-20T11:00:00.000Z", updated_at: "2026-10-20T11:30:00.000Z", last_activity_at: "2026-10-20T11:30:00.000Z" },
];

const messages = [
  { conversation_id: "c1", direction: "inbound" as const, sender_type: "patient", operator_id: null, created_at: "2026-10-20T10:00:00.000Z" },
  { conversation_id: "c1", direction: "outbound" as const, sender_type: "operator", operator_id: "op1", created_at: "2026-10-20T10:05:00.000Z" },
  { conversation_id: "c2", direction: "inbound" as const, sender_type: "patient", operator_id: null, created_at: "2026-10-20T11:00:00.000Z" },
  { conversation_id: "c2", direction: "outbound" as const, sender_type: "operator", operator_id: "op2", created_at: "2026-10-20T11:10:00.000Z" },
];

const events = [
  { conversation_id: "c1", event_type: "human_takeover_started", actor_id: "op1", created_at: "2026-10-20T10:03:00.000Z" },
  { conversation_id: "c2", event_type: "human_takeover_started", actor_id: "op2", created_at: "2026-10-20T11:05:00.000Z" },
];

const operators = [
  { id: "op1", role: "operator", last_seen_at: "2026-10-20T12:00:00.000Z" },
  { id: "op2", role: "operator", last_seen_at: "2026-10-20T12:00:00.000Z" },
];

const areaNames = new Map([["a1", "Cardiología"]]);

const base = {
  conversations,
  messages,
  events,
  operators,
  areaNames,
  from,
  to,
  now: "2026-10-20T12:00:30.000Z",
};

describe("buildAnalyticsReport", () => {
  test("vista general: volumen, resolución, actividad y tiempos", () => {
    const report = buildAnalyticsReport({ ...base, operatorId: null });
    expect(report.volume).toEqual({ total: 2, open: 1, closed: 1 });
    expect(report.resolution).toEqual({ abierta: 0, pendiente: 1, resuelta: 1 });
    expect(report.activity).toEqual({ participatedConversations: 2, interventions: 2, operatorMessages: 2 });
    expect(report.times.firstResponseMinutes).toBe(8);
    expect(report.times.resolutionMinutes).toBe(45);
    expect(report.times.queueMinutes).toBe(4);
    expect(report.presence.connected).toBe(2);
  });

  test("por usuario: solo cuenta su participación", () => {
    const report = buildAnalyticsReport({ ...base, operatorId: "op1" });
    expect(report.volume).toEqual({ total: 1, open: 0, closed: 1 });
    expect(report.activity).toEqual({ participatedConversations: 1, interventions: 1, operatorMessages: 1 });
    expect(report.times.firstResponseMinutes).toBe(5);
    expect(report.presence.connected).toBe(true);
  });

  test("derivación por gestión y por área", () => {
    const report = buildAnalyticsReport({ ...base, operatorId: null });
    expect(report.topIntents).toEqual([
      { intent: "TURNOS_MEDICOS_ATENCION_MEDICA", count: 1 },
      { intent: "sin_gestion", count: 1 },
    ]);
    expect(report.topAreas).toEqual([
      { area: "Cardiología", count: 1 },
      { area: "Sin área", count: 1 },
    ]);
  });

  test("sin datos no produce NaN", () => {
    const report = buildAnalyticsReport({ ...base, conversations: [], messages: [], events: [], operatorId: null });
    expect(report.volume.total).toBe(0);
    expect(report.times.firstResponseMinutes).toBeNull();
    expect(report.times.resolutionMinutes).toBeNull();
    expect(report.times.queueMinutes).toBeNull();
  });
});

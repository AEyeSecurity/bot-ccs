export type AnalyticsConversation = {
  id: string;
  status: string;
  resolution_status?: string | null;
  area_ids?: string[] | null;
  current_intent?: string | null;
  assigned_operator_id?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
};

export type AnalyticsMessage = {
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  operator_id: string | null;
  created_at: string;
};

export type AnalyticsEvent = {
  conversation_id: string;
  event_type: string;
  actor_id: string | null;
  created_at: string;
};

export type AnalyticsOperator = {
  id: string;
  role: string;
  last_seen_at?: string | null;
};

const INTERVENTION_EVENTS = new Set([
  "human_takeover_started",
  "conversation_closed",
  "conversation_closed_after_unanswered_release",
  "bot_released",
]);

const PRESENCE_WINDOW_MS = 90_000;

function timestamp(value?: string | null) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function inRange(value: string | null, from: string, to: string) {
  const time = timestamp(value);
  return time >= timestamp(from) && time <= timestamp(to);
}

function averageMinutes(durationsMs: number[]) {
  if (!durationsMs.length) return null;
  return Math.round(durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length / 60000);
}

export function buildAnalyticsReport(args: {
  conversations: AnalyticsConversation[];
  messages: AnalyticsMessage[];
  events: AnalyticsEvent[];
  operators: AnalyticsOperator[];
  areaNames: Map<string, string>;
  from: string;
  to: string;
  operatorId?: string | null;
  now?: string;
}) {
  const { conversations, messages, events, operators, areaNames, from, to, operatorId } = args;
  const now = args.now || new Date().toISOString();

  const scopedMessages = operatorId
    ? messages.filter((message) => message.operator_id === operatorId && inRange(message.created_at, from, to))
    : messages.filter((message) => inRange(message.created_at, from, to));
  const scopedEvents = operatorId
    ? events.filter((event) => event.actor_id === operatorId && inRange(event.created_at, from, to))
    : events.filter((event) => inRange(event.created_at, from, to));

  const participatedIds = new Set<string>([
    ...scopedMessages.map((message) => message.conversation_id),
    ...scopedEvents.map((event) => event.conversation_id),
  ]);

  const scopedConversations = conversations.filter((conversation) => {
    if (!inRange(conversation.last_activity_at, from, to)) return false;
    return operatorId ? participatedIds.has(conversation.id) : true;
  });

  const open = scopedConversations.filter((conversation) => conversation.status !== "closed");
  const closed = scopedConversations.filter((conversation) => conversation.status === "closed");

  const resolution: Record<string, number> = { abierta: 0, pendiente: 0, resuelta: 0 };
  for (const conversation of scopedConversations) {
    const key = conversation.resolution_status || "abierta";
    resolution[key] = (resolution[key] || 0) + 1;
  }

  const interventions = scopedEvents.filter((event) => INTERVENTION_EVENTS.has(event.event_type)).length;
  const operatorMessages = scopedMessages.filter((message) => message.sender_type === "operator").length;

  const messagesByConversation = new Map<string, AnalyticsMessage[]>();
  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) || [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }
  const eventsByConversation = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    const list = eventsByConversation.get(event.conversation_id) || [];
    list.push(event);
    eventsByConversation.set(event.conversation_id, list);
  }

  const firstResponseDurations: number[] = [];
  for (const conversation of scopedConversations) {
    const conversationMessages = messagesByConversation.get(conversation.id) || [];
    const inboundAt = Math.min(
      ...conversationMessages.filter((message) => message.direction === "inbound").map((message) => timestamp(message.created_at)),
    );
    const operatorReplies = conversationMessages.filter(
      (message) => message.sender_type === "operator" && (!operatorId || message.operator_id === operatorId),
    );
    const operatorReplyAt = Math.min(...operatorReplies.map((message) => timestamp(message.created_at)));
    if (inboundAt > 0 && operatorReplyAt >= inboundAt && operatorReplyAt < Infinity) {
      firstResponseDurations.push(operatorReplyAt - inboundAt);
    }
  }

  const resolutionDurations: number[] = [];
  for (const conversation of closed) {
    const duration = timestamp(conversation.updated_at) - timestamp(conversation.created_at);
    if (duration > 0) resolutionDurations.push(duration);
  }

  const queueDurations: number[] = [];
  for (const conversation of scopedConversations) {
    const takeover = (eventsByConversation.get(conversation.id) || []).find((event) => event.event_type === "human_takeover_started");
    if (takeover) {
      const duration = timestamp(takeover.created_at) - timestamp(conversation.created_at);
      if (duration >= 0) queueDurations.push(duration);
    }
  }

  const intentCounts = new Map<string, number>();
  for (const conversation of scopedConversations) {
    const intent = conversation.current_intent || "sin_gestion";
    intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
  }
  const topIntents = [...intentCounts.entries()]
    .map(([intent, count]) => ({ intent, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const areaCounts = new Map<string, number>();
  for (const conversation of scopedConversations) {
    const ids = conversation.area_ids?.length ? conversation.area_ids : [null];
    for (const id of ids) {
      const name = id ? areaNames.get(id) || id : "Sin área";
      areaCounts.set(name, (areaCounts.get(name) || 0) + 1);
    }
  }
  const topAreas = [...areaCounts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  const presenceConnected = (() => {
    if (!operatorId) {
      return operators.filter(
        (operator) => operator.role !== "admin" && timestamp(operator.last_seen_at) >= timestamp(now) - PRESENCE_WINDOW_MS,
      ).length;
    }
    const operator = operators.find((item) => item.id === operatorId);
    return operator ? timestamp(operator.last_seen_at) >= timestamp(now) - PRESENCE_WINDOW_MS : false;
  })();

  return {
    period: { from, to, operator_id: operatorId || null },
    volume: { total: scopedConversations.length, open: open.length, closed: closed.length },
    resolution,
    activity: {
      participatedConversations: operatorId ? participatedIds.size : scopedConversations.length,
      interventions,
      operatorMessages,
    },
    times: {
      firstResponseMinutes: averageMinutes(firstResponseDurations),
      resolutionMinutes: averageMinutes(resolutionDurations),
      queueMinutes: averageMinutes(queueDurations),
    },
    topIntents,
    topAreas,
    presence: { connected: presenceConnected },
  };
}

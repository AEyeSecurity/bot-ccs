import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "./supabase";
import { getServerEnv } from "./env";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export async function parseBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  const text = await request.text();
  if (!text.trim()) return {};

  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

export function requireBotSecret(request: NextRequest) {
  const expected = getServerEnv().botWebhookSecret;
  if (!expected) return;

  const provided =
    request.headers.get("x-bot-ccs-secret") ||
    request.headers.get("authorization")?.replace(/^bearer\s+/i, "") ||
    "";

  if (provided !== expected) {
    throw Object.assign(new Error("Invalid bot webhook secret"), { status: 401 });
  }
}

export function addMinutes(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export async function expireTakeovers(supabase: SupabaseAdmin) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("conversations")
    .update({
      status: "takeover_expired",
      assigned_operator_id: null,
      bot_paused_until: null,
      updated_at: now,
    })
    .eq("status", "human_takeover")
    .lte("bot_paused_until", now);

  if (error) throw new Error(error.message);
}

export async function insertConversationEvent(
  supabase: SupabaseAdmin,
  conversationId: string,
  eventType: string,
  actorType: "operator" | "bot" | "system",
  actorId: string | null,
  payload?: Record<string, unknown>,
) {
  const { error } = await supabase.from("conversation_events").insert({
    conversation_id: conversationId,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    payload: payload || null,
  });

  if (error) throw new Error(error.message);
}

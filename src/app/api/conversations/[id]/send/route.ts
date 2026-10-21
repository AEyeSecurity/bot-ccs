import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { addMinutes, insertConversationEvent } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendWhatsappMessage } from "@/lib/twilio";
import { getServerEnv } from "@/lib/env";
import { accessDenied, canViewConversation, isAdmin } from "@/lib/areas";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z.string().trim().min(1).max(1600),
});

function apiStatusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const { body } = schema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("*,contact:contacts(*)")
      .eq("id", id)
      .single();
    if (conversationError) throw new Error(conversationError.message);
    if (!canViewConversation(operator, conversation)) throw accessDenied();
    if (!conversation.contact?.whatsapp_number) throw Object.assign(new Error("Conversation has no WhatsApp contact"), { status: 400 });
    if (conversation.status !== "human_takeover") {
      throw apiStatusError("Tomá control de la conversación antes de enviar.", 409);
    }
    if (!isAdmin(operator) && conversation.assigned_operator_id && conversation.assigned_operator_id !== operator.id) {
      throw apiStatusError("La conversación está tomada por otro operador.", 403);
    }

    const nowDate = new Date();
    const pausedUntilDate = conversation.bot_paused_until ? new Date(conversation.bot_paused_until) : null;
    if (pausedUntilDate && pausedUntilDate.getTime() <= nowDate.getTime()) {
      const nowIso = nowDate.toISOString();
      await supabase
        .from("conversations")
        .update({
          status: "takeover_expired",
          assigned_operator_id: null,
          bot_paused_until: null,
          updated_at: nowIso,
        })
        .eq("id", id);

      await insertConversationEvent(supabase, id, "takeover_expired", "system", null, {
        expired_at: nowIso,
        previous_bot_paused_until: conversation.bot_paused_until,
      });

      throw apiStatusError("El control humano venció. Volvé a tomar control antes de enviar.", 409);
    }

    const twilioMessage = await sendWhatsappMessage(conversation.contact.whatsapp_number, body);
    const now = nowDate.toISOString();
    const pausedUntil = addMinutes(getServerEnv().humanTakeoverTimeoutMinutes);

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        contact_id: conversation.contact_id,
        direction: "outbound",
        sender_type: "operator",
        operator_id: operator.id,
        body,
        twilio_message_sid: twilioMessage.sid,
        twilio_status: twilioMessage.status || "queued",
        expires_at: new Date(Date.now() + getServerEnv().retentionMessagesDays * 86400000).toISOString(),
      })
      .select("*")
      .single();
    if (messageError) throw new Error(messageError.message);

    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        status: "human_takeover",
        assigned_operator_id: operator.id,
        bot_paused_until: pausedUntil,
        last_outbound_at: now,
        last_activity_at: now,
        unread_count: 0,
        unanswered_release_at: null,
        updated_at: now,
      })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await insertConversationEvent(supabase, id, "operator_message_sent", "operator", operator.id, {
      message_id: message.id,
      twilio_message_sid: twilioMessage.sid,
      bot_paused_until: pausedUntil,
    });

    return Response.json({ message });
  } catch (error) {
    return apiError(error);
  }
}

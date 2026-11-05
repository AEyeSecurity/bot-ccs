import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { addMinutes, insertConversationEvent } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendWhatsappMessage } from "@/lib/twilio";
import { getServerEnv } from "@/lib/env";
import { accessDenied, canViewConversation } from "@/lib/areas";

import { withConversationLock } from "@/lib/conversation-lock";

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

    return await withConversationLock(supabase, id, async () => {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("*,contact:contacts(*)")
        .eq("id", id)
        .single();
      if (conversationError) throw new Error(conversationError.message);
      if (!canViewConversation(operator, conversation)) throw accessDenied();
      if (!conversation.contact?.whatsapp_number) throw Object.assign(new Error("Conversation has no WhatsApp contact"), { status: 400 });
      if (conversation.status === "closed") throw apiStatusError("La conversación está archivada. Esperá un nuevo mensaje del paciente.", 409);
      const now = new Date().toISOString();
      const pausedUntil = addMinutes(getServerEnv().humanTakeoverTimeoutMinutes);
      const previous = Object.fromEntries([
        "status", "assigned_operator_id", "bot_paused_until", "unanswered_release_at", "resolution_status", "resolved_at", "resolved_by", "updated_at",
      ].map((key) => [key, conversation[key] ?? null]));
      const { error: pauseError } = await supabase.from("conversations").update({
        status: "human_takeover", assigned_operator_id: operator.id, bot_paused_until: pausedUntil,
        unanswered_release_at: null, updated_at: now,
        ...(conversation.resolution_status === "resuelta" ? { resolution_status: "abierta", resolved_at: null, resolved_by: null } : {}),
      }).eq("id", id);
      if (pauseError) throw new Error(pauseError.message);

      let twilioMessage;
      try {
        twilioMessage = await sendWhatsappMessage(conversation.contact.whatsapp_number, body);
      } catch (sendError) {
        const { error: restoreError } = await supabase.from("conversations").update(previous).eq("id", id);
        if (restoreError) throw new Error("Falló el envío y no se pudo restaurar el estado de la conversación");
        throw sendError;
      }

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

      if (conversation.status !== "human_takeover" || conversation.assigned_operator_id !== operator.id ||
          (conversation.bot_paused_until && new Date(conversation.bot_paused_until).getTime() <= Date.now())) {
        await insertConversationEvent(supabase, id, "human_takeover_started", "operator", operator.id, {
          automatic: true, previous_operator_id: conversation.assigned_operator_id || null,
        });
      }
      await insertConversationEvent(supabase, id, "operator_message_sent", "operator", operator.id, {
        message_id: message.id,
        twilio_message_sid: twilioMessage.sid,
        bot_paused_until: pausedUntil,
      });

      return Response.json({ message });
    });
  } catch (error) {
    return apiError(error);
  }
}

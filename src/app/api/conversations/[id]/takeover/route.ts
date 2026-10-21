import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { accessDenied, canTakeConversation } from "@/lib/areas";
import { insertConversationEvent } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const now = new Date().toISOString();

    const { data: current, error: currentError } = await supabase
      .from("conversations")
      .select("id,area_ids,assigned_operator_id")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!canTakeConversation(operator, current)) throw accessDenied();

    const previousOperatorId = current.assigned_operator_id && current.assigned_operator_id !== operator.id
      ? current.assigned_operator_id
      : null;

    const { data, error } = await supabase
      .from("conversations")
      .update({
        status: "human_takeover",
        assigned_operator_id: operator.id,
        bot_paused_until: null,
        unread_count: 0,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await insertConversationEvent(supabase, id, "human_takeover_started", "operator", operator.id, {
      timer_starts_on: "operator_message_sent",
      previous_operator_id: previousOperatorId,
    });

    return Response.json({ conversation: data });
  } catch (error) {
    return apiError(error);
  }
}

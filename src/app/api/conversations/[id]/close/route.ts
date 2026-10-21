import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { insertConversationEvent } from "@/lib/api-helpers";
import { accessDenied, canOperateConversation } from "@/lib/areas";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();

    const { data: current, error: currentError } = await supabase
      .from("conversations")
      .select("id,area_ids,assigned_operator_id")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!canOperateConversation(operator, current)) throw accessDenied("Solo el operador que tiene la conversación o un admin puede cerrarla.");

    const { data, error } = await supabase
      .from("conversations")
      .update({
        status: "closed",
        assigned_operator_id: null,
        bot_paused_until: null,
        unanswered_release_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await insertConversationEvent(supabase, id, "conversation_closed", "operator", operator.id);
    return Response.json({ conversation: data });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { insertConversationEvent } from "@/lib/api-helpers";
import { accessDenied, canOperateConversation } from "@/lib/areas";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ mark_resolved: z.boolean().optional().default(false) });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const { mark_resolved } = schema.parse(await request.json().catch(() => ({})));
    const supabase = createAdminSupabaseClient();
    const now = new Date().toISOString();

    const { data: current, error: currentError } = await supabase
      .from("conversations")
      .select("id,area_ids,assigned_operator_id")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!canOperateConversation(operator, current)) throw accessDenied("Solo el operador que tiene la conversación o un admin puede cerrarla.");

    const update: Record<string, unknown> = {
      status: "closed",
      assigned_operator_id: null,
      bot_paused_until: null,
      unanswered_release_at: null,
      updated_at: now,
    };
    if (mark_resolved) {
      update.resolution_status = "resuelta";
      update.resolved_at = now;
      update.resolved_by = operator.id;
    }

    const { data, error } = await supabase
      .from("conversations")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await insertConversationEvent(supabase, id, "conversation_closed", "operator", operator.id, {
      mark_resolved,
      resolution_status: data.resolution_status,
    });
    return Response.json({ conversation: data });
  } catch (error) {
    return apiError(error);
  }
}

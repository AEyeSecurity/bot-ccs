import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { insertConversationEvent } from "@/lib/api-helpers";
import { accessDenied, canOperateConversation } from "@/lib/areas";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { RESOLUTION_STATUSES } from "@/lib/domain";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ resolution_status: z.enum(RESOLUTION_STATUSES) });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const { resolution_status } = schema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const now = new Date().toISOString();

    const { data: current, error: currentError } = await supabase
      .from("conversations")
      .select("id,area_ids,assigned_operator_id")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!canOperateConversation(operator, current)) throw accessDenied("Solo el operador que tiene la conversación o un admin puede cambiar su estado.");

    const { data, error } = await supabase
      .from("conversations")
      .update({
        resolution_status,
        resolved_at: resolution_status === "resuelta" ? now : null,
        resolved_by: resolution_status === "resuelta" ? operator.id : null,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await insertConversationEvent(supabase, id, "resolution_status_changed", "operator", operator.id, {
      resolution_status,
    });
    return Response.json({ conversation: data });
  } catch (error) {
    return apiError(error);
  }
}

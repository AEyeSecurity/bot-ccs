import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
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
    });

    return Response.json({ conversation: data });
  } catch (error) {
    return apiError(error);
  }
}

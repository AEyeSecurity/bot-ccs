import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { releaseConversation } from "@/lib/conversation-release";
import { accessDenied, canOperateConversation } from "@/lib/areas";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await getOperatorFromRequest(request);
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();

    const { data: current, error: currentError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .single();
    if (currentError) throw new Error(currentError.message);
    if (!canOperateConversation(operator, current)) throw accessDenied("Solo el operador que tiene la conversación o un admin puede liberarla.");

    const result = await releaseConversation(supabase, current, operator.id);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

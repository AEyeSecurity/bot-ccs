import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("operators")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", operator.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { expireTakeovers } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await getOperatorFromRequest(request);
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    await expireTakeovers(supabase);

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("*,contact:contacts(*),assigned_operator:operators(id,auth_user_id,name,email,role,is_active)")
      .eq("id", id)
      .single();
    if (conversationError) throw new Error(conversationError.message);

    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id,conversation_id,contact_id,direction,sender_type,operator_id,body,twilio_message_sid,twilio_status,media_received,media_count,media_content_types,intent_detected,confidence,needs_manual_review,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(300);
    if (messagesError) throw new Error(messagesError.message);

    const { data: openCase, error: caseError } = await supabase
      .from("cases")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);

    await supabase.from("conversations").update({ unread_count: 0, updated_at: new Date().toISOString() }).eq("id", id);

    return Response.json({ conversation, messages: messages || [], case: openCase || null });
  } catch (error) {
    return apiError(error);
  }
}

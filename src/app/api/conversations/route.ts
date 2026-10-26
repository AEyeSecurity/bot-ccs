import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest } from "@/lib/auth";
import { expireTakeovers } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { Contact, Conversation, Message, Operator } from "@/lib/domain";
import { RESOLUTION_STATUSES } from "@/lib/domain";
import { isAdmin } from "@/lib/areas";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["bot_active", "waiting_operator", "human_takeover", "takeover_expired", "closed"]);
const allowedResolutions = new Set<string>(RESOLUTION_STATUSES);

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    const supabase = createAdminSupabaseClient();
    await expireTakeovers(supabase);

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const resolution = url.searchParams.get("resolution");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();

    let query = supabase
      .from("conversations")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .limit(80);

    if (status && allowedStatuses.has(status)) {
      query = query.eq("status", status);
    }

    if (resolution && allowedResolutions.has(resolution)) {
      query = query.eq("resolution_status", resolution);
    }

    if (from && !Number.isNaN(Date.parse(from))) {
      query = query.gte("last_activity_at", from);
    }
    if (to && !Number.isNaN(Date.parse(to))) {
      query = query.lte("last_activity_at", to);
    }

    // Operadores de área: solo las conversaciones derivadas a sus áreas. Admin ve todas.
    if (!isAdmin(operator)) {
      query = query.overlaps("area_ids", operator.area_ids || []);
    }

    const { data: conversations, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (conversations || []) as Conversation[];
    const conversationIds = rows.map((row) => row.id);
    const contactIds = [...new Set(rows.map((row) => row.contact_id))];
    const operatorIds = [...new Set(rows.map((row) => row.assigned_operator_id).filter(Boolean))] as string[];

    const [{ data: contacts }, { data: operators }, { data: messages }] = await Promise.all([
      contactIds.length
        ? supabase.from("contacts").select("*").in("id", contactIds)
        : Promise.resolve({ data: [] }),
      operatorIds.length
        ? supabase.from("operators").select("id,auth_user_id,name,email,role,is_active").in("id", operatorIds)
        : Promise.resolve({ data: [] }),
      conversationIds.length
        ? supabase
            .from("messages")
            .select("id,conversation_id,contact_id,direction,sender_type,operator_id,body,twilio_message_sid,twilio_status,media_received,media_count,media_content_types,intent_detected,confidence,needs_manual_review,created_at")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: false })
            .limit(240)
        : Promise.resolve({ data: [] }),
    ]);

    const contactMap = new Map((contacts || []).map((contact) => [contact.id, contact as Contact]));
    const operatorMap = new Map((operators || []).map((operator) => [operator.id, operator as Operator]));
    const latestMessageMap = new Map<string, Message>();
    for (const message of (messages || []) as Message[]) {
      if (!latestMessageMap.has(message.conversation_id)) latestMessageMap.set(message.conversation_id, message);
    }

    const result = rows
      .map((conversation) => ({
        ...conversation,
        contact: contactMap.get(conversation.contact_id) || null,
        assigned_operator: conversation.assigned_operator_id
          ? operatorMap.get(conversation.assigned_operator_id) || null
          : null,
        latest_message: latestMessageMap.get(conversation.id) || null,
      }))
      .filter((conversation) => {
        if (!search) return true;
        const haystack = [
          conversation.contact?.whatsapp_number,
          conversation.contact?.display_name,
          conversation.contact?.patient_full_name,
          conversation.latest_message?.body,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });

    return Response.json({ conversations: result });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";
import { apiError, getOperatorFromRequest, requireAdminPanels } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import {
  buildAnalyticsReport,
  type AnalyticsConversation,
  type AnalyticsEvent,
  type AnalyticsMessage,
  type AnalyticsOperator,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

function dayBounds(dateString: string | null) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;
  return {
    from: new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(),
    to: new Date(year, month - 1, day, 23, 59, 59, 999).toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const operator = await getOperatorFromRequest(request);
    requireAdminPanels(operator);
    const supabase = createAdminSupabaseClient();

    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const operatorId = url.searchParams.get("operator_id");

    const today = new Date();
    const defaultDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const bounds = {
      from: dayBounds(fromParam || defaultDay)?.from || "",
      to: dayBounds(toParam || defaultDay)?.to || "",
    };

    const [{ data: operators }, { data: areas }, { data: conversations }, { data: messages }, { data: events }] = await Promise.all([
      supabase.from("operators").select("id,name,email,role,is_active,last_seen_at").order("name", { ascending: true }),
      supabase.from("areas").select("id,name"),
      supabase
        .from("conversations")
        .select("id,status,resolution_status,area_ids,current_intent,assigned_operator_id,created_at,updated_at,last_activity_at"),
      supabase.from("messages").select("conversation_id,direction,sender_type,operator_id,created_at"),
      supabase.from("conversation_events").select("conversation_id,event_type,actor_id,created_at"),
    ]);

    const areaNames = new Map<string, string>((areas || []).map((area) => [String(area.id), String(area.name)]));

    const report = buildAnalyticsReport({
      conversations: (conversations || []) as AnalyticsConversation[],
      messages: (messages || []) as AnalyticsMessage[],
      events: (events || []) as AnalyticsEvent[],
      operators: (operators || []) as AnalyticsOperator[],
      areaNames,
      from: bounds.from,
      to: bounds.to,
      operatorId: operatorId || null,
    });

    const selector = ((operators || []) as Array<{ id: string; name: string; email: string; role: string; is_active: boolean; last_seen_at: string | null }>)
      .filter((row) => row.role !== "admin")
      .map((row) => ({ id: row.id, name: row.name, email: row.email, last_seen_at: row.last_seen_at }));

    return Response.json({ report, operators: selector });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";
import { apiError } from "@/lib/auth";
import { parseBody } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const terminalStatuses = new Set(["delivered", "read", "undelivered", "failed"]);
const failureStatuses = new Set(["undelivered", "failed"]);

function shouldUpdateMessageStatus(currentStatus: string | null | undefined, nextStatus: string) {
  const current = stringValue(currentStatus).toLowerCase();
  const next = nextStatus.toLowerCase();

  if (!current) return true;
  if (failureStatuses.has(next)) return true;
  if (terminalStatuses.has(current) && !terminalStatuses.has(next)) return false;
  if (failureStatuses.has(current) && next !== current) return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseBody(request);
    const messageSid = stringValue(payload.MessageSid ?? payload.SmsSid ?? payload.messageSid);
    const messageStatus = stringValue(payload.MessageStatus ?? payload.SmsStatus ?? payload.messageStatus);
    const errorCode = stringValue(payload.ErrorCode ?? payload.errorCode) || null;
    const errorMessage = stringValue(payload.ErrorMessage ?? payload.errorMessage) || null;
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase.from("twilio_callbacks").insert({
      message_sid: messageSid || null,
      message_status: messageStatus || null,
      error_code: errorCode,
      error_message: errorMessage,
      raw_payload: payload,
    });
    if (error) throw new Error(error.message);

    if (messageSid && messageStatus) {
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .select("id,twilio_status")
        .eq("twilio_message_sid", messageSid)
        .maybeSingle();
      if (messageError) throw new Error(messageError.message);

      if (message && shouldUpdateMessageStatus(message.twilio_status, messageStatus)) {
        await supabase.from("messages").update({ twilio_status: messageStatus }).eq("id", message.id);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

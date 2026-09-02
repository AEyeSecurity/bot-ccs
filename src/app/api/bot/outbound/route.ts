import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/auth";
import { parseBody, requireBotSecret } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const schema = z.object({
  outboundMessageId: z.string().uuid(),
  twilioMessageSid: z.string().optional().nullable(),
  twilioStatus: z.string().optional().nullable(),
  rawPayload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    requireBotSecret(request);
    const payload = schema.parse(await parseBody(request));
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("messages")
      .update({
        twilio_message_sid: payload.twilioMessageSid || null,
        twilio_status: payload.twilioStatus || "sent",
        raw_payload: payload.rawPayload || null,
      })
      .eq("id", payload.outboundMessageId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return Response.json({ message: data });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/auth";
import { parseBody, requireBotSecret } from "@/lib/api-helpers";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendWhatsappMediaMessage, sendWhatsappMessage } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const mediaSchema = z
  .object({
    kind: z.literal("vcard"),
    urls: z.array(z.string().url()).min(1),
  })
  .optional()
  .nullable();

const schema = z.object({
  outboundMessageId: z.string().uuid(),
  toNumber: z.string().min(1),
  replyText: z.string().min(1),
  media: mediaSchema,
});

function twilioPayload(message: Awaited<ReturnType<typeof sendWhatsappMessage>>) {
  return {
    sid: message.sid,
    status: message.status,
    errorCode: message.errorCode,
    errorMessage: message.errorMessage,
    to: message.to,
    from: message.from,
    body: message.body,
  };
}

export async function POST(request: NextRequest) {
  const supabase = createAdminSupabaseClient();
  let outboundMessageId: string | null = null;

  try {
    requireBotSecret(request);
    const payload = schema.parse(await parseBody(request));
    outboundMessageId = payload.outboundMessageId;

    const message = payload.media?.urls?.length
      ? await sendWhatsappMediaMessage(payload.toNumber, payload.replyText, payload.media.urls)
      : await sendWhatsappMessage(payload.toNumber, payload.replyText);

    const rawPayload = twilioPayload(message);
    const { error } = await supabase
      .from("messages")
      .update({
        twilio_message_sid: message.sid,
        twilio_status: message.status || "queued",
        raw_payload: {
          ...rawPayload,
          media: payload.media || null,
        },
      })
      .eq("id", payload.outboundMessageId);

    if (error) throw new Error(error.message);

    return Response.json({
      ...rawPayload,
      messageSid: message.sid,
      contentType: payload.media?.kind ? `twilio/${payload.media.kind}` : "twilio/text",
      media: payload.media || null,
    });
  } catch (error) {
    if (outboundMessageId) {
      await supabase
        .from("messages")
        .update({
          twilio_status: "failed",
          raw_payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .eq("id", outboundMessageId);
    }

    return apiError(error);
  }
}

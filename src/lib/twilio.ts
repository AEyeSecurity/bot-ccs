import Twilio from "twilio";
import { getServerEnv } from "./env";

export function createTwilioClient() {
  const env = getServerEnv();
  return Twilio(env.twilioAccountSid, env.twilioAuthToken);
}

export function toWhatsappAddress(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed}`;
}

function applySender(payload: Record<string, unknown>) {
  const env = getServerEnv();

  if (env.twilioStatusCallbackUrl) {
    payload.statusCallback = env.twilioStatusCallbackUrl;
  }

  if (env.twilioMessagingServiceSid) {
    payload.messagingServiceSid = env.twilioMessagingServiceSid;
  } else {
    payload.from = toWhatsappAddress(env.twilioWhatsappFrom);
  }
}

export async function sendWhatsappMessage(to: string, body: string) {
  const client = createTwilioClient();
  const payload: Record<string, unknown> = {
    to: toWhatsappAddress(to),
    body,
  };

  applySender(payload);

  return client.messages.create(payload as unknown as Parameters<typeof client.messages.create>[0]);
}

export async function sendWhatsappMediaMessage(to: string, body: string, mediaUrls: string[]) {
  const client = createTwilioClient();
  const payload: Record<string, unknown> = {
    to: toWhatsappAddress(to),
    body,
    mediaUrl: mediaUrls,
  };

  applySender(payload);

  return client.messages.create(payload as unknown as Parameters<typeof client.messages.create>[0]);
}

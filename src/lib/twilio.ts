import Twilio from "twilio";
import { getServerEnv } from "./env";
import { randomBytes } from "node:crypto";

type SentMessage = {
  sid: string; status: string; errorCode: number | null; errorMessage: string | null;
  to: string; from: string; body: string;
};

function simulatedMessage(to: string, body: string): SentMessage | null {
  if (process.env.TWILIO_TRANSPORT !== "mock") return null;
  if (process.env.BOT_CCS_TEST_INSTANCE !== "1") throw new Error("Mock transport requires an isolated test instance");
  return {
    sid: `SM${randomBytes(16).toString("hex")}`,
    status: "queued", errorCode: null, errorMessage: null,
    to: toWhatsappAddress(to), from: getServerEnv().twilioWhatsappFrom, body,
  };
}

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

export async function sendWhatsappMessage(to: string, body: string): Promise<SentMessage> {
  const simulated = simulatedMessage(to, body);
  if (simulated) return simulated;
  const client = createTwilioClient();
  const payload: Record<string, unknown> = {
    to: toWhatsappAddress(to),
    body,
  };

  applySender(payload);

  return client.messages.create(payload as unknown as Parameters<typeof client.messages.create>[0]);
}

export async function sendWhatsappMediaMessage(to: string, body: string, mediaUrls: string[]): Promise<SentMessage> {
  const simulated = simulatedMessage(to, body);
  if (simulated) return simulated;
  const client = createTwilioClient();
  const payload: Record<string, unknown> = {
    to: toWhatsappAddress(to),
    body,
    mediaUrl: mediaUrls,
  };

  applySender(payload);

  return client.messages.create(payload as unknown as Parameters<typeof client.messages.create>[0]);
}

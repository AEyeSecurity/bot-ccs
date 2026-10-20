import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/auth";
import { parseBody, requireBotSecret } from "@/lib/api-helpers";
import { processInbound, type NormalizedInbound } from "@/lib/bot-engine";

export const dynamic = "force-dynamic";

const schema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  body: z.string().optional().default(""),
  messageSid: z.string().nullable().optional(),
  profileName: z.string().nullable().optional(),
  numMedia: z.coerce.number().int().min(0).optional().default(0),
  mediaContentTypes: z.array(z.string()).optional().default([]),
  mediaUrls: z.array(z.string()).optional().default([]),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function sanitizeTwilioPayload(input: unknown): Record<string, unknown> | unknown[] | string | number | boolean | null {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeTwilioPayload(item));
  }

  if (!input || typeof input !== "object") {
    return input as string | number | boolean | null;
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([key]) => !/^MediaUrl\d*$/i.test(key) && key !== "mediaUrls")
      .map(([key, value]) => [key, sanitizeTwilioPayload(value)]),
  );
}

function normalizePayload(input: Record<string, unknown>) {
  const numMedia = Number(input.numMedia ?? input.NumMedia ?? 0) || 0;
  const mediaContentTypes = Array.isArray(input.mediaContentTypes)
    ? input.mediaContentTypes.map(String)
    : Array.from({ length: numMedia })
        .map((_, index) => input[`MediaContentType${index}`])
        .filter(Boolean)
        .map(String);
  const mediaUrls = Array.isArray(input.mediaUrls)
    ? input.mediaUrls.map(String).filter(Boolean)
    : Array.from({ length: numMedia })
        .map((_, index) => input[`MediaUrl${index}`])
        .filter(Boolean)
        .map(String);

  return {
    from: stringValue(input.from ?? input.From),
    to: stringValue(input.to ?? input.To),
    body: stringValue(input.body ?? input.Body),
    messageSid: stringValue(input.messageSid ?? input.MessageSid) || null,
    profileName: stringValue(input.profileName ?? input.ProfileName) || null,
    numMedia,
    mediaContentTypes,
    mediaUrls,
    rawPayload: sanitizeTwilioPayload(input) as Record<string, unknown>,
  };
}

export async function POST(request: NextRequest) {
  try {
    requireBotSecret(request);
    const input = await parseBody(request);
    const parsed = schema.parse(normalizePayload(input));
    const payload: NormalizedInbound = {
      ...parsed,
      messageSid: parsed.messageSid ?? null,
      profileName: parsed.profileName ?? null,
    };
    const result = await processInbound(payload);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest } from "next/server";

const processHolder = vi.hoisted(() => ({
  processInbound: vi.fn(),
}));

vi.mock("@/lib/bot-engine", () => ({
  processInbound: processHolder.processInbound,
}));

describe("bot inbound route", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service";
    process.env.TWILIO_ACCOUNT_SID ||= "AC123";
    process.env.TWILIO_AUTH_TOKEN ||= "token";
    process.env.TWILIO_WHATSAPP_FROM ||= "whatsapp:+5493516424148";
    process.env.BOT_CCS_WEBHOOK_SECRET = "test-secret";
    processHolder.processInbound.mockReset();
    processHolder.processInbound.mockResolvedValue({ shouldReply: false });
  });

  test("passes transient mediaUrls but sanitizes rawPayload", async () => {
    const { POST } = await import("@/app/api/bot/inbound/route");
    const request = new NextRequest("http://localhost/api/bot/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-ccs-secret": "test-secret",
      },
      body: JSON.stringify({
        From: "whatsapp:+5491110000001",
        To: "whatsapp:+5493516424148",
        Body: "Adjunto DNI",
        MessageSid: "SM-ROUTE-1",
        NumMedia: "1",
        MediaContentType0: "image/jpeg",
        MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM/Media/ME",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(processHolder.processInbound).toHaveBeenCalledTimes(1);
    const payload = processHolder.processInbound.mock.calls[0][0];
    expect(payload.mediaUrls).toEqual([
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM/Media/ME",
    ]);
    expect(payload.rawPayload.MediaUrl0).toBeUndefined();
    expect(payload.rawPayload.mediaUrls).toBeUndefined();
  });

  test("rejects missing authentication before processing", async () => {
    const { POST } = await import("@/app/api/bot/inbound/route");
    const response = await POST(new NextRequest("http://localhost/api/bot/inbound", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(processHolder.processInbound).not.toHaveBeenCalled();
  });

  test("does not silently allow requests when the shared secret is unconfigured", async () => {
    delete process.env.BOT_CCS_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/bot/inbound/route");
    const response = await POST(new NextRequest("http://localhost/api/bot/inbound", { method: "POST", body: "{}" }));
    expect(response.status).toBe(500);
    expect(processHolder.processInbound).not.toHaveBeenCalled();
  });
});

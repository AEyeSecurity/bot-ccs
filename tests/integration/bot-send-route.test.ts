import { NextRequest } from "next/server";

const supabaseHolder = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; id: string }>,
}));

const twilioHolder = vi.hoisted(() => ({
  sendText: vi.fn(),
  sendMedia: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_field: string, id: string) => {
              supabaseHolder.updates.push({ table, patch, id });
              return { error: null };
            },
          };
        },
      };
    },
  }),
}));

vi.mock("@/lib/twilio", () => ({
  sendWhatsappMessage: (...args: unknown[]) => twilioHolder.sendText(...args),
  sendWhatsappMediaMessage: (...args: unknown[]) => twilioHolder.sendMedia(...args),
}));

describe("/api/bot/send", () => {
  let POST: typeof import("@/app/api/bot/send/route").POST;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/bot/send/route"));
  });

  beforeEach(() => {
    supabaseHolder.updates.length = 0;
    twilioHolder.sendText.mockReset();
    twilioHolder.sendMedia.mockReset();
    twilioHolder.sendText.mockResolvedValue({
      sid: "SM-TEXT-1",
      status: "queued",
      errorCode: null,
      errorMessage: null,
      to: "whatsapp:+5491110000010",
      from: "whatsapp:+5493516424148",
      body: "Mensaje",
    });
    twilioHolder.sendMedia.mockResolvedValue({
      sid: "SM-MEDIA-1",
      status: "queued",
      errorCode: null,
      errorMessage: null,
      to: "whatsapp:+5491110000011",
      from: "whatsapp:+5493516424148",
      body: "Tarjeta",
    });
  });

  test("sends plain text messages through Twilio", async () => {
    const request = new NextRequest("http://localhost/api/bot/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-ccs-secret": "bot-ccs-secret",
      },
      body: JSON.stringify({
        outboundMessageId: "f9c4a4be-4f07-48eb-a52b-b55de636c000",
        toNumber: "+5491110000010",
        replyText: "Mensaje",
        media: null,
      }),
    });

    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(twilioHolder.sendText).toHaveBeenCalledWith("+5491110000010", "Mensaje");
    expect(supabaseHolder.updates[0]?.patch.twilio_message_sid).toBe("SM-TEXT-1");
    expect(json.contentType).toBe("twilio/text");
    expect(json.media).toBeNull();
  });

  test("sends vCard media messages through Twilio", async () => {
    const request = new NextRequest("http://localhost/api/bot/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-ccs-secret": "bot-ccs-secret",
      },
      body: JSON.stringify({
        outboundMessageId: "f9c4a4be-4f07-48eb-a52b-b55de636c001",
        toNumber: "+5491110000011",
        replyText: "Tarjeta",
        media: {
          kind: "vcard",
          urls: ["https://vcards.aeye.com.ar/ccs-recetas-medicas.vcf"],
        },
      }),
    });

    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(twilioHolder.sendMedia).toHaveBeenCalledWith("+5491110000011", "Tarjeta", [
      "https://vcards.aeye.com.ar/ccs-recetas-medicas.vcf",
    ]);
    expect(supabaseHolder.updates[0]?.patch.raw_payload.media).toEqual({
      kind: "vcard",
      urls: ["https://vcards.aeye.com.ar/ccs-recetas-medicas.vcf"],
    });
    expect(json.contentType).toBe("twilio/vcard");
    expect(json.media).toEqual({
      kind: "vcard",
      urls: ["https://vcards.aeye.com.ar/ccs-recetas-medicas.vcf"],
    });
  });
});

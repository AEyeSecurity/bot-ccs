import { sendWhatsappMessage, sendWhatsappMediaMessage } from "@/lib/twilio";

describe("isolated Twilio transport", () => {
  afterEach(() => {
    delete process.env.TWILIO_TRANSPORT;
    delete process.env.BOT_CCS_TEST_INSTANCE;
  });
  test("requires explicit test instance before simulating delivery", async () => {
    process.env.TWILIO_TRANSPORT = "mock";
    delete process.env.BOT_CCS_TEST_INSTANCE;
    await expect(sendWhatsappMessage("+5491112345678", "hola")).rejects.toThrow("isolated test instance");
  });
  test("simulates text and media without contacting Twilio", async () => {
    process.env.TWILIO_TRANSPORT = "mock";
    process.env.BOT_CCS_TEST_INSTANCE = "1";
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    try {
      const text = await sendWhatsappMessage("+5491112345678", "hola");
      const media = await sendWhatsappMediaMessage("+5491112345678", "contacto", ["https://example.com/card.vcf"]);
      expect(text.status).toBe("queued");
      expect(media.sid).not.toBe(text.sid);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});

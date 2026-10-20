import { validateDocumentMedia } from "@/lib/document-validation";
import type { NormalizedInbound } from "@/lib/bot-types";

function payload(overrides: Partial<NormalizedInbound> = {}): NormalizedInbound {
  return {
    from: "whatsapp:+5491110000001",
    to: "whatsapp:+5493516424148",
    body: "Juan Perez",
    messageSid: "SM-test",
    profileName: null,
    numMedia: 1,
    mediaContentTypes: ["image/jpeg"],
    mediaUrls: ["https://example.test/media/front.jpg"],
    rawPayload: {},
    ...overrides,
  };
}

describe("document validation", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.SESSION_SECRET = "document-validation-test-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("treats a single recognized DNI side as missing side instead of not_document", async () => {
    let callCount = 0;
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: "dni",
                      valid_document: false,
                      has_front: true,
                      has_back: false,
                      name: "PEREZ JUAN",
                      document_number: "12345678",
                      confidence: 0.92,
                      reason: "solo frente visible",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const result = await validateDocumentMedia(payload(), {
      field: "dniMedia",
      expectedName: "Juan Perez",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      field: "dniMedia",
      valid: false,
      reason: "missing_dni_side",
      documentType: "dni",
      dniHasFront: true,
      dniHasBack: false,
      dniNameMatches: true,
      dniDocumentFingerprint: expect.any(String),
      dniNameFingerprint: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain("12345678");
  });

  test("asks Gemini to extract the document number from each DNI side", async () => {
    let callCount = 0;
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }

      const body = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      expect(body.contents[0].parts[0].text).toContain("número de documento desde cada cara");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: "dni",
                      valid_document: true,
                      has_front: true,
                      has_back: false,
                      name: "PEREZ JUAN",
                      document_number: "12345678",
                      confidence: 0.9,
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await validateDocumentMedia(payload(), { field: "dniMedia", expectedName: "Juan Perez" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("accepts a recognized DNI back even when its confidence is below the generic document threshold", async () => {
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      document_type: "dni",
                      valid_document: true,
                      has_front: false,
                      has_back: true,
                      name: "PEREZ JUAN",
                      document_number: "12345678",
                      confidence: 0.48,
                      reason: "dorso visible",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const result = await validateDocumentMedia(payload(), {
      field: "dniMedia",
      expectedName: "Juan Perez",
    });

    expect(result).toMatchObject({
      valid: false,
      reason: "missing_dni_side",
      documentType: "dni",
      dniHasFront: false,
      dniHasBack: true,
      dniDocumentFingerprint: expect.any(String),
      dniNameFingerprint: expect.any(String),
    });
  });
});

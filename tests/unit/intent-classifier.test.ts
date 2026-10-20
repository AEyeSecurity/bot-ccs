import { classifyIntentWithGemini } from "@/lib/intent-classifier";

function geminiResponse(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("intent classifier", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  test("returns null when no API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(classifyIntentWithGemini("hola")).resolves.toBeNull();
  });

  test("parses a valid classification", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      geminiResponse('{"intent_key":"OTRAS_CONSULTAS","confidence":0.8,"needs_operator":true,"reason":"prueba"}'),
    );

    await expect(classifyIntentWithGemini("consulta sin regla")).resolves.toEqual({
      intent_key: "OTRAS_CONSULTAS",
      confidence: 0.8,
      needs_operator: true,
      reason: "prueba",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns null when Gemini returns invalid JSON", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(geminiResponse("no soy json"));
    await expect(classifyIntentWithGemini("consulta sin regla")).resolves.toBeNull();
  });

  test("returns null when Gemini responds with an error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("error", { status: 500 }));
    await expect(classifyIntentWithGemini("consulta sin regla")).resolves.toBeNull();
  });
});

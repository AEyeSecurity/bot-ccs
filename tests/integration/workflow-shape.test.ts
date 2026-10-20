import fs from "fs";
import path from "path";

describe("n8n workflow shape", () => {
  test("keeps the single outbound path through /api/bot/send", () => {
    const workflowPath = path.join(process.cwd(), "n8n", "BOT_CCS.workflow.json");
    const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

    const sendNode = workflow.nodes.find((node: { name: string }) => node.name === "Enviar WhatsApp CCS");
    expect(sendNode?.type).toBe("n8n-nodes-base.httpRequest");
    expect(sendNode?.parameters?.url).toBe("http://127.0.0.1:3010/api/bot/send");
    expect(sendNode?.parameters?.authentication).toBe("genericCredentialType");
    expect(sendNode?.parameters?.genericAuthType).toBe("httpHeaderAuth");
    expect(JSON.stringify(workflow)).not.toContain("n8n-nodes-base.twilio");
  });

  test("does not classify intent in n8n and forwards inbound directly to the API", () => {
    const workflowPath = path.join(process.cwd(), "n8n", "BOT_CCS.workflow.json");
    const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

    expect(workflow.nodes.find((node: { name: string }) => node.name === "Clasificar intención Gemini")).toBeUndefined();
    expect(workflow.nodes.find((node: { name: string }) => node.name === "Preparar payload API")).toBeUndefined();
    expect(JSON.stringify(workflow)).not.toContain("geminiClassification");
    expect(JSON.stringify(workflow)).not.toContain("googleGemini");

    const inboundConnections = workflow.connections["Preparar inbound Twilio"]?.main?.[0];
    expect(inboundConnections).toEqual([{ node: "Procesar inbound en CCS API", type: "main", index: 0 }]);
  });
});

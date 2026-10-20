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
});

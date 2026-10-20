import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

if (process.env.BOT_CCS_TEST_INSTANCE !== "1" || process.env.TWILIO_TRANSPORT !== "mock") {
  throw new Error("Validation requires an isolated mock instance");
}
const apiKey = process.env.N8N_API_KEY;
if (!apiKey) throw new Error("Set N8N_API_KEY in the private tools environment");
const base = process.env.N8N_ADMIN_BASE_URL || "http://host.docker.internal:5678";
const target = process.env.BOT_CCS_VALIDATION_API_URL || "http://127.0.0.1:13010";
if (target === "http://127.0.0.1:3010") throw new Error("Do not target the production port");
const readiness = await fetch(`${process.env.APP_BASE_URL}/api/health/ready`).then((r) => r.json());
if (!readiness.testInstance) throw new Error("The validation application is not using mock transport");

async function api(method, pathname, payload) {
  const response = await fetch(`${base}/api/v1/${pathname}`, {
    method,
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`n8n ${method} ${pathname}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const workflow = JSON.parse(fs.readFileSync("n8n/BOT_CCS.workflow.json", "utf8"));
const path = `bot-ccs-docker-test-${randomUUID()}`;
for (const node of workflow.nodes) {
  if (node.type === "n8n-nodes-base.webhook") {
    node.parameters.path = path;
    node.webhookId = randomUUID();
  }
  if (node.parameters.url?.startsWith("http://127.0.0.1:3010/")) {
    node.parameters.url = node.parameters.url.replace("http://127.0.0.1:3010", target);
  }
}
const created = await api("POST", "workflows", {
  name: `BOT CCS validation ${path}`,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "none", saveManualExecutions: false },
});
try {
  await api("POST", `workflows/${created.id}/activate`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/run-bot-test-matrix.mjs"], {
      stdio: "inherit",
      env: { ...process.env, N8N_WEBHOOK_BOT_CCS_URL: `${base}/webhook/${path}` },
    });
    child.once("error", () => resolve(1));
    child.once("exit", (result) => resolve(result ?? 1));
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
  });
  process.exitCode = code;
} finally {
  await api("POST", `workflows/${created.id}/deactivate`);
  await api("DELETE", `workflows/${created.id}`);
}

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const controller = new AbortController();
let child;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    controller.abort();
    child?.kill("SIGTERM");
  });
}
while (!controller.signal.aborted) {
  const code = await new Promise((resolve) => {
    child = spawn(process.execPath, ["scripts/run-conversation-maintenance.mjs"], { stdio: "inherit" });
    child.once("error", () => resolve(1));
    child.once("exit", (result) => resolve(result ?? 1));
  });
  child = undefined;
  if (code === 0) await writeFile("/tmp/maintenance-ok", new Date().toISOString());
  else console.error(JSON.stringify({ event: "maintenance_failed", code }));
  if (!controller.signal.aborted) {
    await setTimeout(60_000, undefined, { signal: controller.signal }).catch(() => {});
  }
}

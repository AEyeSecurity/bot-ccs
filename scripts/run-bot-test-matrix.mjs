import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const reportDir = path.join(process.cwd(), "test-reports");
fs.mkdirSync(reportDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  const vitestJsonPath = path.join(reportDir, "vitest-latest.json");
  const vitestJsonArg = path.join("test-reports", "vitest-latest.json");

  run("npx", ["vitest", "run", "--reporter=json", "--outputFile", vitestJsonArg]);
  run("node", ["scripts/verify-bot-live-http.mjs"]);
  run("node", ["scripts/verify-bot-n8n-e2e.mjs"]);

  const vitest = readJson(vitestJsonPath);
  const scenarioCoverage = readJson(path.join(reportDir, "bot-scenario-coverage.latest.json"));
  const processInboundReport = readJson(path.join(reportDir, "bot-process-inbound.integration.latest.json"));
  const liveHttpReport = readJson(path.join(reportDir, "bot-live-http.latest.json"));
  const n8nE2eReport = readJson(path.join(reportDir, "bot-n8n-e2e.latest.json"));

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      tests: vitest.numTotalTests,
      passed: vitest.numPassedTests,
      failed: vitest.numFailedTests,
      skipped: vitest.numPendingTests,
    },
    scenarios: {
      executed: scenarioCoverage.totalScenarios,
      branchesCovered: scenarioCoverage.coveredBranchCount,
      transitionsCovered: scenarioCoverage.coveredTransitionCount,
      missingVisibleBranches: scenarioCoverage.missingVisibleBranches,
    },
    liveHttp: {
      passed: liveHttpReport.passed,
      failed: liveHttpReport.failed,
    },
    n8nE2e: {
      passed: n8nE2eReport.passed,
      failed: n8nE2eReport.failed,
    },
    processInboundIntegration: processInboundReport,
    zeroIncident:
      vitest.numFailedTests === 0 &&
      vitest.numPendingTests === 0 &&
      scenarioCoverage.missingVisibleBranches.length === 0 &&
      liveHttpReport.failed === 0 &&
      n8nE2eReport.failed === 0,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const summaryPath = path.join(reportDir, `bot-test-matrix-summary-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportDir, "bot-test-matrix-summary.latest.json"), JSON.stringify(summary, null, 2));

  if (!summary.zeroIncident) {
    throw new Error("Bot test matrix finished with incidents");
  }
}

await main();

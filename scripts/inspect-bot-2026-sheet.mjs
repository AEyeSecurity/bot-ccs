import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = process.argv[2];

if (!workbookPath) {
  throw new Error("Usage: node inspect-bot-2026-sheet.mjs <xlsx-path>");
}

const outputDir = path.join(process.cwd(), "test-reports");
await fs.mkdir(outputDir, { recursive: true });

const blob = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(blob);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 25,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});

const report = {
  generatedAt: new Date().toISOString(),
  workbookPath,
  summary: summary.ndjson,
  sheets: sheets.ndjson,
};

await fs.writeFile(
  path.join(outputDir, "bot-2026-workbook-inspect.latest.json"),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify(report, null, 2));

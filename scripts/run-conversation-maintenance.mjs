import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const logPath = path.join(process.cwd(), "logs", "bot-ccs-maintenance.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const writeLog = (message) => fs.appendFileSync(logPath, `${new Date().toISOString()} - ${message}\n`);

try {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("close_unanswered_released_conversations");
  if (error) throw new Error(error.message);
  writeLog(`completed; closed=${Number(data || 0)}`);
} catch (error) {
  writeLog(`failed; error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

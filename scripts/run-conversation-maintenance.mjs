import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const writeLog = (message) => console.log(`${new Date().toISOString()} - ${message}`);

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

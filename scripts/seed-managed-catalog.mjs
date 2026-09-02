import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const payload = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "bot-catalog-initial.json"), "utf8"));

const { data: current, error: currentError } = await supabase
  .from("bot_catalog_versions")
  .select("id,version,status")
  .eq("status", "published")
  .maybeSingle();
if (currentError) throw new Error(currentError.message);

if (current) {
  console.log(`Published catalog already exists: version ${current.version}`);
  process.exit(0);
}

const { data, error } = await supabase
  .from("bot_catalog_versions")
  .insert({ version: 1, status: "published", payload, revision: 1, published_at: new Date().toISOString() })
  .select("id,version,status")
  .single();
if (error) throw new Error(error.message);
console.log(`Seeded published catalog version ${data.version} (${data.id})`);

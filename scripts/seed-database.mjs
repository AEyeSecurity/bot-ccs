import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

function databaseUrl() {
  const value = process.env.SUPABASE_DB_URL?.trim();
  if (!value) throw new Error("Missing SUPABASE_DB_URL in .env.local");
  return process.env.SUPABASE_DB_PASSWORD
    ? value.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))
    : value;
}

function projectRef() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return url.hostname.split(".")[0];
}

async function runWithManagementApi(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Missing SUPABASE_ACCESS_TOKEN for Management API fallback");

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Management API query failed (${response.status}): ${text}`);
  }
}

const seedPath = path.join(process.cwd(), "supabase", "seed.sql");
const sql = await fs.readFile(seedPath, "utf8");
const client = new Client({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
});

let connected = false;
try {
  await client.connect();
  connected = true;
  console.log("Applying supabase/seed.sql");
  await client.query(sql);
  console.log("Seed applied");
} catch (error) {
  if (connected) throw error;
  console.warn("Direct Postgres connection failed; trying Supabase Management API fallback.");
  console.log("Applying supabase/seed.sql through Management API");
  await runWithManagementApi(sql);
  console.log("Seed applied through Management API");
} finally {
  if (connected) await client.end();
}

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

async function applyWithManagementApi(file, sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Missing SUPABASE_ACCESS_TOKEN for Management API fallback");

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/migrations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": `bot-ccs-${file.replace(/[^a-zA-Z0-9]/g, "-")}`,
    },
    body: JSON.stringify({
      name: file.replace(/\.sql$/i, ""),
      query: sql,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Management API migration failed (${response.status}): ${text}`);
  }
}

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

if (!files.length) {
  throw new Error(`No SQL migrations found in ${migrationsDir}`);
}

const client = new Client({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
});

let connected = false;
try {
  await client.connect();
  connected = true;
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await client.query(sql);
  }
  console.log("Migrations applied");
} catch (error) {
  if (connected) throw error;
  console.warn("Direct Postgres connection failed; trying Supabase Management API fallback.");
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file} through Management API`);
    await applyWithManagementApi(file, sql);
  }
  console.log("Migrations applied through Management API");
} finally {
  if (connected) await client.end();
}

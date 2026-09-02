import crypto from "node:crypto";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });

function databaseUrl() {
  const value = process.env.SUPABASE_DB_URL?.trim();
  if (!value) throw new Error("Missing SUPABASE_DB_URL");
  return process.env.SUPABASE_DB_PASSWORD
    ? value.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))
    : value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  const { rows: catalogs } = await client.query(
    "select id, version, revision, payload from public.bot_catalog_versions where status = 'published'",
  );
  assert(catalogs.length === 1, `Expected one published catalog, got ${catalogs.length}`);
  const payload = catalogs[0].payload;
  assert(payload.medicalServices.length === 18, "Expected 18 specialties");
  assert(payload.imagingStudies.length === 19, "Expected 19 imaging studies");
  assert(payload.professionals.length === 45, "Expected 45 professionals");
  assert(payload.insurancePlans.length === 16, "Expected 16 insurance plans");

  const suffix = crypto.randomUUID();
  const { rows: contacts } = await client.query(
    "insert into public.contacts (whatsapp_number, whatsapp_number_hash) values ($1, $2) returning id",
    [`+549000${Date.now()}`, suffix],
  );
  const contactId = contacts[0].id;
  const { rows: conversations } = await client.query(`
    insert into public.conversations (contact_id, status, last_inbound_at, last_activity_at, unanswered_release_at)
    values
      ($1, 'bot_active', now() - interval '23 hours 59 minutes 59 seconds', now(), now()),
      ($1, 'bot_active', now() - interval '24 hours', now(), now()),
      ($1, 'bot_active', now() - interval '25 hours', now(), now()),
      ($1, 'bot_active', now() - interval '25 hours', now(), null)
    returning id
  `, [contactId]);
  const [beforeBoundary, atBoundary, afterBoundary, unmarked] = conversations.map((row) => row.id);
  await client.query(`
    insert into public.cases (conversation_id, contact_id, intent_key, status, current_step)
    values ($1, $3, 'TEST_AT', 'waiting_operator', 'patient_identity'),
           ($2, $3, 'TEST_AFTER', 'in_progress', 'insurance')
  `, [atBoundary, afterBoundary, contactId]);

  const firstRun = await client.query("select public.close_unanswered_released_conversations() as count");
  const secondRun = await client.query("select public.close_unanswered_released_conversations() as count");
  assert(Number(firstRun.rows[0].count) === 2, `Expected two closures, got ${firstRun.rows[0].count}`);
  assert(Number(secondRun.rows[0].count) === 0, "Maintenance must be idempotent");

  const { rows: statuses } = await client.query(
    "select id, status from public.conversations where id = any($1::uuid[])",
    [[beforeBoundary, atBoundary, afterBoundary, unmarked]],
  );
  const status = Object.fromEntries(statuses.map((row) => [row.id, row.status]));
  assert(status[beforeBoundary] === "bot_active", "23:59:59 conversation closed too early");
  assert(status[atBoundary] === "closed", "24-hour conversation did not close");
  assert(status[afterBoundary] === "closed", "Overdue conversation did not close");
  assert(status[unmarked] === "bot_active", "Unmarked conversation must remain active");

  const cases = await client.query("select status from public.cases where conversation_id = any($1::uuid[])", [[atBoundary, afterBoundary]]);
  assert(cases.rows.every((row) => row.status === "cancelled"), "Open cases were not cancelled");
  const events = await client.query(
    "select count(*)::int as count from public.conversation_events where conversation_id = any($1::uuid[]) and event_type = 'conversation_closed_after_unanswered_release'",
    [[atBoundary, afterBoundary]],
  );
  assert(events.rows[0].count === 2, "Expected one closure event per conversation");
  const messages = await client.query("select count(*)::int as count from public.messages where conversation_id = any($1::uuid[])", [[atBoundary, afterBoundary]]);
  assert(messages.rows[0].count === 0, "Maintenance must not send patient messages");

  console.log(JSON.stringify({
    catalog: { version: catalogs[0].version, revision: catalogs[0].revision, specialties: 18, studies: 19, professionals: 45, insurancePlans: 16 },
    maintenance: { beforeBoundary: "open", atBoundary: "closed", afterBoundary: "closed", repeatedClosures: 0, events: 2, messages: 0 },
  }, null, 2));
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}

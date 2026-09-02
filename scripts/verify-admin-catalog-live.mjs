import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const baseUrl = "http://127.0.0.1:3010";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: operator, error: operatorError } = await admin
  .from("operators")
  .select("id,email,role,is_active")
  .eq("role", "admin")
  .eq("is_active", true)
  .limit(1)
  .single();
if (operatorError) throw new Error(operatorError.message);

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: operator.email,
});
if (linkError) throw new Error(linkError.message);
const tokenHash = link.properties?.hashed_token;
if (!tokenHash) throw new Error("Supabase did not return a hashed login token");

const browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: sessionData, error: sessionError } = await browserClient.auth.verifyOtp({
  type: "magiclink",
  token_hash: tokenHash,
});
if (sessionError || !sessionData.session?.access_token) throw new Error(sessionError?.message || "Could not create admin session");
const headers = {
  authorization: `Bearer ${sessionData.session.access_token}`,
  "content-type": "application/json",
};

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

const initial = await api("/api/admin/catalog");
if (!initial.published) throw new Error("Missing published catalog");
if (initial.draft) throw new Error("A pre-existing draft exists; refusing to overwrite it");
const sourceId = initial.published.id;
const sourcePayload = initial.published.payload;
const sourceVersion = initial.published.version;

const saved = await api("/api/admin/catalog/draft", {
  method: "PUT",
  body: JSON.stringify({ payload: sourcePayload, revision: null }),
});
if (saved.validation.errors.length || saved.validation.pending.length) throw new Error("Identical draft did not validate cleanly");

await api("/api/admin/catalog/publish", {
  method: "POST",
  body: JSON.stringify({ draftId: saved.draft.id, revision: saved.draft.revision }),
});
const afterPublish = await api("/api/admin/catalog");
if (afterPublish.published.version !== sourceVersion + 1) throw new Error("Publish did not advance the version");

await api("/api/admin/catalog/restore", {
  method: "POST",
  body: JSON.stringify({ versionId: sourceId }),
});
const restoredDraft = await api("/api/admin/catalog");
if (!restoredDraft.draft) throw new Error("Restore did not create a new draft");
await api("/api/admin/catalog/publish", {
  method: "POST",
  body: JSON.stringify({ draftId: restoredDraft.draft.id, revision: restoredDraft.draft.revision }),
});
const final = await api("/api/admin/catalog");
if (final.published.version !== sourceVersion + 2) throw new Error("Restored publication did not advance the version");
if (JSON.stringify(final.published.payload) !== JSON.stringify(sourcePayload)) throw new Error("Restored payload differs from the source");
if (final.draft) throw new Error("Draft remained after publishing");

console.log(JSON.stringify({
  adminAccess: true,
  sourceVersion,
  publishedVersion: afterPublish.published.version,
  restoredVersion: final.published.version,
  payloadUnchanged: true,
  draftRemaining: false,
}, null, 2));

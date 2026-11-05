// Limpieza explícita aprobada: solo cuentas de operators; nunca contactos ni mensajes.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const keep = new Set(["admin@bot-ccs.local", "admindev@bot-ccs.local"]);
const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const rows = check(await db.from("operators").select("id,email,auth_user_id,role,is_active"));
for (const email of keep) {
  const row = rows.find((item) => item.email?.toLowerCase() === email);
  if (!row || row.role !== "admin" || !row.is_active || !row.auth_user_id) throw new Error("Falta una cuenta administrativa protegida activa");
}
const targets = rows.filter((row) => !keep.has(row.email?.toLowerCase()));
const ids = targets.map((row) => row.id);
const protectedAuthIds = rows.filter((row) => keep.has(row.email?.toLowerCase())).map((row) => row.auth_user_id);
if (targets.some((row) => protectedAuthIds.includes(row.auth_user_id))) throw new Error("Identidad Auth compartida con cuenta protegida");
const conversations = ids.length ? check(await db.from("conversations").select("id").in("assigned_operator_id", ids).eq("status", "human_takeover")) : [];
console.log(JSON.stringify({ protectedAccounts: keep.size, accountsToDelete: targets.length, takeoversToArchive: conversations.length, apply: process.argv.includes("--apply") }));
if (process.argv.includes("--apply")) {
  for (const target of targets) {
    // Desactivar primero bloquea las APIs de las sesiones existentes.
    check(await db.from("operators").update({ is_active: false }).eq("id", target.id));
    const active = check(await db.from("conversations").select("id").eq("assigned_operator_id", target.id).eq("status", "human_takeover"));
    for (const conversation of active) {
      const now = new Date().toISOString();
      check(await db.from("conversations").update({ status: "closed", assigned_operator_id: null, bot_paused_until: null, unanswered_release_at: null, updated_at: now }).eq("id", conversation.id).eq("assigned_operator_id", target.id).eq("status", "human_takeover"));
      check(await db.from("conversation_events").insert({ conversation_id: conversation.id, event_type: "conversation_closed_account_cleanup", actor_type: "system", actor_id: null, payload: {} }));
    }
    if (target.auth_user_id) {
      const user = check(await db.auth.admin.getUserById(target.auth_user_id));
      if (keep.has(user.user.email?.toLowerCase())) throw new Error("Auth protegido: limpieza detenida");
      check(await db.auth.admin.deleteUser(target.auth_user_id));
    }
    check(await db.from("operators").delete().eq("id", target.id));
  }
  const remaining = check(await db.from("operators").select("email,role,is_active"));
  if (remaining.length !== 2 || remaining.some((row) => !keep.has(row.email?.toLowerCase()) || row.role !== "admin" || !row.is_active)) throw new Error("Verificación final fallida");
  console.log("Limpieza verificada: solo admin y admindev, activos.");
}

// Alta o actualización de un usuario del panel (cuenta de área o admin) desde la línea de comandos.
// Uso:
//   npm run operator:create -- --username cardiologia --name "Cardiología" --areas "Cardiología"
//   npm run operator:create -- --username admin2 --name "Administración" --role admin
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en .env.local o en el entorno).
// La contraseña temporal se genera al azar y se imprime una sola vez; el usuario debe cambiarla.
// Varias computadoras pueden iniciar sesión con la misma cuenta.

import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Argumento inesperado: ${key}`);
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const username = String(args.username || "").trim().toLowerCase();
const name = String(args.name || "").trim();
const role = args.role || "operator";
const areaNames = String(args.areas || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!/^[a-z0-9._-]{3,}$/.test(username)) throw new Error("--username debe tener al menos 3 caracteres (a-z, 0-9, . _ -)");
if (!name) throw new Error("--name es obligatorio");
if (!["admin", "operator"].includes(role)) throw new Error("--role debe ser admin u operator");
if (role === "operator" && !areaNames.length) throw new Error("Un operador necesita al menos un área en --areas");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `${username}@bot-ccs.local`;

const { data: areas, error: areasError } = await supabase.from("areas").select("id,name").in("name", areaNames);
if (areasError) throw new Error(areasError.message);
const missing = areaNames.filter((areaName) => !areas.some((area) => area.name === areaName));
if (missing.length) throw new Error(`Áreas inexistentes: ${missing.join(", ")}`);

const { data: existing } = await supabase.from("operators").select("id,auth_user_id").eq("email", email).maybeSingle();

let authUserId = existing?.auth_user_id || null;
let temporaryPassword = null;

if (!existing) {
  temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError) throw new Error(createError.message);
  authUserId = created.user.id;
}

const { data: operator, error: operatorError } = await supabase
  .from("operators")
  .upsert(
    { auth_user_id: authUserId, name, email, role, is_active: true },
    { onConflict: "email" },
  )
  .select("id")
  .single();
if (operatorError) throw new Error(operatorError.message);

const { error: deleteError } = await supabase.from("operator_areas").delete().eq("operator_id", operator.id);
if (deleteError) throw new Error(deleteError.message);

if (role === "operator") {
  const { error: insertError } = await supabase
    .from("operator_areas")
    .insert(areas.map((area) => ({ operator_id: operator.id, area_id: area.id })));
  if (insertError) throw new Error(insertError.message);
}

console.log(`Usuario ${username} (${role}) listo. Áreas: ${role === "admin" ? "todas (admin)" : areaNames.join(", ")}`);
if (temporaryPassword) {
  console.log(`Contraseña temporal (mostrar una sola vez): ${temporaryPassword}`);
} else {
  console.log("La cuenta ya existía; no se cambió la contraseña.");
}

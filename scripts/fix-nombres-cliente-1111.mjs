// Correcciones de nombres pedidas por el cliente (11/11/2026):
// Segovia Néstor -> Segovia Marcelo, Núñes -> Núñez Gaspar, "Ginecología y Obstetricia" -> "Ginecología".
// Conserva intents e ids de bloque (no toca area_rules) y deja los alias anteriores.
//
// Uso (dentro del servicio tools, con SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/fix-nombres-cliente-1111.mjs          # dry-run
//   node scripts/fix-nombres-cliente-1111.mjs --apply  # escribe en Supabase (publicado y borrador)
// Tras aplicar, reiniciar web para recargar la caché del catálogo publicado.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const TEXT = [
  ["Segovia Néstor", "Segovia Marcelo"],
  ["Núñes", "Núñez"],
  ["Ginecología y Obstetricia", "Ginecología"],
];
const uniq = (list) => [...new Set(list)];

function fixText(value) {
  let out = value;
  for (const [from, to] of TEXT) out = out.split(from).join(to);
  return out;
}

function transform(payload) {
  let changes = 0;
  const set = (obj, field, value) => {
    if (obj[field] !== value) { obj[field] = value; changes += 1; }
  };
  for (const service of payload.medicalServices || []) {
    set(service, "title", fixText(service.title));
    set(service, "generalBody", fixText(service.generalBody || ""));
    set(service, "customBody", fixText(service.customBody || ""));
    service.matchers = uniq([...service.matchers.map(fixText), ...service.matchers]);
  }
  for (const group of payload.professionalResponseGroups || []) {
    set(group, "specialty", fixText(group.specialty));
    set(group, "body", fixText(group.body));
  }
  for (const professional of payload.professionals || []) {
    set(professional, "specialty", fixText(professional.specialty));
    const newName = professional.name === "Segovia Néstor" ? "Segovia Marcelo" : fixText(professional.name);
    if (newName !== professional.name) {
      professional.aliases = uniq([
        ...professional.aliases.map((alias) => fixText(alias.replace("Néstor", "Marcelo"))),
        ...professional.aliases,
      ]);
      set(professional, "name", newName);
    }
  }
  return changes;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("bot_catalog_versions")
    .select("*")
    .in("status", ["published", "draft"]);
  if (error) throw new Error(error.message);
  for (const row of rows) {
    const changes = transform(row.payload);
    console.log(`[${row.status}] cambios: ${changes}`);
    if (APPLY && changes) {
      const patch = { payload: row.payload, updated_at: new Date().toISOString() };
      if (row.status === "draft") patch.revision = row.revision + 1;
      const { error: updateError } = await supabase.from("bot_catalog_versions").update(patch).eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
    }
  }
  console.log(APPLY ? "Aplicado. Reiniciar web." : "DRY-RUN. Use --apply para escribir.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

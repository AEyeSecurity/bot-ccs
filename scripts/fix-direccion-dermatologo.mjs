// Correcciones de contenido confirmadas por el cliente (27/10/2026):
// 1) Unificar la dirección del Sector A: "Pasaje Tamarisco 735" -> "Pje. Dra. Elena Ibarra de Zilberberg 735".
// 2) Dermatólogo: es hombre; se reemplaza el nombre femenino "Romero Claudia" por "Romero" (primer nombre pendiente).
//
// Uso (dentro del servicio tools, con SUPABASE_SERVICE_ROLE_KEY inyectada):
//   node scripts/fix-direccion-dermatologo.mjs          # dry-run
//   node scripts/fix-direccion-dermatologo.mjs --apply  # escribe en Supabase
//
// Tras aplicar, reiniciar web para recargar la caché del catálogo publicado.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const APPLY = process.argv.includes("--apply");
const OLD_ADDRESS = "Pasaje Tamarisco 735";
const NEW_ADDRESS = "Pje. Dra. Elena Ibarra de Zilberberg 735";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function fixAddress(payload) {
  let changed = false;
  for (const entry of Object.values(payload.direct || {})) {
    if (typeof entry.body === "string" && entry.body.includes(OLD_ADDRESS)) {
      entry.body = entry.body.split(OLD_ADDRESS).join(NEW_ADDRESS);
      changed = true;
    }
  }
  for (const study of payload.imagingStudies || []) {
    if (typeof study.body === "string" && study.body.includes(OLD_ADDRESS)) {
      study.body = study.body.split(OLD_ADDRESS).join(NEW_ADDRESS);
      changed = true;
    }
  }
  return changed;
}

function fixDermatologist(payload) {
  const professional = (payload.professionals || []).find((item) => item.name === "Romero Claudia");
  if (!professional) return { found: false, changed: false };
  const changed = professional.name !== "Romero" || JSON.stringify(professional.aliases) !== JSON.stringify(["Romero"]);
  professional.name = "Romero";
  professional.aliases = ["Romero"];
  return { found: true, changed };
}

function transform(payload) {
  const addressChanged = fixAddress(payload);
  const dermatologist = fixDermatologist(payload);
  return { addressChanged, dermatologist };
}

async function main() {
  const { data: published, error: publishedError } = await supabase
    .from("bot_catalog_versions")
    .select("*")
    .eq("status", "published")
    .maybeSingle();
  if (publishedError) throw new Error(publishedError.message);
  if (!published) throw new Error("No existe catálogo publicado");

  const { data: draft, error: draftError } = await supabase
    .from("bot_catalog_versions")
    .select("*")
    .eq("status", "draft")
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);

  const publishedResult = transform(published.payload);
  console.log(`[published v${published.version}] dirección: ${publishedResult.addressChanged}, dermatólogo: ${JSON.stringify(publishedResult.dermatologist)}`);

  let draftResult = null;
  if (draft) {
    draftResult = transform(draft.payload);
    console.log(`[draft rev ${draft.revision}] dirección: ${draftResult.addressChanged}, dermatólogo: ${JSON.stringify(draftResult.dermatologist)}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada se escribió. Ejecutar con --apply para aplicar.");
    return;
  }

  const now = new Date().toISOString();
  const { error: updatePublishedError } = await supabase
    .from("bot_catalog_versions")
    .update({ payload: published.payload, updated_at: now })
    .eq("id", published.id);
  if (updatePublishedError) throw new Error(updatePublishedError.message);

  if (draft) {
    const { error: updateDraftError } = await supabase
      .from("bot_catalog_versions")
      .update({ payload: draft.payload, revision: draft.revision + 1, updated_at: now })
      .eq("id", draft.id);
    if (updateDraftError) throw new Error(updateDraftError.message);
  }

  console.log("\nAplicado. Reiniciar web para recargar la caché del catálogo publicado.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

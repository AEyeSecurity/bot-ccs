// Agrega los servicios nuevos (Medicina laboral, Hemoterapia, Flebología, Facturación,
// Quirófanos, Terapia intensiva y Radiología) al catálogo productivo, con texto placeholder
// editable desde el banco de respuestas. El área de cada servicio ya está en la migración 009.
//
// Uso (dentro del servicio tools, con SUPABASE_SERVICE_ROLE_KEY inyectada):
//   node scripts/add-servicios-sin-area.mjs          # dry-run
//   node scripts/add-servicios-sin-area.mjs --apply  # escribe en Supabase
//
// Tras aplicar, reiniciar web para recargar la caché del catálogo publicado.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const APPLY = process.argv.includes("--apply");
const PLACEHOLDER = "Estamos actualizando la información de este servicio. Disculpe las molestias.";

const SERVICES = [
  { key: "medicinaLaboral", title: "Medicina laboral" },
  { key: "hemoterapia", title: "Hemoterapia" },
  { key: "flebologia", title: "Flebología" },
  { key: "facturacion", title: "Facturación" },
  { key: "quirofanos", title: "Quirófanos" },
  { key: "terapiaIntensiva", title: "Terapia intensiva" },
  { key: "radiologia", title: "Radiología" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function addServices(payload) {
  const added = [];
  payload.direct ||= {};
  for (const service of SERVICES) {
    if (!payload.direct[service.key]) {
      payload.direct[service.key] = {
        body: PLACEHOLDER,
        phones: [],
        available: true,
        reviewStatus: "reviewed",
      };
      added.push(service.title);
    }
  }
  return added;
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

  const publishedAdded = addServices(published.payload);
  console.log(`[published v${published.version}] agregados: ${publishedAdded.join(", ") || "ninguno"}`);

  let draftAdded = [];
  if (draft) {
    draftAdded = addServices(draft.payload);
    console.log(`[draft rev ${draft.revision}] agregados: ${draftAdded.join(", ") || "ninguno"}`);
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

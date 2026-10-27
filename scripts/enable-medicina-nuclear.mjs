// Habilita el estudio Medicina Nuclear (available=true y revisado) en el catálogo productivo.
// El estudio ya fue agregado por scripts/fix-medicina-nuclear-as-study.mjs; este script solo lo activa.
//
// Uso (dentro del servicio tools, con SUPABASE_SERVICE_ROLE_KEY inyectada):
//   node scripts/enable-medicina-nuclear.mjs          # dry-run: muestra el cambio
//   node scripts/enable-medicina-nuclear.mjs --apply  # escribe en Supabase
//
// Tras aplicar, reiniciar web para recargar la caché del catálogo publicado.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const APPLY = process.argv.includes("--apply");
const STUDY_INTENT = "IMAGENES_MEDICINA_NUCLEAR";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function enable(payload) {
  const study = payload.imagingStudies?.find((item) => item.intent === STUDY_INTENT);
  if (!study) return { found: false, changed: false };
  const changed = study.available !== true || study.reviewStatus !== "reviewed";
  study.available = true;
  study.reviewStatus = "reviewed";
  return { found: true, changed };
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

  const publishedResult = enable(published.payload);
  console.log(`[published v${published.version}] estudio encontrado: ${publishedResult.found}, cambio: ${publishedResult.changed}`);

  let draftResult = null;
  if (draft) {
    draftResult = enable(draft.payload);
    console.log(`[draft rev ${draft.revision}] estudio encontrado: ${draftResult.found}, cambio: ${draftResult.changed}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada se escribió. Ejecutar con --apply para aplicar.");
    return;
  }

  const now = new Date().toISOString();
  if (publishedResult.found && publishedResult.changed) {
    const { error: updatePublishedError } = await supabase
      .from("bot_catalog_versions")
      .update({ payload: published.payload, updated_at: now })
      .eq("id", published.id);
    if (updatePublishedError) throw new Error(updatePublishedError.message);
  }

  if (draft && draftResult?.found && draftResult.changed) {
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

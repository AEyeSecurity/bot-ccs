// Corrección controlada del catálogo: Medicina Nuclear es un ESTUDIO, no una especialidad.
// Elimina la especialidad ATENCION_MEDICA_MEDICINA_NUCLEAR (agregada por error el 21/10) y
// agrega el estudio IMAGENES_MEDICINA_NUCLEAR (disponible=false, pendiente de texto).
// El publicado necesita reviewStatus=reviewed para cargar; el borrador conserva pending.
//
// Uso (dentro del servicio tools, con SUPABASE_SERVICE_ROLE_KEY inyectada):
//   node scripts/fix-medicina-nuclear-as-study.mjs          # dry-run: muestra el cambio
//   node scripts/fix-medicina-nuclear-as-study.mjs --apply  # escribe en Supabase
//
// Tras aplicar, reiniciar web para recargar la caché del catálogo publicado. El estudio queda
// desactivado y pendiente; se completa el texto y se marca revisado desde el panel antes de publicar.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const APPLY = process.argv.includes("--apply");

const SPECIALTY_INTENT = "ATENCION_MEDICA_MEDICINA_NUCLEAR";
const STUDY_INTENT = "IMAGENES_MEDICINA_NUCLEAR";

const STUDY = {
  intent: STUDY_INTENT,
  title: "Medicina nuclear",
  matchers: ["Medicina Nuclear", "Cámara Gamma", "SPECT"],
  body: "Para solicitar un turno de Medicina Nuclear (Cámara Gamma), comuníquese por WhatsApp al +5492974198386.",
  phones: ["+5492974198386"],
  sourceCell: "Usuarios: Gamma / Información importante: Cámara Gamma",
  available: false,
  reviewStatus: "pending",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function transform(payload, reviewStatus = "pending") {
  const before = payload.medicalServices.length;
  payload.medicalServices = payload.medicalServices.filter((service) => service.intent !== SPECIALTY_INTENT);
  const removedSpecialty = payload.medicalServices.length !== before;

  const already = payload.imagingStudies.some((study) => study.intent === STUDY_INTENT);
  let addedStudy = false;
  if (!already) {
    payload.imagingStudies.push({ ...structuredClone(STUDY), reviewStatus });
    addedStudy = true;
  }

  return { removedSpecialty, addedStudy, alreadyStudy: already };
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

  const publishedResult = transform(published.payload, "reviewed");
  console.log(`[published v${published.version}] especialidad eliminada: ${publishedResult.removedSpecialty}, estudio agregado: ${publishedResult.addedStudy}, ya existía: ${publishedResult.alreadyStudy}`);

  let draftResult = null;
  if (draft) {
    draftResult = transform(draft.payload);
    console.log(`[draft rev ${draft.revision}] especialidad eliminada: ${draftResult.removedSpecialty}, estudio agregado: ${draftResult.addedStudy}, ya existía: ${draftResult.alreadyStudy}`);
  } else {
    console.log("[draft] no existe; se creará a partir del publicado corregido");
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
  } else {
    const { error: insertDraftError } = await supabase
      .from("bot_catalog_versions")
      .insert({ version: 0, status: "draft", payload: published.payload, revision: 1, created_by: null, updated_by: null })
      .select("*")
      .single();
    if (insertDraftError) throw new Error(insertDraftError.message);
  }

  console.log("\nAplicado. Reiniciar web para recargar la caché del catálogo publicado. Luego completar el texto del estudio y marcarlo revisado antes de publicar.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

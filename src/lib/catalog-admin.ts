import { replacePublishedCatalog } from "./catalog-store";
import {
  extractManagedPhones,
  managedCatalogSchema,
  validateManagedCatalog,
  type ManagedCatalog,
} from "./managed-catalog";
import { createAdminSupabaseClient } from "./supabase";

export type CatalogVersionRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  payload: ManagedCatalog;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function immutableProjection(catalog: ManagedCatalog) {
  return {
    schemaVersion: catalog.schemaVersion,
    messageKeys: Object.keys(catalog.messages).sort(),
    directKeys: Object.keys(catalog.direct).sort(),
    medicalServices: catalog.medicalServices.map(({ intent, title, matchers, sourceCell }) => ({
      intent, title, matchers, sourceCell,
    })),
    imagingStudies: catalog.imagingStudies.map(({ intent, title, matchers, sourceCell }) => ({
      intent, title, matchers, sourceCell,
    })),
    professionalResponseGroups: catalog.professionalResponseGroups.map(({
      id, specialty, subservices, order, sourceCell, includeServiceGeneral,
    }) => ({ id, specialty, subservices, order, sourceCell, includeServiceGeneral })),
    professionals: catalog.professionals.map(({
      name, aliases, specialty, subservices, responseGroupId, sourceCell,
    }) => ({ name, aliases, specialty, subservices, responseGroupId, sourceCell })),
    insurancePlans: catalog.insurancePlans.map(({ id, aliases }) => ({ id, aliases })),
  };
}

function assertEditableStructure(candidate: ManagedCatalog, published: ManagedCatalog) {
  if (JSON.stringify(immutableProjection(candidate)) !== JSON.stringify(immutableProjection(published))) {
    throw httpError("La estructura, los alias y las relaciones del catálogo no se pueden modificar desde el panel", 400);
  }
}

function markChangedEntriesPending(candidate: ManagedCatalog, base: ManagedCatalog) {
  for (const [key, entry] of Object.entries(candidate.messages)) {
    if (entry.body !== base.messages[key].body) entry.reviewStatus = "pending";
  }
  for (const [key, entry] of Object.entries(candidate.direct)) {
    const previous = base.direct[key];
    if (entry.body !== previous.body || entry.available !== previous.available) entry.reviewStatus = "pending";
  }
  candidate.medicalServices.forEach((entry, index) => {
    const previous = base.medicalServices[index];
    if (entry.generalBody !== previous.generalBody || entry.available !== previous.available) entry.reviewStatus = "pending";
  });
  candidate.imagingStudies.forEach((entry, index) => {
    const previous = base.imagingStudies[index];
    if (entry.body !== previous.body || entry.available !== previous.available) entry.reviewStatus = "pending";
  });
  candidate.professionalResponseGroups.forEach((entry, index) => {
    const previous = base.professionalResponseGroups[index];
    if (entry.body !== previous.body || entry.available !== previous.available) entry.reviewStatus = "pending";
  });
  candidate.professionals.forEach((entry, index) => {
    if (entry.available !== base.professionals[index].available) entry.reviewStatus = "pending";
  });
  candidate.insurancePlans.forEach((entry, index) => {
    const previous = base.insurancePlans[index];
    if (entry.name !== previous.name || entry.available !== previous.available) entry.reviewStatus = "pending";
  });
  return candidate;
}

export function prepareCatalogPayload(input: unknown) {
  const catalog = structuredClone(managedCatalogSchema.parse(input));
  for (const entry of Object.values(catalog.direct)) entry.phones = extractManagedPhones(entry.body);
  for (const service of catalog.medicalServices) service.phones = extractManagedPhones(service.generalBody);
  for (const study of catalog.imagingStudies) study.phones = extractManagedPhones(study.body);
  for (const group of catalog.professionalResponseGroups) group.phones = extractManagedPhones(group.body);
  return managedCatalogSchema.parse(catalog);
}

async function getVersion(status: "draft" | "published") {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("bot_catalog_versions")
    .select("*")
    .eq("status", status)
    .maybeSingle();
  if (error) throw httpError(error.message, 500);
  return data as CatalogVersionRow | null;
}

export async function getCatalogAdminState() {
  const supabase = createAdminSupabaseClient();
  const [{ data: versions, error }, published, draft] = await Promise.all([
    supabase.from("bot_catalog_versions").select("*").order("created_at", { ascending: false }).limit(20),
    getVersion("published"),
    getVersion("draft"),
  ]);
  if (error) throw httpError(error.message, 500);
  const effectiveDraft = draft?.payload || published?.payload;
  const validation = effectiveDraft ? validateManagedCatalog(effectiveDraft) : { errors: ["No existe catálogo"], pending: [] };
  return {
    published,
    draft,
    validation: { errors: validation.errors, pending: validation.pending },
    history: ((versions || []) as CatalogVersionRow[]).map((row) => ({
      id: row.id,
      version: row.version,
      status: row.status,
      revision: row.revision,
      updated_at: row.updated_at,
      published_at: row.published_at,
    })),
  };
}

export async function saveCatalogDraft(args: {
  actorId: string;
  payload: unknown;
  expectedRevision: number | null;
}) {
  const supabase = createAdminSupabaseClient();
  const [published, draft] = await Promise.all([getVersion("published"), getVersion("draft")]);
  if (!published) throw httpError("No existe un catálogo publicado para editar", 503);
  const payload = prepareCatalogPayload(args.payload);
  assertEditableStructure(payload, published.payload);
  markChangedEntriesPending(payload, draft?.payload || published.payload);
  const validation = validateManagedCatalog(payload);

  if (draft) {
    if (args.expectedRevision !== draft.revision) throw httpError("El borrador fue modificado por otro administrador", 409);
    const { data, error } = await supabase
      .from("bot_catalog_versions")
      .update({ payload, revision: draft.revision + 1, updated_by: args.actorId })
      .eq("id", draft.id)
      .eq("revision", draft.revision)
      .select("*")
      .maybeSingle();
    if (error) throw httpError(error.message, 500);
    if (!data) throw httpError("El borrador fue modificado por otro administrador", 409);
    return { draft: data as CatalogVersionRow, validation: { errors: validation.errors, pending: validation.pending } };
  }

  if (args.expectedRevision !== null) throw httpError("El borrador ya no existe; actualice la pantalla", 409);
  const { data, error } = await supabase
    .from("bot_catalog_versions")
    .insert({
      version: 0,
      status: "draft",
      payload,
      revision: 1,
      created_by: args.actorId,
      updated_by: args.actorId,
    })
    .select("*")
    .single();
  if (error) throw httpError(error.message, 500);
  return { draft: data as CatalogVersionRow, validation: { errors: validation.errors, pending: validation.pending } };
}

export async function publishCatalogDraft(args: { actorId: string; draftId: string; expectedRevision: number }) {
  const supabase = createAdminSupabaseClient();
  const [published, draft] = await Promise.all([getVersion("published"), getVersion("draft")]);
  if (!draft || draft.id !== args.draftId) throw httpError("No se encontró el borrador", 404);
  if (draft.revision !== args.expectedRevision) throw httpError("El borrador fue modificado por otro administrador", 409);
  if (!published) throw httpError("No existe catálogo publicado", 503);
  assertEditableStructure(draft.payload, published.payload);
  const validation = validateManagedCatalog(draft.payload, { requireReviewed: true });
  if (validation.errors.length) throw httpError(validation.errors.join("; "), 400);

  const { data, error } = await supabase.rpc("publish_bot_catalog", {
    p_draft_id: draft.id,
    p_expected_revision: draft.revision,
    p_actor: args.actorId,
  });
  if (error) {
    if (/revision conflict/i.test(error.message)) throw httpError("El borrador fue modificado por otro administrador", 409);
    throw httpError(error.message, 500);
  }
  const row = (Array.isArray(data) ? data[0] : data) as CatalogVersionRow | null;
  if (!row) throw httpError("No se pudo publicar el catálogo", 500);
  replacePublishedCatalog(row as unknown as Record<string, unknown>);
  return row;
}

export async function restoreCatalogVersion(args: { actorId: string; versionId: string }) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("restore_bot_catalog", {
    p_version_id: args.versionId,
    p_actor: args.actorId,
  });
  if (error) throw httpError(error.message, 500);
  const row = (Array.isArray(data) ? data[0] : data) as CatalogVersionRow | null;
  if (!row) throw httpError("No se pudo restaurar la versión", 500);
  return row;
}

import { activateCatalog, hasActiveCatalog } from "./bot-catalog";
import { validateManagedCatalog, type ManagedCatalog } from "./managed-catalog";
import { createAdminSupabaseClient } from "./supabase";

export type PublishedCatalogVersion = {
  id: string;
  version: number;
  revision: number;
  payload: ManagedCatalog;
  published_at: string | null;
};

let cachedVersion: PublishedCatalogVersion | null = null;
let loadingCatalog: Promise<PublishedCatalogVersion> | null = null;

async function loadPublishedCatalogRow() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("bot_catalog_versions")
    .select("id,version,revision,payload,published_at")
    .eq("status", "published")
    .maybeSingle();
  if (error) throw unavailable(`No se pudo cargar el catálogo publicado: ${error.message}`);
  if (!data) throw unavailable("No existe un catálogo publicado");
  return data as Record<string, unknown>;
}

let catalogLoader: () => Promise<Record<string, unknown>> = loadPublishedCatalogRow;

function unavailable(message: string) {
  return Object.assign(new Error(message), { status: 503 });
}

function activateVersion(row: Record<string, unknown>) {
  let validation;
  try {
    validation = validateManagedCatalog(row.payload, { requireReviewed: true });
  } catch (error) {
    throw unavailable(`El catálogo publicado no es válido: ${error instanceof Error ? error.message : "estructura inválida"}`);
  }
  if (validation.errors.length) {
    throw unavailable(`El catálogo publicado no es válido: ${validation.errors.join("; ")}`);
  }
  const version: PublishedCatalogVersion = {
    id: String(row.id),
    version: Number(row.version),
    revision: Number(row.revision),
    payload: validation.catalog,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
  };
  activateCatalog(version.payload);
  cachedVersion = version;
  return version;
}

export async function getPublishedCatalog() {
  if (cachedVersion && hasActiveCatalog()) return cachedVersion;
  if (loadingCatalog) return loadingCatalog;

  loadingCatalog = (async () => {
    try {
      return activateVersion(await catalogLoader());
    } catch (error) {
      if (typeof error === "object" && error && "status" in error && error.status === 503) throw error;
      throw unavailable(error instanceof Error ? error.message : "No se pudo cargar el catálogo publicado");
    }
  })().finally(() => {
    loadingCatalog = null;
  });

  return loadingCatalog;
}

export function replacePublishedCatalog(row: Record<string, unknown>) {
  return activateVersion(row);
}

export function clearPublishedCatalogCache() {
  cachedVersion = null;
  loadingCatalog = null;
}

export function currentPublishedCatalog() {
  return cachedVersion;
}

export function setPublishedCatalogLoaderForTests(loader: (() => Promise<Record<string, unknown>>) | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("The catalog loader can only be replaced in tests");
  catalogLoader = loader || loadPublishedCatalogRow;
  clearPublishedCatalogCache();
}

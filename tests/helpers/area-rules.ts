import fs from "node:fs";
import path from "node:path";
import type { AreaRule } from "@/lib/areas";

const migration004 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/004_roles_areas.sql"), "utf8");
const migration005 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/005_gamma_contacto_profesionales.sql"), "utf8");
const migration008 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/008_clinica_medica_edificios.sql"), "utf8");
const migration009 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/009_servicios_sin_area.sql"), "utf8");

// Las reglas viven en las migraciones (fuente de la carga inicial). Se leen de ahí para no duplicarlas.
function insertNames(sql: string) {
  const start = sql.indexOf("insert into public.areas");
  if (start < 0) return [];
  const block = sql.slice(start, sql.indexOf(";", start));
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
export const areaNames = [...new Set([...insertNames(migration004), ...insertNames(migration005)])];
const areaIdByName = new Map(areaNames.map((name) => [name, `area:${name}`]));

// Admite tuplas de 2 o 3 columnas: ('área', 'INTENT') o ('área', 'INTENT', null|'grupo').
// El nombre de área nunca lleva guión bajo, para no confundir con las listas `in (...)`.
function tuplesOf(sql: string, areaIdOf: (name: string) => string): AreaRule[] {
  return [...sql.matchAll(/\('([^'_]+)',\s*'([A-Z_]+)'(?:\s*,\s*(null|'[a-z_]+'))?\)/g)].map(([, areaName, intentKey, group]) => ({
    area_id: areaIdOf(areaName),
    intent_key: intentKey,
    response_group_id: group === "null" || group === undefined ? null : group.slice(1, -1),
  }));
}

const areaIdOf = (name: string) => areaIdByName.get(name) || `missing:${name}`;
const removals: Array<{ area_id: string; intent_key: string; response_group_id: string | null }> = [
  ...migration005.matchAll(/a\.name = '([^']+)'\s+and r\.intent_key = '([A-Z_]+)'\s+and r\.response_group_id = '([a-z_]+)'/g),
].map(([, areaName, intentKey, group]) => ({ area_id: areaIdOf(areaName), intent_key: intentKey, response_group_id: group }));
// 008: quita Clínica Médica y Médicos clínicos de Guardia (reglas genéricas, sin grupo).
removals.push({ area_id: areaIdOf("Guardia"), intent_key: "ATENCION_MEDICA_CLINICA_MEDICA", response_group_id: null });
removals.push({ area_id: areaIdOf("Guardia"), intent_key: "MEDICOS_CLINICOS", response_group_id: null });
export const seededRules: AreaRule[] = [
  ...tuplesOf(migration004, areaIdOf).filter(
    (rule) => !removals.some((removed) => removed.area_id === rule.area_id && removed.intent_key === rule.intent_key && removed.response_group_id === rule.response_group_id),
  ),
  ...tuplesOf(migration005, areaIdOf),
  ...tuplesOf(migration008, areaIdOf),
  ...tuplesOf(migration009, areaIdOf),
];


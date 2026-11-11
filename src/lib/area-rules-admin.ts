import type { ManagedCatalog } from "./managed-catalog";
import type { createAdminSupabaseClient } from "./supabase";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export async function listAreaNames(supabase: SupabaseAdmin) {
  const { data, error } = await supabase.from("areas").select("name").eq("is_active", true);
  if (error) throw new Error(error.message);
  return ((data || []) as Array<{ name: string }>).map((row) => row.name).sort((a, b) => a.localeCompare(b, "es"));
}

// Deriva el bloque de respuesta de un profesional (nuevo) a un sector.
// Si la especialidad solo tenía reglas generales (sin profesional), se copian a los profesionales
// existentes: de lo contrario, al nombrar a la persona nueva dejarían de derivarse los demás.
export async function assignGroupToArea(args: {
  supabase: SupabaseAdmin;
  catalog: ManagedCatalog;
  groupId: string;
  areaName: string;
}) {
  const { supabase, catalog, groupId, areaName } = args;
  const group = catalog.professionalResponseGroups.find((item) => item.id === groupId);
  if (!group) throw httpError("El bloque del profesional no existe; guarde el borrador primero", 400);
  const service = catalog.medicalServices.find((item) => item.title === group.specialty);
  if (!service) throw httpError("La especialidad del profesional no existe", 400);

  const { data: area, error: areaError } = await supabase.from("areas").select("id,name").eq("name", areaName).maybeSingle();
  if (areaError) throw new Error(areaError.message);
  if (!area) throw httpError(`El sector ${areaName} no existe`, 400);

  const { data: existing, error: rulesError } = await supabase
    .from("area_rules")
    .select("area_id,response_group_id")
    .eq("intent_key", service.intent);
  if (rulesError) throw new Error(rulesError.message);
  const rules = (existing || []) as Array<{ area_id: string; response_group_id: string | null }>;

  const wanted: Array<{ area_id: string; response_group_id: string }> = [{ area_id: String(area.id), response_group_id: groupId }];
  if (!rules.some((rule) => rule.response_group_id)) {
    const siblings = catalog.professionalResponseGroups.filter((item) => item.specialty === service.title && item.id !== groupId);
    for (const rule of rules) {
      for (const sibling of siblings) wanted.push({ area_id: rule.area_id, response_group_id: sibling.id });
    }
  }
  const missing = wanted.filter((item) => !rules.some((rule) => rule.area_id === item.area_id && rule.response_group_id === item.response_group_id));
  if (missing.length) {
    const { error } = await supabase
      .from("area_rules")
      .insert(missing.map((item) => ({ ...item, intent_key: service.intent })));
    if (error) throw new Error(error.message);
  }
  return { intent: service.intent, groupId, area: areaName, created: missing.length };
}

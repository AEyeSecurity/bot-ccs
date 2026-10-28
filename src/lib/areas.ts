import { MEDICAL_SERVICES, PROFESSIONAL_RESPONSE_GROUPS, TURNOS_MEDICOS_SELECTOR_INTENT } from "./bot-catalog";
import type { Conversation, Operator } from "./domain";
import type { createAdminSupabaseClient } from "./supabase";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export type AreaRule = {
  area_id: string;
  intent_key: string;
  response_group_id: string | null;
};

export type RoutingKeys = {
  intentKey: string | null;
  responseGroupIds: string[];
};

const SPECIALTY_INTENT = "TURNOS_MEDICOS_ATENCION_MEDICA";

// Traduce el estado del turno a las claves de area_rules.
// Para especialidades y profesionales, la clave es el intent ATENCION_MEDICA_* de la especialidad.
export function resolveRoutingKeys(
  currentIntent: string | null,
  caseData: Record<string, unknown> | null | undefined,
): RoutingKeys {
  const groupIds = Array.isArray(caseData?.professionalResponseGroupIds)
    ? caseData.professionalResponseGroupIds.filter((value): value is string => typeof value === "string")
    : [];

  if (currentIntent === TURNOS_MEDICOS_SELECTOR_INTENT) return { intentKey: null, responseGroupIds: [] };

  if (currentIntent === SPECIALTY_INTENT) {
    const groupSpecialty = groupIds
      .map((id) => PROFESSIONAL_RESPONSE_GROUPS.find((group) => group.id === id)?.specialty)
      .find((value): value is string => Boolean(value));
    const specialty = groupSpecialty || (typeof caseData?.professionalOrService === "string" ? caseData.professionalOrService : "");
    const intentKey = MEDICAL_SERVICES.find((service) => service.title === specialty)?.intent || null;
    return { intentKey, responseGroupIds: groupIds };
  }

  return { intentKey: currentIntent, responseGroupIds: groupIds };
}

// Un caso va a las áreas de su intent. Si el paciente nombró un profesional que tiene reglas
// propias para esa especialidad, cuentan solo las áreas de esos profesionales.
// Un profesional sin regla (no figura en la hoja) no se deriva a ninguna área: queda solo para admin.
export function deriveAreaIds(keys: RoutingKeys, rules: AreaRule[]): string[] {
  if (!keys.intentKey) return [];
  const intentRules = rules.filter((rule) => rule.intent_key === keys.intentKey);
  const hasGroupRules = intentRules.some((rule) => rule.response_group_id);

  const selected =
    keys.responseGroupIds.length && hasGroupRules
      ? intentRules.filter((rule) => rule.response_group_id && keys.responseGroupIds.includes(rule.response_group_id))
      : intentRules.filter((rule) => !rule.response_group_id);

  return [...new Set(selected.map((rule) => rule.area_id))];
}

export async function loadAreaRules(supabase: SupabaseAdmin): Promise<AreaRule[]> {
  const { data, error } = await supabase
    .from("area_rules")
    .select("area_id,intent_key,response_group_id")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data || []) as AreaRule[];
}

export async function loadOperatorAreaIds(supabase: SupabaseAdmin, operatorId: string): Promise<string[]> {
  const { data, error } = await supabase.from("operator_areas").select("area_id").eq("operator_id", operatorId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => String(row.area_id));
}

const PRESENCE_WINDOW_MS = 90_000;

// Áreas con al menos un operador activo conectado (último latido en 90 s).
export async function loadConnectedAreaIds(supabase: SupabaseAdmin, areaIds: string[]): Promise<Set<string>> {
  const connected = new Set<string>();
  if (!areaIds.length) return connected;

  const { data: operatorAreas, error } = await supabase
    .from("operator_areas")
    .select("operator_id,area_id")
    .in("area_id", areaIds);
  if (error) throw new Error(error.message);

  const operatorIds = [...new Set((operatorAreas || []).map((row) => String(row.operator_id)))];
  if (!operatorIds.length) return connected;

  const threshold = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
  const { data: operators, error: operatorError } = await supabase
    .from("operators")
    .select("id")
    .eq("is_active", true)
    .gte("last_seen_at", threshold)
    .in("id", operatorIds);
  if (operatorError) throw new Error(operatorError.message);

  const activeOperatorIds = new Set((operators || []).map((row) => String(row.id)));
  for (const row of (operatorAreas || []) as Array<{ operator_id: string; area_id: string }>) {
    if (activeOperatorIds.has(String(row.operator_id))) connected.add(String(row.area_id));
  }
  return connected;
}

// Patch de area_ids para una conversación. Vacío si el turno no tiene intent que derivar.
// Si el intent cae en varias áreas, prioriza las áreas con operador conectado y deriva a la
// menos ocupada (empate al azar). Sin conectados, deriva a la menos ocupada entre todas.
export async function buildAreaPatch(
  supabase: SupabaseAdmin,
  currentIntent: string | null,
  caseData: Record<string, unknown> | null | undefined,
): Promise<{ area_ids?: string[] }> {
  const keys = resolveRoutingKeys(currentIntent, caseData);
  if (!keys.intentKey) return {};
  const rules = await loadAreaRules(supabase);
  // Intents no derivables (saludo, OTRAS_CONSULTAS, etc.) no modifican la área ya asignada.
  if (!rules.some((rule) => rule.intent_key === keys.intentKey)) return {};
  const candidates = deriveAreaIds(keys, rules);
  if (candidates.length <= 1) return { area_ids: candidates };
  const connected = await loadConnectedAreaIds(supabase, candidates);
  const pool = connected.size ? candidates.filter((id) => connected.has(id)) : candidates;
  const occupation = await loadAreaOccupation(supabase, pool);
  return { area_ids: [pickLeastBusyArea(pool, occupation)] };
}

// Ocupación de un área = conversaciones abiertas (no cerradas) con resolución "abierta"
// (ni resuelta ni pendiente) cuya area_ids incluye esa área.
export async function loadAreaOccupation(supabase: SupabaseAdmin, areaIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>(areaIds.map((id) => [id, 0]));
  if (!areaIds.length) return counts;

  const { data, error } = await supabase
    .from("conversations")
    .select("area_ids")
    .neq("status", "closed")
    .eq("resolution_status", "abierta");
  if (error) throw new Error(error.message);

  for (const row of (data || []) as Array<{ area_ids?: string[] | null }>) {
    for (const areaId of row.area_ids || []) {
      if (counts.has(areaId)) counts.set(areaId, (counts.get(areaId) || 0) + 1);
    }
  }
  return counts;
}

export function pickLeastBusyArea(
  candidates: string[],
  occupation: Map<string, number>,
  random: () => number = Math.random,
): string {
  const min = Math.min(...candidates.map((id) => occupation.get(id) || 0));
  const least = candidates.filter((id) => (occupation.get(id) || 0) === min);
  return least[Math.floor(random() * least.length)];
}

type AccessSubject = Pick<Operator, "role"> & { area_ids?: string[] };

export function isAdmin(operator: AccessSubject) {
  return operator.role === "admin";
}

export function canViewConversation(operator: AccessSubject, conversation: Pick<Conversation, "area_ids">) {
  if (isAdmin(operator)) return true;
  const areas = operator.area_ids || [];
  return (conversation.area_ids || []).some((areaId) => areas.includes(areaId));
}

// Tomar control: cualquier operador del área, incluso si otro compañero la tenía.
export function canTakeConversation(operator: AccessSubject, conversation: Pick<Conversation, "area_ids">) {
  return canViewConversation(operator, conversation);
}

// Liberar o cerrar: conversación sin dueño dentro del área, o propia. Admin siempre puede.
export function canOperateConversation(
  operator: AccessSubject & { id: string },
  conversation: Pick<Conversation, "area_ids" | "assigned_operator_id">,
) {
  if (isAdmin(operator)) return true;
  if (!canViewConversation(operator, conversation)) return false;
  return !conversation.assigned_operator_id || conversation.assigned_operator_id === operator.id;
}

export function accessDenied(message = "Sin acceso a esta conversación") {
  return Object.assign(new Error(message), { status: 403 });
}

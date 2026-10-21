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

// Patch de area_ids para una conversación. Vacío si el turno no tiene intent que derivar.
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
  return { area_ids: deriveAreaIds(keys, rules) };
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

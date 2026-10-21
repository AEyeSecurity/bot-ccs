import fs from "node:fs";
import path from "node:path";
import initialCatalog from "../../data/bot-catalog-initial.json";
import { getPublishedCatalog } from "@/lib/catalog-store";
import { MEDICAL_SERVICES, IMAGING_STUDIES } from "@/lib/bot-catalog";
import {
  canOperateConversation,
  canTakeConversation,
  canViewConversation,
  deriveAreaIds,
  resolveRoutingKeys,
  type AreaRule,
} from "@/lib/areas";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/004_roles_areas.sql"), "utf8");

// Las reglas viven en la migración (fuente de la carga inicial). Se leen de ahí para no duplicarlas.
const areasBlock = migration.slice(migration.indexOf("insert into public.areas"), migration.indexOf(";", migration.indexOf("insert into public.areas")));
const areaNames = [...areasBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const areaIdByName = new Map(areaNames.map((name) => [name, `area:${name}`]));
const seededRules: AreaRule[] = [...migration.matchAll(/\('([^']+)',\s*'([A-Z_]+)',\s*(null|'[a-z_]+')\)/g)].map(
  ([, areaName, intentKey, group]) => ({
    area_id: areaIdByName.get(areaName) || `missing:${areaName}`,
    intent_key: intentKey,
    response_group_id: group === "null" ? null : group.slice(1, -1),
  }),
);

const id = (name: string) => areaIdByName.get(name) as string;
const names = (ids: string[]) => ids.map((areaId) => areaId.replace(/^area:/, "")).sort();

// Construye las claves como lo hace el motor: intent + datos del caso.
function keysFor(currentIntent: string | null, caseData: Record<string, unknown> = {}) {
  return resolveRoutingKeys(currentIntent, caseData);
}

function derive(currentIntent: string | null, caseData: Record<string, unknown> = {}) {
  return names(deriveAreaIds(keysFor(currentIntent, caseData), seededRules));
}

const SPECIALTY = "TURNOS_MEDICOS_ATENCION_MEDICA";

beforeAll(async () => {
  await getPublishedCatalog();
});

describe("carga inicial de áreas (hoja Usuarios)", () => {
  test("crea las 13 áreas de la hoja, sin Gamma", () => {
    expect(areaNames).toHaveLength(13);
    expect(areaNames).not.toContain("Gamma");
  });

  test("cada regla apunta a un área existente y a intents o profesionales del catálogo", () => {
    const serviceIntents = new Set([...MEDICAL_SERVICES].map((service) => service.intent));
    const imagingIntents = new Set([...IMAGING_STUDIES].map((study) => study.intent));
    const groupIds = new Set(initialCatalog.professionalResponseGroups.map((group) => group.id));
    const directIntents = new Set(["LABORATORIO_CLINICO", "OBRAS_SOCIALES", "RECETAS_MEDICAS", "MEDICOS_CLINICOS"]);

    expect(seededRules.length).toBeGreaterThanOrEqual(60);
    for (const rule of seededRules) {
      expect(rule.area_id.startsWith("area:")).toBe(true);
      const known = serviceIntents.has(rule.intent_key) || imagingIntents.has(rule.intent_key) || directIntents.has(rule.intent_key);
      expect({ intent: rule.intent_key, known }).toEqual({ intent: rule.intent_key, known: true });
      if (rule.response_group_id) expect(groupIds.has(rule.response_group_id)).toBe(true);
    }
  });

  test("Cardiología agrupa todo el área cardiológica", () => {
    expect(derive("ATENCION_MEDICA_CARDIOLOGIA")).toEqual(["Cardiología"]);
    expect(derive("IMAGENES_ELECTROCARDIOGRAMA_ECG")).toEqual(["Cardiología"]);
    expect(derive("IMAGENES_HOLTER")).toEqual(["Cardiología"]);
  });

  test("un profesional de cardiología deriva a Cardiología", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cardiologia_segovia"], professionalOrService: "Segovia Néstor" })).toEqual(["Cardiología"]);
  });

  test("especialidad nombrada sin profesional: Nefrología va a Pasaje", () => {
    expect(derive("ATENCION_MEDICA_NEFROLOGIA")).toEqual(["Pasaje"]);
  });

  test("estudios de la hoja van a su área", () => {
    expect(derive("IMAGENES_TOMOGRAFIA_COMPUTADA")).toEqual(["TAC"]);
    expect(derive("IMAGENES_RESONANCIA_MAGNETICA")).toEqual(["RMN"]);
    expect(derive("IMAGENES_HEMODINAMIA")).toEqual(["Hemodinamia"]);
    expect(derive("LABORATORIO_CLINICO")).toEqual(["Laboratorio"]);
    expect(derive("IMAGENES_BIOPSIAS")).toEqual(["Patología"]);
    expect(derive("IMAGENES_MAMOGRAFIA")).toEqual(["DMO"]);
    expect(derive("OBRAS_SOCIALES")).toEqual(["Call Center"]);
    expect(derive("RECETAS_MEDICAS")).toEqual(["Call Center"]);
    expect(derive("IMAGENES_ESPINOGRAMA")).toEqual(["Guardia"]);
    expect(derive("IMAGENES_ENDOSCOPIA_ALTA_Y_BAJA_COLONOSCOPIA")).toEqual(["Admisión"]);
  });

  test("profesionales nombrados de Pasaje, Anexo y CEMI van solo a su área", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cirugia_cardoso_atilio"], professionalOrService: "Cardoso Atilio" })).toEqual(["Pasaje"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cirugia_del_carpio"], professionalOrService: "Del Carpio Ysmael" })).toEqual(["Anexo"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cirugia_francalancia"], professionalOrService: "Francalancia Gustavo" })).toEqual(["CEMI"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["traumatologia_longo"], professionalOrService: "Longo José Luis" })).toEqual(["Anexo"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["diabetologia_carrizo"], professionalOrService: "Carrizo Mercedes" })).toEqual(["Pasaje"]);
  });

  test("un profesional que aparece en dos áreas se muestra en ambas", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["neurologia_alvarez"], professionalOrService: "Álvarez Czernik Ángel" })).toEqual(["CEMI", "Pasaje"]);
  });

  test("especialidad genérica con varias áreas la muestra en todas ellas (pendiente con el cliente)", () => {
    expect(derive("ATENCION_MEDICA_CIRUGIA")).toEqual(["Anexo", "CEMI", "Pasaje"]);
    expect(derive("ATENCION_MEDICA_TRAUMATOLOGIA")).toEqual(["Anexo", "Pasaje"]);
  });

  test("profesional que no figura en la hoja no se deriva a ningún área (solo admin)", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cirugia_goldenberg"], professionalOrService: "Goldenberg Gustavo" })).toEqual([]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["neurologia_albino"], professionalOrService: "Edgar Albiño" })).toEqual([]);
  });

  test("Gamma no tiene derivación", () => {
    expect(seededRules.some((rule) => rule.area_id === "missing:Gamma")).toBe(false);
  });

  test("selector de especialidad y saludo no derivan a ninguna área", () => {
    expect(resolveRoutingKeys("TURNOS_MEDICOS_SELECTOR", {}).intentKey).toBeNull();
    expect(resolveRoutingKeys("OPENING", {}).intentKey).toBe("OPENING");
    expect(derive("OPENING")).toEqual([]);
  });
});

describe("permisos por área", () => {
  const cardiologyOperator = { id: "op-carla", role: "operator" as const, area_ids: [id("Cardiología")] };
  const otherCardiologyOperator = { id: "op-antonela", role: "operator" as const, area_ids: [id("Cardiología")] };
  const tacOperator = { id: "op-tac", role: "operator" as const, area_ids: [id("TAC")] };
  const admin = { id: "admin-1", role: "admin" as const, area_ids: [] as string[] };
  const cardiologyConversation = { area_ids: [id("Cardiología")], assigned_operator_id: "op-carla" };
  const unassignedConversation = { area_ids: [id("Cardiología")], assigned_operator_id: null };

  test("solo ve conversaciones de sus áreas; admin ve todas", () => {
    expect(canViewConversation(cardiologyOperator, cardiologyConversation)).toBe(true);
    expect(canViewConversation(tacOperator, cardiologyConversation)).toBe(false);
    expect(canViewConversation(admin, cardiologyConversation)).toBe(true);
    expect(canViewConversation(admin, { area_ids: [] })).toBe(true);
    expect(canViewConversation(cardiologyOperator, { area_ids: [] })).toBe(false);
  });

  test("un compañero del área puede tomar la conversación; otra área no", () => {
    expect(canTakeConversation(otherCardiologyOperator, cardiologyConversation)).toBe(true);
    expect(canTakeConversation(tacOperator, cardiologyConversation)).toBe(false);
  });

  test("liberar o cerrar: dueño, o nadie asignado dentro del área; compañero no", () => {
    expect(canOperateConversation(cardiologyOperator, cardiologyConversation)).toBe(true);
    expect(canOperateConversation(otherCardiologyOperator, cardiologyConversation)).toBe(false);
    expect(canOperateConversation(otherCardiologyOperator, unassignedConversation)).toBe(true);
    expect(canOperateConversation(tacOperator, unassignedConversation)).toBe(false);
    expect(canOperateConversation(admin, cardiologyConversation)).toBe(true);
  });
});

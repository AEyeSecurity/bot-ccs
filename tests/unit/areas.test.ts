import expectedRules from "../fixtures/area-rules-expected.json";
import initialCatalog from "../../data/bot-catalog-initial.json";
import { getPublishedCatalog } from "@/lib/catalog-store";
import { MEDICAL_SERVICES, IMAGING_STUDIES } from "@/lib/bot-catalog";
import {
  canOperateConversation,
  canTakeConversation,
  canViewConversation,
  deriveAreaIds,
  resolveRoutingKeys,
} from "@/lib/areas";

import { areaNames, seededRules } from "../helpers/area-rules";
import routingCases from "../fixtures/area-routing.json";
const areaIdByName = new Map(areaNames.map((name) => [name, `area:${name}`]));

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
  test("crea las 13 áreas de la hoja más Gamma (área de contacto)", () => {
    expect(areaNames).toHaveLength(14);
    expect(areaNames).toContain("Gamma");
  });

  test("cada regla apunta a un área existente y a intents o profesionales del catálogo", () => {
    const serviceIntents = new Set([...MEDICAL_SERVICES].map((service) => service.intent));
    const imagingIntents = new Set([...IMAGING_STUDIES].map((study) => study.intent));
    const groupIds = new Set(initialCatalog.professionalResponseGroups.map((group) => group.id));
    const directIntents = new Set([
      "LABORATORIO_CLINICO", "OBRAS_SOCIALES", "RECETAS_MEDICAS", "MEDICOS_CLINICOS",
      "MEDICINA_LABORAL", "HEMOTERAPIA", "FLEBOLOGIA", "FACTURACION",
      "QUIROFANOS", "TERAPIA_INTENSIVA", "RADIOLOGIA", "INTERNACION",
      "INFORMES_MEDICOS_IMAGENES_MEDICAS", "INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA", "INFORMES_MEDICOS_LABORATORIO_CLINICO",
    ]);

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
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cardiologia_segovia"], professionalOrService: "Segovia Marcelo" })).toEqual(["Cardiología"]);
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

  test("Álvarez Czernik va solo a Pasaje (la hoja actualizada ya no lo lista en CEMI)", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["neurologia_alvarez"], professionalOrService: "Álvarez Czernik" })).toEqual(["Pasaje"]);
  });

  test("especialidad genérica con varias áreas la muestra en todas ellas (pendiente con el cliente)", () => {
    expect(derive("ATENCION_MEDICA_CIRUGIA")).toEqual(["Anexo", "CEMI", "Pasaje"]);
    expect(derive("ATENCION_MEDICA_TRAUMATOLOGIA")).toEqual(["Anexo", "Pasaje"]);
  });

  test("Clínica Médica y Médicos clínicos derivan a los edificios (Pasaje + Anexo), no a Guardia", () => {
    expect(derive("ATENCION_MEDICA_CLINICA_MEDICA")).toEqual(["Anexo", "Pasaje"]);
    expect(derive("MEDICOS_CLINICOS")).toEqual(["Anexo", "Pasaje"]);
  });

  test("servicios asignados por el cliente derivan a su área", () => {
    expect(derive("MEDICINA_LABORAL")).toEqual(["Admisión"]);
    expect(derive("HEMOTERAPIA")).toEqual(["Pasaje"]);
    expect(derive("FLEBOLOGIA")).toEqual(["Anexo"]);
    expect(derive("FACTURACION")).toEqual(["Anexo"]);
    expect(derive("QUIROFANOS")).toEqual(["Guardia"]);
    expect(derive("TERAPIA_INTENSIVA")).toEqual(["Guardia"]);
    expect(derive("RADIOLOGIA")).toEqual(["Guardia"]);
    expect(derive("INTERNACION")).toEqual(["Admisión"]);
    expect(derive("INFORMES_MEDICOS_IMAGENES_MEDICAS")).toEqual(["Call Center"]);
    expect(derive("INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA")).toEqual(["Call Center"]);
    expect(derive("INFORMES_MEDICOS_LABORATORIO_CLINICO")).toEqual(["Call Center"]);
  });

  test("profesionales agregados en la hoja actualizada van a su área", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["cirugia_goldenberg"], professionalOrService: "Goldenberg Gustavo" })).toEqual(["Pasaje"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["traumatologia_juarez"], professionalOrService: "Juárez Marcelo" })).toEqual(["Pasaje"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["traumatologia_catullo"], professionalOrService: "Catullo Marcelo" })).toEqual(["Pasaje"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["neurologia_albino"], professionalOrService: "Edgar Albiño" })).toEqual(["CEMI"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["nutricion_jara"], professionalOrService: "Jara Cristina" })).toEqual(["DMO"]);
  });

  test("profesional con regla va a su área; sin regla (no figura en la hoja) no deriva a ninguna", () => {
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["nutricion_santana"], professionalOrService: "Santana Agostina" })).toEqual(["Pasaje"]);
    expect(derive(SPECIALTY, { professionalResponseGroupIds: ["unknown_group"], professionalOrService: "Desconocido" })).toEqual([]);
  });

  test("Gamma es área de contacto: no deriva casos", () => {
    expect(seededRules.some((rule) => rule.area_id === id("Gamma"))).toBe(false);
    expect(derive("IMAGENES_MEDICINA_NUCLEAR")).toEqual([]);
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

// Expectativas explícitas independientes del parser de migraciones.
describe("matriz de todas las áreas", () => {
  test("cada área definida tiene un caso de aceptación", () => {
    expect(routingCases.map((item) => item.area).sort()).toEqual([...areaNames].sort());
  });
  test.each(routingCases)("$area: $message", ({ intent, expectedAreas }) => {
    expect(derive(intent)).toEqual(expectedAreas);
  });
  test.each(areaNames)("permisos aislados para %s", (area) => {
    const operator = { id: "owner", role: "operator" as const, area_ids: [id(area)] };
    for (const target of areaNames) {
      const conversation = { area_ids: [id(target)], assigned_operator_id: null };
      expect(canViewConversation(operator, conversation)).toBe(area === target);
      expect(canTakeConversation(operator, conversation)).toBe(area === target);
      expect(canOperateConversation(operator, conversation)).toBe(area === target);
    }
  });
});

describe("contrato completo de reglas acordadas", () => {
  test("migraciones conservan exactamente el inventario esperado", () => {
    const serialize = (rules: typeof expectedRules) => rules.map((rule) => JSON.stringify(rule)).sort();
    expect(serialize(seededRules.map((rule) => ({ area: rule.area_id.replace(/^area:/, ""), intent: rule.intent_key, group: rule.response_group_id })))).toEqual(serialize(expectedRules));
  });
  test.each(expectedRules)("$area / $intent / $group", ({ intent, group }) => {
    const expected = [...new Set(expectedRules.filter((rule) => rule.intent === intent && rule.group === group).map((rule) => rule.area))].sort();
    expect(names(deriveAreaIds({ intentKey: intent, responseGroupIds: group ? [group] : [] }, seededRules))).toEqual(expected);
  });
});

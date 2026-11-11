import initialCatalog from "../../data/bot-catalog-initial.json";
import {
  addProfessionalToCatalog,
  buildProfessionalAliases,
  renameProfessionalInCatalog,
  renameSpecialtyInCatalog,
} from "@/lib/catalog-editor";
import { validateManagedCatalog, type ManagedCatalog } from "@/lib/managed-catalog";
import { assignGroupToArea } from "@/lib/area-rules-admin";
import { createFakeSupabaseClient } from "../helpers/fake-supabase";

const fresh = () => structuredClone(initialCatalog) as unknown as ManagedCatalog;

describe("alias de profesionales", () => {
  test("incluye nombre, orden invertido y apellido", () => {
    expect(buildProfessionalAliases("Dra. Pérez María")).toEqual(["Pérez María", "María Pérez", "Pérez"]);
  });

  test("no repite el apellido si otro profesional ya lo usa", () => {
    expect(buildProfessionalAliases("Segovia Juan", ["Segovia"])).toEqual(["Segovia Juan", "Juan Segovia"]);
  });
});

describe("agregar y renombrar desde el panel", () => {
  test("agrega un profesional con bloque propio, alias y estado pendiente", () => {
    const catalog = fresh();
    const { groupId, intent } = addProfessionalToCatalog(catalog, {
      name: "Pérez María",
      specialty: "Dermatología",
      body: "La Dra. Pérez atiende con turno previo. WhatsApp +5492974192007.",
    });
    expect(intent).toBe("ATENCION_MEDICA_DERMATOLOGIA");
    const professional = catalog.professionals.at(-1)!;
    expect(professional).toMatchObject({ name: "Pérez María", responseGroupId: groupId, reviewStatus: "pending", available: true });
    expect(professional.aliases).toContain("María Pérez");
    const group = catalog.professionalResponseGroups.find((item) => item.id === groupId)!;
    expect(group).toMatchObject({ specialty: "Dermatología", reviewStatus: "pending" });
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
  });

  test("rechaza duplicados y especialidades inexistentes", () => {
    const catalog = fresh();
    expect(() => addProfessionalToCatalog(catalog, { name: "Segovia Marcelo", specialty: "Cardiología", body: "x" })).toThrow(/Ya existe/);
    expect(() => addProfessionalToCatalog(catalog, { name: "Nuevo Doc", specialty: "Inventada", body: "x" })).toThrow(/no existe/);
  });

  test("renombrar un profesional conserva los alias anteriores", () => {
    const catalog = fresh();
    const index = catalog.professionals.findIndex((item) => item.name === "Segovia Marcelo");
    const before = [...catalog.professionals[index].aliases];
    renameProfessionalInCatalog(catalog, index, "Segovia Marcelo Daniel");
    expect(catalog.professionals[index].name).toBe("Segovia Marcelo Daniel");
    for (const alias of before) expect(catalog.professionals[index].aliases).toContain(alias);
  });

  test("renombrar una especialidad actualiza profesionales y bloques sin cambiar el intent", () => {
    const catalog = fresh();
    const index = catalog.medicalServices.findIndex((item) => item.title === "Ginecología");
    const intent = catalog.medicalServices[index].intent;
    renameSpecialtyInCatalog(catalog, index, "Ginecología y Mastología");
    expect(catalog.medicalServices[index]).toMatchObject({ title: "Ginecología y Mastología", intent });
    expect(catalog.medicalServices[index].matchers).toContain("Ginecología y Mastología");
    expect(catalog.professionals.filter((item) => item.specialty === "Ginecología y Mastología")).not.toHaveLength(0);
    expect(catalog.professionals.some((item) => item.specialty === "Ginecología")).toBe(false);
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
  });
});

describe("Clínica Médica usa el mensaje de Médicos clínicos", () => {
  test("se puede publicar aunque su texto propio esté vacío", () => {
    const catalog = fresh();
    const service = catalog.medicalServices.find((item) => item.intent === "ATENCION_MEDICA_CLINICA_MEDICA")!;
    service.generalBody = "";
    service.customBody = "";
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
  });

  test("otra especialidad sin contenido sigue fallando", () => {
    const catalog = fresh();
    const service = catalog.medicalServices.find((item) => item.intent === "ATENCION_MEDICA_ONCOLOGIA")!;
    catalog.professionalResponseGroups = catalog.professionalResponseGroups.filter((group) => group.specialty !== service.title);
    catalog.professionals = catalog.professionals.filter((item) => item.specialty !== service.title);
    service.generalBody = "";
    service.customBody = "";
    expect(validateManagedCatalog(catalog).errors.join(" ")).toContain("no tiene contenido disponible");
  });
});

describe("derivación por sector de un profesional nuevo", () => {
  function setup() {
    const catalog = fresh();
    const { groupId } = addProfessionalToCatalog(catalog, { name: "Pérez María", specialty: "Dermatología", body: "Atiende con turno." });
    const client = createFakeSupabaseClient({
      areas: [{ id: "a-anexo", name: "Anexo" }, { id: "a-pasaje", name: "Pasaje" }],
      area_rules: [{ area_id: "a-anexo", intent_key: "ATENCION_MEDICA_DERMATOLOGIA", response_group_id: null }],
    });
    return { catalog, groupId, client };
  }

  test("crea la regla del nuevo profesional y conserva a los existentes", async () => {
    const { catalog, groupId, client } = setup();
    await assignGroupToArea({ supabase: client as never, catalog, groupId, areaName: "Pasaje" });
    const rules = client.table("area_rules");
    expect(rules).toContainEqual(expect.objectContaining({ area_id: "a-pasaje", response_group_id: groupId }));
    // Romero (bloque existente) mantiene Anexo al pasar la especialidad a reglas por profesional.
    expect(rules).toContainEqual(expect.objectContaining({ area_id: "a-anexo", response_group_id: "dermatologia_romero" }));
  });

  test("es idempotente y rechaza sectores inexistentes", async () => {
    const { catalog, groupId, client } = setup();
    await assignGroupToArea({ supabase: client as never, catalog, groupId, areaName: "Pasaje" });
    const count = client.table("area_rules").length;
    await assignGroupToArea({ supabase: client as never, catalog, groupId, areaName: "Pasaje" });
    expect(client.table("area_rules")).toHaveLength(count);
    await expect(assignGroupToArea({ supabase: client as never, catalog, groupId, areaName: "Nada" })).rejects.toThrow(/no existe/);
  });
});

import initialCatalog from "../../data/bot-catalog-initial.json";
import { activateCatalog } from "@/lib/bot-catalog";
import { detectImagingStudy, detectInsuranceInquiry, detectSpecialty } from "@/lib/bot-core";
import {
  addImagingStudyToCatalog,
  addInsurancePlanToCatalog,
  addMedicalServiceToCatalog,
} from "@/lib/catalog-editor";
import { managedCatalogSchema, validateManagedCatalog, type ManagedCatalog } from "@/lib/managed-catalog";

const fresh = () => structuredClone(managedCatalogSchema.parse(initialCatalog)) as ManagedCatalog;

describe("alta de obras sociales", () => {
  test("agrega al final con alias, pendiente de revisión", () => {
    const catalog = fresh();
    const before = catalog.insurancePlans.length;
    addInsurancePlanToCatalog(catalog, { name: "Salud Patagónica", aliases: "SaludPat, Salud Pat" });
    expect(catalog.insurancePlans).toHaveLength(before + 1);
    expect(catalog.insurancePlans.at(-1)).toMatchObject({ name: "Salud Patagónica", available: true, reviewStatus: "pending" });
    expect(catalog.insurancePlans.at(-1)!.aliases).toEqual(["Salud Patagónica", "SaludPat", "Salud Pat"]);
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
  });

  test("rechaza duplicados por nombre o alias", () => {
    const catalog = fresh();
    const existing = catalog.insurancePlans[0];
    expect(() => addInsurancePlanToCatalog(catalog, { name: existing.name })).toThrow(/Ya existe/);
    expect(() => addInsurancePlanToCatalog(catalog, { name: "Otra", aliases: existing.aliases[0] })).toThrow(/Ya existe/);
    expect(() => addInsurancePlanToCatalog(catalog, { name: "  " })).toThrow(/obligatorio/);
  });

  test("el bot reconoce la obra social nueva tras activar el catálogo", () => {
    const catalog = fresh();
    addInsurancePlanToCatalog(catalog, { name: "Salud Patagónica" });
    activateCatalog(catalog);
    expect(detectInsuranceInquiry("¿Trabajan con Salud Patagónica?")).toEqual({ kind: "accepted", planName: "Salud Patagónica" });
  });
});

describe("alta de estudios", () => {
  test("agrega con intent propio y lo reconoce el bot", () => {
    const catalog = fresh();
    const { intent } = addImagingStudyToCatalog(catalog, {
      title: "Capilaroscopía",
      body: "Se realiza con turno previo. WhatsApp +5492974192007.",
      synonyms: "capilaroscopia",
    });
    expect(intent).toBe("ESTUDIO_CAPILAROSCOPIA");
    expect(catalog.imagingStudies.at(-1)).toMatchObject({ reviewStatus: "pending", sourceCell: "panel", phones: ["+5492974192007"] });
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
    activateCatalog(catalog);
    expect(detectImagingStudy("quiero turno para una capilaroscopia")?.intent).toBe(intent);
  });

  test("rechaza nombre repetido y matcher que ya usa otro estudio", () => {
    const catalog = fresh();
    const existing = catalog.imagingStudies[0];
    expect(() => addImagingStudyToCatalog(catalog, { title: existing.title, body: "x" })).toThrow(/Ya existe/);
    expect(() => addImagingStudyToCatalog(catalog, { title: "Nuevo", body: "x", synonyms: existing.matchers[0] })).toThrow(/ya lo usa/);
  });
});

describe("alta de especialidades", () => {
  test("agrega al final, queda pendiente y el bot responde con su texto general", () => {
    const catalog = fresh();
    const before = catalog.medicalServices.length;
    const { intent } = addMedicalServiceToCatalog(catalog, {
      title: "Oftalmología",
      body: "Atención con turno previo.",
      synonyms: "oftalmologo",
    });
    expect(intent).toBe("ATENCION_MEDICA_OFTALMOLOGIA");
    expect(catalog.medicalServices).toHaveLength(before + 1);
    expect(catalog.medicalServices.at(-1)).toMatchObject({ title: "Oftalmología", reviewStatus: "pending", customBody: "" });
    expect(validateManagedCatalog(catalog).errors).toEqual([]);
    activateCatalog(catalog);
    expect(detectSpecialty("necesito un oftalmologo")).toMatchObject({ intent, body: "Atención con turno previo." });
  });

  test("rechaza duplicados y matchers repetidos", () => {
    const catalog = fresh();
    const existing = catalog.medicalServices[0];
    expect(() => addMedicalServiceToCatalog(catalog, { title: existing.title, body: "x" })).toThrow(/Ya existe/);
    expect(() => addMedicalServiceToCatalog(catalog, { title: "Otra", body: "x", synonyms: existing.matchers[0] })).toThrow(/ya lo usa/);
    expect(() => addMedicalServiceToCatalog(catalog, { title: "Otra", body: " " })).toThrow(/obligatorio/);
  });
});

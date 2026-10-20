import initialCatalog from "../../data/bot-catalog-initial.json";
import {
  editorialState,
  pendingEntryCount,
  phonesIn,
  specialtyEditorModel,
} from "@/lib/catalog-editor";
import { managedCatalogSchema } from "@/lib/managed-catalog";

function catalog() {
  return structuredClone(managedCatalogSchema.parse(initialCatalog));
}

describe("catalog editor presentation model", () => {
  test("explains a specialty without general text through its real professional blocks", () => {
    const source = catalog();
    const intent = source.medicalServices.find((item) => item.title === "Cardiología")!.intent;
    const model = specialtyEditorModel(source, intent);

    expect(model?.generalBody).toBe("");
    expect(model?.activeBlockCount).toBe(4);
    expect(model?.blocks.map((block) => block.title)).toEqual([
      "Respuesta de Segovia Néstor",
      "Respuesta de Kurta Leonardo",
      "Respuesta de Bossio Ariel",
      "Respuesta de Moguilner Alejandro",
    ]);
    expect(model?.preview).toContain("El Dr. Segovia Néstor");
    expect(model?.preview).toContain("El Dr. Alejandro Moguilner");
  });

  test("keeps a specialty general text separate from the complete preview", () => {
    const source = catalog();
    const service = source.medicalServices.find((item) => item.title === "Clínica Médica");
    expect(service).toBeDefined();

    const model = specialtyEditorModel(source, service!.intent);
    expect(model?.generalBody).toContain("La atención de médicos clínicos");
    expect(model?.blocks).toHaveLength(0);
    expect(model?.preview).toBe(model?.generalBody);
  });

  test("previews the custom body alone when a specialty overrides its automatic assembly", () => {
    const source = catalog();
    const service = source.medicalServices.find((item) => item.title === "Cardiología")!;
    service.customBody = "Cardiología atiende únicamente con turno previo.";

    const model = specialtyEditorModel(source, service.intent);
    expect(model?.customBody).toBe("Cardiología atiende únicamente con turno previo.");
    expect(model?.usesCustomBody).toBe(true);
    expect(model?.preview).toBe("Cardiología atiende únicamente con turno previo.");
  });

  test("derives phones from the owning block and reflects a single source edit", () => {
    const source = catalog();
    const group = source.professionalResponseGroups.find((item) => item.id === "cardiologia_bossio");
    expect(group).toBeDefined();
    expect(phonesIn(group!.body)).toEqual(["+5492974192007"]);

    group!.body = group!.body.replace("+5492974192007", "+5492974352470");
    const intent = source.medicalServices.find((item) => item.title === "Cardiología")!.intent;
    const model = specialtyEditorModel(source, intent);
    const block = model?.blocks.find((item) => item.id === group!.id);
    expect(block?.phones).toEqual(["+5492974352470"]);
    expect(block?.body).toBe(group!.body);
    expect(model?.preview).toContain("+5492974352470");
    expect(block?.body).not.toContain("+5492974192007");
  });

  test("reports the editorial workflow state in priority order", () => {
    expect(editorialState({ dirty: true, pendingCount: 3, hasDraft: true })).toBe("Cambios sin guardar");
    expect(editorialState({ dirty: false, pendingCount: 3, hasDraft: true })).toBe("Pendiente de revisión");
    expect(editorialState({ dirty: false, pendingCount: 0, hasDraft: true })).toBe("Borrador guardado");
    expect(editorialState({ dirty: false, pendingCount: 0, hasDraft: false })).toBe("Publicado");
  });

  test("counts the same pending entry types validated by the server", () => {
    const source = catalog();
    expect(pendingEntryCount(source)).toBe(0);
    source.medicalServices[0].reviewStatus = "pending";
    source.professionalResponseGroups[0].reviewStatus = "pending";
    source.professionals[0].reviewStatus = "pending";
    expect(pendingEntryCount(source)).toBe(3);
  });
});

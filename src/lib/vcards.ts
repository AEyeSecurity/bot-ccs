import { extractManagedPhones, type ManagedCatalog } from "./managed-catalog";

const directCards: Record<string, { key: string; name: string }> = {
  "ccs-laboratorio-clinico.vcf": { key: "laboratory", name: "CCS Laboratorio Clínico" },
  "ccs-estudios-patologia.vcf": { key: "reportsPathology", name: "CCS Estudios Patología" },
  "ccs-recetas-medicas.vcf": { key: "prescriptions", name: "CCS Recetas Médicas" },
  "ccs-telemedicina-dra-estrada.vcf": { key: "telemedicine", name: "CCS Telemedicina Dra. Estrada" },
};

const studyCards: Record<string, { intent: string; name: string }> = {
  "ccs-medicina-nuclear.vcf": { intent: "IMAGENES_MEDICINA_NUCLEAR", name: "CCS Medicina Nuclear" },
};

function renderCard(name: string, phones: string[]) {
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, "ORG:Clínica Cruz del Sur",
    ...phones.map((phone) => `TEL;TYPE=CELL:${phone}`), "END:VCARD", ""].join("\r\n");
}

export function buildVcard(catalog: ManagedCatalog, filename: string) {
  const directCard = Object.hasOwn(directCards, filename) ? directCards[filename] : undefined;
  if (directCard) {
    const entry = catalog.direct[directCard.key];
    if (!entry?.available) return null;
    const phones = extractManagedPhones(entry.body);
    return phones.length ? renderCard(directCard.name, phones) : null;
  }

  const studyCard = Object.hasOwn(studyCards, filename) ? studyCards[filename] : undefined;
  if (studyCard) {
    const study = catalog.imagingStudies.find((item) => item.intent === studyCard.intent);
    if (!study?.available) return null;
    const phones = extractManagedPhones(study.body);
    return phones.length ? renderCard(studyCard.name, phones) : null;
  }

  return null;
}

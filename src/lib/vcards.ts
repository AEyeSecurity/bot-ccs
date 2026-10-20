import { extractManagedPhones, type ManagedCatalog } from "./managed-catalog";

const cards: Record<string, { key: string; name: string }> = {
  "ccs-laboratorio-clinico.vcf": { key: "laboratory", name: "CCS Laboratorio Clínico" },
  "ccs-estudios-patologia.vcf": { key: "reportsPathology", name: "CCS Estudios Patología" },
  "ccs-recetas-medicas.vcf": { key: "prescriptions", name: "CCS Recetas Médicas" },
  "ccs-telemedicina-dra-estrada.vcf": { key: "telemedicine", name: "CCS Telemedicina Dra. Estrada" },
};

export function buildVcard(catalog: ManagedCatalog, filename: string) {
  const card = Object.hasOwn(cards, filename) ? cards[filename] : undefined;
  if (!card) return null;
  const entry = catalog.direct[card.key];
  if (!entry?.available) return null;
  const phones = extractManagedPhones(entry.body);
  if (!phones.length) return null;
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${card.name}`, "ORG:Clínica Cruz del Sur",
    ...phones.map((phone) => `TEL;TYPE=CELL:${phone}`), "END:VCARD", ""].join("\r\n");
}

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { mkdirSync } from "fs";
import * as XLSX from "xlsx";

const SHEET = "Banco de preguntas actualizado";
const BUILDINGS_SHEET = "Edificios, Áreas y Números";
const PROFESSIONALS_SHEET = "Profesionales";
const PROFESSIONAL_HEADERS = [
  "Nombre canónico",
  "Alias declarados",
  "Especialidad",
  "Subservicio",
  "Grupo de respuesta",
  "Mensaje exacto",
  "Orden",
  "Celda de origen",
];
const EXPECTED_HEADERS = {
  A4: "Turnos Médicos",
  C4: "Laboratorio Clínico",
  D4: "Informes Médicos",
  G4: "Recetas Médicas",
  H4: "Ubicación",
  I4: "Internación",
  J4: "Obras sociales",
  K4: "Guardia",
  L4: "Búsqueda laboral",
};
const DIRECT_CELLS = {
  laboratory: "C5",
  reportsImages: "D7",
  reportsPathology: "E7",
  reportsLaboratory: "F7",
  prescriptions: "G5",
  buildings: "H5",
  hospitalization: "I5",
  socialInsurance: "J5",
  guard: "K5",
  employment: "L5",
  clinicalMedicine: "A8",
  unavailableService: "A24",
};
const MEDICAL_CELLS = Array.from({ length: 18 }, (_, index) => `A${index + 6}`);
const IMAGING_CELLS = Array.from({ length: 19 }, (_, index) => `B${index + 6}`);
const MOBILE_PHONE = /(?<!\d)\+?\s*54\s*9(?:[\s-]*\d){10}(?!\d)/g;
const MOBILE_PHONE_PREFIX = /(?<!\d)\+?\s*54\s*9(?=[\s\d-])/;

function normalize(value) {
  return String(value).replace(/\r\n?/g, "\n").trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cellText(sheet, coordinate) {
  const value = sheet[coordinate]?.v;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required text at ${SHEET}!${coordinate}`);
  }
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizePhones(text) {
  const unmatchedPhone = text.replace(MOBILE_PHONE, "").match(MOBILE_PHONE_PREFIX)?.[0];
  if (unmatchedPhone) {
    throw new Error(`Invalid Argentine mobile phone near: ${unmatchedPhone}`);
  }
  const phones = [];
  const body = text.replace(MOBILE_PHONE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length !== 13 || !digits.startsWith("549")) {
      throw new Error(`Invalid Argentine mobile phone: ${match}`);
    }
    const phone = `+${digits}`;
    phones.push(phone);
    return phone;
  });
  return { body, phones: [...new Set(phones)] };
}

function slug(value) {
  const result = normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!result) throw new Error(`Cannot build intent from title: ${value}`);
  return result;
}

function serviceDetail(sheet, coordinate, prefix) {
  const { body: fullBody } = normalizePhones(cellText(sheet, coordinate));
  const [titleLine, ...bodyLines] = fullBody.split("\n");
  const title = titleLine.trim();
  if (!title) throw new Error(`Missing title at ${SHEET}!${coordinate}`);
  const body = bodyLines.join("\n").trim();
  if (!body) throw new Error(`Missing body at ${SHEET}!${coordinate}`);
  const { phones } = normalizePhones(body);
  return { intent: `${prefix}_${slug(title)}`, title, body, phones, sourceCell: coordinate };
}

function validateTitles(items, kind) {
  const seen = new Map();
  for (const item of items) {
    const key = normalize(item.title);
    if (seen.has(key)) throw new Error(`Duplicate ${kind} title ${item.title} at ${item.sourceCell} and ${seen.get(key)}`);
    seen.set(key, item.sourceCell);
  }
}

function extractTelemedicine(buildings) {
  const marker = "La Dra. Estrada brinda atención por telemedicina";
  const index = buildings.indexOf(marker);
  if (index < 0) throw new Error("Telemedicine text not found in H5");
  return buildings.slice(index).trim();
}

function extractInsurancePlans(body) {
  const introduction = "A continuación encontrará el listado de las obras sociales con convenio vigente en Clínica Cruz del Sur.";
  if (!body.startsWith(introduction)) {
    throw new Error(`Unexpected social insurance introduction at ${SHEET}!${DIRECT_CELLS.socialInsurance}`);
  }
  const plans = body.slice(introduction.length).split("\n").map((line) => line.trim()).filter(Boolean);
  if (plans.length !== 16) {
    throw new Error(`Expected 16 social insurance plans at ${SHEET}!${DIRECT_CELLS.socialInsurance}, found ${plans.length}`);
  }
  const normalizedPlans = plans.map(normalize);
  if (new Set(normalizedPlans).size !== plans.length) {
    throw new Error(`Duplicate social insurance plan at ${SHEET}!${DIRECT_CELLS.socialInsurance}`);
  }
  return plans;
}

function splitDeclaredValues(value) {
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function professionalRows(sheet, medicalServices) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (
    !rows.length ||
    PROFESSIONAL_HEADERS.some((header, index) => normalize(rows[0][index]) !== normalize(header)) ||
    rows[0].slice(PROFESSIONAL_HEADERS.length).some((value) => String(value).trim())
  ) {
    throw new Error(`Unexpected headers at ${PROFESSIONALS_SHEET}!A1:H1`);
  }

  const serviceByTitle = new Map(medicalServices.map((service) => [normalize(service.title), service]));
  const groups = new Map();
  const professionals = [];
  const aliasOwners = new Map();

  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const row = rows[index];
    if (row.every((value) => !String(value).trim())) continue;
    if (row.length < PROFESSIONAL_HEADERS.length) {
      throw new Error(`Incomplete professional row at ${PROFESSIONALS_SHEET}!A${rowNumber}:H${rowNumber}`);
    }

    const [nameValue, aliasesValue, specialtyValue, subservicesValue, groupValue, messageValue, orderValue, sourceCellValue] = row;
    const name = String(nameValue).trim();
    const aliases = [...new Set(splitDeclaredValues(aliasesValue))];
    const specialty = String(specialtyValue).trim();
    const subservices = [...new Set(splitDeclaredValues(subservicesValue))];
    const responseGroupId = String(groupValue).trim();
    const sourceCell = String(sourceCellValue).trim().toUpperCase();
    const order = Number(orderValue);
    const { body, phones } = normalizePhones(String(messageValue).replace(/\r\n?/g, "\n").trim());
    const service = serviceByTitle.get(normalize(specialty));

    if (!name) throw new Error(`Missing professional name at ${PROFESSIONALS_SHEET}!A${rowNumber}`);
    if (!aliases.length) throw new Error(`Missing aliases at ${PROFESSIONALS_SHEET}!B${rowNumber}`);
    if (!aliases.some((alias) => normalize(alias) === normalize(name))) {
      throw new Error(`Canonical name must be a declared alias at ${PROFESSIONALS_SHEET}!B${rowNumber}`);
    }
    if (!service) throw new Error(`Unknown or missing specialty at ${PROFESSIONALS_SHEET}!C${rowNumber}`);
    if (!responseGroupId) throw new Error(`Missing response group at ${PROFESSIONALS_SHEET}!E${rowNumber}`);
    if (!body) throw new Error(`Missing response text at ${PROFESSIONALS_SHEET}!F${rowNumber}`);
    if (!Number.isInteger(order) || order < 1) throw new Error(`Invalid order at ${PROFESSIONALS_SHEET}!G${rowNumber}`);
    if (sourceCell !== service.sourceCell) {
      throw new Error(`Source cell ${sourceCell} does not match ${specialty} at ${PROFESSIONALS_SHEET}!H${rowNumber}`);
    }
    if (!normalize(service.body).includes(normalize(body))) {
      throw new Error(`Response does not match ${SHEET}!${sourceCell} at ${PROFESSIONALS_SHEET}!F${rowNumber}`);
    }

    const existingGroup = groups.get(responseGroupId);
    const group = { id: responseGroupId, specialty, subservices, body, phones, order, sourceCell };
    if (existingGroup && JSON.stringify(existingGroup) !== JSON.stringify(group)) {
      throw new Error(`Response group ${responseGroupId} has inconsistent rows`);
    }
    groups.set(responseGroupId, group);

    for (const alias of aliases) {
      const key = normalize(alias);
      const owners = aliasOwners.get(key) || new Set();
      owners.add(responseGroupId);
      aliasOwners.set(key, owners);
    }

    professionals.push({ name, aliases, specialty, subservices, responseGroupId, sourceCell });
  }

  for (const [alias, owners] of aliasOwners) {
    if (owners.size > 1 && alias.split(" ").length > 1) {
      throw new Error(`Ambiguous multi-word professional alias: ${alias}`);
    }
  }

  const canonicalNames = new Set();
  for (const professional of professionals) {
    const key = normalize(professional.name);
    if (canonicalNames.has(key)) throw new Error(`Duplicate professional: ${professional.name}`);
    canonicalNames.add(key);
  }

  return { professionals, professionalResponseGroups: [...groups.values()] };
}

function main() {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    throw new Error("Usage: npm run catalog:import -- <input.xlsx> <output.ts>");
  }

  const workbook = XLSX.read(readFileSync(input), { cellFormula: true, cellText: false, cellNF: false });
  if (
    workbook.SheetNames.length !== 3 ||
    workbook.SheetNames[0] !== SHEET ||
    workbook.SheetNames[1] !== BUILDINGS_SHEET ||
    workbook.SheetNames[2] !== PROFESSIONALS_SHEET
  ) {
    throw new Error("Unexpected workbook sheets");
  }
  const buildingsSheet = workbook.Sheets[BUILDINGS_SHEET];
  if (normalize(cellText(buildingsSheet, "B1")) !== normalize("Sector A | Guardia")) {
    throw new Error("Unexpected buildings sheet layout");
  }

  for (const name of workbook.SheetNames) {
    for (const cell of Object.values(workbook.Sheets[name])) {
      if (cell && typeof cell === "object" && "f" in cell) {
        throw new Error(`Unexpected formula in ${name}`);
      }
    }
  }

  const sheet = workbook.Sheets[SHEET];
  for (const [coordinate, expected] of Object.entries(EXPECTED_HEADERS)) {
    if (normalize(cellText(sheet, coordinate)) !== normalize(expected)) {
      throw new Error(`Unexpected header at ${SHEET}!${coordinate}`);
    }
  }

  const direct = Object.fromEntries(
    Object.entries(DIRECT_CELLS).map(([key, coordinate]) => {
      const { body, phones } = normalizePhones(cellText(sheet, coordinate));
      return [key, { body, phones, sourceCell: coordinate }];
    }),
  );
  direct.socialInsurance.plans = extractInsurancePlans(direct.socialInsurance.body);
  const medicalServices = MEDICAL_CELLS.map((coordinate) => serviceDetail(sheet, coordinate, "ATENCION_MEDICA"));
  const imagingStudies = IMAGING_CELLS.map((coordinate) => serviceDetail(sheet, coordinate, "IMAGENES"));
  validateTitles(medicalServices, "medical service");
  validateTitles(imagingStudies, "imaging study");
  direct.clinicalMedicine = {
    body: medicalServices.find((service) => service.sourceCell === DIRECT_CELLS.clinicalMedicine).body,
    phones: medicalServices.find((service) => service.sourceCell === DIRECT_CELLS.clinicalMedicine).phones,
    sourceCell: DIRECT_CELLS.clinicalMedicine,
  };
  const { professionals, professionalResponseGroups } = professionalRows(workbook.Sheets[PROFESSIONALS_SHEET], medicalServices);

  const catalog = {
    source: { workbook: input.split(/[\\/]/).at(-1), sheet: SHEET },
    greeting: cellText(sheet, "A1"),
    direct,
    telemedicine: extractTelemedicine(direct.buildings.body),
    medicalServices,
    imagingStudies,
    professionalResponseGroups,
    professionals,
  };
  const content = [
    "// Generated by scripts/import-bot-2026.mjs. Do not edit manually.",
    "",
    `export const BOT_2026_DATA = ${JSON.stringify(catalog, null, 2)} as const;`,
    "",
    "export type Bot2026Service = (typeof BOT_2026_DATA.medicalServices)[number];",
    "export type Bot2026ImagingStudy = (typeof BOT_2026_DATA.imagingStudies)[number];",
    "export type Bot2026ProfessionalResponseGroup = (typeof BOT_2026_DATA.professionalResponseGroups)[number];",
    "export type Bot2026Professional = (typeof BOT_2026_DATA.professionals)[number];",
    "",
  ].join("\n");
  const outputPath = resolve(output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  console.log(
    `Imported ${medicalServices.length} medical services, ${imagingStudies.length} imaging studies, ` +
      `${professionalResponseGroups.length} response groups and ${professionals.length} professionals`,
  );
}

main();

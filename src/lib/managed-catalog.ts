import { z } from "zod";

export const REVIEW_STATES = ["reviewed", "pending"] as const;

const reviewState = z.enum(REVIEW_STATES);
const phone = z.string().regex(/^\+549\d{10}$/, "El teléfono debe usar el formato +549XXXXXXXXXX");
const textEntry = z.object({
  body: z.string().trim().min(1),
  reviewStatus: reviewState,
});
const contentEntry = textEntry.extend({
  available: z.boolean(),
  phones: z.array(phone),
});

export const managedCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  messages: z.record(z.string(), textEntry),
  direct: z.record(z.string(), contentEntry),
  medicalServices: z.array(
    z.object({
      intent: z.string().min(1),
      title: z.string().min(1),
      matchers: z.array(z.string().min(1)).min(1),
      generalBody: z.string(),
      phones: z.array(phone),
      sourceCell: z.string().min(1),
      available: z.boolean(),
      reviewStatus: reviewState,
    }),
  ),
  imagingStudies: z.array(
    z.object({
      intent: z.string().min(1),
      title: z.string().min(1),
      matchers: z.array(z.string().min(1)).min(1),
      body: z.string().trim().min(1),
      phones: z.array(phone),
      sourceCell: z.string().min(1),
      available: z.boolean(),
      reviewStatus: reviewState,
    }),
  ),
  professionalResponseGroups: z.array(
    z.object({
      id: z.string().min(1),
      specialty: z.string().min(1),
      subservices: z.array(z.string()),
      body: z.string().trim().min(1),
      phones: z.array(phone),
      order: z.number().int().positive(),
      sourceCell: z.string().min(1),
      available: z.boolean(),
      reviewStatus: reviewState,
      includeServiceGeneral: z.boolean(),
    }),
  ),
  professionals: z.array(
    z.object({
      name: z.string().min(1),
      aliases: z.array(z.string().min(1)).min(1),
      specialty: z.string().min(1),
      subservices: z.array(z.string()),
      responseGroupId: z.string().min(1),
      sourceCell: z.string().min(1),
      available: z.boolean(),
      reviewStatus: reviewState,
    }),
  ),
  insurancePlans: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      aliases: z.array(z.string().min(1)).min(1),
      available: z.boolean(),
      reviewStatus: reviewState,
    }),
  ),
});

export type ManagedCatalog = z.infer<typeof managedCatalogSchema>;
export type ManagedCatalogMessageKey = keyof ManagedCatalog["messages"];

export const REQUIRED_MESSAGE_KEYS = [
  "greetingQuestion", "greetingThanks", "unavailableService", "medicalAppointmentIntro",
  "medicalAppointmentHandoff", "imagingAppointmentIntro", "imagingAppointmentHandoff",
  "reportsHandoff", "insuranceHandoff", "otherConsultIntro", "otherConsultHandoff",
  "outOfScope", "turnServicePrompt", "patientIdentityPrompt", "insurancePrompt",
  "availabilityPrompt", "imagingStudyPrompt", "reportsPatientPrompt", "reportsDniPrompt",
  "reportsStudyDatePrompt", "insuranceReasonPrompt", "otherConsultPrompt", "telemedicineIntro",
  "telemedicineCityPrompt", "surgerySelector", "cardosoSelector", "unknownServicePrompt",
] as const;

export const REQUIRED_DIRECT_KEYS = [
  "laboratory", "reportsImages", "reportsPathology", "reportsLaboratory", "prescriptions",
  "buildings", "hospitalization", "guard", "employment", "clinicalMedicine", "telemedicine",
  "socialInsurance",
] as const;

const mobileCandidate = /(?<!\d)\+?\s*54\s*9(?:[\s-]*\d){10}(?!\d)/g;
const mobilePrefix = /(?<!\d)\+?\s*54\s*9(?=[\s\d-])/;

export function extractManagedPhones(body: string) {
  const matches = [...body.matchAll(mobileCandidate)].map((match) => `+${match[0].replace(/\D/g, "")}`);
  if (body.replace(mobileCandidate, "").match(mobilePrefix)) {
    throw new Error("Se encontró un teléfono argentino incompleto");
  }
  for (const value of matches) phone.parse(value);
  return [...new Set(matches)];
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  }
  return [...duplicates];
}

export function validateManagedCatalog(input: unknown, options: { requireReviewed?: boolean } = {}) {
  const catalog = managedCatalogSchema.parse(input);
  const errors: string[] = [];
  const pending: string[] = [];

  for (const key of REQUIRED_MESSAGE_KEYS) {
    if (!catalog.messages[key]) errors.push(`Falta el mensaje obligatorio ${key}`);
  }
  for (const key of REQUIRED_DIRECT_KEYS) {
    if (!catalog.direct[key]) errors.push(`Falta el servicio obligatorio ${key}`);
  }

  const inspectEntry = (label: string, entry: { body?: string; phones?: string[]; reviewStatus: string }) => {
    if (entry.body !== undefined) {
      const detected = extractManagedPhones(entry.body);
      if (JSON.stringify(detected) !== JSON.stringify(entry.phones || [])) {
        errors.push(`${label}: la lista de teléfonos no coincide con el texto`);
      }
    }
    if (entry.reviewStatus === "pending") pending.push(label);
  };

  for (const [key, entry] of Object.entries(catalog.messages)) inspectEntry(`Mensaje ${key}`, entry);
  for (const [key, entry] of Object.entries(catalog.direct)) inspectEntry(`Servicio ${key}`, entry);
  for (const item of catalog.medicalServices) inspectEntry(`Especialidad ${item.title}`, { ...item, body: item.generalBody });
  for (const item of catalog.imagingStudies) inspectEntry(`Estudio ${item.title}`, item);
  for (const item of catalog.professionalResponseGroups) inspectEntry(`Bloque ${item.id}`, item);
  for (const item of catalog.professionals) {
    if (item.reviewStatus === "pending") pending.push(`Profesional ${item.name}`);
  }
  for (const item of catalog.insurancePlans) {
    if (item.reviewStatus === "pending") pending.push(`Obra social ${item.name}`);
  }

  const serviceTitles = new Set(catalog.medicalServices.map((item) => item.title));
  const groupIds = new Set(catalog.professionalResponseGroups.map((item) => item.id));
  const duplicateIntents = duplicateValues([
    ...catalog.medicalServices.map((item) => item.intent),
    ...catalog.imagingStudies.map((item) => item.intent),
  ]);
  if (duplicateIntents.length) errors.push(`Intenciones duplicadas: ${duplicateIntents.join(", ")}`);
  const duplicateGroups = duplicateValues(catalog.professionalResponseGroups.map((item) => item.id));
  if (duplicateGroups.length) errors.push(`Grupos duplicados: ${duplicateGroups.join(", ")}`);
  const duplicatePlans = duplicateValues(catalog.insurancePlans.map((item) => item.name));
  if (duplicatePlans.length) errors.push(`Obras sociales duplicadas: ${duplicatePlans.join(", ")}`);

  const beginsWithTitle = (body: string, title: string) => {
    const firstLine = body.split(/\r?\n/).find((line) => line.trim()) || "";
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    return normalize(firstLine) === normalize(title);
  };
  for (const service of catalog.medicalServices) {
    if (service.generalBody && beginsWithTitle(service.generalBody, service.title)) {
      errors.push(`${service.title}: el título interno no debe aparecer en la respuesta`);
    }
  }
  for (const study of catalog.imagingStudies) {
    if (beginsWithTitle(study.body, study.title)) {
      errors.push(`${study.title}: el título interno no debe aparecer en la respuesta`);
    }
  }

  for (const group of catalog.professionalResponseGroups) {
    if (!serviceTitles.has(group.specialty)) errors.push(`El grupo ${group.id} no tiene una especialidad válida`);
  }
  for (const professional of catalog.professionals) {
    if (!serviceTitles.has(professional.specialty)) errors.push(`${professional.name} no tiene una especialidad válida`);
    if (!groupIds.has(professional.responseGroupId)) errors.push(`${professional.name} no tiene un bloque válido`);
  }
  for (const service of catalog.medicalServices.filter((item) => item.available)) {
    const hasGeneral = Boolean(service.generalBody.trim());
    const hasActiveGroup = catalog.professionalResponseGroups.some(
      (group) => group.specialty === service.title && group.available && catalog.professionals.some(
        (professional) => professional.responseGroupId === group.id && professional.available,
      ),
    );
    if (!hasGeneral && !hasActiveGroup) errors.push(`${service.title} está activa pero no tiene contenido disponible`);
  }

  if (options.requireReviewed && pending.length) errors.push(`Hay ${pending.length} registros pendientes de revisión`);
  return { catalog, errors, pending };
}

export function catalogHasPending(catalog: ManagedCatalog) {
  return validateManagedCatalog(catalog).pending.length > 0;
}

import { serviceFallbackBody, type ManagedCatalog } from "./managed-catalog";

export type SpecialtyResponseBlock = {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  phones: string[];
  available: boolean;
  reviewStatus: "reviewed" | "pending";
};

export function phonesIn(body: string) {
  return [...new Set(body.match(/\+549\d{10}/g) || [])];
}

export function joinReply(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join("\n\n");
}

export function specialtyEditorModel(catalog: ManagedCatalog, serviceIntent: string) {
  const service = catalog.medicalServices.find((item) => item.intent === serviceIntent);
  if (!service) return null;

  const blocks = catalog.professionalResponseGroups
    .filter((group) => group.specialty === service.title)
    .sort((left, right) => left.order - right.order)
    .map((group): SpecialtyResponseBlock => {
      const professionals = catalog.professionals.filter((item) => item.responseGroupId === group.id);
      const names = professionals.map((item) => item.name);
      const availableNames = professionals.filter((item) => item.available).map((item) => item.name);
      return {
        id: group.id,
        title: names.length > 1 ? `Respuesta compartida: ${names.join(", ")}` : `Respuesta de ${names[0] || group.id}`,
        subtitle: group.subservices.length ? group.subservices.join(" · ") : service.title,
        body: group.body,
        phones: phonesIn(group.body),
        available: group.available && availableNames.length > 0,
        reviewStatus: group.reviewStatus === "pending" || professionals.some((item) => item.reviewStatus === "pending")
          ? "pending"
          : "reviewed",
      };
    });

  const activeBodies = blocks
    .filter((block) => block.available)
    .map((block) => block.body);

  const usesCustomBody = Boolean(service.customBody.trim());
  const fallbackBody = service.generalBody.trim() ? "" : serviceFallbackBody(catalog, service.intent);

  return {
    generalBody: service.generalBody,
    generalPhones: phonesIn(service.generalBody || fallbackBody),
    usesSharedMessage: Boolean(fallbackBody),
    customBody: service.customBody,
    customPhones: phonesIn(service.customBody),
    usesCustomBody,
    blocks,
    preview: usesCustomBody ? service.customBody : joinReply([service.generalBody || fallbackBody, ...activeBodies]),
    activeBlockCount: activeBodies.length,
  };
}

export function pendingEntryCount(catalog: ManagedCatalog) {
  return [
    ...Object.values(catalog.messages),
    ...Object.values(catalog.direct),
    ...catalog.medicalServices,
    ...catalog.imagingStudies,
    ...catalog.professionalResponseGroups,
    ...catalog.professionals,
    ...catalog.insurancePlans,
  ].filter((item) => item.reviewStatus === "pending").length;
}

export function editorialState(args: {
  dirty: boolean;
  pendingCount: number;
  hasDraft: boolean;
}) {
  if (args.dirty) return "Cambios sin guardar";
  if (args.pendingCount > 0) return "Pendiente de revisión";
  if (args.hasDraft) return "Borrador guardado";
  return "Publicado";
}

// ---------------------------------------------------------------------------
// Edición de nombres y alta de profesionales desde el panel.
// ---------------------------------------------------------------------------

export function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function slugify(value: string) {
  return normalizeLabel(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function uniqueLabels(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeLabel(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Alias que el bot reconoce para un profesional. Convención del catálogo: "Apellido Nombre".
// El apellido solo (primera palabra) se agrega si ningún otro profesional ya lo usa.
export function buildProfessionalAliases(name: string, takenAliases: string[] = []) {
  const clean = name.replace(/^(?:dr|dra)\.?\s+/i, "").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  const aliases = [clean];
  if (words.length === 2) aliases.push(`${words[1]} ${words[0]}`);
  const taken = new Set(takenAliases.map(normalizeLabel));
  if (words.length > 1 && words[0].length >= 3 && !taken.has(normalizeLabel(words[0]))) aliases.push(words[0]);
  return uniqueLabels(aliases);
}

export type NewProfessionalInput = {
  name: string;
  specialty: string;
  body: string;
};

export function addProfessionalToCatalog(catalog: ManagedCatalog, input: NewProfessionalInput) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const body = input.body.trim();
  if (!name) throw new Error("El nombre del profesional es obligatorio");
  if (!body) throw new Error("El texto de respuesta es obligatorio");
  const service = catalog.medicalServices.find((item) => item.title === input.specialty);
  if (!service) throw new Error("La especialidad no existe");
  if (catalog.professionals.some((item) => normalizeLabel(item.name) === normalizeLabel(name))) {
    throw new Error("Ya existe un profesional con ese nombre");
  }

  const sameSpecialty = catalog.professionalResponseGroups.filter((group) => group.specialty === service.title);
  const baseId = `${slugify(service.title)}_${slugify(name.split(" ")[0])}`;
  const existingIds = new Set(catalog.professionalResponseGroups.map((group) => group.id));
  let id = baseId;
  for (let n = 2; existingIds.has(id); n += 1) id = `${baseId}_${n}`;

  catalog.professionalResponseGroups.push({
    id,
    specialty: service.title,
    subservices: [],
    body,
    phones: phonesIn(body),
    order: Math.max(0, ...sameSpecialty.map((group) => group.order)) + 1,
    sourceCell: "panel",
    available: true,
    reviewStatus: "pending",
    includeServiceGeneral: sameSpecialty[0]?.includeServiceGeneral ?? false,
  });
  catalog.professionals.push({
    name,
    aliases: buildProfessionalAliases(name, catalog.professionals.flatMap((item) => item.aliases)),
    specialty: service.title,
    subservices: [],
    responseGroupId: id,
    sourceCell: "panel",
    available: true,
    reviewStatus: "pending",
  });
  return { groupId: id, intent: service.intent };
}

// ---------------------------------------------------------------------------
// Altas de obras sociales, estudios y especialidades (solo admin; siempre al final de la lista).
// ---------------------------------------------------------------------------

function splitExtras(extras: string | string[] | undefined) {
  const list = Array.isArray(extras) ? extras : (extras || "").split(/[,;\n]/);
  return list.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function uniqueKey(base: string, existing: Iterable<string>, separator = "_") {
  const taken = new Set(existing);
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}${separator}${n}`;
  return key;
}

// Un matcher nuevo no puede coincidir con el de otra especialidad o estudio (capturaría sus consultas).
function assertMatchersFree(catalog: ManagedCatalog, matchers: string[]) {
  const used = new Map<string, string>();
  for (const item of [...catalog.medicalServices, ...catalog.imagingStudies]) {
    for (const matcher of item.matchers) used.set(normalizeLabel(matcher), item.title);
  }
  for (const matcher of matchers) {
    const owner = used.get(normalizeLabel(matcher));
    if (owner) throw new Error(`"${matcher}" ya lo usa ${owner}. Use otro nombre o sinónimo.`);
  }
}

export type NewInsurancePlanInput = { name: string; aliases?: string | string[] };

export function addInsurancePlanToCatalog(catalog: ManagedCatalog, input: NewInsurancePlanInput) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("El nombre de la obra social es obligatorio");
  const aliases = uniqueLabels([name, ...splitExtras(input.aliases)]);
  const taken = new Set(catalog.insurancePlans.flatMap((plan) => [plan.name, ...plan.aliases]).map(normalizeLabel));
  const clash = aliases.find((alias) => taken.has(normalizeLabel(alias)));
  if (clash) throw new Error(`Ya existe una obra social con el nombre o alias "${clash}"`);
  const id = uniqueKey(slugify(name) || "obra_social", catalog.insurancePlans.map((plan) => plan.id));
  catalog.insurancePlans.push({ id, name, aliases, available: true, reviewStatus: "pending" });
  return { id };
}

export type NewImagingStudyInput = { title: string; body: string; synonyms?: string | string[] };

export function addImagingStudyToCatalog(catalog: ManagedCatalog, input: NewImagingStudyInput) {
  const title = input.title.replace(/\s+/g, " ").trim();
  const body = input.body.trim();
  if (!title) throw new Error("El nombre del estudio es obligatorio");
  if (!body) throw new Error("El texto de respuesta es obligatorio");
  if (catalog.imagingStudies.some((item) => normalizeLabel(item.title) === normalizeLabel(title))) {
    throw new Error("Ya existe un estudio con ese nombre");
  }
  const matchers = uniqueLabels([title, ...splitExtras(input.synonyms)]);
  assertMatchersFree(catalog, matchers);
  const intent = uniqueKey(
    `ESTUDIO_${slugify(title).toUpperCase()}`,
    [...catalog.imagingStudies, ...catalog.medicalServices].map((item) => item.intent),
  );
  catalog.imagingStudies.push({
    intent, title, matchers, body, phones: phonesIn(body), sourceCell: "panel", available: true, reviewStatus: "pending",
  });
  return { intent };
}

export type NewMedicalServiceInput = { title: string; body: string; synonyms?: string | string[] };

export function addMedicalServiceToCatalog(catalog: ManagedCatalog, input: NewMedicalServiceInput) {
  const title = input.title.replace(/\s+/g, " ").trim();
  const body = input.body.trim();
  if (!title) throw new Error("El nombre de la especialidad es obligatorio");
  if (!body) throw new Error("El texto general de la especialidad es obligatorio");
  if (catalog.medicalServices.some((item) => normalizeLabel(item.title) === normalizeLabel(title))) {
    throw new Error("Ya existe una especialidad con ese nombre");
  }
  const matchers = uniqueLabels([title, ...splitExtras(input.synonyms)]);
  assertMatchersFree(catalog, matchers);
  const intent = uniqueKey(
    `ATENCION_MEDICA_${slugify(title).toUpperCase()}`,
    [...catalog.imagingStudies, ...catalog.medicalServices].map((item) => item.intent),
  );
  catalog.medicalServices.push({
    intent, title, matchers, generalBody: body, customBody: "", phones: phonesIn(body),
    sourceCell: "panel", available: true, reviewStatus: "pending",
  });
  return { intent };
}

export function renameProfessionalInCatalog(catalog: ManagedCatalog, index: number, rawName: string) {
  const professional = catalog.professionals[index];
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!professional || !name || name === professional.name) return;
  const others = catalog.professionals.filter((_, otherIndex) => otherIndex !== index);
  if (others.some((item) => normalizeLabel(item.name) === normalizeLabel(name))) {
    throw new Error("Ya existe un profesional con ese nombre");
  }
  // Se conservan los alias anteriores: quien escriba el nombre viejo sigue siendo reconocido.
  professional.aliases = uniqueLabels([
    ...buildProfessionalAliases(name, others.flatMap((item) => item.aliases)),
    ...professional.aliases,
  ]);
  professional.name = name;
}

export function renameSpecialtyInCatalog(catalog: ManagedCatalog, index: number, rawTitle: string) {
  const service = catalog.medicalServices[index];
  const title = rawTitle.replace(/\s+/g, " ").trim();
  if (!service || !title || title === service.title) return;
  if (catalog.medicalServices.some((item, otherIndex) => otherIndex !== index && normalizeLabel(item.title) === normalizeLabel(title))) {
    throw new Error("Ya existe una especialidad con ese nombre");
  }
  const previous = service.title;
  service.title = title;
  service.matchers = uniqueLabels([title, ...service.matchers]);
  for (const group of catalog.professionalResponseGroups) if (group.specialty === previous) group.specialty = title;
  for (const professional of catalog.professionals) if (professional.specialty === previous) professional.specialty = title;
}

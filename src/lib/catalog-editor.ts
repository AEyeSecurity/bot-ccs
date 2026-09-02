import type { ManagedCatalog } from "./managed-catalog";

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

  return {
    generalBody: service.generalBody,
    generalPhones: phonesIn(service.generalBody),
    blocks,
    preview: joinReply([service.generalBody, ...activeBodies]),
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

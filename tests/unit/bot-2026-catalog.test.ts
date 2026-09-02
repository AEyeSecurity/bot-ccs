import { BOT_2026_DATA } from "@/lib/bot-2026-data";
import {
  FLOWS,
  IMAGING_STUDIES,
  INSURANCE_PLANS,
  MEDICAL_SERVICES,
  PROFESSIONALS,
  PROFESSIONAL_RESPONSE_GROUPS,
} from "@/lib/bot-catalog";

const E164_ARGENTINE_MOBILE = /^\+549\d{10}$/;

function assertPhoneContract(body: string, phones: readonly string[]) {
  for (const phone of phones) {
    expect(phone).toMatch(E164_ARGENTINE_MOBILE);
    expect(body).toContain(phone);
  }
  expect(body).not.toMatch(/\+54\s+9\s+\d/);
}

describe("Bot 2026 static catalog", () => {
  test("keeps the imported direct content and visible mobile numbers", () => {
    for (const item of Object.values(BOT_2026_DATA.direct)) {
      expect(item.body).toBeTruthy();
      assertPhoneContract(item.body, item.phones);
    }
  });

  test("keeps every medical specialty and imaging study unique and complete", () => {
    const titles = [...MEDICAL_SERVICES, ...IMAGING_STUDIES].map((item) => item.title.normalize("NFD").toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(MEDICAL_SERVICES).toHaveLength(18);
    expect(IMAGING_STUDIES).toHaveLength(19);

    for (const item of [...MEDICAL_SERVICES, ...IMAGING_STUDIES]) {
      expect(item.body.trim()).not.toMatch(new RegExp(`^${item.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"));
      expect(item.body.trimStart().startsWith(`${item.title}\n`)).toBe(false);
      expect(item.matchers).toContain(item.title);
      assertPhoneContract(item.body, item.phones);
    }
  });

  test("keeps every professional mapped to one validated response group", () => {
    expect(PROFESSIONALS).toHaveLength(45);
    expect(PROFESSIONAL_RESPONSE_GROUPS).toHaveLength(45);
    const groupIds = new Set(PROFESSIONAL_RESPONSE_GROUPS.map((group) => group.id));

    for (const professional of PROFESSIONALS) {
      expect(professional.name).toBeTruthy();
      expect(professional.specialty).toBeTruthy();
      expect(professional.aliases.length).toBeGreaterThan(0);
      expect(groupIds.has(professional.responseGroupId)).toBe(true);
    }

    for (const group of PROFESSIONAL_RESPONSE_GROUPS) {
      expect(group.body).toBeTruthy();
      assertPhoneContract(group.body, group.phones);
      expect(MEDICAL_SERVICES.some((service) => service.title === group.specialty)).toBe(true);
    }
  });

  test("keeps the 16 canonical insurance plans unique and queryable", () => {
    expect(INSURANCE_PLANS).toHaveLength(16);
    expect(new Set(INSURANCE_PLANS.map((plan) => plan.name)).size).toBe(16);
    expect(INSURANCE_PLANS.find((plan) => plan.name === "CAJA DE SERVICIOS SOCIALES SANTA CRUZ")?.aliases).toEqual(
      expect.arrayContaining(["CSS", "Caja de Servicios Sociales de Santa Cruz"]),
    );
    expect(INSURANCE_PLANS.find((plan) => plan.name === "SANCOR")?.aliases).toContain("Sancor Salud");
    expect(INSURANCE_PLANS.find((plan) => plan.name === "SWISS MEDICAL")?.aliases).toContain("Swiss");
  });

  test("keeps surgery split into the supplied response groups", () => {
    const group = (id: string) => PROFESSIONAL_RESPONSE_GROUPS.find((item) => item.id === id);

    expect(group("cirugia_del_carpio")?.subservices).toContain("Cirugía general");
    expect(group("cirugia_cardoso_martin")?.subservices).toContain("Cirugía maxilofacial");
    expect(group("cirugia_soulergues")?.subservices).toEqual(
      expect.arrayContaining(["Cirugías estéticas y plásticas", "Cirugía vascular"]),
    );
    expect(group("cirugia_goldenberg")?.subservices).toContain("Cirugías estéticas y plásticas");
    expect(group("cirugia_goldenberg")?.body).toContain("especialista en cirugía plástica");
  });

  test("maps imported direct content to the current flows", () => {
    expect(FLOWS.LABORATORIO_CLINICO).toMatchObject({ body: BOT_2026_DATA.direct.laboratory.body });
    expect(FLOWS.RECETAS_MEDICAS).toMatchObject({ body: BOT_2026_DATA.direct.prescriptions.body });
    expect(FLOWS.INTERNACION).toMatchObject({ body: BOT_2026_DATA.direct.hospitalization.body });
    expect(FLOWS.NUESTROS_EDIFICIOS).toMatchObject({ body: BOT_2026_DATA.direct.buildings.body });
    expect(FLOWS.GUARDIA).toMatchObject({ body: BOT_2026_DATA.direct.guard.body });
    expect(FLOWS.BUSQUEDA_LABORAL).toMatchObject({ body: BOT_2026_DATA.direct.employment.body });
    expect(FLOWS.SERVICIO_NO_DISPONIBLE.body).toBe(BOT_2026_DATA.direct.unavailableService.body);
  });
});

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sourcePath = path.join(process.cwd(), "src", "lib", "bot-2026-data.ts");
const outputPath = path.join(process.cwd(), "data", "bot-catalog-initial.json");

function loadGeneratedData() {
  const source = fs
    .readFileSync(sourcePath, "utf8")
    .split(/\r?\nexport type/)[0]
    .replace(/^\/\/.*\r?\n\r?\n/, "")
    .replace("export const BOT_2026_DATA =", "globalThis.data =")
    .replace(/\s+as const;/g, ";");
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.data;
}

const serviceAliases = {
  "Cardiología": ["cardiólogo", "cardióloga"],
  "Cirugía": ["cirujano", "cirujana"],
  "Clínica Médica": ["médico generalista", "médica generalista", "generalista"],
  "Dermatología": ["dermatólogo", "dermatóloga"],
  "Diabetología": ["diabetólogo", "diabetóloga"],
  "Gastroenterología": ["gastroenterólogo", "gastroenteróloga"],
  "Ginecología y Obstetricia": ["ginecologia", "obstetricia", "ginecólogo", "ginecóloga", "obstetra"],
  "Nefrología": ["nefrólogo", "nefróloga"],
  "Neurología": ["neurólogo", "neuróloga"],
  "Nutrición": ["nutricionista"],
  "Oncología": ["oncólogo", "oncóloga"],
  "Psicología": ["psicólogo", "psicóloga"],
  "Pediatría": ["pediatra"],
  "Psiquiatría": ["psiquiatra"],
  "Reumatología": ["reumatólogo", "reumatóloga"],
  "Traumatología": ["traumatólogo", "traumatóloga"],
  "Urología": ["urólogo", "uróloga"],
  "Infectología": ["infectólogo", "infectóloga"],
};
const imagingAliases = {
  "Ecografía Doppler": ["ecodoppler", "ecodopler"],
  "Electrocardiograma (ECG)": ["electrocardiograma", "ecg"],
  "Radiografía": ["radiografia", "rx", "rayos x"],
  "Resonancia Magnética": ["resonancia"],
  "Tomografía computada": ["tomografia", "tac"],
};
const insuranceAliases = {
  "CAJA DE SERVICIOS SOCIALES SANTA CRUZ": ["CSS", "Caja de Servicios Sociales", "Caja de Servicios Sociales de Santa Cruz"],
  SANCOR: ["Sancor Salud"],
  "SWISS MEDICAL": ["Swiss"],
};

function phones(body) {
  return [...new Set([...String(body).matchAll(/(?<!\d)\+549\d{10}(?!\d)/g)].map((match) => match[0]))];
}

function reviewed(body, available = true) {
  return { body, phones: phones(body), available, reviewStatus: "reviewed" };
}

function removeBlocks(body, groups) {
  let result = body;
  for (const group of groups) result = result.replace(group.body, "");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

const data = loadGeneratedData();
const originalGroups = [...data.professionalResponseGroups];
const groupReplacements = new Map();
const groups = [];

for (const group of originalGroups) {
  if (group.id === "pediatria_serrano_ceballos") {
    const suffix = "puede hacerlo enviando un mensaje por WhatsApp al +5492974290998.";
    groups.push(
      { ...group, id: "pediatria_serrano", body: `Para solicitar un turno con el Dr. Serrano, ${suffix}`, phones: ["+5492974290998"] },
      { ...group, id: "pediatria_ceballos", body: `Para solicitar un turno con la Dra. Ceballos, ${suffix}`, phones: ["+5492974290998"], order: group.order + 1 },
    );
    groupReplacements.set("pediatria_serrano_ceballos", { Serrano: "pediatria_serrano", Ceballos: "pediatria_ceballos" });
    continue;
  }
  if (group.id === "traumatologia_equipo") {
    const members = [
      ["Longo", "traumatologia_longo", "Dr. Longo José - Sector C"],
      ["Castro", "traumatologia_castro", "Dr. Castro Germán - Sector C"],
      ["Vargas", "traumatologia_vargas", "Dr. Vargas Mario - Sector B"],
      ["Núñes", "traumatologia_nunes", "Dr. Núñes Gaspar - Sector B"],
      ["Juárez", "traumatologia_juarez", "Dr. Juárez Marcelo - Sector B"],
    ];
    const replacements = {};
    members.forEach(([name, id, body], index) => {
      groups.push({ ...group, id, body, phones: [], order: group.order + index });
      replacements[name] = id;
    });
    groupReplacements.set("traumatologia_equipo", replacements);
    continue;
  }
  groups.push(group);
}

const professionals = data.professionals.map((professional) => {
  const replacement = groupReplacements.get(professional.responseGroupId);
  let responseGroupId = professional.responseGroupId;
  if (replacement) {
    const key = Object.keys(replacement).find((name) => professional.name.includes(name));
    if (!key) throw new Error(`No replacement group for ${professional.name}`);
    responseGroupId = replacement[key];
  }
  return { ...professional, responseGroupId, available: true, reviewStatus: "reviewed" };
});

const traumaGeneral = originalGroups.find((group) => group.id === "traumatologia_equipo").body.split("\n\n")[0];
const medicalServices = data.medicalServices.map((service) => {
  const serviceGroups = originalGroups.filter((group) => group.specialty === service.title).sort((a, b) => a.order - b.order);
  let generalBody = removeBlocks(service.body, serviceGroups);
  if (service.title === "Traumatología") generalBody = traumaGeneral;
  return {
    intent: service.intent,
    title: service.title,
    matchers: [service.title, ...(serviceAliases[service.title] || [])],
    generalBody,
    phones: phones(generalBody),
    sourceCell: service.sourceCell,
    available: true,
    reviewStatus: "reviewed",
  };
});

const managedGroups = groups.map((group) => ({
  ...group,
  phones: phones(group.body),
  available: true,
  reviewStatus: "reviewed",
  includeServiceGeneral: group.id.startsWith("traumatologia_") && group.id !== "traumatologia_catullo",
}));

const direct = Object.fromEntries(
  Object.entries(data.direct)
    .filter(([key]) => key !== "socialInsurance" && key !== "unavailableService")
    .map(([key, value]) => [key, reviewed(value.body)]),
);
direct.telemedicine = reviewed(data.telemedicine);
direct.socialInsurance = reviewed("A continuación encontrará el listado de las obras sociales con convenio vigente en Clínica Cruz del Sur.");

const messages = Object.fromEntries(
  Object.entries({
    greetingQuestion: data.greeting,
    greetingThanks: "Gracias por comunicarse con Clínica Cruz del Sur.",
    unavailableService: data.direct.unavailableService.body,
    medicalAppointmentIntro: "Para ayudarle con el turno médico, voy a solicitarle algunos datos.",
    medicalAppointmentHandoff: "Gracias. Ya registramos su solicitud y la derivaremos al equipo correspondiente. Nos comunicaremos con usted a la brevedad con novedades.",
    imagingAppointmentIntro: "Para ayudarle con el turno de imágenes médicas, voy a solicitarle algunos datos.",
    imagingAppointmentHandoff: "Gracias. Ya registramos la solicitud para imágenes médicas y la derivaremos al equipo correspondiente. Nos comunicaremos con usted a la brevedad.",
    reportsHandoff: "Gracias. Ya registramos su solicitud de informes e imágenes médicas y la derivaremos al equipo correspondiente. Nos comunicaremos con usted a la brevedad.",
    insuranceHandoff: "Gracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades.",
    otherConsultIntro: "Voy a ayudarle a derivar la consulta con el sector indicado.",
    otherConsultHandoff: "Gracias. Derivaremos su consulta al sector correspondiente. Nos comunicaremos a la brevedad con novedades.",
    outOfScope: "Este canal no puede brindarle indicaciones médicas ni interpretar síntomas, diagnósticos, medicación o estudios. Si se trata de una urgencia o necesita evaluación clínica, le recomendamos asistir a la guardia o comunicarse con un profesional de salud.",
    turnServicePrompt: "Indíqueme, por favor, el profesional o servicio que necesita.",
    patientIdentityPrompt: "Ahora necesito el nombre completo del paciente y una foto clara del DNI, frente y dorso.",
    insurancePrompt: "También necesito el número de afiliado de la obra social o una foto clara de la credencial.",
    availabilityPrompt: "Por último, indíqueme la disponibilidad para asistir: días y horarios.",
    imagingStudyPrompt: "Indíqueme, por favor, qué estudio de imágenes necesita.",
    reportsPatientPrompt: "Indíqueme, por favor, el nombre completo del paciente.",
    reportsDniPrompt: "Ahora envíeme una foto clara del DNI, frente y dorso.",
    reportsStudyDatePrompt: "Por último, indíqueme el estudio y la fecha estimada de realización.",
    insuranceReasonPrompt: "Para derivarla correctamente, indíqueme brevemente en qué podemos ayudarle con su obra social.",
    otherConsultPrompt: "Cuénteme brevemente en qué podemos ayudarle para derivar su consulta con el equipo correspondiente.",
    telemedicineIntro: "Para orientarlo con la opción de telemedicina, necesito confirmar desde qué localidad nos escribe.",
    telemedicineCityPrompt: "Para orientarlo mejor, indíqueme desde qué localidad nos escribe. La telemedicina de la Dra. Estrada está pensada para pacientes que residen fuera de Caleta Olivia.",
    surgerySelector: "Muy bien, indíquenos si desea una consulta con cirugía general, maxilofacial o estética y plástica.",
    cardosoSelector: "Muy bien, para corroborar la información enviada puede indicarnos si desea una consulta con cirugía general o maxilofacial",
    unknownServicePrompt: "No pude identificar el profesional o servicio. Indíqueme, por favor, el nombre del profesional, la especialidad o el estudio que necesita.",
  }).map(([key, body]) => [key, { body, reviewStatus: "reviewed" }]),
);

const catalog = {
  schemaVersion: 1,
  messages,
  direct,
  medicalServices,
  imagingStudies: data.imagingStudies.map((study) => ({
    ...study,
    matchers: [study.title, ...(imagingAliases[study.title] || [])],
    available: true,
    reviewStatus: "reviewed",
  })),
  professionalResponseGroups: managedGroups,
  professionals,
  insurancePlans: data.direct.socialInsurance.plans.map((name) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name,
    aliases: [name, ...(insuranceAliases[name] || [])],
    available: true,
    reviewStatus: "reviewed",
  })),
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Generated ${outputPath}`);

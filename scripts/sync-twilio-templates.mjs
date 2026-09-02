import process from "node:process";
import { Client } from "pg";
import dotenv from "dotenv";
import Twilio from "twilio";

dotenv.config({ path: ".env.local" });
dotenv.config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function databaseUrl() {
  const value = required("SUPABASE_DB_URL");
  return process.env.SUPABASE_DB_PASSWORD
    ? value.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))
    : value;
}

const db = new Client({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
});
const twilio = Twilio(required("TWILIO_ACCOUNT_SID"), required("TWILIO_AUTH_TOKEN"));

const listTemplates = {
  ccs_bienvenida: {
    body: "Gracias por comunicarse con Clínica Cruz del Sur. Elija el motivo de su consulta para continuar.",
    button: "Elija motivo",
    items: [
      ["TURNOS_MEDICOS_SELECTOR", "Turnos Médicos"],
      ["LABORATORIO_CLINICO", "Laboratorio Clínico"],
      ["INFORMES_MEDICOS_SELECTOR", "Informes Médicos"],
      ["RECETAS_MEDICAS", "Recetas Médicas"],
      ["NUESTROS_EDIFICIOS", "Nuestros Edificios"],
      ["INTERNACION", "Internación"],
      ["OBRAS_SOCIALES", "Obras sociales"],
      ["MEDICOS_CLINICOS", "Médicos Clínicos"],
      ["OTRAS_CONSULTAS", "Otras consultas"],
    ],
  },
  ccs_menu_turnos: {
    body: "Seleccione una de las siguientes opciones. A la brevedad nuestros operadores se pondrán en contacto.",
    button: "Seleccione",
    items: [
      ["TURNOS_MEDICOS_ATENCION_MEDICA", "Atención médica"],
      ["TURNOS_MEDICOS_IMAGENES_MEDICAS", "Imágenes médicas"],
    ],
  },
  ccs_menu_informes: {
    body: "Seleccione una de las siguientes opciones. A la brevedad nuestros operadores se pondrán en contacto.",
    button: "Seleccione",
    items: [
      ["INFORMES_MEDICOS_IMAGENES_MEDICAS", "Imágenes médicas"],
      ["INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA", "Estudios de Patología"],
      ["INFORMES_MEDICOS_LABORATORIO_CLINICO", "Laboratorio Clínico"],
    ],
  },
};

function listFallback(config) {
  return `${config.body}\n\n${config.items.map(([, item], index) => `${index + 1}. ${item}`).join("\n")}`;
}

function listPickerTypes(row, config) {
  const body = config.body;
  const fallback = listFallback(config);
  return {
    "twilio/list-picker": {
      body,
      button: config.button,
      items: config.items.map(([id, item]) => ({ id, item })),
    },
    "twilio/text": {
      body: fallback,
    },
  };
}

async function fetchContent(contentSid) {
  if (!contentSid) return null;
  try {
    return await twilio.content.v1.contents(contentSid).fetch();
  } catch {
    return null;
  }
}

async function upsertContent(row) {
  const config = listTemplates[row.template_key];
  if (!config) {
    if (row.content_sid) return row.content_sid;
    const content = await twilio.content.v1.contents.create({
      friendlyName: row.friendly_name,
      language: "es",
      types: {
        "twilio/text": {
          body: row.fallback_text,
        },
      },
    });
    return content.sid;
  }

  const current = await fetchContent(row.content_sid);
  const types = listPickerTypes(row, config);
  if (current?.types?.["twilio/list-picker"]) return row.content_sid;

  if (row.content_sid && current) {
    try {
      const updated = await twilio.content.v1.contents(row.content_sid).update({
        friendlyName: row.friendly_name,
        language: "es",
        types,
      });
      return updated.sid;
    } catch (error) {
      console.log(`Could not update ${row.template_key}; creating a replacement. ${error.message}`);
    }
  }

  const content = await twilio.content.v1.contents.create({
    friendlyName: row.friendly_name,
    language: "es",
    types,
  });
  return content.sid;
}

await db.connect();
try {
  const { rows } = await db.query(`
    select template_key, content_sid, friendly_name, fallback_text
    from public.twilio_templates
    order by created_at asc
  `);

  let changed = 0;
  for (const row of rows) {
    const config = listTemplates[row.template_key];
    const contentSid = await upsertContent(row);
    const fallbackText = config ? listFallback(config) : row.fallback_text;
    const variables = config
      ? {
          content_type: "twilio/list-picker",
          button: config.button,
          items: Object.fromEntries(config.items),
        }
      : {};

    await db.query(
      `
        update public.twilio_templates
        set
          content_sid = $1,
          fallback_text = $2,
          variables = case
            when $3::jsonb = '{}'::jsonb then variables
            else $3::jsonb
          end,
          updated_at = now()
        where template_key = $4
      `,
      [contentSid, fallbackText, JSON.stringify(variables), row.template_key],
    );
    if (contentSid !== row.content_sid || config) {
      changed += 1;
      console.log(`Updated ${row.template_key}: ${contentSid}`);
    }
  }

  console.log(`Twilio templates changed: ${changed}`);
} finally {
  await db.end();
}

insert into public.knowledge_base (
  intent_key,
  parent_intent_key,
  title,
  response_text,
  options,
  required_fields,
  routing_type,
  routing_numbers,
  is_active,
  sort_order
)
values
(
  'MENU_INICIAL',
  null,
  'Menú inicial',
  $$Gracias por comunicarse con Clínica Cruz del Sur. Elija el motivo de su consulta para continuar.$$,
  jsonb_build_array(
    'Turnos Médicos',
    'Laboratorio Clínico',
    'Informes Médicos',
    'Recetas Médicas',
    'Nuestros Edificios',
    'Internación',
    'Obras sociales',
    'Médicos Clínicos',
    'Otras consultas'
  ),
  null,
  'bot_only',
  null,
  true,
  10
),
(
  'TURNOS_MEDICOS_SELECTOR',
  'MENU_INICIAL',
  'Turnos médicos',
  $$Seleccione una de las siguientes opciones. A la brevedad nuestros operadores se pondrán en contacto.$$,
  jsonb_build_array('Atención médica', 'Imágenes médicas'),
  null,
  'bot_only',
  null,
  true,
  20
),
(
  'TURNOS_MEDICOS_ATENCION_MEDICA',
  'TURNOS_MEDICOS_SELECTOR',
  'Turnos médicos - Atención médica',
  $$¡Está un paso más cerca de agendar su turno! Por favor, indique el nombre del profesional o el servicio que necesita.$$,
  null,
  jsonb_build_array(
    'Nombre completo del paciente',
    'Fotografía del DNI de ambos lados',
    'Número de afiliado o credencial de obra social',
    'Disponibilidad para asistir al turno: días y horarios'
  ),
  'operator_queue',
  null,
  true,
  30
),
(
  'TURNOS_MEDICOS_IMAGENES_MEDICAS',
  'TURNOS_MEDICOS_SELECTOR',
  'Turnos médicos - Imágenes médicas',
  $$Radiografía: se realiza por orden de llegada, sin turno previo, de lunes a viernes de 08:00 a 20:00 h y sábados de 08:00 a 12:00 h. Sector A, Pasaje Tamarisco 735. Asistir con DNI, pedido médico y credencial de obra social.

Electrocardiograma (ECG): se realiza por orden de llegada, sin turno previo, de lunes a viernes de 08:00 a 15:00 h. Sector Cardiología, 9 de Julio 680. Asistir con DNI, pedido médico y credencial de obra social.

Ecocardiograma: se realiza por orden de llegada, sin turno previo, de lunes a viernes de 08:00 a 20:00 h. Sector Cardiología, 9 de Julio 680. Asistir con DNI, pedido médico y credencial de obra social.

Tomografía computada sin contraste: se realiza por orden de llegada, sin turno previo, de lunes a viernes de 08:00 a 20:00 h y sábados de 08:00 a 12:00 h. Sector Cardiología, 9 de Julio 680. Asistir con DNI, pedido médico y credencial de obra social.

Espinograma: se realiza por orden de llegada, sin turno previo, en pacientes menores o de hasta 50 kg de peso. Lunes a viernes de 08:00 a 20:00 h y sábados de 08:00 a 12:00 h. Sector A, Pasaje Tamarisco 735. Asistir con DNI, pedido médico y credencial de obra social.$$,
  null,
  jsonb_build_array(
    'Nombre completo del paciente',
    'Fotografía clara del pedido médico',
    'Número de afiliado de obra social'
  ),
  'operator_queue',
  null,
  true,
  40
),
(
  'LABORATORIO_CLINICO',
  'MENU_INICIAL',
  'Laboratorio clínico',
  $$El servicio de laboratorio atiende por orden de llegada, de lunes a viernes, de 08:00 a 20:00 h. Las extracciones se realizan de 07:00 a 09:30 h.

Para más información, comuníquese por WhatsApp al siguiente número:
+54 9 2974 35-6928.$$,
  null,
  null,
  'explicit_number',
  array['+54 9 2974 35-6928']::text[],
  true,
  50
),
(
  'INFORMES_MEDICOS_SELECTOR',
  'MENU_INICIAL',
  'Informes médicos',
  $$Seleccione una de las siguientes opciones. A la brevedad nuestros operadores se pondrán en contacto.$$,
  jsonb_build_array('Imágenes médicas', 'Estudios de Patología', 'Laboratorio Clínico'),
  null,
  'bot_only',
  null,
  true,
  60
),
(
  'INFORMES_MEDICOS_IMAGENES_MEDICAS',
  'INFORMES_MEDICOS_SELECTOR',
  'Informes médicos - Imágenes médicas',
  $$Para recibir informes e imágenes médicas, por favor envíe la siguiente información:

* Nombre completo del paciente.
* Fotografía de frente y dorso del DNI.
* Estudio y fecha estimada de realización.

Nos encontramos trabajando en su solicitud y nos comunicaremos a la brevedad con novedades.$$,
  null,
  jsonb_build_array(
    'Nombre completo del paciente',
    'Fotografía de frente y dorso del DNI',
    'Estudio y fecha estimada de realización'
  ),
  'operator_queue',
  null,
  true,
  70
),
(
  'INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA',
  'INFORMES_MEDICOS_SELECTOR',
  'Informes médicos - Estudios de Patología',
  $$Respecto a biopsias y estudios de patología, comuníquese por WhatsApp al siguiente número:
+54 9 2974 08-2603

Nuestro equipo le indicará los pasos a seguir a la brevedad.$$,
  null,
  null,
  'explicit_number',
  array['+54 9 2974 08-2603']::text[],
  true,
  80
),
(
  'INFORMES_MEDICOS_LABORATORIO_CLINICO',
  'INFORMES_MEDICOS_SELECTOR',
  'Informes médicos - Laboratorio clínico',
  $$Para obtener los resultados de sus análisis, comuníquese por WhatsApp al siguiente número:
+54 9 2974 35-6928

Nuestro equipo le indicará los pasos a seguir a la brevedad.$$,
  null,
  null,
  'explicit_number',
  array['+54 9 2974 35-6928']::text[],
  true,
  90
),
(
  'RECETAS_MEDICAS',
  'MENU_INICIAL',
  'Recetas médicas',
  $$Para solicitar una receta médica, comuníquese por WhatsApp al siguiente número:
+54 9 2974 21-4000

Nuestro equipo le indicará los pasos a seguir a la brevedad.$$,
  null,
  null,
  'explicit_number',
  array['+54 9 2974 21-4000']::text[],
  true,
  100
),
(
  'NUESTROS_EDIFICIOS',
  'MENU_INICIAL',
  'Nuestros edificios',
  $$Sector A | Recepción principal
Pasaje Tamarisco 735

Sector C | Consultorios Externos
Pasaje Dra. Elena de Zilberberg 735

Sector E | Cardiología
9 de Julio 680

Sector F | Centro Materno Infantil
9 de Julio 468

La Dra. Estrada brinda atención por telemedicina, modalidad recomendada para pacientes que residen en otras localidades. Para turnos y consultas enviar un WhatsApp al +54 9 2974 93-5087.$$,
  null,
  null,
  'bot_only',
  null,
  true,
  110
),
(
  'INTERNACION',
  'MENU_INICIAL',
  'Internación',
  $$Para recibir información sobre los procesos de admisión e internación, puede comunicarse por WhatsApp a los siguientes números:
+54 9 2976 21-5682
+54 9 2975 45-1495.$$,
  null,
  null,
  'explicit_number',
  array['+54 9 2976 21-5682', '+54 9 2975 45-1495']::text[],
  true,
  120
),
(
  'OBRAS_SOCIALES',
  'MENU_INICIAL',
  'Obras sociales',
  $$¿En qué podemos ayudarle?
Lo derivaremos a un operador. Por favor, aguarde un momento.$$,
  null,
  null,
  'operator_queue',
  null,
  true,
  130
),
(
  'MEDICOS_CLINICOS',
  'MENU_INICIAL',
  'Médicos clínicos',
  $$La atención de médicos clínicos se realiza por orden de llegada, de lunes a viernes, a partir de las 09:00 h por la mañana y a partir de las 15:00 h por la tarde, en los Edificios B y C.

Ante una urgencia, recomendamos asistir a nuestra guardia, ubicada en Pasaje Tamarisco 735, donde contamos con atención médica las 24 horas, todos los días del año.

En nuestro perfil de Instagram se encuentran para su consulta los profesionales disponibles.$$,
  null,
  null,
  'bot_only',
  null,
  true,
  140
),
(
  'OTRAS_CONSULTAS',
  'MENU_INICIAL',
  'Otras consultas',
  $$¿En qué podemos ayudarle?
Lo derivaremos a un operador. Por favor, aguarde un momento.$$,
  null,
  null,
  'operator_queue',
  null,
  true,
  150
),
(
  'FUERA_ALCANCE_MEDICO',
  null,
  'Fuera de alcance médico',
  $$Este canal no reemplaza la atención médica ni permite realizar diagnósticos o indicaciones clínicas. Ante síntomas, urgencias o dudas médicas, le recomendamos asistir a la guardia o comunicarse con un profesional de salud.$$,
  null,
  null,
  'operator_queue',
  null,
  true,
  160
)
on conflict (intent_key) do update set
  parent_intent_key = excluded.parent_intent_key,
  title = excluded.title,
  response_text = excluded.response_text,
  options = excluded.options,
  required_fields = excluded.required_fields,
  routing_type = excluded.routing_type,
  routing_numbers = excluded.routing_numbers,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.routing_rules (
  intent_key,
  routing_type,
  routing_numbers,
  queue_name,
  priority,
  is_active
)
select
  intent_key,
  routing_type,
  routing_numbers,
  case when routing_type = 'operator_queue' then 'operadores_ccs' else null end,
  'normal',
  true
from public.knowledge_base
on conflict (intent_key) do update set
  routing_type = excluded.routing_type,
  routing_numbers = excluded.routing_numbers,
  queue_name = excluded.queue_name,
  priority = excluded.priority,
  is_active = excluded.is_active;

insert into public.twilio_templates (
  template_key,
  content_sid,
  friendly_name,
  fallback_text,
  variables,
  approved,
  use_case
)
values
(
  'ccs_bienvenida',
  null,
  'CCS bienvenida',
  $$Gracias por comunicarse con Clínica Cruz del Sur. Elija el motivo de su consulta para continuar:

1. Turnos Médicos
2. Laboratorio Clínico
3. Informes Médicos
4. Recetas Médicas
5. Nuestros Edificios
6. Internación
7. Obras sociales
8. Médicos Clínicos
9. Otras consultas$$,
  '{}'::jsonb,
  false,
  'menu_inicial'
),
(
  'ccs_menu_turnos',
  null,
  'CCS menú turnos',
  $$Seleccione una opción:

1. Atención médica
2. Imágenes médicas$$,
  '{}'::jsonb,
  false,
  'menu_turnos'
),
(
  'ccs_menu_informes',
  null,
  'CCS menú informes',
  $$Seleccione una opción:

1. Imágenes médicas
2. Estudios de Patología
3. Laboratorio Clínico$$,
  '{}'::jsonb,
  false,
  'menu_informes'
),
(
  'ccs_solicitud_datos_turno',
  null,
  'CCS solicitud datos turno',
  $$Para avanzar con su solicitud, por favor envíe:

* Nombre completo del paciente.
* DNI de ambos lados.
* Número de afiliado o credencial de obra social.
* Disponibilidad de días y horarios.$$,
  '{}'::jsonb,
  false,
  'solicitud_datos_turno'
),
(
  'ccs_derivacion_operador',
  null,
  'CCS derivación operador',
  $$Gracias. Vamos a derivar su consulta a un operador. Por favor, aguarde un momento.$$,
  '{}'::jsonb,
  false,
  'derivacion_operador'
),
(
  'ccs_fuera_alcance_medico',
  null,
  'CCS fuera de alcance médico',
  $$Este canal no reemplaza la atención médica ni permite realizar diagnósticos o indicaciones clínicas. Ante síntomas, urgencias o dudas médicas, le recomendamos asistir a la guardia o comunicarse con un profesional de salud.$$,
  '{}'::jsonb,
  false,
  'fuera_alcance_medico'
),
(
  'ccs_cierre',
  null,
  'CCS cierre',
  $$Muchas gracias. Nos comunicaremos a la brevedad con novedades.$$,
  '{}'::jsonb,
  false,
  'cierre'
)
on conflict (template_key) do update set
  friendly_name = excluded.friendly_name,
  fallback_text = excluded.fallback_text,
  variables = excluded.variables,
  approved = excluded.approved,
  use_case = excluded.use_case,
  updated_at = now();

insert into public.app_settings (key, value)
values
  ('retention_messages_days', '90'::jsonb),
  ('retention_logs_days', '30'::jsonb),
  ('retention_media_metadata_days', '30'::jsonb),
  ('human_takeover_timeout_minutes', '10'::jsonb),
  ('twilio_whatsapp_from', '"whatsapp:+5493516424148"'::jsonb),
  ('cloudflare_pending_rule', '"https://ccs.aeye.com.ar -> http://localhost:3010"'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

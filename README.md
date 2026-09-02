# BOT CCS

Asistente WhatsApp para Clínica Cruz del Sur con n8n, Twilio, Supabase y una web Next.js tipo WhatsApp/CRM.

## Estado Actual

- Aplicación productiva: `https://ccs.aeye.com.ar/`.
- Runtime web: Next.js 16 sobre Node.js, administrado por PM2 en el puerto `3010`.
- Banco administrable: 18 especialidades, 19 estudios, 45 profesionales y 16 obras sociales.
- Calidad de referencia al 2 de septiembre de 2026: 302 pruebas, 229 escenarios, 17 verificaciones HTTP y 9 recorridos n8n sin incidentes.
- Repositorio privado: `https://github.com/AEyeSecurity/bot-ccs`.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md): componentes, datos, integraciones, seguridad y estados.
- [Funcionalidades](docs/FEATURES.md): comportamiento implementado del bot y del panel.
- [Banco de respuestas](docs/CATALOG.md): edición, revisión, publicación, importación y validaciones.
- [Operación](docs/OPERATIONS.md): instalación, despliegue, PM2, tareas programadas e incidentes.
- [Pruebas](docs/TESTING.md): estrategia, comandos y criterios de alta.
- [Historial](docs/CHANGELOG.md): cambios funcionales y operativos.

Toda modificación debe actualizar la documentación correspondiente y `docs/CHANGELOG.md` en el mismo commit. Esta regla también está registrada en `AGENTS.md` para las futuras tareas automatizadas.

## Arquitectura

- Twilio WhatsApp envía inbound a n8n: `https://n8n.aeye.com.ar/webhook/bot-ccs`.
- n8n usa el workflow existente `BOT CCS` (`lRDscbvgNSzjOoP3`) y Gemini solo como apoyo de desambiguación.
- El envío WhatsApp sale por Next server-side. El flujo activo usa solo texto y media/vCard; no usa menús interactivos ni `list-picker`.
- Next.js corre local en `http://127.0.0.1:3010`.
- Supabase guarda contactos, conversaciones, casos, mensajes, versiones publicadas del banco, reglas y callbacks.
- El runtime carga exclusivamente la versión `published` de `bot_catalog_versions`, la valida y la conserva en memoria. No usa XLSX ni TypeScript como fallback.
- El motor conversacional vive en `src/lib/bot-catalog.ts`, `src/lib/bot-core.ts` y `src/lib/bot-engine.ts`. Gemini no redacta respuestas al paciente.
- Adjuntos sensibles no se descargan, no se guardan como archivo y no se muestran en la web; solo se registra metadata mínima.

## Variables

Copiar `.env.example` a `.env.local` y completar valores reales solo localmente.

Variables principales:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_DB_PASSWORD`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM=whatsapp:+5493516424148`
- `TWILIO_STATUS_CALLBACK_URL=https://ccs.aeye.com.ar/api/twilio/status`
- `TWILIO_WEBHOOK_URL=https://n8n.aeye.com.ar/webhook/bot-ccs`
- `RETENTION_MESSAGES_DAYS=90`
- `RETENTION_LOGS_DAYS=30`
- `RETENTION_MEDIA_METADATA_DAYS=30`
- `HUMAN_TAKEOVER_TIMEOUT_MINUTES=10`

`BOT_CCS_WEBHOOK_SECRET` es opcional. Si se define en Next, también debe existir con el mismo valor en el proceso de n8n.

## Supabase

Aplicar schema y seed:

```powershell
npm run db:apply
npm run db:seed
```

Los scripts intentan conectar por `SUPABASE_DB_URL`. Si falla, usan `SUPABASE_ACCESS_TOKEN` contra la Management API. Ese token debe tener permisos `database_write`; si no, Supabase devuelve `403`.

Tablas creadas:

- `operators`
- `contacts`
- `conversations`
- `cases`
- `messages`
- `knowledge_base`
- `routing_rules`
- `twilio_templates`
- `twilio_callbacks`
- `conversation_events`
- `app_settings`
- `bot_catalog_versions`

RLS queda habilitado. La web usa Supabase Auth; las operaciones privilegiadas pasan por API server-side con `service_role`.

## Operador Inicial

1. Crear el usuario en Supabase Auth con email/password.
2. Insertar el mapeo en `operators`:

```sql
insert into public.operators (auth_user_id, name, email, role, is_active)
values ('AUTH_USER_ID', 'Nombre operador', 'email@dominio.com', 'admin', true);
```

El login web acepta email o alias. El usuario maestro operativo usa el alias `admin` y se resuelve internamente al email `admin@bot-ccs.local`; la contraseña no se versiona.

## n8n

Backup previo generado antes de modificar: `C:\n8n-backups\manual\20260610-154926`.

Workflow importable:

```powershell
n8n import:workflow --input "C:\BOT CCS\n8n\BOT_CCS.workflow.json"
```

El workflow:

- Recibe `POST /webhook/bot-ccs`.
- Normaliza payload Twilio sin conservar `MediaUrl`.
- Clasifica intención con Gemini en JSON, solo como apoyo.
- Llama a `http://127.0.0.1:3010/api/bot/inbound`.
- Llama a `http://127.0.0.1:3010/api/bot/send` para enviar WhatsApp desde Next server-side.
- Registra SID/status en `http://127.0.0.1:3010/api/bot/outbound`.
- Mantiene un único camino técnico: `Twilio -> n8n -> /api/bot/inbound -> /api/bot/send -> /api/bot/outbound`.

## Banco De Respuestas

Los administradores acceden a `Conversaciones | Banco de respuestas` desde el panel. Los cambios se guardan como borrador y no afectan al bot hasta su publicación. Toda edición queda `Pendiente`; debe marcarse `Revisada` para habilitar `Publicar`.

La publicación valida contenido, teléfonos `+549XXXXXXXXXX`, disponibilidad, relaciones y revisión; luego archiva la versión anterior y activa la nueva en una transacción. El proceso actualiza inmediatamente su caché en memoria, sin build ni reinicio.

Si al iniciar no existe una versión publicada válida, las entradas del bot fallan de forma controlada con `503`. Si Supabase falla después de una carga correcta, la versión ya cargada continúa vigente.

## Fuentes De Importación

El banco canónico es `data/Bot 2026 reconstruido.xlsx`. La hoja `Profesionales` declara nombres, alias, especialidad, subservicio, grupo de respuesta, texto exacto y celda fuente. Los títulos de especialidades y estudios se usan para clasificar, pero no se envían al paciente.

El XLSX y el catálogo TypeScript son fuentes de importación y recuperación manual, no fuentes de runtime. Para reconstruir los datos de importación:

```powershell
npm run catalog:import -- "C:\BOT CCS\data\Bot 2026 reconstruido.xlsx" "C:\BOT CCS\src\lib\bot-2026-data.ts"
npm run catalog:generate-managed
npm run catalog:seed-managed
```

El importador rechaza hojas o encabezados inesperados, títulos duplicados, alias completos ambiguos, grupos inconsistentes, textos ajenos a su celda fuente, teléfonos móviles inválidos y profesionales sin especialidad.

## Twilio

Configurar manualmente en Twilio:

- Incoming webhook WhatsApp: `https://n8n.aeye.com.ar/webhook/bot-ccs`.
- Status callback: `https://ccs.aeye.com.ar/api/twilio/status`.
- Sender WhatsApp: `whatsapp:+5493516424148`.

El catálogo local de templates queda en `twilio_templates`, pero el flujo activo no usa menús ni `ContentSid`. Para crear o actualizar contenido legado en Twilio sin enviarlo a aprobación:

```powershell
npm run twilio:templates
```

No hay templates de lista activas en el flujo productivo actual.

## Web

Desarrollo:

```powershell
npm run dev
```

Producción local:

```powershell
npm run build
npm run start
```

PM2 sugerido:

```powershell
pm2 start npm --name bot-ccs-web -- start
pm2 save
```

Cloudflare Zero Trust publica actualmente el servicio mediante el túnel existente:

```text
Hostname: ccs.aeye.com.ar
Service: http://localhost:3010
```

La disponibilidad se comprueba tanto en la URL local como en `https://ccs.aeye.com.ar/`. El watchdog recupera el proceso local; no modifica la configuración del túnel.

## Pruebas Manuales

- `hola`: responde solo el saludo inicial, sin menú numérico.
- `quiero un turno`: pregunta directamente por el profesional o servicio.
- `cardiología`: envía la ficha completa del área y continúa con los datos del paciente.
- `Cardoso Atilio`: envía únicamente el bloque de ese profesional y continúa con los datos del paciente.
- `Cardoso`: solicita elegir entre los profesionales que comparten el apellido.
- `resonancia`: envía únicamente la ficha del estudio y cierra la gestión para que el paciente contacte a recepción.
- `laboratorio`: responde horarios y comparte vCard del sector.
- `telemedicina`: pregunta ciudad; si es fuera de Caleta Olivia comparte el contacto.
- `obra social`: pide el motivo y luego deriva a operador.
- Foto/DNI: no muestra archivo ni URL; registra metadata.
- Consulta de síntomas/medicación: responde fuera de alcance médico.
- Operador toma control: bot deja de responder.
- Operador responde: sale por Twilio y se guarda como outbound/operator.
- Pasan 10 minutos desde el último mensaje enviado por operador: `human_takeover` pasa a `takeover_expired`.
- Tomar control no inicia el vencimiento; el timer empieza al enviar el primer mensaje humano.
- Tocar la caja de texto o escribir un borrador no reinicia el timer.
- Operador libera bot: conversación vuelve a `bot_active`.
- Si se libera sin una respuesta humana posterior al último inbound, la conversación cierra al cumplirse 24 horas desde ese inbound.
- Un nuevo inbound o una respuesta humana antes del vencimiento cancela esa marca.

## Mantenimiento

`BOT CCS Conversation Maintenance` ejecuta cada minuto `scripts/run-conversation-maintenance.mjs`. Cierra de forma idempotente conversaciones liberadas sin respuesta, cancela casos abiertos y no envía mensajes al paciente.

```powershell
npm run maintenance:conversations
npm run verify:catalog-db
Get-Content logs/bot-ccs-maintenance.log -Tail 20
```

## Fuera Del MVP

- Turnos reales.
- Historia clínica.
- Facturación.
- CRM externo.
- Descarga de estudios.
- Adjuntos seguros visibles.
- Gerencias/equipos/asignaciones.
- Analítica avanzada.
- Templates WhatsApp aprobadas en producción.

## Fase 2

- Sistema de gerencias/equipos.
- Asignación por área.
- Visualización segura de adjuntos con cifrado y signed URLs.
- Integración real con turnos.
- Descarga de estudios vía bot.
- Reportes gerenciales.
- Analítica avanzada.
- Multi-sucursal/multi-equipo.
- Templates WhatsApp aprobadas en producción.
- Reglas avanzadas de SLA/prioridad.

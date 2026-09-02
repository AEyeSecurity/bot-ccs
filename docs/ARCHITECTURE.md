# Arquitectura de BOT CCS

## Vista General

BOT CCS es un asistente determinístico de WhatsApp y un panel web de operación para Clínica Cruz del Sur. Gemini se utiliza únicamente como apoyo acotado de clasificación y validación documental; no redacta las respuestas enviadas al paciente.

```text
Paciente
  -> Twilio WhatsApp
  -> n8n /webhook/bot-ccs
  -> POST /api/bot/inbound
  -> Motor conversacional
  -> Supabase
  -> POST /api/bot/send
  -> Twilio WhatsApp
  -> POST /api/bot/outbound y /api/twilio/status
```

La aplicación Next.js también sirve el panel de conversaciones y el editor administrativo en `https://ccs.aeye.com.ar/`. El proceso productivo escucha en `127.0.0.1:3010` y Cloudflare Tunnel publica el dominio.

## Componentes

- **Next.js 16 / React 19:** interfaz y Route Handlers server-side.
- **Motor conversacional:** `bot-core.ts` detecta intenciones y evalúa transiciones; `bot-catalog.ts` construye flujos; `bot-engine.ts` persiste y coordina cada turno.
- **Supabase/PostgreSQL:** operadores, contactos, conversaciones, casos, mensajes, eventos, callbacks y versiones del catálogo.
- **n8n:** normaliza el webhook de Twilio y mantiene un único recorrido técnico hacia la API local.
- **Twilio:** recepción y envío de mensajes, media/vCards y callbacks de estado.
- **Gemini:** clasificación auxiliar y OCR estructurado para documentos.
- **PM2:** mantiene el proceso `bot-ccs-web` activo.
- **Programador de tareas de Windows:** ejecuta watchdog y mantenimiento de conversaciones.

## Estados Y Casos

Estados de conversación:

- `bot_active`: el bot puede responder.
- `waiting_operator`: caso derivado a atención humana.
- `human_takeover`: un operador tomó control.
- `takeover_expired`: venció el control humano por inactividad.
- `closed`: conversación cerrada.

Estados de caso:

- `in_progress`
- `waiting_operator`
- `closed`
- `cancelled`

Los pasos y datos requeridos se almacenan en el caso. La detección puede reclasificar un mensaje mientras existe una solicitud abierta sin perder información ya capturada.

## Catálogo Productivo

`bot_catalog_versions` almacena una versión `published`, como máximo un `draft` y versiones `archived`. El proceso carga y valida la versión publicada una vez, comparte la promesa entre solicitudes concurrentes y conserva el catálogo en memoria. Una publicación válida reemplaza la caché inmediatamente.

No existe fallback productivo al XLSX ni a datos TypeScript. Si el proceso inicia sin poder obtener una publicación válida, la API responde `503`. Si la base falla después de una carga correcta, la versión ya cargada sigue vigente.

## Seguridad Y Privacidad

- El panel usa Supabase Auth y relaciona la sesión con un operador activo.
- Las APIs administrativas exigen rol `admin`; responden `401` sin sesión y `403` para operadores comunes.
- Las escrituras privilegiadas se realizan server-side con `service_role`.
- RLS permanece habilitado en Supabase.
- Los secretos solo viven en `.env.local` o en el entorno del servicio.
- Los adjuntos sensibles no se descargan ni se muestran en el panel; se conserva metadata mínima y huellas no reversibles.
- Los logs, reportes, respaldos y variables reales están excluidos del repositorio.

## Decisiones Vigentes

- Respuestas determinísticas y alias explícitos; no se usa coincidencia difusa general.
- Teléfonos dentro del texto como única fuente de verdad, con formato `+549XXXXXXXXXX`.
- Un solo catálogo publicado como fuente productiva.
- No se cambian contratos de n8n al editar contenido.
- El operador controla la publicación; guardar un borrador nunca cambia la respuesta productiva.

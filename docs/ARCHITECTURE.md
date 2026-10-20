# Arquitectura de BOT CCS

## Vista General

BOT CCS es un asistente determinístico de WhatsApp y un panel web de operación para Clínica Cruz del Sur. Gemini se utiliza únicamente como apoyo acotado: validación documental y clasificación de intención bajo demanda cuando las reglas determinísticas no resuelven el mensaje; no redacta las respuestas enviadas al paciente.

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

La aplicación Next.js también sirve el panel de conversaciones y el editor administrativo en `https://ccs.aeye.com.ar/`. El contenedor escucha en `0.0.0.0:3010`; Docker publica `127.0.0.1:3010` en el host para n8n y diagnóstico. Cloudflare Tunnel publica el dominio.

## Componentes

- **Next.js 16 / React 19:** interfaz y Route Handlers server-side.
- **Motor conversacional:** `bot-core.ts` detecta intenciones y evalúa transiciones; `bot-catalog.ts` construye flujos; `bot-engine.ts` persiste y coordina cada turno.
- **Supabase/PostgreSQL:** operadores, contactos, conversaciones, casos, mensajes, eventos, callbacks y versiones del catálogo.
- **n8n:** normaliza el webhook de Twilio y mantiene un único recorrido técnico hacia la API local.
- **Twilio:** recepción y envío de mensajes, media/vCards y callbacks de estado.
- **Gemini:** OCR estructurado para documentos y clasificación de intención "lazy" (solo cuando el motor determinístico no clasificó, con timeout y caída a `OTRAS_CONSULTAS`).
- **Docker Compose:** ejecuta web, mantenimiento y conector Cloudflare con reinicio automático y logs rotados; tools contiene las herramientas bajo un perfil opcional.
- **Mantenimiento en contenedor:** ejecuta cierres idempotentes cada minuto, sin tareas Windows.

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
- Los secretos se inyectan desde archivos privados fuera del repositorio y mediante el secret del túnel. `.env.local` es una entrada opcional para herramientas y no forma parte de las imágenes.
- Los adjuntos se descargan temporalmente en memoria y se envían a Gemini para validación; no se persisten como archivos ni se muestran en el panel.
- Los logs, reportes, respaldos y variables reales están excluidos del repositorio.

## Decisiones Vigentes

- Respuestas determinísticas y alias explícitos; no se usa coincidencia difusa general.
- Teléfonos dentro del texto como única fuente de verdad, con formato `+549XXXXXXXXXX`.
- Un solo catálogo publicado como fuente productiva.
- No se cambian contratos de n8n al editar contenido.
- El operador controla la publicación; guardar un borrador nunca cambia la respuesta productiva.

## Docker: configuración vigente desde 2026-10-16

Aplicación y mantenimiento en Docker Compose; n8n existente conserva el workflow editable y llama al puerto loopback3010 del host. Supabase sigue externo y conserva los datos. Cloudflare dedicado se configura con el perfil public y token propio. Las vCards se generan desde el catálogo publicado en /vcards/. BOT_CCS_WEBHOOK_SECRET es obligatorio, usando Header Auth en n8n. PM2 y tareas Windows son mecanismos históricos retirados al completar el corte. Ver docs/OPERATIONS.md y docs/TESTING.md.

## Organización del proyecto

| Ruta | Uso vigente |
| --- | --- |
| `src/` | Panel, APIs, motor, catálogo y vCards |
| `scripts/` | Mantenimiento y herramientas de pruebas, importación y migraciones ejecutadas en Docker |
| `n8n/BOT_CCS.workflow.json` | Exportación canónica del workflow externo, sin secretos |
| `data/` y `src/lib/bot-2026-data.ts` | Importación y fixtures de pruebas; no son contenido productivo |
| `supabase/` | Esquema, migraciones y seeds explícitos; preservar el historial |
| `tests/` | Pruebas herméticas, integración y matriz del bot |
| `public/` | Directorio de recursos estáticos; sin imágenes de ejemplo de Next.js |
| `docs/` | Documentación canónica de arquitectura, operación, pruebas y producto |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Construcción, servicios, herramientas y exclusiones |

Las dependencias y `.next` se generan dentro de las imágenes. Los reportes viven en un volumen Docker y los logs en el mecanismo de rotación de Docker. No hay montajes de fuentes o dependencias del host en web o mantenimiento. El único archivo externo montado en producción es el token del túnel, de solo lectura. Los archivos privados de entorno se inyectan al crear los contenedores.

Se retiraron configuraciones PM2, instaladores/watchdog Windows, el script de corte inicial, snapshots de workflows y el sincronizador antiguo de menús Twilio. La limpieza no altera tablas, usuarios, catálogo publicado ni configuración del n8n compartido.

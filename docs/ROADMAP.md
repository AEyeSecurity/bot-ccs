# Roadmap de BOT CCS

> Documento vivo de trabajo **futuro**: cambios y funcionalidades a planificar o desarrollar. El `README.md` documenta únicamente lo ya implementado; el historial completo está en [CHANGELOG.md](CHANGELOG.md). Antes de agregar una nueva funcionalidad, registrarla aquí como iteración o iniciativa.

## Contexto

Ya implementado (no repetir aquí; ver detalle en los documentos canónicos):

- **Iteración 1** — roles, permisos y derivación por área: áreas y reglas de derivación, estados de resolución, presencia, alta de usuarios desde la web y panel de datos. ([FEATURES.md](FEATURES.md))
- **Iteración 2** — texto general propio por especialidad (`customBody`, caso Cardiología). ([FEATURES.md](FEATURES.md))
- **Iteración 4** — clasificación Gemini "lazy" (asíncrona y solo ante fallo de reglas determinísticas). ([ARCHITECTURE.md](ARCHITECTURE.md))

Comprobaciones operativas pendientes (WhatsApp real, reinicio del host, retiro de `admindev`, ruta Cloudflare antigua) se gestionan en [OPERATIONS.md](OPERATIONS.md#comprobaciones-pendientes), no aquí.

## Fase 2 — iteraciones pendientes

La migración Docker precede estas funcionalidades; no las implementa:

- Sistema de gerencias/equipos.
- Asignación/derivación manual entre operadores o áreas.
- Visualización segura de adjuntos con cifrado y signed URLs.
- Integración real con turnos.
- Descarga de estudios vía bot.
- Reportes gerenciales.
- Analítica avanzada.
- Multi-sucursal/multi-equipo.
- Templates de WhatsApp aprobadas en producción.
- Reglas avanzadas de SLA/prioridad.

Historia clínica, facturación y CRM externo permanecen fuera del MVP.

## Iteración 3 — Respuesta simple con cierre confirmado (caso Medicina Clínica)

> Estado: pendiente de análisis.

**Requerimiento del cliente:**

- Hay casos de respuesta muy simple, como Medicina Clínica: solo informa el horario de atención (sin turnos).
- Si el cliente no pide más información, el caso podría darse por **cerrado** una vez que el paciente **confirme que entendió** (que no hay turnos y que el horario es de X a Y).

**Comportamiento actual (técnico):**

- `MEDICOS_CLINICOS` es un flujo de tipo `info` (`src/lib/bot-catalog.ts`), con `status: bot_active`. Envía un texto fijo (el horario) y no pide confirmación ni cierra la conversación.

**Ideas preliminares (a validar):**

1. **Paso de confirmación:** después de enviar el horario, preguntar "¿Le es de utilidad? ¿Hay algo más en lo que pueda ayudarle?". Si el paciente responde con un cierre ("no, gracias", "entendido", "ok"), cerrar el caso.
2. **Detección de confirmación:** sumar un conjunto de términos de confirmación/cierre (como ya existen `GREETINGS` o `CLINICAL_RISK_TERMS`) y una regla que cierre el caso.
3. **Riesgos a analizar:** cerrar de más (que el paciente aún necesitaba algo), cierres por un "ok" ambiguo e impacto en las métricas del panel.
4. **Alcance:** aplicar solo a flujos "informativos simples" (Medicina Clínica y similares), no a los casos que derivan a operador.

## Plan de datos — Centros / edificios

### Objetivo

Reemplazar la información de ubicaciones que hoy solo existe como **texto fijo** en el catálogo por **datos estructurados** consultables, de modo que el bot pueda responder "¿dónde queda X?" y relacionar cada sector físico con sus servicios y áreas de derivación sin depender de una guía externa.

### Estado actual (verificado en el código)

La ubicación física se describe únicamente como prosa en la respuesta `NUESTROS_EDIFICIOS` (`direct("buildings").body` en `src/lib/bot-2026-data.ts`, consumida por `src/lib/bot-catalog.ts`), y las direcciones están esparcidas por los `body` de especialidades, estudios y profesionales. No existe tabla ni relación consultable.

Sectores mencionados en el texto vigente:

| Sector | Descripción en el texto | Área de derivación aproximada |
|---|---|---|
| A | Guardia | Guardia |
| B | Imágenes Médicas | Pasaje (según migración 008: "Sector B y C = Pasaje y Anexo") |
| C | Consultorios Externos | Anexo |
| D | Mamografía y Densitometría | DMO |
| E | Cardiología | Cardiología |
| F | Centro Materno Infantil | CEMI |
| — | Cámara Gamma SPECT | Gamma (Medicina nuclear) |

### Hallazgos y ambigüedades a resolver

- El texto llama "Imágenes Médicas" al Sector B, pero la migración 008 equipara "Sector B y C" a "Pasaje y Anexo". La correspondencia sector ↔ área **no está unificada** y debe confirmarse con el cliente.
- DMO deriva Psicología y Nutrición, pero el Sector D solo nombra Mamografía y Densitometría; la ubicación física de esas especialidades no está clara.
- Las dos ubicaciones base (Pasaje Ibarra de Zilberberg y Av. 9 de Julio) conviven con direcciones puntuales (p. ej. Centro Materno Infantil en 9 de Julio 468).

### Propuesta de modelo (sin implementar)

Opción recomendada, a validar:

1. **Tabla `centers`** (o `buildings`/`locations`): `id`, `name`, `sector` (A–F o libre), `address`, `phone` (opcional), `is_active`.
2. **Tabla `center_areas`**: relación `center_id` ↔ `area_id`, indicando en qué centro opera cada área de derivación.
3. **Relación con el catálogo**: asociar cada servicio directo, estudio o especialidad a un `center_id` (o varios), para que el bot arme la respuesta de ubicación a partir del dato en lugar del texto fijo.
4. **Mecánica de respuesta**: `NUESTROS_EDIFICIOS` y los mensajes con dirección pasan a consultar el modelo; la publicación del catálogo valida que toda dirección referenciada tenga su `center` correspondiente.

### Alternativas consideradas

| Opción | Pros | Contras |
|---|---|---|
| Tabla `centers` + relación con `areas` y catálogo (recomendada) | Ubicación consultable y única fuente de verdad; habilitaría búsqueda/mapas. | Requiere migración, carga inicial y actualizar los `body` para dejar de usar texto fijo. |
| Campo JSONB de "edificios" en el catálogo | Menor esfuerzo de modelado. | Sigue atado al payload del catálogo; no es relacional ni consultable por área. |
| Mantener texto fijo | Sin trabajo. | Repite el problema actual: información frágil, duplicada y no consultable. |

### Preguntas para el cliente (a incorporar en NOTAS-CLIENTE)

1. Correspondencia exacta sector ↔ área (sobre todo Sector B: ¿"Imágenes Médicas" equivale a Pasaje?).
2. ¿DMO (Psicología/Nutrición) opera físicamente en el Sector D u otra ubicación?
3. ¿Se desea exponer dirección/número por sector, o solo un texto general por centro?
4. ¿Algún sector tiene nombre o teléfono oficial que deba usarse como dato, distinto del texto actual?

### Criterios de aceptación (cuando se implemente)

- El bot responde ubicaciones desde datos estructurados, sin texto fijo en los `body`.
- La relación sector ↔ área ↔ servicio queda validada por pruebas (unitaria/integración) como las de `src/lib/areas.ts`.
- La publicación del catálogo valida la integridad de las direcciones referenciadas.

## Decisión técnica pendiente — Supabase a futuro

Supabase hoy cubre PostgreSQL + Auth + RLS + SDK con poco esfuerzo. Se conserva en el corto plazo y se reconsidera solo ante estos disparadores:

1. **Costo** a escala (el plan actual deja de alcanzar).
2. Necesidad de funciones específicas de Postgres o control fino de la base.
3. **Residencia/compliance** de datos de salud (elegir región o self-hosted por exigencias legales).

La migración más razonable, si llegara a ser necesaria, sería a **PostgreSQL autogestionado (Neon o servidor propio) + Auth.js**, manteniendo el mismo esquema SQL. Ver análisis completo en [ARCHITECTURE.md](ARCHITECTURE.md) (componentes y decisión vigente) cuando se reabra el tema.

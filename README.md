# BOT CCS

Asistente WhatsApp y panel de atención para Clínica Cruz del Sur. El motor es determinístico: Gemini valida documentos y, bajo demanda y solo como último recurso, clasifica la intención. No redacta respuestas al paciente.

## Arquitectura y ejecución

- Aplicación, mantenimiento y conector Cloudflare: Docker Compose, proyecto bot-ccs.
- n8n existente: https://n8n.aeye.com.ar; el workflow BOT CCS sigue editable allí. No se instala otro n8n.
- Twilio → n8n → http://127.0.0.1:3010/api/bot/inbound → /api/bot/send → /api/bot/outbound.
- Docker publica la aplicación únicamente en 127.0.0.1:3010; dentro escucha en 0.0.0.0:3010.
- Supabase externo conserva usuarios, contactos, conversaciones, casos, mensajes y catálogo. El único contenido productivo es la versión publicada de bot_catalog_versions; no hay fallback XLSX/TypeScript.
- Las vCards se generan desde el catálogo publicado en https://ccs.aeye.com.ar/vcards/*.vcf.
- Documentos: descarga transitoria en memoria para validación con Gemini; no se persisten como archivos ni se muestran en el panel.

## Operación Docker

Configuración privada fuera de Git: C:/ProgramData/BotCCS/deploy.env y runtime.env. Copiar los nombres de .env.example y .env.docker.example; completar valores reales en archivos privados.

~~~powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env build web maintenance tools
docker compose --env-file C:/ProgramData/BotCCS/deploy.env up -d web maintenance
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile public up -d cloudflared
docker compose --env-file C:/ProgramData/BotCCS/deploy.env ps
~~~

El perfil public requiere un túnel propio y su token en archivo. Ver docs/OPERATIONS.md para publicación, pruebas y recuperación. PM2 y las tareas Windows del bot son mecanismos retirados; no ejecutarlos en paralelo.

**Estado verificado al 20 de octubre de 2026:** web y mantenimiento activos en Docker en3010, tareas nativas deshabilitadas e instancia de ensayo detenida. El túnel exclusivo Bot CSS publica ccs.aeye.com.ar hacia http://web:3010; DNS actualizado y login, readiness y vCard HTTP200. Pendientes: retirar con seguridad la ruta antigua (Cloudflare advierte que también borraría DNS), WhatsApp real y reinicio coordinado del host. [Operación y comprobaciones pendientes](docs/OPERATIONS.md#comprobaciones-pendientes).

El proyecto ya no contiene scripts de PM2, tareas Windows ni el corte inicial. Dependencias, compilación y herramientas se ejecutan dentro de Docker; los reportes quedan en un volumen de Compose. Se conservan las fuentes de importación, las pruebas y las migraciones de base de datos. Ver el mapa de carpetas en [Arquitectura](docs/ARCHITECTURE.md#organización-del-proyecto).

## Contenido y panel

El panel usa Supabase Auth y exige un operador activo. Los administradores editan el banco como borrador, guardan, revisan y publican. Publicar valida y reemplaza el catálogo en memoria sin build ni reinicio. Una única réplica web evita divergencias de caché y colas por contacto.

El bot informa sobre especialidades, profesionales, estudios, servicios y coberturas; reúne datos y deriva a operadores. No confirma turnos reales. La referencia documentada del catálogo es 18 especialidades, 19 estudios, 45 profesionales y 16 obras sociales.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Funcionalidades](docs/FEATURES.md)
- [Catálogo](docs/CATALOG.md)
- [Operación](docs/OPERATIONS.md)
- [Pruebas](docs/TESTING.md)
- [Historial](docs/CHANGELOG.md)
- [Memoria de la última sesión](MEMORY.MD): lectura obligatoria al iniciar un chat; actualizar con cada cambio, comprimiendo y reemplazando entradas para mantener un máximo de 50 líneas.

Cada cambio debe actualizar su documento canónico y docs/CHANGELOG.md. Nunca versionar secretos, datos de pacientes, logs, backups ni evidencias de pruebas.

## Pendientes antes de avanzar a las siguientes fases

La aplicación ya funciona en Docker. El cierre de la migración todavía requiere estas comprobaciones; no darlas por realizadas en una nueva sesión:

- **WhatsApp real, pospuesto:** probar desde un número autorizado el saludo, laboratorio/vCard, captura de datos, atención humana, liberación y estados de entrega. La matriz automática utiliza transporte simulado. Ver [procedimiento](docs/OPERATIONS.md#whatsapp-real).
- **Reinicio completo de SERVER-CIT, pospuesto:** coordinar una ventana por los servicios compartidos y comprobar inicio de Docker, salud de web/mantenimiento, reconexión del túnel, persistencia y conexión de n8n. No reiniciar el servidor sin coordinarlo. Ver [procedimiento](docs/OPERATIONS.md#reinicio-del-servidor).
- **Ruta Cloudflare antigua:** retirar únicamente `ccs.aeye.com.ar` del túnel compartido cuando se pueda preservar/restaurar y verificar el CNAME del túnel exclusivo. El panel advierte que eliminar la ruta también borra DNS; no confirmar a ciegas ni tocar otras aplicaciones. La publicación actual ya usa el túnel exclusivo.
- **Administrador definitivo:** verificar su acceso y eliminar la cuenta temporal `admindev` antes de habilitar usuarios reales. Primero desactivar el operador y después eliminar su identidad de Auth, conservando el historial; la cuenta administrativa anterior no se restableció. Ver [operación](docs/OPERATIONS.md#administrador-temporal-de-desarrollo).

Registrar cada comprobación en MEMORY.MD, TESTING y CHANGELOG, y actualizar esta lista. Después del cierre, seleccionar las iteraciones funcionales de abajo por separado; no mezclarlas con limpieza de datos ni con cambios a los servicios compartidos.

## Fase 2: iteraciones pendientes

La migración Docker precede estas funcionalidades; no las implementa:

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

Historia clínica, facturación y CRM externo permanecen fuera del MVP.

## Próximas Iteraciones

Registro de requerimientos del cliente y soluciones propuestas. Se amplía a medida que el cliente sume solicitudes.

### Iteración 1 — Roles, permisos y derivación por área

> **Estado: entrega 1 completada** (áreas, derivación y permisos; alta por CLI). Pendientes: entrega 2 (estado de resolución y filtro por día) y entrega 3 (alta de usuarios desde la web, presencia y métricas).

**Requerimiento del cliente:**

- Crear usuarios para el personal de la clínica, cada uno con **permisos distintos** (acceso a información y a funcionalidades).
- Cada usuario debe ver **solo los mensajes clasificados para él** (por área, especialidad o profesional).
- El **admin** debe tener permisos exclusivos: **editar los textos de respuesta automática**, ver quiénes están conectados y cuántos casos se atienden por día.
- Estados de los casos: `resuelto`, `pendiente`, `en curso`.
- Los usuarios no-admin solo deben ver casos pendientes, en curso y finalizados **del día**.
- El admin debe poder **editar los textos de respuesta automática** desde la web.

**Datos de referencia (hoja "Usuarios" del Excel):**

| Área / Usuario | Derivación (especialidades y profesionales) |
|---|---|
| Cardiología | Cardiología, Ergometría, ECG, Ecocardiograma, Ecografía Doppler Cardíaca, Holter |
| TAC | Tomografía computada |
| RMN | Resonancia Magnética |
| Admisión | Gastroenterología, Arteriografía, Endoscopia alta y baja |
| Hemodinamia | Hemodinamia |
| Call Center | Obras sociales, Recetas médicas |
| Guardia | Clínica Médica, Espinograma, Radiografía |
| Pasaje | Nefrología; Cirugía (Cardoso Atilio, Cardoso Martin, Heredia); Diabetología (Carrizo); Neurología (Paolini, Álvarez Czernik); Nutrición (Santana); Traumatología (Vargas, Núñez Gaspar) |
| Anexo | Cirugía (del Carpio, Luján del Bueno, Soulergues); Oncología; Reumatología; Traumatología (Longo, Castro); Diabetología (Sedán); Dermatología; Urología; Infectología; Ecografías (abdominal, Doppler, renal) |
| DMO | Mamografía, Psicología, Densitometría ósea, Nutrición |
| CEMI | Cirugía (Francalancia); Ginecología y Obstetricia; Neurología (Albiño); Pediatría; Psiquiatría; Ecografía ginecológica/obstétrica/mamaria |
| Patología | Biopsias |
| Laboratorio | Laboratorio clínico |
| Gamma | Área de contacto para Medicina nuclear (sin derivación de casos; ver NOTAS-CLIENTE) |

Migraciones: `004_roles_areas.sql` (carga inicial) y `005_gamma_contacto_profesionales.sql` (Gamma, profesionales Goldenberg, Juárez, Catullo, Albiño y Jara; Álvarez Czernik solo en Pasaje).

**Lo que ya existe en el sistema:**

- Tabla `operators` con campo `role` (`admin`) e `is_active`; autenticación con Supabase Auth.
- Control de acceso básico: `requireAdmin` protege las APIs administrativas.
- Tabla `routing_rules` (pensada para reglas de enrutamiento; hoy sin uso para usuarios).
- Estados de caso ya modelados: `in_progress`, `waiting_operator`, `closed`, `cancelled`.
- Banco de respuestas editable por admin (ya cubre "modificar textos desde la web").

**Soluciones propuestas:**

1. **Modelo de roles y asignación por área/profesional**
   - Roles: `admin` (total) y `operator` (restringido). Opcional: `supervisor`.
   - Nueva tabla `operator_assignments` (o columnas JSONB en `operators`) que asocie a cada usuario un conjunto de etiquetas: especialidades, estudios y profesionales específicos que puede ver.
   - Para el caso "general vs. particular" (un área como Cardiología vs. un médico puntual), la asignación se expresa como lista de identificadores de especialidad, estudio y profesional. Un caso se muestra al usuario si su intención coincide con **alguna** de esas etiquetas.

2. **Derivación automática de casos**
   - Cuando el bot detecta la intención (especialidad/estudio/profesional), se asigna automáticamente el caso a los usuarios cuya área coincide (mapeo de la hoja "Usuarios").
   - Reutilizar/ampliar `routing_rules` para definir ese mapeo, administrable sin tocar código.

3. **Estados de resolución**
   - Agregar un estado de resolución visible al operador: `pendiente`, `en curso`, `resuelto` (mapeable sobre los estados de caso existentes).
   - El submenú del chat cambia el estado; los filtros de la bandeja usan esos estados.

4. **Filtros por día y por asignación**
   - No-admin: solo conversaciones de su área y del día actual (filtro por `created_at` y por asignación).
   - Admin: vista global + dashboard (usuarios conectados, casos por día).

5. **Presencia y métricas para admin**
   - Columna `last_seen_at` en `operators`, actualizada con un "heartbeat" del panel; el admin ve quién está conectado.
   - Conteo de casos por día/operador con una consulta agrupada, mostrado en un panel de métricas.

6. **Edición de textos por admin (desde la web)**
   - Ya cubierto por el Banco de respuestas. Confirmar con el cliente el alcance exacto (textos de flujo vs. mensajes generales).

7. **Seguridad adicional**
   - Las credenciales de acceso del Excel (hoja "Tareas") deben tratarse como temporales: rotar la contraseña de admin y entregar credenciales **individuales** a cada usuario (no compartidas).

**Decisiones de diseño acordadas:**

- Cada área de la hoja "Usuarios" es una **cuenta** que puede tener varios accesos simultáneos (varias computadoras del mismo consultorio ven lo mismo).
- La derivación se decide por intent, especialidad, estudio o profesional nombrado (por ejemplo, "electrocardiograma" o "Dr. Segovia" → Cardiología; "Nefrología" → Pasaje).
- Gamma es área de contacto: Medicina nuclear se responde con número y vCard, sin derivar casos. El estudio no está publicado hasta aprobar el texto (pendiente con el cliente).
- Un operador de la misma área puede tomar una conversación que otro compañero estaba atendiendo. Operadores de otras áreas no.
- Los pendientes y en curso de días anteriores siguen visibles para el área hasta marcarse `resuelto`.
- Un paciente que vuelve después de 24 h abre una solicitud nueva; el caso anterior se conserva.
- Admin puede crear y dar de baja usuarios desde la web. También existe alta por línea de comandos.

**Pendientes de definición con el cliente:** se llevan en un documento privado local (no versionado), con las preguntas y las decisiones a revisar.

### Iteración 2 — Texto general editable por especialidad (caso Cardiología)

**Requerimiento del cliente:**

- Hoy, el mensaje pregenerado de **Cardiología** "retoma" varios mensajes distintos y los envía **todos juntos** al paciente.
- El cliente quiere poder **modificar eso** para que sea **un único texto** que puedan editar libremente, sin que arrastre contenido de otros textos.
- En concreto: poder **crear un texto general para Cardiología** (y, en general, una respuesta por especialidad que no esté armada por bloques de profesionales).

**Comportamiento actual (técnico):**

- En `bot-catalog.ts` (`activateCatalog`), el cuerpo de cada especialidad se arma automáticamente concatenando el texto general más los bloques de los profesionales disponibles: `texto general + bloque profesional 1 + bloque profesional 2 + ...`.
- Por eso "Cardiología" responde con la introducción + las fichas de todos los cardiólogos juntas.
- El editor del banco permite editar textos y bloques por separado, pero **no** permite reemplazar ese armado por un único texto propio.

**Soluciones propuestas:**

1. **Campo de "texto general completo" por especialidad**
   - Agregar a cada especialidad un campo opcional (por ejemplo `customBody` o `overrideBody`).
   - Si está completado, la respuesta de la especialidad usa **solo ese texto** y no concatena los bloques profesionales.
   - Si está vacío, se mantiene el comportamiento actual (armado por bloques), para no romper el resto de especialidades.

2. **Editor en el Banco de respuestas**
   - En la edición de la especialidad, ofrecer la opción "usar texto general propio" (un textarea) además del armado por bloques.
   - Mantener la vista previa exacta de WhatsApp que ya existe.

3. **Alcance**
   - Empezar por Cardiología (el caso puntual que pide el cliente) y dejarlo **configurable por especialidad** para las demás.

4. **Regresión y pruebas**
   - Validar que las especialidades que no usen el texto propio sigan respondiendo igual (armado por bloques) y que la publicación siga validando teléfonos y disponibilidad.

### Iteración 3 — Respuesta simple con cierre confirmado (caso Medicina Clínica)

> **Estado: pendiente de análisis más profundo.** Se deja anotado para revisar.

**Requerimiento del cliente:**

- Hay casos de respuesta muy simple, como **Medicina Clínica**: solo informa el horario de atención (sin turnos).
- Si el cliente no pide más información, el caso podría darse por **cerrado** una vez que el paciente **confirme que entendió** (que no hay turnos y que el horario es de X a Y).

**Comportamiento actual (técnico):**

- `MEDICOS_CLINICOS` es un flujo de tipo `info` (`bot-catalog.ts`), con `status: bot_active`. Envía un texto fijo (el horario) y **no** pide confirmación ni cierra la conversación.

**Ideas preliminares (a validar):**

1. **Paso de confirmación**: después de enviar el horario, preguntar algo como "¿Le es de utilidad? ¿Hay algo más en lo que pueda ayudarle?". Si el paciente responde afirmativamente o con un cierre ("no, gracias", "entendido", "ok"), cerrar el caso.
2. **Detección de confirmación**: sumar un conjunto de términos de confirmación/cierre (como ya existe `GREETINGS` o `CLINICAL_RISK_TERMS`) y una regla que cierre el caso.
3. **Riesgos a analizar**: cerrar de más (que el paciente aún necesitaba algo), conversaciones que se cierran por un "ok" ambiguo, e impacto en las métricas del panel.
4. **Alcance**: aplicar solo a flujos "informativos simples" (Medicina Clínica y similares), no a los casos que derivan a operador.

### Iteración 4 — Clasificación Gemini "lazy" (asíncrona y bajo demanda)

> **Estado: completada.** La clasificación dejó de hacerse siempre en n8n; ahora `detectIntent` es asíncrono e invoca `classifyIntentWithGemini()` (`src/lib/intent-classifier.ts`) únicamente cuando las reglas determinísticas no clasificaron, con timeout y caída a `OTRAS_CONSULTAS` ante error. El nodo `Clasificar intención Gemini` se retiró del workflow de n8n.

**Requerimiento:**

- Que la petición a Gemini **no se haga siempre** (hoy se hace en n8n para todo mensaje).
- Que recién se invoque cuando el motor determinístico **no pudo clasificar**, al llegar al punto en que se consulta la información de Gemini (opción "lazy").

**Comportamiento actual (técnico):**

- n8n llama siempre al nodo `Clasificar intención Gemini` y el resultado viaja en `geminiClassification`.
- El motor (`detectIntent`) recorre sus `if` determinísticos y, recién al final, **usa** ese resultado si ninguna regla coincidió.

**Solución propuesta:**

1. Quitar el nodo `Clasificar intención Gemini` del workflow de n8n (deja de llamarse siempre).
2. Hacer **asíncronas** `detectIntent` y sus llamadores (`evaluateInboundTurn`, `getDocumentValidationRequestsForTurn`) y, solo en el fallback, llamar a una nueva `classifyIntentWithGemini()` que pegue a la REST de Gemini (mismo patrón que `document-validation.ts`, reutilizando `GEMINI_API_KEY` de `env.ts`).
3. Agregar **timeout y manejo de error**: si Gemini falla o tarda, caer a `OTRAS_CONSULTAS` sin romper el turno.
4. Actualizar pruebas (`workflow-shape`, `bot-inbound-route`) y documentación.

**Tradeoffs:**

- **A favor:** menos llamadas (menor costo y latencia), motor autocontenido, se elimina la dependencia n8n→Gemini.
- **En contra:** refactor asíncrono del motor, cambio del contrato de n8n y revalidación de la matriz de pruebas.

### Análisis técnico — Supabase: rol actual y alternativas

**Qué hace Supabase hoy en el proyecto:**

- **PostgreSQL** como base relacional (12 tablas: `operators`, `contacts`, `conversations`, `cases`, `messages`, `knowledge_base`, `routing_rules`, `twilio_templates`, `twilio_callbacks`, `conversation_events`, `app_settings`, `bot_catalog_versions`).
- **Auth** (Supabase Auth) para el login del panel, mapeado a la tabla `operators`.
- **RLS** (Row Level Security) + cliente `service_role` para escrituras privilegiadas server-side.
- SDK `@supabase/supabase-js`; migraciones por script (`db:apply`).
- **No** usa hoy Storage (las fotos no se guardan), ni Realtime, ni Edge Functions.

**Alternativas y comparación:**

| Opción | Pros | Contras |
|---|---|---|
| **Supabase (actual)** | Todo integrado (Postgres + Auth + RLS + SDK); rápido de construir; free tier; bajo mantenimiento. | Vendor lock-in; menos control sobre config/extensiones de Postgres; límites del free tier; costo crece al escalar. |
| **PostgreSQL propio + Auth.js/JWT** (Neon o servidor propio) | Control total; sin lock-in; más barato a gran escala; uso de ORM (Prisma/Drizzle). | Más trabajo: hosting, backups, autenticación y seguridad a mano (reemplazar RLS por validaciones de app). |
| **Neon / PlanetScale** (Postgres/MySQL serverless) | Serverless, branching, escala por demanda. | Requiere armar auth por separado; Neon es Postgres (mejor encaje), PlanetScale es MySQL. |
| **Firebase (Firestore + Auth)** | Realtime y auth integrados. | Modelo NoSQL poco natural para datos relacionales (casos→mensajes→conversaciones); lock-in. |
| **MongoDB / documental** | Flexible. | Poco recomendable para este esquema relacional con joins. |

**Recomendación (para revisar):**

- **Mantener Supabase** en el corto plazo: es un buen encaje para datos relacionales + Auth + RLS con poco esfuerzo.
- Reconsiderar solo si aparece alguno de estos disparadores:
  1. **Costo** a escala (el plan Pro deja de alcanzar).
  2. Necesidad de **funciones de Postgres** específicas o control fino de la base.
  3. **Residencia/compliance de datos de salud** (elegir región o self-hosted por exigencias legales).
- La migración más razonable, si llegara a ser necesaria, sería a **PostgreSQL autogestionado (Neon o servidor propio) + Auth.js**, manteniendo el mismo esquema SQL.

# Historial De Cambios

Este archivo registra cambios funcionales y operativos. A partir de la creación del repositorio, toda modificación debe agregarse aquí dentro del mismo commit.

## Iteración 1, Entrega 1: áreas, derivación y permisos

- Migración `004_roles_areas.sql`: tablas `areas`, `area_rules` (intent o profesional por área), `operator_areas` (un usuario puede tener varias áreas) y `conversations.area_ids`. Carga inicial desde la hoja "Usuarios" del Excel. Gamma queda pendiente.
- `src/lib/areas.ts`: traduce el turno (intent o profesional nombrado) a claves de área y deriva `area_ids`. Permisos: ver por área; tomar, para cualquier operador del área aunque otro compañero la tuviera; liberar y cerrar, para el dueño o si no tiene dueño dentro del área; admin siempre.
- El motor recalcula `area_ids` en cada turno con intent derivable. Saludos y OTRAS_CONSULTAS no cambian el área existente.
- Rutas: el listado filtra por área para operadores (admin ve todo). takeover, release, close, send y messages validan el área. takeover registra `previous_operator_id`.
- `npm run operator:create`: alta por línea de comandos de una cuenta de área o admin, con contraseña temporal mostrada una sola vez.
- Pruebas: derivación con los casos del Excel, carga validada contra el catálogo, matriz de permisos, rutas y mensajes entrantes reales. 343 pruebas, lint y build correctos.

## 2026-10-21

- Agregada Medicina Nuclear al catálogo Supabase publicado y al borrador existente, conservando todas sus otras ediciones. Publicación 6, 19 especialidades; entrada inicialmente desactivada y sin texto/profesionales para completar desde el panel. Validación de payloads, 343 pruebas, lint y build aprobados; web reiniciada para recargar estructura y readiness público correcto. Matriz aislada: 17 HTTP y 9 n8n aprobados, cero incidentes; ensayo detenido.

- Validación y despliegue de 1faa2f3 en servidor mediante Docker. Migración 004 aplicada explícitamente en el Supabase actual por decisión del usuario (no existe proyecto de prueba): 13 áreas, 63 reglas, RLS y columna de derivación verificados; 0 asociaciones de operadores. Build/lint y 343 pruebas aprobados, matriz con 229 escenarios, 17 HTTP y 9 n8n sin incidentes. Web/mantenimiento saludables y acceso local/público HTTP200. Documentado que test.env y validation-tools.env comparten la base productiva; sin altas/asignaciones de usuarios.

## 2026-10-20

- Diagnóstico directo autorizado de Gemini con texto sintético de turno cardiología: gemini-2.5-flash HTTP200 en 3017ms, intención TURNOS_MEDICOS_ATENCION_MEDICA con confianza 0.95. Sin WhatsApp, conversaciones ni cambios productivos; documentada la comprobación puntual.

- Versionada la retirada de la limpieza de GEMINI_API_KEY en tests/setup-env.ts; documentado el aislamiento mediante -e GEMINI_API_KEY= en Compose tools. 319 pruebas con clave vacía, lint y build aprobados; sin cambios de runtime.

- Desplegado 0f87e48 y publicado el workflow canónico en el n8n existente mediante API: mismo ID, webhook y credenciales Header Auth; eliminados los nodos Gemini/payload, 8 nodos activos. Respaldo privado fuera de Git; imágenes reconstruidas y servicios web/mantenimiento recreados saludables. Setup de Vitest corregido para eliminar la clave Gemini heredada y evitar consultas externas en pruebas herméticas (319 pruebas aprobadas, lint/build OK). Matriz aislada completa: 229 escenarios, 17 HTTP y 9 n8n, cero incidentes; readiness local/público y recursos públicos HTTP200.

- Iteración 4 (clasificación Gemini "lazy"): la intención ya no se clasifica siempre en n8n. Se retiró el nodo `Clasificar intención Gemini` (y el nodo intermedio `Preparar payload API`) del workflow canónico, que ahora reenvía el inbound directo a `/api/bot/inbound`. `detectIntent`, `evaluateInboundTurn` y `getDocumentValidationRequestsForTurn` pasaron a ser asíncronos y, solo cuando las reglas determinísticas no clasifican, invocan la nueva `classifyIntentWithGemini()` (`src/lib/intent-classifier.ts`) contra la REST de Gemini con timeout y caída a `OTRAS_CONSULTAS` ante error o ausencia de `GEMINI_API_KEY`. Se eliminó `geminiClassification` del contrato del payload. Pruebas y docs actualizados (319 pruebas, lint y build correctos).
- Aplicado en SERVER-CIT el commit 402b0c4 mediante pull fast-forward y reconstrucción Docker. Web y mantenimiento recreados saludables; 312 pruebas, lint/build y matriz aislada sin incidentes (229 escenarios, 17 HTTP, 9 n8n). Readiness local/público, inicio y vCard verificados. No se reinició Windows ni se enviaron pruebas WhatsApp reales.

- Iteración 2 (Cardiología): las especialidades ahora tienen un campo opcional `customBody` (texto general propio). Si está completo, la respuesta de la especialidad usa solo ese texto y no concatena el texto general con los bloques profesionales; si está vacío se conserva el armado automático. El editor del Banco de respuestas expone el campo con su vista previa y detección de teléfonos; la publicación valida los teléfonos del cuerpo efectivo y marca el cambio como pendiente. Generador de catálogo, esquema, validación, panel, diff de revisión y pruebas actualizados (312 pruebas, lint y build correctos).
- Handoff entre sesiones: creado MEMORY.MD con recorrido de migración, limpieza, validación y pendientes; AGENTS exige leerlo al iniciar cada chat y actualizarlo con cada cambio, reescribiendo para no superar 50 líneas. README concentra las comprobaciones pendientes antes de Fase2. Entrega Git de la migración, limpieza y documentación, con 310 pruebas, lint y build nuevamente aprobados en Docker.
- Limpieza posterior al corte Docker: retirados PM2, watchdog/instalador Windows, script de corte inicial, sincronizador antiguo de menús Twilio, snapshots n8n y recursos de ejemplo sin uso. Archivados fuera del proyecto, junto con dependencias, compilación, logs y evidencias generadas del host, preservando cambios locales.
- Reportes de herramientas trasladados a un volumen de Compose; builds y pruebas no necesitan Node ni dependencias en Windows. Conservados fixtures, importaciones, esquema y migraciones; sin cambios en datos o servicios compartidos.
- Mantenimiento registra siempre en stdout para la rotación de Docker; eliminado el fallback de archivo local y su selector de entorno.
- Retirado el manual transitorio de migración y consolidados los procedimientos vigentes y pendientes en OPERATIONS/TESTING. WhatsApp real y reinicio del servidor continúan pospuestos por decisión del usuario.
- Limpieza validada en Docker: build y lint correctos, 310 pruebas, 229 escenarios, 54 ramas, 23 transiciones, 17 verificaciones HTTP y 9 recorridos n8n aprobados, sin incidentes. Ensayo detenido y workflow temporal retirado.

- Se creó un administrador temporal de desarrollo `admindev`, con acceso por alias o email y eliminación pendiente antes del uso real. La cuenta administrativa anterior y su contraseña no se modifican; no se documentan contraseñas.

- Se verificó el corte a Docker ejecutado por el usuario: web y mantenimiento saludables, tareas nativas deshabilitadas y ensayo detenido.
- Ruta ccs.aeye.com.ar -> http://web:3010 creada en el túnel exclusivo Bot CSS; CNAME movido al UUID8a182973-237c-466c-9765-dc164c68c233, proxy y TTL conservados.
- Login, readiness y vCard públicos HTTP200 y configuración recibida por cloudflared.
- Retirada de la ruta antigua cancelada: Cloudflare advierte que también eliminaría DNS. Se conservan el túnel compartido y sus demás rutas. WhatsApp real y reinicio coordinado siguen pendientes.

## 2026-10-16

- Se dejó una guía manual con comando elevado, configuración del túnel, prueba real de WhatsApp y comprobación de reinicio. Estos pasos quedan pendientes por decisión del usuario; el proceso nativo principal se conserva hasta el corte manual.

- Empaquetado Docker multietapa y Compose para web, mantenimiento, herramientas y túnel Cloudflare dedicado.
- n8n compartido conserva el workflow y las URLs loopback; autenticación obligatoria mediante secreto y Header Auth.
- vCards generadas desde el catálogo publicado, endpoints de salud y transporte simulado restringido a instancias de prueba.
- Configuración privada fuera de Git, logs rotados, imágenes fijadas y documentación operativa Docker.
- Validación Docker: 310 pruebas, 229 escenarios, 17 verificaciones HTTP y 9 recorridos n8n aprobados; build y lint correctos; 2.143 filas anteriores conservadas.
- Imágenes compiladas y comprobadas en el puerto13010. Corte del puerto3010 pendiente de ejecutar scripts/deploy-docker.ps1 con administrador (Windows devolvió Acceso denegado). Túnel dedicado pendiente de credenciales Cloudflare; se conserva la publicación compartida.

## 2026-09-02

- Se creó el repositorio Git y la documentación técnica integral del sistema.
- Se estableció la regla obligatoria de documentación por cambio en `AGENTS.md`.
- Se clarificó el Banco de respuestas: texto general y bloques profesionales separados, edición compartida sin duplicación, teléfonos por bloque y estados editoriales explícitos.
- `Marcar revisado` pasó a persistir inmediatamente cuando el borrador está guardado.
- Se verificaron 302 pruebas, 229 escenarios, 17 contratos HTTP y 9 recorridos n8n sin incidentes.
- Se comprobó el catálogo productivo con 18 especialidades, 19 estudios, 45 profesionales y 16 obras sociales.

## Estado Funcional Acumulado

- Banco 2026 importado, reconstruido y publicado con respuestas por especialidad, profesional, subservicio y estudio.
- Títulos internos eliminados de las respuestas al paciente.
- Pregunta inicial de atención médica/imágenes eliminada; reclasificación directa por servicio.
- Variantes humanas de profesiones, títulos médicos, acentos y errores declarados.
- Cirugía separada en general, maxilofacial y estética/plástica; Cardoso/Cardozo desambiguado.
- Obras sociales reconocidas por nombres y alias explícitos.
- Saludo corto para solicitudes ya identificadas y mensajes de derivación formalizados.
- Validación robusta de frente y dorso del DNI mediante datos coincidentes.
- Panel de conversaciones modernizado y banco administrable exclusivo para administradores.
- Catálogo publicado en Supabase con borrador, revisión, publicación, historial, restauración, validación y caché en memoria.
- Cierre automático de conversaciones liberadas sin respuesta a las 24 horas.
- Aplicación, mantenimiento y túnel propio operativos en Docker Compose; n8n externo conserva el workflow. PM2 y tareas Windows del bot retirados.

# Estrategia De Pruebas

La prueba real de WhatsApp y el reinicio del host quedan pospuestos. Seguir [las comprobaciones pendientes de operación](OPERATIONS.md#comprobaciones-pendientes) cuando se retomen. No cuentan como aprobados en la matriz automática.

## Comandos

```powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env build web maintenance tools
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm -e GEMINI_API_KEY= tools npm test
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm tools npm run lint
```

La construcción de web ejecuta `npm run build` dentro de Docker. La matriz `npm run test:bot:report` se ejecuta mediante el runner aislado descrito abajo, nunca contra producción. No instalar dependencias ni compilar en el host.

Verificaciones adicionales, dentro de `tools`:

```powershell
npm run verify:catalog-db
npm run verify:catalog-admin-live
node scripts/verify-bot-live-http.mjs
node scripts/verify-bot-n8n-e2e.mjs
```

`verify:catalog-admin-live` crea, publica y restaura versiones reales sin cambiar el payload final. Solo debe ejecutarse cuando no exista un borrador administrativo en curso.

## Cobertura

- Unitarias: detección, normalización, catálogo, caché, DNI, vencimientos, modelo del editor y clasificador de intención Gemini "lazy" (timeout y caída a `OTRAS_CONSULTAS`).
- Integración: APIs administrativas, inbound, envío, persistencia y forma del workflow.
- Matriz generada: caminos por especialidad, profesión, profesional, estudio, servicio directo, cobertura y ambigüedad.
- HTTP local: contratos productivos con el proceso levantado.
- n8n E2E: webhook completo hacia la API local.
- Operación: contenedores saludables, URL pública, túnel y mantenimiento.

## Casos Críticos

- Frente y dorso de DNI coincidentes, inconsistentes, incompletos, inválidos y concurrentes.
- Solicitudes específicas iniciales sin pregunta redundante.
- Alias humanos declarados y errores ortográficos permitidos.
- Cardoso/Cardozo ambiguo y resolución por nombre o subespecialidad.
- Todas las especialidades, estudios, obras sociales y profesionales del catálogo.
- Edición de catálogo sin impacto productivo hasta publicar.
- Revisión, conflicto de `revision`, restauración y caché inmediata.
- Teléfonos derivados del bloque propietario y rechazo de formatos inválidos.
- Liberación con y sin respuesta humana y cierre idempotente a las 24 horas.

## Criterio De Alta

Una versión puede darse de alta solo si:

- no hay pruebas fallidas ni omitidas;
- lint y build terminan correctamente;
- no faltan ramas visibles en la matriz;
- HTTP y n8n E2E no tienen incidentes;
- la URL local y pública responden `200`;
- web y mantenimiento están saludables, y el túnel está conectado;
- mantenimiento termina sus ciclos correctamente y sin superposición;
- el cambio y sus pruebas están documentados.

## Línea Base

Última verificación completa: 2 de septiembre de 2026.

- 302 pruebas aprobadas.
- 229 escenarios ejecutados.
- 54 ramas y 23 transiciones cubiertas.
- 17 pruebas HTTP aprobadas.
- 9 recorridos n8n aprobados.
- Cero incidentes y cero ramas visibles faltantes.

Los reportes generados se conservan en el volumen Compose `test_reports`; no se versionan porque pueden contener información operativa. El proyecto de validación usa su propio volumen.

## Validación Docker

Ejecutar npm test, npm run lint, npm run build y npm run test:bot:report dentro de las imágenes/servicio tools. APP_BASE_URL parametriza las pruebas HTTP y N8N_WEBHOOK_BOT_CCS_URL selecciona el webhook. Usar una instancia aislada del bot con TWILIO_TRANSPORT=mock y BOT_CCS_TEST_INSTANCE=1, un workflow temporal apuntando a ella y credencial Header Auth; nunca dirigir teléfonos sintéticos al transporte real. Supabase conserva las filas anteriores; las pruebas HTTP crean filas sintéticas adicionales sin eliminar datos.

Verificar salud, vCards desde catálogo, rechazo sin secreto, persistencia después de recrear el contenedor, mantenimiento sin superposición y llamadas del n8n compartido al puerto publicado. WhatsApp real requiere un número de prueba autorizado. El reinicio del host requiere ventana coordinada por los demás servicios. No confundir healthy con verificación completa de Twilio o arranque del servidor.

### Runner reproducible de n8n

scripts/with-n8n-validation.mjs crea un workflow temporal con ruta única, reutiliza las credenciales por referencia, apunta al puerto13010, ejecuta la matriz y retira el workflow en finally. Requiere N8N_API_KEY solo en el entorno privado de tools, APP_BASE_URL=http://web:3010, N8N_ADMIN_BASE_URL=http://host.docker.internal:5678 y BOT_CCS_VALIDATION_API_URL=http://127.0.0.1:13010. El contenedor web de validación debe usar test.env sin la clave administrativa de n8n; tools puede usar validation-tools.env. No montar ese archivo en producción.

Matriz Docker de referencia del 20 de octubre de 2026: 310 pruebas aprobadas, 229 escenarios, 54 ramas, 23 transiciones, 17 verificaciones HTTP y 9 recorridos n8n, sin incidentes. Build y lint aprobados. El puerto3010 y el túnel propio ya están operativos; WhatsApp real y reinicio del host siguen pendientes.

Desde PowerShell, ejecutar el ensayo con los archivos privados ya preparados:

```powershell
$env:BOT_CCS_ENV_FILE = 'C:/ProgramData/BotCCS/test.env'
$env:BOT_CCS_PORT = '13010'
try {
  docker compose --env-file C:/ProgramData/BotCCS/deploy.env -p bot-ccs-validation up -d --no-build --wait web
  if ($LASTEXITCODE -ne 0) { throw 'Falló el inicio de validación' }
  $env:BOT_CCS_ENV_FILE = 'C:/ProgramData/BotCCS/validation-tools.env'
  docker compose --env-file C:/ProgramData/BotCCS/deploy.env -p bot-ccs-validation --profile tools run --rm -e GEMINI_API_KEY= tools node scripts/with-n8n-validation.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Falló la matriz' }
} finally {
  Remove-Item Env:BOT_CCS_ENV_FILE, Env:BOT_CCS_PORT -ErrorAction SilentlyContinue
  docker compose --env-file C:/ProgramData/BotCCS/deploy.env -p bot-ccs-validation stop web
}
```

Para leer la evidencia, usar el mismo proyecto `-p bot-ccs-validation` con `tools`, por ejemplo `cat /app/test-reports/bot-test-matrix-summary.latest.json`. No usar `down -v` si se desea conservarla.

## Comprobación de publicación del 20 de octubre de 2026

Web y mantenimiento saludables en Docker, tareas nativas deshabilitadas, ensayo detenido. Configuración remota del túnel exclusivo recibida y CNAME verificado en el panel. Login público, readiness (ok=true, testInstance=false) y laboratorio.vcf HTTP200. El cambio es de publicación y documentación; no altera el motor del bot. WhatsApp real y reinicio completo del host siguen sin ejecutar. La ruta compartida antigua se conserva hasta resolver la advertencia de eliminación de DNS.

## Validación de limpieza del 20 de octubre de 2026

Imágenes reconstruidas desde la carpeta limpia, sin dependencias ni compilación del host. Build y lint aprobados en Docker. Matriz terminada a las 17:44 UTC: 310 pruebas aprobadas, ninguna fallida u omitida; 229 escenarios, 54 ramas, 23 transiciones, 17 verificaciones HTTP y 9 recorridos n8n aprobados, cero incidentes. Se comprobó la ausencia de scripts de despliegue retirados en la imagen tools y la sintaxis del mantenimiento. Reportes persistidos en `bot-ccs-validation_test_reports`; workflow temporal retirado e instancia de ensayo detenida.

Imágenes aplicadas en producción: web y maintenance saludables, usuario node y sin montajes de fuentes del host. Mantenimiento completó su ciclo con cero cierres; las dos tareas nativas continúan deshabilitadas. Readiness local y público (`ok=true`, `testInstance=false`), página principal, vCard de laboratorio y salud del n8n existente respondieron HTTP200. El conector Cloudflare continuó activo. No se ejecutaron WhatsApp real ni reinicio del host.


## Actualización desplegada 402b0c4 — 20 de octubre de 2026

Pull fast-forward desde main, imágenes web/maintenance/tools reconstruidas con build correcto y lint aprobado. Matriz aislada finalizada a las 20:15 UTC: 312 pruebas aprobadas, ninguna fallida u omitida; 229 escenarios, 54 ramas, 23 transiciones, 17 verificaciones HTTP y 9 recorridos n8n, sin incidentes. Workflow temporal retirado e instancia de ensayo detenida. Web y maintenance recreados y saludables; readiness local y público HTTP200 (ok=true, testInstance=false), inicio y /vcards/ccs-laboratorio-clinico.vcf HTTP200. Cloudflared continuó activo. Reinicio limitado a los servicios del bot; Windows y WhatsApp real siguen pendientes.


## Aislamiento del clasificador Gemini

El setup de Vitest conserva las variables heredadas. Ejecutar las pruebas con `-e GEMINI_API_KEY=` en Compose tools para impedir consultas reales a Gemini. Las pruebas del clasificador habilitan una clave ficticia y simulan fetch explícitamente. Así las pruebas herméticas no consultan Gemini real ni dependen de su clasificación. El primer ensayo con 0f87e48 detectó esa dependencia: 318/319 pruebas; tras aislar la clave, 319/319 aprobadas. El aislamiento se aplica ahora en el comando Compose, en lugar de eliminar la variable en setup-env.ts. Esto no modifica la clave ni el clasificador del proceso productivo.

## Despliegue Gemini lazy — 20 de octubre de 2026

Commit 0f87e48 aplicado. Workflow BOT CCS real actualizado mediante API n8n, activado y cotejado con el JSON canónico: 8 nodos, sin clasificación Gemini ni Preparar payload API, conexiones idénticas, mismo webhook bot-ccs y Header Auth preservado en inbound/send/outbound. Respaldo anterior privado en C:/ServerCIT/backups/BOT_CCS.before-0f87e48.json. Web y maintenance recreados y saludables; runtime conserva GEMINI_API_KEY configurada. Build y lint aprobados. Matriz aislada finalizada 20:58 UTC: 319 pruebas sin fallos ni omisiones, 229 escenarios, 54 ramas, 23 transiciones, 17 HTTP y 9 n8n, cero incidentes. Workflow temporal retirado e instancia de ensayo detenida. Readiness local/público (ok=true, testInstance=false), página inicial y vCard de laboratorio HTTP200. No se enviaron pruebas WhatsApp reales ni se reinició Windows.

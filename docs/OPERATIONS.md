# Operación y despliegue Docker

Al retomar trabajo en un chat nuevo, leer primero [MEMORY.MD](../MEMORY.MD). Actualizarlo con cada cambio en el mismo commit, con un máximo de 50 líneas: comprimir decisiones, resultados y pendientes, reemplazando contexto obsoleto. Mantener aquí los procedimientos detallados y en CHANGELOG el historial permanente.

## Administrador temporal de desarrollo

Se creó la cuenta temporal `admindev@bot-ccs.local`, operador activo con rol `admin`. El panel acepta el alias `admindev` o el email completo. La contraseña fue elegida por el usuario y solo se guarda protegida en Supabase Auth; no debe registrarse en Git, logs ni documentación. La cuenta `admin@bot-ccs.local` y su contraseña se conservan sin cambios.

**Pendiente obligatorio antes de habilitar el sistema a usuarios reales:** eliminar la cuenta temporal `admindev`. Primero desactivar su registro en `operators` para bloquear las APIs incluso con sesiones existentes y después eliminar su identidad de Supabase Auth, preservando el historial de acciones y referencias existentes. Verificar el acceso de un administrador definitivo antes de retirarla. No automatizar un borrado de contactos, conversaciones o datos clínicos al eliminar esta cuenta.

## Alta de usuarios de área

- Desde la web (panel "Usuarios", admin): nombre (Nombre + Apellido), usuario (login único), contraseña escrita por el admin y áreas. La contraseña debe cumplir mínimo 8 caracteres, una mayúscula, una minúscula y un número; se rechaza un usuario (login) repetido. El usuario debe cambiarla en el primer acceso (y tras un reset), antes de entrar al panel.
- Por CLI: `npm run operator:create -- --username cardiologia --name "Cardiología" --areas "Cardiología"`. Varias áreas se separan con coma. Para un admin: `--role admin` (sin áreas).
- Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` o en el entorno. Ejecutar dentro del servicio Compose `tools` con las variables inyectadas.
- Crea la cuenta en Supabase Auth con email `<usuario>@bot-ccs.local` (el login acepta solo el usuario), la registra en `operators` y asigna las áreas en `operator_areas`. Si ya existe, actualiza nombre, áreas y reactiva la cuenta, sin cambiar la contraseña.
- La contraseña temporal del CLI se imprime una sola vez. Entregarla en persona y pedir el cambio en el primer acceso. No registrarla en logs ni en Git.
- Los nombres de área deben existir en la tabla `areas` (migraciones 004 y 005). Las migraciones 005, 006 y 007 ya están aplicadas en el Supabase productivo (resolución de casos, presencia y alta desde la web operativas). Pendiente de aplicar en el servidor la migración `010_password_change_required.sql` (cambio de contraseña forzado).

## Requisitos y configuración

Docker Engine con contenedores Linux y Compose. El host no necesita Node ni PM2 para BOT CCS. El n8n compartido continúa fuera de este stack y conserva los otros workflows.

Guardar runtime.env, deploy.env y tunnel-token.txt fuera del repositorio (C:/ProgramData/BotCCS). Restringir sus permisos al usuario operativo y administradores. runtime.env contiene las variables de .env.example; BOT_CCS_WEBHOOK_SECRET es obligatorio. En n8n usar la credencial Header Auth BOT CCS Docker API con el mismo secreto. Nunca exportar sus valores al workflow canónico.

Las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY se usan durante el build y son públicas por diseño. Las claves service_role, Twilio y Gemini solo se inyectan al ejecutar. Cambiar las variables públicas requiere reconstruir web.

`BOT_CCS_ADMIN_USERS` (default `admin,admindev`) define qué cuentas admin acceden a los paneles de administración (Banco de respuestas, Usuarios, Panel de datos); los usernames se separan con coma. Para rotar o agregar administradores, editar esta variable en runtime.env y recrear web con `docker compose --env-file C:/ProgramData/BotCCS/deploy.env up -d --no-build --force-recreate --wait web`; un simple restart no vuelve a leer env_file. Desde el 27/10/2026 está definida explícitamente como `admin,admindev` en el archivo privado y verificada en el contenedor.

`BOT_CCS_RESTORE_USERS` (default `admindev`) define qué cuentas pueden ver el historial y restaurar versiones del Banco de respuestas.

## Construcción y ejecución

~~~powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env build web maintenance tools
docker compose --env-file C:/ProgramData/BotCCS/deploy.env up -d web maintenance
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile public up -d cloudflared
~~~

Una sola réplica web. Puerto del host 127.0.0.1:3010; dentro del contenedor 0.0.0.0:3010. n8n nativo conserva sus llamadas HTTP a 127.0.0.1:3010. No usar localhost para comunicar contenedores entre sí.

Para ensayar sin interrumpir el proceso activo, cambiar BOT_CCS_PORT a 13010 y usar otro nombre de proyecto con -p bot-ccs-validation. Las pruebas automáticas usan TWILIO_TRANSPORT=mock y BOT_CCS_TEST_INSTANCE=1; producción usa live. Nunca ejecutar la matriz contra el transporte real con teléfonos sintéticos.

## Publicación

Crear un túnel Cloudflare exclusivo BOT CCS. Su hostname ccs.aeye.com.ar debe apuntar al servicio http://web:3010; el token se monta como Docker secret desde el archivo privado indicado en deploy.env. El perfil public permite preparar y probar web sin credenciales de Cloudflare.

Comprobar primero el túnel nuevo; cambiar el DNS y retirar solo la ruta ccs del túnel compartido. No reutilizar el token del túnel compartido: produciría conectores equivalentes y afectaría otras rutas.

Twilio mantiene inbound https://n8n.aeye.com.ar/webhook/bot-ccs y callback https://ccs.aeye.com.ar/api/twilio/status. El editor de workflows sigue en el n8n existente. Las vCards están en /vcards/ y no dependen del servidor compartido de tarjetas.

## Mantenimiento, salud y logs

maintenance ejecuta close_unanswered_released_conversations cada minuto después de terminar la ejecución anterior. No aplica migraciones, seeds ni purgas nuevas. Un fallo queda registrado y se reintenta; SIGTERM detiene el hijo y el ciclo.

/api/health/live indica vida del proceso; /api/health/ready comprueba Supabase y catálogo válido. No revelan credenciales ni contenido. Docker usa readiness y un marcador reciente de éxito para maintenance.

~~~powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env ps
docker compose --env-file C:/ProgramData/BotCCS/deploy.env logs --tail 100 web maintenance
docker compose --env-file C:/ProgramData/BotCCS/deploy.env restart web
~~~

Logs por stdout/stderr con rotación de 3 archivos de 10 MB. unless-stopped reinicia procesos terminados, no contenedores que solo estén unhealthy: investigar y reiniciar explícitamente. Docker debe iniciar con SERVER-CIT; comprobarlo mediante un reinicio coordinado del host.

## Herramientas, actualizaciones y recuperación

~~~powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm tools npm test
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm tools npm run lint
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm tools npm run verify:catalog-db
~~~

Las migraciones e importaciones se ejecutan explícitamente con el servicio tools y los comandos npm documentados en package.json; no al arrancar. Ver CATALOG.md para trabajar con archivos de importación. Las evidencias se guardan en `/app/test-reports`, dentro del volumen Compose `test_reports` (por proyecto: `bot-ccs_test_reports` o `bot-ccs-validation_test_reports`). No se genera una carpeta de reportes en el host. Para inspeccionar sus archivos:

~~~powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm tools ls -lh /app/test-reports
~~~

Los reportes se conservan al retirar contenedores. `down -v` elimina el volumen: no usarlo si se necesita conservar esa evidencia. Si se exportan reportes para diagnóstico, guardarlos fuera de Git y con permisos restringidos.

Antes de actualizar, conservar las imágenes anteriores por etiqueta y respaldar configuración privada y exportación del workflow. Respaldar Supabase con el mecanismo del proyecto externo y comprobar su restauración según el plan contratado: copiar este repositorio no respalda los datos. No volcar pacientes en Git.

Las tareas ServerCIT BOT CCS Recovery y ServerCIT BOT CCS Conversation Maintenance ya están deshabilitadas. No reactivarlas. Los scripts de PM2, instaladores de tareas Windows y el script del corte inicial se retiraron del proyecto. Para actualizar se construyen las imágenes y se ejecuta `up -d` como se indica arriba.

Para volver atrás: desplegar la imagen anterior y su configuración compatible. Conservar el estado de Supabase y no ejecutar db:seed como recuperación. Diagnosticar el túnel exclusivo sin modificar rutas ni DNS de las otras aplicaciones.

## Limpieza del proyecto

Se conservaron fuera del repositorio los scripts retirados, snapshots antiguos de n8n y archivos generados del host en `C:/ServerCIT/backups/bot-ccs-cleanup-20261020-143727`, con permisos restringidos. Esa copia incluye cambios locales que tenían los scripts antiguos. El servicio Docker no monta `node_modules`, `.next`, logs ni fuentes del host; no depende de esos archivos archivados.

Solo se conserva `n8n/BOT_CCS.workflow.json` como exportación canónica sin secretos. Se retiró el sincronizador de menús Twilio list-picker sin consumidores en el código actual; no se eliminaron templates de Twilio ni tablas o datos de Supabase. Las plantillas aprobadas siguen como una iteración futura en README.

## Publicación verificada el 20 de octubre de 2026

Túnel exclusivo: Bot CSS, UUID 8a182973-237c-466c-9765-dc164c68c233. Hostname ccs.aeye.com.ar, origen http://web:3010. CNAME ccs -> 8a182973-237c-466c-9765-dc164c68c233.cfargotunnel.com, proxy activado y TTL automático. Cloudflared recibió la configuración remota; dominio, readiness y vCard respondieron200.

Se conserva la ruta ccs antigua en el túnel Server CIT (082b5e55-3ff9-489c-ae27-0e646b02ce74), aunque el DNS apunta al exclusivo. La interfaz advierte que eliminarla también elimina su DNS: se canceló la operación. Para retirarla en otra intervención, preservar y volver a verificar el CNAME exclusivo; no borrar el túnel compartido ni detener su servicio. No se modificaron rutas o registros de n8n ni de otras aplicaciones.

## Comprobaciones pendientes

WhatsApp real y el reinicio completo de SERVER-CIT se posponen por decisión del usuario. No cuentan como pruebas aprobadas.

### WhatsApp real

Usar un teléfono propio o expresamente autorizado. Los mensajes reales tienen los cargos normales de Twilio.

1. Confirmar en el n8n existente que BOT CCS está activo y que inbound, send y outbound usan Header Auth BOT CCS Docker API y `http://127.0.0.1:3010/api/bot/...`. No copiar secretos al workflow.
2. Verificar el número WhatsApp de la clínica en el sender de Twilio y escribirle desde el teléfono autorizado. En esta instalación la referencia es +54 9 351 642-4148.
3. Enviar `hola` y comprobar saludo y mensaje en el panel; enviar `laboratorio` y comprobar respuesta y vCard con el teléfono del catálogo publicado.
4. Enviar `quiero un turno con cardiología` y comprobar la captura de datos. Usar datos y documentos ficticios; el bot no confirma una reserva real.
5. Tomar control en el panel, escribir desde el teléfono y comprobar el silencio del bot. Responder como operador y verificar la entrega; liberar el control y comprobar el comportamiento automático según el estado de la conversación.
6. Comprobar el SID y estado de entrega en el panel/Twilio. `read` depende de las confirmaciones de lectura. No guardar mensajes, números privados ni imágenes en Git.

El workflow evita guardar cuerpos de ejecuciones: una lista vacía de ejecuciones no demuestra un fallo. Revisar la conversación y el mensaje en Twilio. Si no responde, revisar salud, workflow, Header Auth, URLs y errores de Twilio. Nunca ejecutar la matriz sintética con transporte real.

### Reinicio del servidor

Coordinar una ventana con los responsables de los servicios compartidos. Después del reinicio, verificar que Docker inicia, web y maintenance están saludables, cloudflared reconecta y `https://ccs.aeye.com.ar/api/health/ready` devuelve `ok: true`, `testInstance: false`. Confirmar catálogo, conversaciones conservadas y acceso del n8n existente al puerto3010. No reactivar tareas nativas. `unless-stopped` depende de que el motor Docker esté activo.

La retirada segura de la ruta compartida antigua y la eliminación del administrador temporal también siguen pendientes según los apartados anteriores. Registrar el resultado en TESTING y CHANGELOG después de cada comprobación.

## Áreas: migraciones aplicadas

El servidor dispone de un único proyecto Supabase externo. Los archivos test.env y validation-tools.env apuntan al mismo proyecto que runtime.env; el transporte mock no aísla la base de datos. El usuario autorizó expresamente aplicar `004_roles_areas.sql` en ese proyecto actual. Se ejecutó únicamente esa migración mediante pg dentro de tools, en transacción y con lock_timeout de 10s, sin repetir las migraciones anteriores ni ejecutar seeds. Resultado: 13 áreas, 63 reglas y ninguna asociación de operador. RLS habilitado en las tres tablas nuevas; conversations.area_ids es uuid[] NOT NULL. Los operadores comunes necesitan asignación explícita antes de acceder a las conversaciones de sus áreas. La creación/asignación de usuarios sigue el procedimiento CLI de este documento; no se crearon cuentas automáticamente.

El 27 de octubre de 2026 se completó la puesta al día del servidor principal: `git pull` + rebuild Docker de las entregas 2-3 y el panel de datos, y aplicación de las migraciones `005_gamma_contacto_profesionales.sql`, `006_resolution_status.sql` y `007_presence.sql` (resolución de casos, presencia y alta de usuarios desde la web operativas). También se ejecutó `fix-medicina-nuclear-as-study.mjs --apply`, se reinició web y se completó el texto del estudio desde el panel, y se configuró `BOT_CCS_ADMIN_USERS` en runtime.env.

Pendiente de aplicar en el servidor (mismo commit): migraciones `008_clinica_medica_edificios.sql`, `009_servicios_sin_area.sql` y `010_password_change_required.sql`; y los scripts `add-servicios-sin-area.mjs --apply`, `enable-medicina-nuclear.mjs --apply` y `fix-direccion-dermatologo.mjs --apply` (todos dentro del servicio tools, con `SUPABASE_SERVICE_ROLE_KEY`), seguido de reinicio de web para recargar la caché.

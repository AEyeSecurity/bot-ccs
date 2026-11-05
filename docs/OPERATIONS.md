# Operación y despliegue Docker

Al retomar trabajo en un chat nuevo, leer primero [MEMORY.MD](../MEMORY.MD). Actualizarlo con cada cambio en el mismo commit, con un máximo de 50 líneas: comprimir decisiones, resultados y pendientes, reemplazando contexto obsoleto. Mantener aquí los procedimientos detallados y en CHANGELOG el historial permanente.

## Administrador temporal de desarrollo

Se creó la cuenta temporal `admindev@bot-ccs.local`, operador activo con rol `admin`. El panel acepta el alias `admindev` o el email completo. La contraseña fue elegida por el usuario y solo se guarda protegida en Supabase Auth; no debe registrarse en Git, logs ni documentación. La cuenta `admin@bot-ccs.local` y su contraseña se conservan sin cambios.

**Decisión del 05/11/2026:** conservar `admin@bot-ccs.local` y `admindev@bot-ccs.local`, activas y con sus contraseñas. El endpoint de borrado protege ambas cuentas. Se revoca el pendiente de retirar admindev; conserva su permiso de restauración.

## Alta de usuarios de área

- Desde la web (panel "Usuarios", admin): nombre de cuenta o sector, usuario (login único), contraseña escrita por el admin y áreas. La contraseña debe cumplir mínimo 8 caracteres, una mayúscula, una minúscula y un número; se rechaza un usuario (login) repetido. El usuario debe cambiarla en el primer acceso (y tras un reset), antes de entrar al panel.
- Para eliminar un usuario: abrir su edición en Usuarios y confirmar "Eliminar usuario". Requiere acceso administrativo; no permite borrar la propia cuenta. Elimina también Supabase Auth; las referencias históricas se desvinculan según las FK. No usar cuentas reales para verificar el borrado.
- Por CLI: `npm run operator:create -- --username cardiologia --name "Cardiología" --areas "Cardiología"`. Varias áreas se separan con coma. Para un admin: `--role admin` (sin áreas).
- Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` o en el entorno. Ejecutar dentro del servicio Compose `tools` con las variables inyectadas.
- Crea la cuenta en Supabase Auth con email `<usuario>@bot-ccs.local` (el login acepta solo el usuario), la registra en `operators` y asigna las áreas en `operator_areas`. Si ya existe, actualiza nombre, áreas y reactiva la cuenta, sin cambiar la contraseña.
- La contraseña temporal del CLI se imprime una sola vez. Entregarla en persona y pedir el cambio en el primer acceso. No registrarla en logs ni en Git.
- Los nombres de área deben existir en la tabla `areas` (migraciones 004 y 005). Las migraciones 005, 006 y 007 ya están aplicadas en el Supabase productivo (resolución de casos, presencia y alta desde la web operativas). Migración `010_password_change_required.sql` aplicada el 28/10/2026 (cambio de contraseña forzado); ver CHANGELOG.

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

### Error público 1033 con Docker Desktop abierto

El 02/11/2026 se recuperó una caída donde Cloudflare mostraba Bot CSS Down (cero conectores), Docker Desktop seguía abierto pero faltaban com.docker.backend y el pipe dockerDesktopLinuxEngine. Primero comprobar `docker ps` y el backend; una interfaz abierta no acredita que el motor funcione. Intentar `docker desktop restart`. Si no responde y el backend está ausente, cerrar los procesos Docker Desktop/com.docker.build y relanzar el ejecutable instalado de Docker Desktop. Esta operación recupera el motor compartido y sus contenedores existentes; no borrar datos ni ejecutar down -v. Verificar web/maintenance healthy, conector activo, túnel Healthy y readiness local/público. AutoStart estaba habilitado y unless-stopped recuperó los servicios; no se identificó el desencadenante de la caída del backend.

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

WhatsApp real y el reinicio completo de SERVER-CIT continúan pendientes y no cuentan como pruebas aprobadas. El 05/11 el usuario retomó la preparación de conexión WhatsApp; primero obtener acceso del administrador a Twilio/Meta y resolver el estado del sender. El reinicio del host sigue requiriendo una ventana coordinada.

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

La retirada segura de la ruta compartida antigua sigue pendiente según los apartados anteriores. Registrar el resultado en TESTING y CHANGELOG después de cada comprobación.

## Áreas: migraciones aplicadas

El servidor dispone de un único proyecto Supabase externo. Los archivos test.env y validation-tools.env apuntan al mismo proyecto que runtime.env; el transporte mock no aísla la base de datos. El usuario autorizó expresamente aplicar `004_roles_areas.sql` en ese proyecto actual. Se ejecutó únicamente esa migración mediante pg dentro de tools, en transacción y con lock_timeout de 10s, sin repetir las migraciones anteriores ni ejecutar seeds. Resultado: 13 áreas, 63 reglas y ninguna asociación de operador. RLS habilitado en las tres tablas nuevas; conversations.area_ids es uuid[] NOT NULL. Los operadores comunes necesitan asignación explícita antes de acceder a las conversaciones de sus áreas. La creación/asignación de usuarios sigue el procedimiento CLI de este documento; no se crearon cuentas automáticamente.

El 27 de octubre de 2026 se completó la puesta al día del servidor principal: `git pull` + rebuild Docker de las entregas 2-3 y el panel de datos, y aplicación de las migraciones `005_gamma_contacto_profesionales.sql`, `006_resolution_status.sql` y `007_presence.sql` (resolución de casos, presencia y alta de usuarios desde la web operativas). También se ejecutó `fix-medicina-nuclear-as-study.mjs --apply`, se reinició web y se completó el texto del estudio desde el panel, y se configuró `BOT_CCS_ADMIN_USERS` en runtime.env.

Completado el 28/10/2026: migraciones 008/009 junto con las transformaciones de catálogo y posteriormente 010, con validación y despliegue documentados en CHANGELOG. No repetir migraciones ni scripts de contenido como parte de la conexión de Twilio.

## Conectar el número definitivo de WhatsApp con Twilio

Guía revisada el 05/11/2026. No implica que el número definitivo esté habilitado. El usuario confirmó que el número definitivo coincide con el remitente configurado terminado en 4148 y que está registrado. No tiene acceso a Twilio/Meta; falta identificar titular/administrador y si el registro corresponde a app móvil u otro proveedor. Confirmar acceso a SMS/llamada antes de cualquier traslado. No confundir el remitente único del bot con los teléfonos de contacto de las áreas: cambiar el remitente no cambia el catálogo publicado.

### Estado observado y pendientes reales

Consulta de solo lectura del 05/11: contenedores web/maintenance saludables; runtime usa transporte live, no es instancia de ensayo y tiene SID/Auth Token configurados, sin Messaging Service. La cuenta consultada figura active/Full. El remitente configurado termina en 4148 y la API Senders v2 lo informa OFFLINE, con webhook inbound correcto; offline_reasons es null. Esto no identifica la causa: revisar el remitente en Console y WhatsApp Manager. No se enviaron mensajes ni se cambió configuración.

Antes de atención real siguen pendientes: habilitar/verificar el remitente definitivo y WhatsApp real; validar cuentas/áreas y contraseñas con sesión; rotar la contraseña administrativa de Tareas; confirmar catálogo/textos/decisiones del cliente; verificar cifrado y copias/restauración; capacitación y aceptación; reinicio coordinado del host y retirada segura de ruta Cloudflare antigua. Ver ROADMAP/MEMORY. Los alias de biopsia/colonoscopia siguen pendientes. Transferencia manual y otras prestaciones de Fase 2 no bloquean técnicamente la conexión, pero no están implementadas.

### 1. Registrar o revisar el remitente

En la cuenta/subcuenta Twilio que usará la clínica, abrir WhatsApp Senders. Si el número ya existe, revisar su estado y errores antes de darlo de alta otra vez. Para alta directa de la clínica, usar Self Sign-up con acceso administrador al Meta Business Portfolio, seleccionar su WABA, verificar el número por SMS/voz y completar las revisiones que indique Meta/Twilio. Se admite un número externo a Twilio: no comprar otro solo por conectarlo.

Si el número está activo en WhatsApp/WhatsApp Business del celular, definir primero el traslado: la guía actual de Twilio indica liberar la cuenta móvil; no borrar la cuenta ni interrumpir la línea durante este diagnóstico. Si ya usa otro proveedor de API, seguir migración de proveedor. No asumir coexistencia de app móvil y Twilio. Si A-Eye incorpora clientes como ISV en cuentas propias, revisar la ruta Tech Provider en lugar de aplicar automáticamente el alta directa.

Referencias oficiales: [Self Sign-up y requisitos](https://www.twilio.com/docs/whatsapp/self-sign-up), [migraciones](https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders), [Senders API v2 y estados](https://www.twilio.com/docs/whatsapp/api/senders). La aprobación operativa se comprueba con estado ONLINE y prueba de entrega; estar en Phone Numbers o disponer de la SIM no acredita habilitación WhatsApp.

### 2. Configurar recepción y confirmaciones

En el sender de WhatsApp (o Integration del Messaging Service si se adopta uno), configurar:

| Campo | Valor |
|---|---|
| Webhook de mensajes entrantes | `https://n8n.aeye.com.ar/webhook/bot-ccs` |
| Método | `POST` |
| Status callback | `https://ccs.aeye.com.ar/api/twilio/status` |

Usar el webhook de producción `/webhook/`, no `/webhook-test/`. El workflow BOT CCS debe estar activo/publicado: no necesita el editor abierto ni el botón de escucha manual. Sus nodos inbound/send/outbound apuntan a `http://127.0.0.1:3010/api/bot/...` y usan Header Auth `x-bot-ccs-secret`, coincidente con BOT_CCS_WEBHOOK_SECRET. Esta credencial es para n8n→bot; no introducirla como requisito adicional del webhook Twilio→n8n.

El código también envía el callback configurado en cada mensaje saliente; que el campo callback del sender esté vacío no demuestra que falten callbacks por mensaje.

### 3. Ajustar runtime privado

Editar `C:/ProgramData/BotCCS/runtime.env`, sin guardar valores reales en Git:

```dotenv
TWILIO_ACCOUNT_SID=<SID de la cuenta/subcuenta del sender>
TWILIO_AUTH_TOKEN=<Auth Token de esa cuenta>
TWILIO_WHATSAPP_FROM=whatsapp:<numero exacto registrado en Twilio>
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_STATUS_CALLBACK_URL=https://ccs.aeye.com.ar/api/twilio/status
TWILIO_WEBHOOK_URL=https://n8n.aeye.com.ar/webhook/bot-ccs
N8N_WEBHOOK_BOT_CCS_URL=https://n8n.aeye.com.ar/webhook/bot-ccs
TWILIO_TRANSPORT=live
BOT_CCS_TEST_INSTANCE=0
```

Conservar el resto de variables y el secreto compartido existente. Copiar el número internacional exacto del sender, con `+` y sin espacios; no inferir prefijos argentinos ni pegar el formato local con 0/15. Esta versión autentica Twilio con Account SID + Auth Token: las variables API_KEY de la plantilla no son consumidas por el cliente actual.

Si se define TWILIO_MESSAGING_SERVICE_SID, el código usa el servicio en lugar de enviar `from`: incluir el sender definitivo en su pool y revisar qué números puede seleccionar. Para esta instalación, actualmente sin servicio, dejarlo vacío permite fijar el remitente.

Después de acordar el cambio, recrear web en una ventana de baja actividad; no hace falta build por cambiar estas variables:

```powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env up -d --no-build --force-recreate --wait web
```

Antes, comprobar la imagen seleccionada en deploy.env: el comando usa esa etiqueta local, que puede haber sido reconstruida para validación. Si se necesita conservar exactamente el binario activo, fijar una etiqueta de la imagen activa antes de recrear. Un restart no recarga runtime.env. No ejecutar el comando durante una guía de diagnóstico sin haber acordado el cambio del número.

### 4. Verificar qué número funciona

Desde otro teléfono autorizado, escribir al número definitivo mostrado por Twilio. Iniciar con `hola` abre la ventana de atención de 24 horas para respuestas libres; fuera de esa ventana se requieren plantillas aprobadas, que este bot no implementa como flujo de recontacto. [Guía oficial de envío/recepción](https://www.twilio.com/docs/whatsapp/quickstart).

Comprobar en este orden: mensaje entrante en Twilio con To igual al número definitivo; conversación en el CRM; respuesta saliente cuyo From sea ese mismo número; estado delivered en Twilio y recepción visible en el teléfono. queued/sent no acreditan entrega, y read depende de confirmaciones de lectura. Luego probar laboratorio/vCard, turno de cardiología y control humano con datos ficticios. Ver procedimiento WhatsApp real de este documento.

Si no entra en Twilio: revisar registro/estado del sender y número destinatario. Si entra allí pero no en CRM: revisar webhook, workflow, conectividad y Header Auth. Si entra en CRM pero no responde: revisar transporte, cuenta y remitente, ventana de atención y código de error en Messaging Logs. Si el número saliente difiere: revisar runtime y Messaging Service. No usar la matriz de teléfonos sintéticos con transporte live.

El Sandbox sirve para probar con el número compartido de Twilio y participantes vinculados por código join; no habilita por sí mismo el número de la clínica. [Sandbox oficial](https://www.twilio.com/docs/whatsapp/sandbox).

### Solicitar acceso al responsable

Pedir invitación al correo de trabajo a la cuenta/subcuenta Twilio que contiene el sender, con permisos para revisar/configurar WhatsApp Senders y ver Messaging Logs. El propietario puede usar Settings > Account settings > User management (o Twilio Admin > Users según la consola) e invitar al correo de trabajo al ámbito correcto; [gestión oficial de usuarios](https://www.twilio.com/docs/iam/organizations/managed-users). No pedir acceso de propietario a toda la organización para revisar una sola cuenta. Para un alta o vinculación Meta, el administrador del Business Portfolio debe realizarla o conceder el acceso administrativo necesario; para diagnóstico, puede mostrar WhatsApp Manager en una sesión compartida sin compartir contraseña. Confirmar quién controla la SIM/línea para recibir códigos. Los códigos se introducen en el portal oficial por el responsable, no se guardan en este proyecto.

Texto sugerido: «Para conectar el WhatsApp de la clínica al bot necesito identificar quién administra Twilio y el portfolio comercial de Meta. ¿Pueden invitar mi correo de trabajo a la cuenta Twilio del número, con permisos de WhatsApp Senders y registros de mensajes? Necesitamos que el administrador de Meta revise con nosotros la cuenta WhatsApp y complete cualquier validación pendiente. El número ya está cargado en Twilio pero figura OFFLINE. Confirmen también si se usa desde WhatsApp Business del celular y quién puede recibir SMS/llamadas de verificación. Por ahora no borren la cuenta ni cambien el registro del número».

## Cuentas de sector y limpieza aprobada (05/11/2026)

Migraciones 011 y 012 aplicadas por separado en transacción, sin repetir seeds/migraciones previas. `operators.personas_list` guarda una lista informativa de hasta 50 personas con Nombre y Apellido separados (máximo 100 caracteres cada campo). En Usuarios usar + Agregar persona para abrir otra tarjeta, Quitar persona para retirarla y Guardar cambios para persistir la lista. Se rechaza una tarjeta incompleta; la lista puede quedar vacía. El texto antiguo `operators.personas` se conserva sin conversión automática y se muestra para revisión cuando no hay lista (en el servidor estaba vacío al aplicar 012). Las personas no intervienen en permisos, presencia, asignación ni atribución de mensajes: la cuenta sigue siendo el login compartido del sector. El nombre de cuenta admite un sector sin apellido.

`node scripts/reset-sector-accounts.mjs` muestra solo cantidades y comprueba los dos administradores activos. Con `--apply` elimina las demás cuentas registradas en operators y sus identidades Auth: primero desactiva, archiva sus eventuales conversaciones en control humano sin cambiar la resolución, y luego elimina Auth/operador. No purga conversaciones, contactos ni mensajes; las FK desvinculan referencias y se pierde la atribución por usuario eliminado. No toca identidades Auth ajenas a operators. Ejecutar dentro de tools con el entorno privado; es una operación explícita de reinicio, no parte del arranque ni del despliegue normal. Si falla parcialmente, revisar el estado antes de repetir.

El panel ya no ofrece cierre manual. Usar Abierta/Pendiente/Resuelta y liberar el bot según corresponda; se conserva el cierre automático por inactividad y por liberación sin respuesta a las 24 h. La tarjeta Archivadas cuenta status=closed e incluye cierres históricos/manuales y de limpieza; no equivale a casos resueltos. La API de cierre existente se conserva por compatibilidad, sin acceso desde el panel.

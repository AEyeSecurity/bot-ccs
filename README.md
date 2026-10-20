# BOT CCS

Asistente WhatsApp y panel de atención para Clínica Cruz del Sur. El motor es determinístico: Gemini clasifica y valida documentos, pero no redacta respuestas al paciente.

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

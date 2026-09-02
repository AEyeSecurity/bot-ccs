# Operación Y Despliegue

## Requisitos

- Windows con PowerShell.
- Node.js y npm.
- PM2 instalado para el usuario operativo.
- n8n self-hosted.
- Proyecto Supabase y cuenta Twilio configurados.
- Cloudflare Tunnel apuntando `ccs.aeye.com.ar` a `http://localhost:3010`.

## Instalación Local

```powershell
npm ci
Copy-Item .env.example .env.local
npm run db:apply
npm run db:seed
npm run build
```

Completar `.env.local` con los secretos reales. Nunca versionar ese archivo.

## Desarrollo Y Producción

```powershell
npm run dev
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Servicio esperado:

- Nombre PM2: `bot-ccs-web`
- Puerto: `3010`
- URL local: `http://127.0.0.1:3010/`
- URL pública: `https://ccs.aeye.com.ar/`

## n8n Y Twilio

Workflow canónico: `n8n/BOT_CCS.workflow.json`.

```powershell
n8n import:workflow --input "C:\BOT CCS\n8n\BOT_CCS.workflow.json"
```

Endpoints principales:

- Twilio inbound: `https://n8n.aeye.com.ar/webhook/bot-ccs`
- Estado Twilio: `https://ccs.aeye.com.ar/api/twilio/status`
- API local inbound: `http://127.0.0.1:3010/api/bot/inbound`
- API local de envío: `http://127.0.0.1:3010/api/bot/send`
- Registro outbound: `http://127.0.0.1:3010/api/bot/outbound`

## Mantenimiento Automático

`BOT CCS Watchdog` verifica la página local y recupera `bot-ccs-web` con PM2 si no responde.

`BOT CCS Conversation Maintenance` ejecuta cada minuto `scripts/run-conversation-maintenance.mjs`; cierra conversaciones liberadas sin respuesta al vencer 24 horas, cancela casos abiertos y no envía mensajes al paciente.

```powershell
Get-ScheduledTask -TaskName "BOT CCS*"
Get-ScheduledTaskInfo -TaskName "BOT CCS Watchdog"
Get-ScheduledTaskInfo -TaskName "BOT CCS Conversation Maintenance"
```

El resultado esperado de ambas tareas es `0`.

## Alta De Una Versión

```powershell
npm test
npm run lint
npm run build
npm run test:bot:report
pm2 restart bot-ccs-web
pm2 save
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3010/
Invoke-WebRequest -UseBasicParsing https://ccs.aeye.com.ar/
```

No reiniciar n8n si no cambió el workflow. Un cambio de contenido publicado desde el panel no requiere build ni reinicio.

## Diagnóstico

1. Comprobar `pm2 status`.
2. Comprobar `http://127.0.0.1:3010/` antes del dominio público.
3. Revisar `pm2 logs bot-ccs-web --lines 100 --nostream`.
4. Verificar tareas programadas y sus últimos resultados.
5. Ejecutar `npm run verify:catalog-db`.
6. Ejecutar `node scripts/verify-bot-live-http.mjs`.
7. Si falla el inbound, revisar primero n8n y luego `/api/bot/inbound`.
8. Si aparece `fetch failed` o `ECONNREFUSED`, confirmar que Next esté escuchando en `3010` y que n8n use `127.0.0.1`, no una dirección externa incorrecta.

No incluir tokens, cuerpos con datos de pacientes ni imágenes de DNI en tickets, commits o documentación.

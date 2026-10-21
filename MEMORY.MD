# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-20. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.

## Último trabajo y cómo se hizo
- Diagnóstico Gemini real autorizado: mensaje sintético de turno cardiología, mismo clasificador/prompt/configuración; gemini-2.5-flash HTTP200 en 3017ms, TURNOS_MEDICOS_ATENCION_MEDICA, confianza 0.95. Sin WhatsApp ni persistencia de conversación. No prueba la estabilidad del proveedor.
- Cierre Git: versionada la retirada local de delete GEMINI_API_KEY en tests/setup-env.ts; aislamiento trasladado al comando Compose en TESTING. 319 pruebas con clave vacía, lint y build aprobados; sin cambio productivo.
- Operación 2026-10-20: pull 0f87e48; workflow real BOT CCS actualizado y activado vía API n8n, mismo ID/webhook/Header Auth, 8 nodos canónicos sin Gemini. Respaldo privado fuera de Git. Web/maintenance recreados saludables; clave Gemini presente en runtime. Tests conservan el entorno; ejecutar tools con -e GEMINI_API_KEY= para evitar llamadas reales; 319 pruebas y lint/build OK; matriz 20:58 UTC: 229 escenarios, 17 HTTP y 9 n8n, cero incidentes. Ensayo detenido; readiness local/público, inicio y vCard HTTP200.
- Iteración 4 (Gemini lazy) completada: se retiró el nodo `Clasificar intención Gemini` (y `Preparar payload API`) del workflow n8n; `detectIntent`/`evaluateInboundTurn`/`getDocumentValidationRequestsForTurn` son async y, solo en el fallback, llaman a `classifyIntentWithGemini()` (nuevo `src/lib/intent-classifier.ts`, REST Gemini con timeout 5s, cae a OTRAS_CONSULTAS si falla o falta GEMINI_API_KEY). Se quitó `geminiClassification` del contrato del payload. Nuevo `GEMINI_INTENT_MODEL`. 319 pruebas, lint y build OK.
- Despliegue 2026-10-20: pull fast-forward a 402b0c4, imágenes reconstruidas y web/maintenance recreados saludables. 312 pruebas, lint/build, 229 escenarios, 17 HTTP y 9 n8n OK; readiness local/público, inicio y vCard HTTP200. Ensayo detenido. Reinicio de servicios Docker; host sin reiniciar.
- Iteración 2 completada: campo opcional `customBody` por especialidad (texto general propio). Si está lleno, la respuesta de la especialidad ignora el armado automático (texto general + bloques). Schema zod, activateCatalog, editor del panel (campo + vista previa + teléfonos), diff de revisión, extracción de teléfonos del cuerpo efectivo, generador y pruebas. 312 pruebas, lint y build OK.
- README ahora incluye "Próximas Iteraciones" (roles/permisos, texto propio, cierre confirmado, Gemini lazy, análisis Supabase) tras integrar notas locales al hacer pull.
- Se migró y desplegó BOT CCS en Docker Compose: web, maintenance y cloudflared; tools bajo perfil opcional.
- Dockerfile multietapa, Next.js standalone en producción, usuario node, una réplica; host 127.0.0.1:3010 -> web:3010.
- Mantenimiento cada minuto sin superposición; logs stdout rotados por Docker y healthchecks. No arrancar PM2.
- El usuario ejecutó el corte elevado; las tareas Windows Recovery y Conversation Maintenance quedaron deshabilitadas.
- Se conservó n8n.aeye.com.ar externo y editable, workflow BOT CCS activo; inbound/send/outbound llaman al host3010 con Header Auth.
- /api/bot/* exige BOT_CCS_WEBHOOK_SECRET; exportación canónica sin secretos en n8n/BOT_CCS.workflow.json.
- Supabase sigue externo y conserva los datos. Catálogo publicado es la única fuente productiva, sin fallback XLSX/TS.
- Las vCards se generan en /vcards/ desde el catálogo; documentos se validan transitoriamente en memoria con Gemini.
- Túnel exclusivo "Bot CSS": 8a182973-237c-466c-9765-dc164c68c233, origen http://web:3010; CNAME ccs apunta a ese UUID.cfargotunnel.com.
- Twilio conserva inbound https://n8n.aeye.com.ar/webhook/bot-ccs y callback https://ccs.aeye.com.ar/api/twilio/status.
- Configuración privada fuera de Git: C:/ProgramData/BotCCS/{deploy.env,runtime.env,tunnel-token.txt}; no imprimir sus valores.
- test.env y validation-tools.env privados aíslan pruebas con TWILIO_TRANSPORT=mock y BOT_CCS_TEST_INSTANCE=1; producción usa live.
- Se creó admindev@bot-ccs.local temporal con rol admin; login acepta admindev/admin o email. La cuenta admin anterior no se modificó.
- Limpieza: archivados PM2, watchdog/instalador Windows, script del corte, manual transitorio, snapshots n8n y sincronizador de menús Twilio sin uso.
- También se retiraron recursos de ejemplo, node_modules, .next, logs y reportes del host; no tocar datos, migraciones ni fixtures/importaciones.
- Respaldo de limpieza con cambios locales: C:/ServerCIT/backups/bot-ccs-cleanup-20261020-143727; hay respaldos previos de la migración.
- Los reportes ahora persisten en volúmenes Compose test_reports (uno por proyecto); no usar down -v si se necesitan.
- Se reconstruyeron imágenes, probó en13010 y aplicó web/mantenimiento en3010; servicios saludables, usuario node, sin montajes de fuentes.
- Runner scripts/with-n8n-validation.mjs crea workflow temporal, ejecuta matriz y lo retira; ensayo detenido después de validar.
- Validación 2026-10-20 17:44 UTC: build/lint OK, 310 pruebas, 229 escenarios, 54 ramas, 23 transiciones, 17 HTTP, 9 n8n, cero incidentes.
- Salud local/pública, login, vCard y salud de n8n HTTP200; mantenimiento completó ciclo; cloudflared siguió conectado.
- Se consolidaron pendientes en README antes de Fase2 y procedimientos en OPERATIONS; eliminado MIGRATION-MANUAL.md.
- Cierre: README ordena pendientes antes de Fase2; esta memoria y AGENTS establecen continuidad obligatoria, máximo 50 líneas.
- Antes de entregar en Git/main se repitieron 310 pruebas, lint y build en Docker; sin valores privados en los archivos preparados. Consultar git log/status para verificar la entrega.

## Pendientes y siguiente paso
- WhatsApp real POSPUESTO por el usuario: requiere teléfono autorizado; seguir OPERATIONS, no enviar pruebas sintéticas con transporte live.
- Reinicio del host POSPUESTO: coordinar por servicios compartidos; comprobar arranque Docker, salud, túnel, persistencia y n8n.
- Retirar ruta ccs del túnel compartido sin perder el CNAME exclusivo: Cloudflare advierte que también elimina DNS; se canceló esa operación.
- Antes del uso real, verificar admin definitivo y retirar admindev (desactivar operators y luego Auth, conservando historial).
- No declarar cerradas esas comprobaciones. Al retomarlas actualizar README, MEMORY, TESTING y CHANGELOG; después desarrollar Fase2 en iteraciones separadas.
- Próxima sesión: leer esta memoria, revisar git status y estado Docker; acordar qué pendiente/iteración se retoma (siguientes: Iteración 1 roles/permisos o Iteración 3 cierre confirmado), sin reiniciar ni enviar WhatsApp por iniciativa propia.

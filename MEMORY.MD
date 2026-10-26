# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-26. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- DESPLEGADO 41b1774 el 26/10: imagen pull-41b1774 aplicada como docker-migration, web/maintenance recreados saludables. 374 pruebas, lint/build OK; matriz 22:29 UTC: 229 escenarios, 17 HTTP/9 n8n, cero incidentes. Readiness local/público/inicio/vCard HTTP200. Admins efectivos admin,admindev por default; ensayo detenido/workflow temporal retirado. Imagen anterior before-41b1774-20261026.
- SERVIDOR 2026-10-26: integrado origin/main d7b6782 con documentos locales; panel por resolución y Medicina Nuclear como estudio. Build/lint/365 pruebas OK; matriz 19:21 UTC: 229 escenarios, 17 HTTP/9 n8n, cero incidentes. Web/maintenance recreados saludables, readiness local/público/inicio/vCard HTTP200. Ensayo detenido/workflow temporal retirado; imagen anterior etiquetada before-d7b6782-20261026.
- Entrega 2 (resolución): migración 006 (resolution_status abierta/pendiente/resuelta + resolved_at/by; cierre auto 24h → pendiente). Close con mark_resolved; /api/conversations/[id]/resolution; filtros resolution/from/to. Confirm "Marcar resuelta y cerrar"/"Solo cerrar".
- Entrega 3 (presencia + usuarios web): migración 007 (operators.last_seen_at); POST /api/presence (latido 30 s, conectado 90 s); GET/POST/PATCH /api/admin/operators; panel "Usuarios".
- Panel de datos: src/lib/analytics.ts + GET /api/admin/analytics?from&to&operator_id + analytics-panel.tsx.
- Migración 005 (Gamma contacto; Goldenberg/Juárez/Catullo→Pasaje, Albiño→CEMI, Jara→DMO; Álvarez solo Pasaje).
- SERVIDOR 2026-10-21: 004 aplicada al Supabase productivo (único, sin proyecto de prueba; test.env/validation-tools.env comparten la base): 13 áreas, 63 reglas, 0 asociaciones. Medicina Nuclear agregada inicialmente como especialidad, corregida a estudio el 26/10.
- Paneles admin restringidos a BOT_CCS_ADMIN_USERS (default admin,admindev): canAccessAdminPanels/requireAdminPanels en auth; /api/me expone permissions.admin; frontend usa canAdmin. Rutas /api/admin/* con requireAdminPanels.
- Derivación al área menos ocupada: areas.ts suma loadAreaOccupation (conversaciones abiertas con resolución abierta) y pickLeastBusyArea (empate al azar); buildAreaPatch elige una sola área cuando hay varias.

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Admins: lista env BOT_CCS_ADMIN_USERS; solo esas cuentas ven Banco de respuestas, Usuarios y Panel de datos.
- Menos ocupado: automático, por área; ocupación = conversaciones no cerradas con resolución abierta (ni resuelta ni pendiente); empate al azar; aplica a todos los intents.
- Resolución abierta/pendiente/resuelta; cerrar no la cambia salvo "marcar resuelta y cerrar"; cierre auto 24h → pendiente.
- Casos atendidos (métrica) = opción D + desglose B/C; panel con rango desde/hasta, selector sin admins.

## Pendientes y siguiente paso
- Medicina Nuclear corregida como estudio IMAGENES_MEDICINA_NUCLEAR, desactivado: publicado v6 rev3 (reviewed, validado requireReviewed=true), borrador rev65 (pending). 18 especialidades/20 estudios; resto preservado mediante pg transaccional con bloqueo. Script ajustado: el publicado no admite pending. Texto/habilitación pendientes.
- Migraciones 005/006/007 verificadas en Supabase: 4 columnas, 5 reglas nuevas, Gamma, regla obsoleta retirada y cierre automático pendiente. No hay SQL posteriores a 007; no se repitieron migraciones ni seeds.
- DIFERIDO: derivación/transferencia manual de un operador a otro operador/área (no existe hoy).
- DIFERIDO: identificación de máquina (UUID + IP auxiliar). Motivo del cliente (NOTAS Q11): "internamente quiero llevar un registro de cuál [máquina] es".
- Confirmar con cliente NOTAS-CLIENTE (1-27): Catullo, Gastro/Clínica Médica/Anexo, dirección Sector A, texto de medicina nuclear.
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin de "Tareas" (ver README).

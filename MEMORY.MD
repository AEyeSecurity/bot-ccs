# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-26. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- Paneles admin restringidos a BOT_CCS_ADMIN_USERS (default admin,admindev): canAccessAdminPanels/requireAdminPanels en auth; /api/me expone permissions.admin; frontend usa canAdmin. Rutas /api/admin/* con requireAdminPanels.
- Derivación al área menos ocupada: areas.ts suma loadAreaOccupation (conversaciones abiertas con resolución abierta) y pickLeastBusyArea (empate al azar); buildAreaPatch elige una sola área cuando hay varias.
- Iteración 1 completa antes: resolución (006), presencia+usuarios web (007), panel de datos, migración 005 (Gamma/profesionales).
- 374 pruebas, lint y build OK (host). Medicina Nuclear = estudio (script fix-medicina-nuclear-as-study.mjs pendiente de --apply en servidor).

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Admins: lista env BOT_CCS_ADMIN_USERS; solo esas cuentas ven Banco de respuestas, Usuarios y Panel de datos.
- Menos ocupado: automático, por área; ocupación = conversaciones no cerradas con resolución abierta (ni resuelta ni pendiente); empate al azar; aplica a todos los intents.
- Resolución abierta/pendiente/resuelta; cerrar no la cambia salvo "marcar resuelta y cerrar"; cierre auto 24h → pendiente.
- Casos atendidos (métrica) = opción D + desglose B/C; panel con rango desde/hasta, selector sin admins.

## Pendientes y siguiente paso
- DIFERIDO: derivación/transferencia manual de un operador a otro operador/área (no existe hoy).
- DIFERIDO: identificación de máquina (UUID + IP auxiliar). Motivo del cliente (NOTAS Q11): "internamente quiero llevar un registro de cuál [máquina] es".
- PENDIENTE EN SERVIDOR: git pull; tests/lint/build Docker; aplicar migraciones 005/006/007; ejecutar fix-medicina-nuclear-as-study.mjs --apply; reiniciar web; setear BOT_CCS_ADMIN_USERS en runtime.env.
- Confirmar con cliente NOTAS-CLIENTE (1-27): Catullo, Gastro/Clínica Médica/Anexo, dirección Sector A, texto de medicina nuclear.
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin de "Tareas" (ver README).

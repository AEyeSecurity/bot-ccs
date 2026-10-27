# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-27. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- Iteración 1 completa y DESPLEGADA en el servidor principal: entregas 1-3 (áreas/derivación, resolución, presencia+usuarios web), panel de datos, paneles admin restringidos a BOT_CCS_ADMIN_USERS y derivación al área menos ocupada.
- En servidor: git pull + rebuild Docker; migraciones 005/006/007 aplicadas; BOT_CCS_ADMIN_USERS seteado; fix-medicina-nuclear-as-study.mjs --apply ejecutado, web reiniciada y texto del estudio completado desde el panel.
- Catálogo productivo: 18 especialidades, 20 estudios, 45 profesionales, 16 obras sociales. Medicina Nuclear es ESTUDIO (agregado por script, no por importación).
- 374 pruebas, lint y build OK (host).

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Admins: BOT_CCS_ADMIN_USERS (default admin,admindev). Menos ocupado automático por área; resolución abierta/pendiente/resuelta.
- Fixture de pruebas (data/bot-catalog-initial.json) refleja el Excel: 19 estudios, SIN Medicina Nuclear (se agrega vía script). Ver CATALOG/TESTING.

## Pendientes y siguiente paso
- DIFERIDO: derivación/transferencia manual entre operadores/áreas.
- DIFERIDO: identificación de máquina (UUID + IP auxiliar). Motivo (NOTAS Q11).
- Confirmar con cliente NOTAS-CLIENTE (1-27): Catullo, Gastro/Clínica Médica/Anexo, dirección Sector A, texto Medicina Nuclear.
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin "Tareas" (ver README).

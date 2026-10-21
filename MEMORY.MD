# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-21. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- Alta solicitada Medicina Nuclear en Supabase: ATENCION_MEDICA_MEDICINA_NUCLEAR, 19 especialidades; publicada versión 6 y borrador existente actualizado a revisión 63 sin publicar sus otros cambios. Sin texto/profesionales, disponible=false para completar desde Especialidades. Web reiniciada por caché; readiness público OK. 343 pruebas, lint/build y matriz 17 HTTP/9 n8n sin incidentes; ensayo detenido.
- Validación/despliegue servidor 2026-10-21 finalizados: matriz 03:08 UTC con 343 pruebas, 229 escenarios, 54 ramas, 23 transiciones, 17 HTTP, 9 n8n y cero incidentes; ensayo detenido/workflow temporal retirado. Web/maintenance recreados saludables; readiness local/público, inicio y vCard HTTP200. Sin WhatsApp real ni reinicio Windows.
- Diagnóstico Gemini real autorizado (servidor): gemini-2.5-flash HTTP200 en 3017ms, TURNOS_MEDICOS_ATENCION_MEDICA, confianza 0.95. Sin WhatsApp ni persistencia; no prueba estabilidad del proveedor.
- Iteración 1, entrega 1 (áreas, derivación y permisos) implementada y subida a GitHub (main).
- Migración supabase/migrations/004_roles_areas.sql: areas, area_rules, operator_areas, conversations.area_ids (uuid[]), RLS de lectura. Carga desde la hoja "Usuarios" del Excel; Gamma sin área.
- src/lib/areas.ts: resolveRoutingKeys, deriveAreaIds, canView/canTake/canOperate. bot-engine recalcula area_ids por turno si el intent es derivable.
- Rutas: listado filtra por área; takeover registra previous_operator_id; release/close exigen dueño o sin dueño en área; send y messages validan área. Admin sin restricción.
- Alta por CLI: npm run operator:create (scripts/create-operator.mjs); contraseña temporal mostrada una vez.
- Validación en host: 343 pruebas, lint y build OK. Docker NO se usó (esta máquina no es el servidor).

## Pendientes y siguiente paso
- Servidor 2026-10-21: pull 1faa2f3; 343 pruebas, lint y build aprobados en Docker. Usuario autorizó aplicar 004 en Supabase actual al confirmar que no existe proyecto de prueba; aplicada solo 004 en transacción: 13 áreas, 63 reglas, 0 asociaciones, RLS activo y area_ids uuid[] NOT NULL verificados.
- test.env y validation-tools.env usan el mismo Supabase productivo; solo aíslan transporte WhatsApp y proceso, no datos. No describirlos como base de prueba.
- Confirmar con el cliente preguntas antes de entrega 2 (especialidades en varias áreas y profesionales sin regla). NOTAS-CLIENTE.local.md no existe en este servidor; permanece solo en la otra computadora. Asignaciones de operadores pendientes (0 asociaciones), no crear cuentas sin definición.
- Entrega 2: resolution_status (pendiente/en_curso/resuelto), filtro por día, pendientes de días anteriores visibles.
- Entrega 3: usuarios desde la web, last_seen_at con heartbeat, métricas admin.
- Futuro: asignar número de contacto fijo a un usuario.
- Comprobaciones previas al uso real: WhatsApp real, reinicio del host, ruta Cloudflare antigua, retirar admindev y rotar la contraseña admin de la hoja "Tareas" (ver README).

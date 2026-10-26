# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-26. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- SERVIDOR 2026-10-26: pull fast-forward a fe5f0ff; imágenes Compose reconstruidas; 365 pruebas, lint y build aprobados. Matriz 17 HTTP/9 n8n, 229 escenarios, cero incidentes; ensayo detenido y workflow temporal retirado. Web/maintenance recreados saludables; readiness local/público, inicio y vCard HTTP200.
- Entrega 2 (resolución): migración 006 (resolution_status abierta/pendiente/resuelta + resolved_at/by; cierre auto 24h → pendiente). Close con mark_resolved; /api/conversations/[id]/resolution; filtros resolution/from/to. Confirm "Marcar resuelta y cerrar"/"Solo cerrar".
- Entrega 3 (presencia + usuarios web): migración 007 (operators.last_seen_at); POST /api/presence (latido 30 s, conectado 90 s); GET/POST/PATCH /api/admin/operators; panel "Usuarios".
- Panel de datos: src/lib/analytics.ts + GET /api/admin/analytics?from&to&operator_id + analytics-panel.tsx.
- Migración 005 (Gamma contacto; Goldenberg/Juárez/Catullo→Pasaje, Albiño→CEMI, Jara→DMO; Álvarez solo Pasaje).
- SERVIDOR 2026-10-21: 004 aplicada al Supabase productivo (único, sin proyecto de prueba; test.env/validation-tools.env comparten la base): 13 áreas, 63 reglas, 0 asociaciones. Medicina Nuclear agregada como ESPECIALIDAD ATENCION_MEDICA_MEDICINA_NUCLEAR (disponible=false, versión 6) — ver discrepancia abajo.

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Resolución abierta/pendiente/resuelta (del Excel); cerrar no la cambia salvo "marcar resuelta y cerrar"; cierre auto 24h → pendiente.
- Casos atendidos = opción D (participó) + desglose B (intervenciones) y C (mensajes).
- Panel: rango desde/hasta inclusivo, selector sin admins, tiempos de primera respuesta/resolución/cola.
- Presencia: heartbeat 30 s; conectado = últimos 90 s.

## Pendientes y siguiente paso
- DISCREPANCIA medicina nuclear: en esta sesión se decidió CONTACTO (número+vCard, sin publicar hasta aprobar texto); el servidor la agregó como ESPECIALIDAD disponible=false. Conciliar con el cliente antes de habilitarla.
- Migraciones 005/006/007 aplicadas en transacción al Supabase actual, sin repetir anteriores ni seeds; columnas de resolución/presencia verificadas. Pendiente prueba manual con operadores reales. Snapshot de imagen previa no disponible por contenido Docker faltante; recuperación exige reconstruir la revisión anterior.
- Confirmar con cliente NOTAS-CLIENTE (1-27): Catullo, Gastro/Clínica Médica/Anexo, dirección Sector A, texto de medicina nuclear.
- Futuro: derivación balanceada al menos ocupado (métrica + asignación pendientes de definir).
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin de "Tareas" (ver README).

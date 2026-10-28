# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-28. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- 28/10: pull origin/main 0a6e502 integrado; 381 pruebas, lint/build OK en Compose (pull-0a6e502). Producción sigue en 41b1774; 008/009 y scripts de contenido nuevos pendientes, sin aplicar en este pull.
- 27/10: BOT_CCS_ADMIN_USERS=admin,admindev definido explícitamente en runtime.env privado; web recreada healthy y variable cotejada en contenedor. Readiness público HTTP200, ok=true/testInstance=false. 374 pruebas, lint/build OK en tools; mismo acceso efectivo anterior.
- DESPLEGADO 41b1774 el 26/10: imagen pull-41b1774 aplicada como docker-migration, web/maintenance recreados saludables. 374 pruebas, lint/build OK; matriz 22:29 UTC: 229 escenarios, 17 HTTP/9 n8n, cero incidentes. Readiness local/público/inicio/vCard HTTP200. Admins efectivos admin,admindev por default; ensayo detenido/workflow temporal retirado. Imagen anterior before-41b1774-20261026.
- SERVIDOR 2026-10-21: 004 aplicada al Supabase productivo (único, sin proyecto de prueba; test.env/validation-tools.env comparten la base): 13 áreas, 63 reglas, 0 asociaciones. Medicina Nuclear agregada inicialmente como especialidad, corregida a estudio el 26/10.
- Paneles admin restringidos a BOT_CCS_ADMIN_USERS (default admin,admindev): canAccessAdminPanels/requireAdminPanels en auth; /api/me expone permissions.admin; frontend usa canAdmin. Rutas /api/admin/* con requireAdminPanels.
- Derivación al área menos ocupada: areas.ts suma loadAreaOccupation (conversaciones abiertas con resolución abierta) y pickLeastBusyArea (empate al azar); buildAreaPatch elige una sola área cuando hay varias.
- Derivación global "conectado → menos casos" (reemplaza "menos ocupado"): areas.ts suma loadConnectedAreaIds (operators+operator_areas, last_seen_at en 90 s); buildAreaPatch prioriza conectadas y luego pickLeastBusyArea; sin conectadas → todas.
- Migraciones 008 (Clínica Médica/Médicos clínicos → Pasaje + Anexo) y 009 (7 servicios nuevos + Internación → Guardia).
- Selector de ecografía: "ecografía" genérica → prompt con 5 tipos (mensaje ecografiaSelector) → deriva al estudio. bot-core detectEcografiaSelection + context "ecografia".
- Medicina Nuclear: habilitable con vCard ccs-medicina-nuclear.vcf (STUDY_CARD_FILES + InfoDefinition.vcardFile + vcards.ts studyCards). Script enable-medicina-nuclear.mjs.
- 7 servicios nuevos como `direct` (placeholder editable en banco): Medicina laboral/Hemoterapia→Pasaje, Flebología/Facturación→Anexo, Quirófanos/Terapia intensiva/Radiología→Guardia. Flujos EXTRA_SERVICES, detección en bot-core, labels en panel.
- Scripts de contenido: fix-direccion-dermatologo.mjs (dirección unificada "Pje. Dra. Elena Ibarra de Zilberberg 735" + dermatólogo "Romero") y add-servicios-sin-area.mjs.

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Derivación multi-área: conectado primero (90 s), luego menos ocupado; fallback sin conectados → menos ocupado.
- Internación → Guardia, pendiente de confirmar con cliente (Q31). Dermatólogo = hombre, nombre pendiente. Catullo → Pasaje (cliente revisa mensaje). Todos los psicólogos → DMO.
- Fixture de pruebas (data/bot-catalog-initial.json) incluye los 7 servicios y ecografiaSelector, pero NO Medicina Nuclear (agregada solo en Supabase vía script).

## Pendientes y siguiente paso
- Medicina Nuclear corregida como estudio IMAGENES_MEDICINA_NUCLEAR, desactivado: publicado v6 rev3 (reviewed, validado requireReviewed=true), borrador rev65 (pending). 18 especialidades/20 estudios; resto preservado mediante pg transaccional con bloqueo. Script ajustado: el publicado no admite pending. Texto/habilitación pendientes.
- Migraciones 005/006/007 verificadas en Supabase: 4 columnas, 5 reglas nuevas, Gamma, regla obsoleta retirada y cierre automático pendiente. 008/009 pendientes de aplicar; no se repitieron migraciones ni seeds.
- DIFERIDO: derivación/transferencia manual de un operador a otro operador/área (no existe hoy).
- DIFERIDO: identificación de máquina (UUID + IP auxiliar). Motivo del cliente (NOTAS Q11): "internamente quiero llevar un registro de cuál [máquina] es".
- Confirmar con cliente NOTAS-CLIENTE (1-27): Catullo, Gastro/Clínica Médica/Anexo, dirección Sector A, texto de medicina nuclear.
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin de "Tareas" (ver README).
- Confirmar con cliente (NOTAS 1-31): mensaje de Catullo, nombre del dermatólogo, área de Internación (Q31), mensajes pendientes (Q29), cierre de Medicina Clínica (Q30).
- DIFERIDO: derivación manual entre operadores/áreas; identificación de máquina (UUID+IP).
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin "Tareas".

# Memoria de continuidad de BOT CCS
Actualizada: 2026-10-28. Lectura obligatoria al iniciar cada chat, según AGENTS.md.
Actualizar con cada cambio/trabajo y en su mismo commit; máximo 50 líneas, comprimir y reemplazar lo obsoleto.
Guardar decisiones, recorrido reciente, validación y próximo paso; nunca contraseñas, tokens, pacientes ni logs.
Los procedimientos completos viven en docs/OPERATIONS.md y docs/TESTING.md; el historial en docs/CHANGELOG.md.
Preguntas al cliente y decisiones a revisar: NOTAS-CLIENTE.local.md (ignorado por Git, no versionar).

## Último trabajo y cómo se hizo
- Fix mensaje "more than one relationship ... 'conversations' and 'operators'" en detalle de conversación: messages/route.ts desambigua el embed con la FK (`operators!conversations_assigned_operator_id_fkey`); desde migración 006 hay 2 FK a operators (assigned_operator_id + resolved_by).
- Derivación global "conectado → menos casos" (reemplaza "menos ocupado"): areas.ts suma loadConnectedAreaIds (operators+operator_areas, last_seen_at en 90 s); buildAreaPatch prioriza conectadas y luego pickLeastBusyArea; sin conectadas → todas.
- Migraciones 008 (Clínica Médica/Médicos clínicos → Pasaje + Anexo) y 009 (7 servicios nuevos + Internación → Guardia).
- Selector de ecografía: "ecografía" genérica → prompt con 5 tipos (mensaje ecografiaSelector) → deriva al estudio. bot-core detectEcografiaSelection + context "ecografia".
- Medicina Nuclear: habilitable con vCard ccs-medicina-nuclear.vcf (STUDY_CARD_FILES + InfoDefinition.vcardFile + vcards.ts studyCards). Script enable-medicina-nuclear.mjs.
- 7 servicios nuevos como `direct` (placeholder editable en banco): Medicina laboral/Hemoterapia→Pasaje, Flebología/Facturación→Anexo, Quirófanos/Terapia intensiva/Radiología→Guardia. Flujos EXTRA_SERVICES, detección en bot-core, labels en panel.
- Scripts de contenido: fix-direccion-dermatologo.mjs (dirección unificada "Pje. Dra. Elena Ibarra de Zilberberg 735" + dermatólogo "Romero") y add-servicios-sin-area.mjs.
- 381 pruebas, lint OK (host).

## Decisiones tomadas (detalle en NOTAS-CLIENTE)
- Derivación multi-área: conectado primero (90 s), luego menos ocupado; fallback sin conectados → menos ocupado.
- Internación → Guardia, pendiente de confirmar con cliente (Q31). Dermatólogo = hombre, nombre pendiente. Catullo → Pasaje (cliente revisa mensaje). Todos los psicólogos → DMO.
- Fixture de pruebas (data/bot-catalog-initial.json) incluye los 7 servicios y ecografiaSelector, pero NO Medicina Nuclear (agregada solo en Supabase vía script).

## Pendientes y siguiente paso
- EN SERVIDOR: git pull + rebuild; aplicar migraciones 008/009; ejecutar add-servicios-sin-area.mjs --apply, enable-medicina-nuclear.mjs --apply y fix-direccion-dermatologo.mjs --apply; reiniciar web.
- Confirmar con cliente (NOTAS 1-31): mensaje de Catullo, nombre del dermatólogo, área de Internación (Q31), mensajes pendientes (Q29), cierre de Medicina Clínica (Q30).
- DIFERIDO: derivación manual entre operadores/áreas; identificación de máquina (UUID+IP).
- Previo a uso real: WhatsApp real, reinicio del host, retirar admindev, rotar contraseña admin "Tareas".

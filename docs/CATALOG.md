# Banco De Respuestas

## Fuente De Verdad

La única fuente productiva es la fila `published` de `bot_catalog_versions`. `data/Bot 2026 reconstruido.xlsx` y el catálogo generado se conservan exclusivamente para importación, pruebas y recuperación manual.

El catálogo contiene mensajes generales, servicios directos, especialidades, estudios, grupos de respuesta profesional, profesionales, alias, obras sociales, disponibilidad, teléfonos, orden y estado de revisión.

## Flujo Editorial

1. **Editar:** cualquier cambio de texto, teléfono o disponibilidad marca el registro como pendiente.
2. **Guardar borrador:** persiste el contenido en Supabase sin modificar lo que usa el bot.
3. **Marcar revisado:** con el borrador guardado, persiste la revisión inmediatamente.
4. **Publicar cambios:** valida todo, archiva la publicación anterior y activa el borrador en una transacción.

El botón Publicar permanece bloqueado si hay cambios locales, errores o pendientes. `revision` evita que dos administradores sobrescriban el mismo borrador; un conflicto devuelve `409` y obliga a cargar la versión más reciente.

## Edición Por Especialidad

- **Texto general:** introducción opcional del área.
- **Texto general propio (`customBody`):** opcional; si está completo, reemplaza toda la respuesta de la especialidad y no se concatenan el texto general ni los bloques profesionales. Si queda vacío, se conserva el armado automático.
- **Bloques profesionales:** respuestas almacenadas en `professionalResponseGroups`.
- **Vista previa completa:** texto general seguido de los bloques activos y disponibles; cuando existe texto propio, la vista previa muestra solo ese texto.

Una especialidad sin texto general no muestra una caja vacía: explica que su respuesta se construye con bloques profesionales. Esos bloques se pueden editar desde la especialidad o desde Profesionales, pero ambas vistas apuntan al mismo objeto persistido.

## Teléfonos

Los teléfonos no tienen campos paralelos. Se escriben dentro del texto y se detectan automáticamente junto al bloque propietario. La publicación exige móviles argentinos en formato:

```text
+549XXXXXXXXXX
```

Un teléfono incompleto, con formato inválido o cuya metadata no coincida con el texto bloquea la publicación.

## Disponibilidad

- Un elemento desactivado conserva alias, relaciones e historial.
- Una consulta por un elemento desactivado responde con el mensaje vigente de servicio no disponible.
- Una especialidad activa muestra solo bloques activos con al menos un profesional disponible.
- Una especialidad activa sin contenido utilizable es inválida.

## Validaciones

La publicación rechaza textos obligatorios vacíos, títulos internos visibles, teléfonos inválidos, registros pendientes, identificadores duplicados, profesionales sin especialidad, relaciones inexistentes y grupos inconsistentes.

La interfaz permite editar contenido y disponibilidad, pero no alias, intenciones, relaciones ni estructura. Esas modificaciones requieren una actualización controlada del sistema y sus pruebas.

## Importación Controlada

Abrir una sesión de herramientas Docker con montajes explícitos de los archivos que se van a generar. Estos montajes se usan únicamente para la importación; los servicios productivos no montan fuentes del host.

```powershell
docker compose --env-file C:/ProgramData/BotCCS/deploy.env --profile tools run --rm -v "${PWD}/data:/app/data" -v "${PWD}/src/lib/bot-2026-data.ts:/app/src/lib/bot-2026-data.ts" tools sh
```

Dentro de esa misma sesión Linux:

```sh
npm run catalog:import -- "/app/data/Bot 2026 reconstruido.xlsx" "/app/src/lib/bot-2026-data.ts"
npm run catalog:generate-managed
```

Revisar los cambios generados y ejecutar la matriz de pruebas antes de publicar. `catalog:seed-managed` solo inicializa una base sin catálogo publicado; si ya existe uno no lo reemplaza. Su ejecución explícita en tools es:

```sh
npm run catalog:seed-managed
```

La importación se debe ejecutar únicamente cuando se modifica la estructura no editable desde el panel. Para bases existentes, publicar mediante el flujo administrativo controlado. No usar seeds como actualización o recuperación del catálogo productivo.

## Corrección: Medicina Nuclear como estudio (aplicada el 26 de octubre de 2026)

Medicina Nuclear es un **estudio**, no una especialidad. La entrada agregada el 21 de octubre como especialidad `ATENCION_MEDICA_MEDICINA_NUCLEAR` se corrige con `scripts/fix-medicina-nuclear-as-study.mjs`, que elimina la especialidad y agrega el estudio `IMAGENES_MEDICINA_NUCLEAR` (matchers "Medicina Nuclear", "Cámara Gamma", "SPECT"; teléfono de Cámara Gamma; `available=false` y pendiente de texto). El publicado debe conservar `reviewStatus=reviewed`, aun desactivado, porque la carga del runtime exige cero pendientes; el borrador conserva `pending`. Ejecutar con `--apply` en el servicio tools y reiniciar web para recargar la caché; luego completar el texto y marcarlo revisado desde el panel antes de publicar.

Aplicada en el servidor el 26 de octubre: transformación equivalente al script mediante pg, en una transacción con bloqueo de catálogo, preservando el resto de ambos payloads. Publicación 6, revisión 3; borrador revisión 65. Ambos contienen 18 especialidades y 20 estudios. Se validó el publicado con `requireReviewed=true`; estudio desactivado en ambos, revisado solo en el publicado.

El estudio responde con texto + vCard `ccs-medicina-nuclear.vcf` (como Patología); el soporte de vCard en estudios está en `STUDY_CARD_FILES` y `vcards.ts`. Para habilitarlo (disponible + revisado) ejecutar `scripts/enable-medicina-nuclear.mjs --apply`.

El fixture de pruebas (`data/bot-catalog-initial.json`) y `src/lib/bot-2026-data.ts` reflejan el Excel y no incluyen Medicina Nuclear: el estudio se agrega únicamente con el script, no por importación. Si se reimporta el catálogo desde el Excel, re-ejecutar `fix-medicina-nuclear-as-study.mjs --apply`.

## Servicios nuevos con área (27 de octubre de 2026)

Medicina laboral, Hemoterapia, Flebología, Facturación, Quirófanos, Terapia intensiva y Radiología se agregan como servicios directos (`direct`) con texto placeholder editable en el banco de respuestas; su área está en la migración 009. El texto definitivo se completa luego desde el banco. El script `scripts/add-servicios-sin-area.mjs` los agrega al catálogo productivo.

## Alta controlada: Medicina Nuclear (21 de octubre de 2026)

Se agregó Medicina Nuclear con intención ATENCION_MEDICA_MEDICINA_NUCLEAR y alias medicina nuclear al catálogo productivo Supabase. Hay 19 especialidades. La entrada está desactivada y sin contenido ni profesionales, lista para completar en Especialidades antes de habilitarla. Se creó la publicación 6 preservando la anterior en el historial y se añadió únicamente la misma entrada al borrador en curso (revisión 63), conservando sus demás ediciones sin publicarlas. Se validaron ambos payloads y se aplicó la ampliación estructural en una transacción con bloqueo de catálogo; no se modificaron XLSX ni fixtures. Como el cambio estructural se hizo fuera de la API editorial, se reinició web para recargar la caché; las ediciones normales publicadas desde el panel no requieren reinicio.

## Despliegue de 0a6e502 — 28 de octubre de 2026

Aplicadas únicamente 008 y 009 junto con las transformaciones de add-servicios-sin-area, enable-medicina-nuclear y fix-direccion-dermatologo mediante pg en una transacción con lock_timeout de 10 s y bloqueo de catálogo. Incorporado ecografiaSelector, obligatorio en el esquema nuevo, con el texto del generador; sin fallback en runtime. Publicado v6 revisión 4 y borrador revisión 66, conservando sus otras ediciones; ambos validados y publicado con requireReviewed=true. Medicina Nuclear habilitada/revisada, siete servicios con placeholder, dirección corregida y dermatólogo Romero. Verificadas las doce reglas esperadas y ausencia de derivación clínica a Guardia. Sin seeds ni repetición de migraciones anteriores.

Imagen pull-0a6e502 validada con 381 pruebas, lint y build en Compose. Matriz final 13:34 UTC: 381 pruebas sin fallos/omisiones, 229 escenarios, 54 ramas, 23 transiciones, 17 HTTP y 9 n8n, cero incidentes. Ensayo mock con Supabase compartido, workflow temporal retirado y web de validación detenida; evidencia en volumen.

Aplicada como docker-migration; web y maintenance recreados saludables. Imagen web cotejada y BOT_CCS_ADMIN_USERS=admin,admindev preservada. Readiness local/público (ok=true, testInstance=false), inicio y vCards de Medicina Nuclear/laboratorio HTTP200; túnel activo. Imagen previa before-0a6e502-20261028 conservada. Reinicio limitado a los servicios del bot, sin reiniciar Windows ni enviar WhatsApp real.

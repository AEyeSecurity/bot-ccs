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
- **Bloques profesionales:** respuestas almacenadas en `professionalResponseGroups`.
- **Vista previa completa:** texto general seguido de los bloques activos y disponibles.

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

```powershell
npm run catalog:import -- "C:\BOT CCS\data\Bot 2026 reconstruido.xlsx" "C:\BOT CCS\src\lib\bot-2026-data.ts"
npm run catalog:generate-managed
npm run catalog:seed-managed
```

La importación se debe ejecutar únicamente cuando se modifica la estructura no editable desde el panel. Después debe correrse toda la matriz de pruebas antes de publicar.

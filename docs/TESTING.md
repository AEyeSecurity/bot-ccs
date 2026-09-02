# Estrategia De Pruebas

## Comandos

```powershell
npm test
npm run lint
npm run build
npm run test:bot:report
```

Verificaciones adicionales:

```powershell
npm run verify:catalog-db
npm run verify:catalog-admin-live
node scripts/verify-bot-live-http.mjs
node scripts/verify-bot-n8n-e2e.mjs
```

`verify:catalog-admin-live` crea, publica y restaura versiones reales sin cambiar el payload final. Solo debe ejecutarse cuando no exista un borrador administrativo en curso.

## Cobertura

- Unitarias: detección, normalización, catálogo, caché, DNI, vencimientos y modelo del editor.
- Integración: APIs administrativas, inbound, envío, persistencia y forma del workflow.
- Matriz generada: caminos por especialidad, profesión, profesional, estudio, servicio directo, cobertura y ambigüedad.
- HTTP local: contratos productivos con el proceso levantado.
- n8n E2E: webhook completo hacia la API local.
- Operación: PM2, URL pública, watchdog y mantenimiento.

## Casos Críticos

- Frente y dorso de DNI coincidentes, inconsistentes, incompletos, inválidos y concurrentes.
- Solicitudes específicas iniciales sin pregunta redundante.
- Alias humanos declarados y errores ortográficos permitidos.
- Cardoso/Cardozo ambiguo y resolución por nombre o subespecialidad.
- Todas las especialidades, estudios, obras sociales y profesionales del catálogo.
- Edición de catálogo sin impacto productivo hasta publicar.
- Revisión, conflicto de `revision`, restauración y caché inmediata.
- Teléfonos derivados del bloque propietario y rechazo de formatos inválidos.
- Liberación con y sin respuesta humana y cierre idempotente a las 24 horas.

## Criterio De Alta

Una versión puede darse de alta solo si:

- no hay pruebas fallidas ni omitidas;
- lint y build terminan correctamente;
- no faltan ramas visibles en la matriz;
- HTTP y n8n E2E no tienen incidentes;
- la URL local y pública responden `200`;
- PM2 está `online`;
- watchdog y mantenimiento terminan con código `0`;
- el cambio y sus pruebas están documentados.

## Línea Base

Última verificación completa: 2 de septiembre de 2026.

- 302 pruebas aprobadas.
- 229 escenarios ejecutados.
- 54 ramas y 23 transiciones cubiertas.
- 17 pruebas HTTP aprobadas.
- 9 recorridos n8n aprobados.
- Cero incidentes y cero ramas visibles faltantes.

Los reportes generados son evidencia local y no se versionan porque pueden contener información operativa.

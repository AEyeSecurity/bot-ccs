# Historial De Cambios

Este archivo registra cambios funcionales y operativos. A partir de la creación del repositorio, toda modificación debe agregarse aquí dentro del mismo commit.

## 2026-09-02

- Se creó el repositorio Git y la documentación técnica integral del sistema.
- Se estableció la regla obligatoria de documentación por cambio en `AGENTS.md`.
- Se clarificó el Banco de respuestas: texto general y bloques profesionales separados, edición compartida sin duplicación, teléfonos por bloque y estados editoriales explícitos.
- `Marcar revisado` pasó a persistir inmediatamente cuando el borrador está guardado.
- Se verificaron 302 pruebas, 229 escenarios, 17 contratos HTTP y 9 recorridos n8n sin incidentes.
- Se comprobó el catálogo productivo con 18 especialidades, 19 estudios, 45 profesionales y 16 obras sociales.

## Estado Funcional Acumulado

- Banco 2026 importado, reconstruido y publicado con respuestas por especialidad, profesional, subservicio y estudio.
- Títulos internos eliminados de las respuestas al paciente.
- Pregunta inicial de atención médica/imágenes eliminada; reclasificación directa por servicio.
- Variantes humanas de profesiones, títulos médicos, acentos y errores declarados.
- Cirugía separada en general, maxilofacial y estética/plástica; Cardoso/Cardozo desambiguado.
- Obras sociales reconocidas por nombres y alias explícitos.
- Saludo corto para solicitudes ya identificadas y mensajes de derivación formalizados.
- Validación robusta de frente y dorso del DNI mediante datos coincidentes.
- Panel de conversaciones modernizado y banco administrable exclusivo para administradores.
- Catálogo publicado en Supabase con borrador, revisión, publicación, historial, restauración, validación y caché en memoria.
- Cierre automático de conversaciones liberadas sin respuesta a las 24 horas.
- PM2, watchdog y mantenimiento programado operativos.

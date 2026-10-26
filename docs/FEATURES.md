# Funcionalidades Implementadas

El login admite los alias `admin` y `admindev`, además del email completo; permisos y estado activo se comprueban mediante Supabase Auth y `operators`. `admindev` es una cuenta administrativa temporal de desarrollo que debe retirarse antes del uso con usuarios reales, según OPERATIONS.md.

## Atención Al Paciente

- Saludo natural para mensajes indefinidos.
- Clasificación de intención determinística; Gemini solo interviene bajo demanda como último recurso cuando ninguna regla coincide.
- Respuesta directa con agradecimiento corto cuando el primer mensaje ya identifica la necesidad.
- Turnos médicos por especialidad, profesión, subespecialidad o profesional específico.
- Respuesta completa para una especialidad y bloque individual para un profesional.
- Aclaración determinística ante nombres ambiguos, incluida la separación de Cardoso/Cardozo por cirugía general o maxilofacial.
- Reconocimiento de variantes de profesión, títulos `Dr`, `Dra`, `Doc`, mayúsculas, acentos omitidos y errores declarados.
- Estudios de imágenes con derivación directa al contacto correspondiente y cierre de la gestión sin solicitar documentación adicional.
- Servicios directos: laboratorio, recetas, informes, internación, ubicaciones, guardia, telemedicina y búsqueda laboral.
- Obras sociales: listado vigente, respuestas de aceptación o rechazo contextual y consulta durante un caso sin perder el paso pendiente.
- Servicio no disponible para solicitudes explícitas fuera del catálogo.
- Derivación a operador con redacción formal y conservación del caso.
- vCards existentes para los contactos operativos.

## Datos Y DNI

- Captura de nombre completo, DNI, cobertura y disponibilidad para turnos médicos.
- Validación estructurada de frente y dorso del DNI.
- Extracción y comparación de nombre, apellido y número entre ambas caras.
- Aceptación de imágenes recibidas en el mismo lote o en mensajes separados.
- Control de imágenes inválidas, cara faltante, datos incompletos, documento inconsistente y concurrencia.
- Los adjuntos no se persisten como archivos ni se muestran en el CRM.

## Áreas Y Permisos (Iteración 1, entrega 1)

- Cada área de la hoja "Usuarios" es una cuenta. Varias computadoras pueden usar la misma cuenta y ven lo mismo.
- La conversación se deriva por intent, especialidad, estudio o profesional nombrado (por ejemplo, "electrocardiograma" o "Dr. Segovia" a Cardiología, "Nefrología" a Pasaje).
- Un operador solo ve las conversaciones de sus áreas. Admin ve todas, incluidas las que no tienen área.
- Un compañero del área puede tomar una conversación que otro estaba atendiendo; el cambio queda registrado. Liberar y cerrar requieren ser el dueño o que no tenga dueño dentro del área.
- Alta de usuarios por línea de comandos: `npm run operator:create` (ver OPERATIONS).
- Estado de resolución por conversación: `abierta`, `pendiente` o `resuelta`, con botón de cambio y filtro propio (entrega 2).
- Filtro por rango de fechas (desde/hasta) en la bandeja.
- Alta y edición de usuarios desde la web (admin): crear, activar/desactivar, asignar áreas y resetear contraseña con temporal mostrada una sola vez.
- Presencia: latido del panel cada 30 s; el listado de usuarios muestra "conectado" según el último latido (90 s).
- Panel de datos (admin): análisis global o por usuario con rango de fechas — volumen, resolución, casos atendidos (participación + intervenciones + mensajes), tiempos de primera respuesta/resolución/cola, conectados y derivación por gestión y área.

## Panel De Conversaciones

- Búsqueda y filtros por estado y por resolución; rango de fechas.
- Lectura de mensajes y estado del caso.
- Toma de control, respuesta humana, liberación y cierre manual.
- Al cerrar una conversación abierta o pendiente se pregunta si marcarla resuelta; el cierre por abandono queda pendiente.
- El bot no responde mientras existe control humano.
- El control humano vence según `HUMAN_TAKEOVER_TIMEOUT_MINUTES` después del último mensaje del operador.
- Si se libera sin respuesta humana, la conversación cierra al cumplirse 24 horas desde el último inbound.
- Un nuevo mensaje del paciente o una respuesta humana cancela el cierre pendiente.

## Banco Administrable

- Acceso exclusivo para administradores.
- Edición de textos, disponibilidad, teléfonos contenidos en el texto, profesionales, estudios, coberturas y mensajes generales.
- Vista previa exacta de WhatsApp.
- Especialidades separadas en texto general y bloques profesionales reales.
- Texto general propio por especialidad: si se completa, la especialidad responde con ese único texto en lugar del armado por bloques.
- Un bloque editado desde Especialidades o Profesionales modifica el mismo registro, sin duplicación.
- Teléfonos detectados y mostrados junto al bloque propietario.
- Estados claros: cambios sin guardar, borrador guardado, pendiente de revisión y publicado.
- Revisión persistida inmediatamente cuando el borrador está guardado.
- Historial y restauración de versiones.
- Publicación sin build ni reinicio.

## Límites Actuales

- No agenda turnos reales.
- No consulta historia clínica ni facturación.
- No descarga estudios.
- No ofrece visualización segura de adjuntos.
- No incluye analítica gerencial avanzada ni asignación por equipos.

## Docker: configuración vigente desde 2026-10-16

Aplicación y mantenimiento en Docker Compose; n8n existente conserva el workflow editable y llama al puerto loopback3010 del host. Supabase sigue externo y conserva los datos. Cloudflare dedicado se configura con el perfil public y token propio. Las vCards se generan desde el catálogo publicado en /vcards/. BOT_CCS_WEBHOOK_SECRET es obligatorio, usando Header Auth en n8n. PM2 y tareas Windows son mecanismos históricos retirados al completar el corte. Ver docs/OPERATIONS.md y docs/TESTING.md.

-- Iteración 1, cambios tras la reunión con el cliente.
-- 1) Gamma es un área de contacto (Medicina nuclear). No deriva casos: no tiene reglas.
-- 2) Profesionales que figuran en la hoja "Usuarios" actualizada y no tenían regla.
-- 3) Neurología Álvarez Czernik figura solo en Pasaje (ya no en CEMI).
-- Pendiente: Catullo (la hoja lo pone en Pasaje; el texto del bot dice que solo realiza intervenciones).

insert into public.areas (name) values ('Gamma')
on conflict (name) do nothing;

delete from public.area_rules r
using public.areas a
where r.area_id = a.id
  and a.name = 'CEMI'
  and r.intent_key = 'ATENCION_MEDICA_NEUROLOGIA'
  and r.response_group_id = 'neurologia_alvarez';

insert into public.area_rules (area_id, intent_key, response_group_id)
select a.id, v.intent_key, v.response_group_id
from (values
  ('Pasaje', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_goldenberg'),
  ('Pasaje', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_juarez'),
  ('Pasaje', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_catullo'),
  ('CEMI', 'ATENCION_MEDICA_NEUROLOGIA', 'neurologia_albino'),
  ('DMO', 'ATENCION_MEDICA_NUTRICION', 'nutricion_jara')
) as v(area_name, intent_key, response_group_id)
join public.areas a on a.name = v.area_name
on conflict do nothing;

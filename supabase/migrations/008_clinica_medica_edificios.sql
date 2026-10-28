-- Clínica Médica (especialidad) y Médicos clínicos (servicio informativo) se derivan a los
-- "edificios" (Sector B y C = Pasaje y Anexo), no a Guardia. Respuesta del cliente del 27/10/2026.

delete from public.area_rules r
using public.areas a
where r.area_id = a.id
  and a.name = 'Guardia'
  and r.intent_key in ('ATENCION_MEDICA_CLINICA_MEDICA', 'MEDICOS_CLINICOS');

insert into public.area_rules (area_id, intent_key, response_group_id)
select a.id, v.intent_key, null
from (values
  ('Pasaje', 'ATENCION_MEDICA_CLINICA_MEDICA'),
  ('Anexo', 'ATENCION_MEDICA_CLINICA_MEDICA'),
  ('Pasaje', 'MEDICOS_CLINICOS'),
  ('Anexo', 'MEDICOS_CLINICOS')
) as v(area_name, intent_key)
join public.areas a on a.name = v.area_name
on conflict do nothing;

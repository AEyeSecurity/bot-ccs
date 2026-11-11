-- Derivaciones marcadas en naranja en la hoja "Usuarios" (Bot 2026, 11/11/2026):
-- Internación y Medicina laboral/preocupacional -> Admisión; Informes médicos -> Call Center.

delete from public.area_rules r
using public.areas a
where r.area_id = a.id
  and ((a.name = 'Guardia' and r.intent_key = 'INTERNACION')
    or (a.name = 'Pasaje' and r.intent_key = 'MEDICINA_LABORAL'));

insert into public.area_rules (area_id, intent_key, response_group_id)
select a.id, v.intent_key, null
from (values
  ('Admisión', 'INTERNACION'),
  ('Admisión', 'MEDICINA_LABORAL'),
  ('Call Center', 'INFORMES_MEDICOS_IMAGENES_MEDICAS'),
  ('Call Center', 'INFORMES_MEDICOS_ESTUDIOS_PATOLOGIA'),
  ('Call Center', 'INFORMES_MEDICOS_LABORATORIO_CLINICO')
) as v(area_name, intent_key)
join public.areas a on a.name = v.area_name
on conflict do nothing;

-- Servicios que figuraban en "Información importante" sin área en "Usuarios".
-- Respuesta del cliente del 27/10/2026 (Radiología/Quirófanos/Terapia intensiva -> Sector A = Guardia).
-- Internación queda en Guardia pendiente de confirmar con el cliente (ver NOTAS-CLIENTE Q31).

insert into public.area_rules (area_id, intent_key, response_group_id)
select a.id, v.intent_key, null
from (values
  ('Pasaje', 'MEDICINA_LABORAL'),
  ('Pasaje', 'HEMOTERAPIA'),
  ('Anexo', 'FLEBOLOGIA'),
  ('Anexo', 'FACTURACION'),
  ('Guardia', 'QUIROFANOS'),
  ('Guardia', 'TERAPIA_INTENSIVA'),
  ('Guardia', 'RADIOLOGIA'),
  ('Guardia', 'INTERNACION')
) as v(area_name, intent_key)
join public.areas a on a.name = v.area_name
on conflict do nothing;

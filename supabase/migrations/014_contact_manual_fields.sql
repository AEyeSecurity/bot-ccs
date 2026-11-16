-- Datos de la ficha cargados a mano por operadoras; el bot no los pisa (manual_fields).
alter table public.contacts add column if not exists dni_number text;
alter table public.contacts add column if not exists insurance_name text;
alter table public.contacts add column if not exists manual_fields text[] not null default '{}';

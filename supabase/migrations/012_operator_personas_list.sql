-- Lista informativa; el texto anterior se conserva para revisión sin inferir apellidos.
alter table public.operators add column if not exists personas_list jsonb not null default '[]'::jsonb;
alter table public.operators add constraint operators_personas_list_array check (jsonb_typeof(personas_list) = 'array' and jsonb_array_length(personas_list) <= 50);

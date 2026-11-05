-- Texto administrativo; no cambia identidad, presencia ni permisos.
alter table public.operators add column if not exists personas text not null default '';
alter table public.operators add constraint operators_personas_length check (char_length(personas) <= 2000);

-- Entrega 1 de Iteración 1: áreas (cuentas), reglas de derivación y permisos por área.
-- Fuente de la carga inicial: hoja "Usuarios" de Bot 2026.xlsx. Gamma queda pendiente (sin área).
-- Reglas sin response_group_id: aplican al intent completo (todos los profesionales).
-- Reglas con response_group_id: aplican solo al profesional/grupo nombrado.

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.area_rules (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  intent_key text not null,
  response_group_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists area_rules_unique_idx
  on public.area_rules(area_id, intent_key, coalesce(response_group_id, ''));
create index if not exists area_rules_intent_idx on public.area_rules(intent_key);

create table if not exists public.operator_areas (
  operator_id uuid not null references public.operators(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (operator_id, area_id)
);

alter table public.conversations add column if not exists area_ids uuid[] not null default '{}';
create index if not exists conversations_area_ids_idx on public.conversations using gin(area_ids);

alter table public.areas enable row level security;
alter table public.area_rules enable row level security;
alter table public.operator_areas enable row level security;

drop policy if exists areas_select_ccs on public.areas;
create policy areas_select_ccs on public.areas
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists area_rules_select_ccs on public.area_rules;
create policy area_rules_select_ccs on public.area_rules
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists operator_areas_select_ccs on public.operator_areas;
create policy operator_areas_select_ccs on public.operator_areas
for select to authenticated
using (public.is_ccs_operator());

grant select on public.areas to authenticated;
grant select on public.area_rules to authenticated;
grant select on public.operator_areas to authenticated;
grant all privileges on public.areas to service_role;
grant all privileges on public.area_rules to service_role;
grant all privileges on public.operator_areas to service_role;

-- Carga inicial de áreas (hoja "Usuarios").
insert into public.areas (name) values
  ('Cardiología'), ('TAC'), ('RMN'), ('Admisión'), ('Hemodinamia'), ('Call Center'),
  ('Guardia'), ('Pasaje'), ('Anexo'), ('DMO'), ('CEMI'), ('Patología'), ('Laboratorio')
on conflict (name) do nothing;

-- Carga inicial de reglas. Formato: (área, intent_key, response_group_id | null).
-- Las especialidades genéricas sin profesional nombrado van a todas las áreas que la listan
-- (Cirugía, Diabetología, Neurología, Traumatología): ver README, pendiente con el cliente.
insert into public.area_rules (area_id, intent_key, response_group_id)
select a.id, v.intent_key, v.response_group_id
from (values
  -- Cardiología (toda el área)
  ('Cardiología', 'ATENCION_MEDICA_CARDIOLOGIA', null),
  ('Cardiología', 'IMAGENES_ERGOMETRIA', null),
  ('Cardiología', 'IMAGENES_ELECTROCARDIOGRAMA_ECG', null),
  ('Cardiología', 'IMAGENES_ECOCARDIOGRAMA', null),
  ('Cardiología', 'IMAGENES_ECOGRAFIA_DOPPLER_CARDIACA', null),
  ('Cardiología', 'IMAGENES_HOLTER', null),
  -- Estudios por área
  ('TAC', 'IMAGENES_TOMOGRAFIA_COMPUTADA', null),
  ('RMN', 'IMAGENES_RESONANCIA_MAGNETICA', null),
  ('Admisión', 'ATENCION_MEDICA_GASTROENTEROLOGIA', null),
  ('Admisión', 'IMAGENES_ARTERIOGRAFIA', null),
  ('Admisión', 'IMAGENES_ENDOSCOPIA_ALTA_Y_BAJA_COLONOSCOPIA', null),
  ('Hemodinamia', 'IMAGENES_HEMODINAMIA', null),
  ('Call Center', 'OBRAS_SOCIALES', null),
  ('Call Center', 'RECETAS_MEDICAS', null),
  ('Guardia', 'ATENCION_MEDICA_CLINICA_MEDICA', null),
  ('Guardia', 'MEDICOS_CLINICOS', null),
  ('Guardia', 'IMAGENES_ESPINOGRAMA', null),
  ('Guardia', 'IMAGENES_RADIOGRAFIA', null),
  ('Patología', 'IMAGENES_BIOPSIAS', null),
  ('Laboratorio', 'LABORATORIO_CLINICO', null),
  -- Pasaje: especialidades por intent (genérico) y profesionales nombrados
  ('Pasaje', 'ATENCION_MEDICA_NEFROLOGIA', null),
  ('Pasaje', 'ATENCION_MEDICA_CIRUGIA', null),
  ('Pasaje', 'ATENCION_MEDICA_DIABETOLOGIA', null),
  ('Pasaje', 'ATENCION_MEDICA_NEUROLOGIA', null),
  ('Pasaje', 'ATENCION_MEDICA_TRAUMATOLOGIA', null),
  ('Pasaje', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_cardoso_atilio'),
  ('Pasaje', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_cardoso_martin'),
  ('Pasaje', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_heredia'),
  ('Pasaje', 'ATENCION_MEDICA_DIABETOLOGIA', 'diabetologia_carrizo'),
  ('Pasaje', 'ATENCION_MEDICA_NEUROLOGIA', 'neurologia_paolini'),
  ('Pasaje', 'ATENCION_MEDICA_NEUROLOGIA', 'neurologia_alvarez'),
  ('Pasaje', 'ATENCION_MEDICA_NUTRICION', 'nutricion_santana'),
  ('Pasaje', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_vargas'),
  ('Pasaje', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_nunes'),
  -- Anexo
  ('Anexo', 'ATENCION_MEDICA_ONCOLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_REUMATOLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_DERMATOLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_UROLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_INFECTOLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_CIRUGIA', null),
  ('Anexo', 'ATENCION_MEDICA_DIABETOLOGIA', null),
  ('Anexo', 'ATENCION_MEDICA_TRAUMATOLOGIA', null),
  ('Anexo', 'IMAGENES_ECOGRAFIA_ABDOMINAL', null),
  ('Anexo', 'IMAGENES_ECOGRAFIA_DOPPLER', null),
  ('Anexo', 'IMAGENES_ECOGRAFIA_RENAL', null),
  ('Anexo', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_del_carpio'),
  ('Anexo', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_del_bueno'),
  ('Anexo', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_soulergues'),
  ('Anexo', 'ATENCION_MEDICA_DIABETOLOGIA', 'diabetologia_sedan'),
  ('Anexo', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_longo'),
  ('Anexo', 'ATENCION_MEDICA_TRAUMATOLOGIA', 'traumatologia_castro'),
  -- DMO
  ('DMO', 'ATENCION_MEDICA_PSICOLOGIA', null),
  ('DMO', 'ATENCION_MEDICA_NUTRICION', null),
  ('DMO', 'IMAGENES_MAMOGRAFIA', null),
  ('DMO', 'IMAGENES_DENSITOMETRIA_OSEA', null),
  -- CEMI
  ('CEMI', 'ATENCION_MEDICA_GINECOLOGIA_Y_OBSTETRICIA', null),
  ('CEMI', 'ATENCION_MEDICA_PEDIATRIA', null),
  ('CEMI', 'ATENCION_MEDICA_PSIQUIATRIA', null),
  ('CEMI', 'ATENCION_MEDICA_CIRUGIA', null),
  ('CEMI', 'ATENCION_MEDICA_NEUROLOGIA', null),
  ('CEMI', 'IMAGENES_ECOGRAFIA_GINECOLOGICA_OBSTETRICA_Y_MAMARIA', null),
  ('CEMI', 'ATENCION_MEDICA_CIRUGIA', 'cirugia_francalancia'),
  ('CEMI', 'ATENCION_MEDICA_NEUROLOGIA', 'neurologia_alvarez')
) as v(area_name, intent_key, response_group_id)
join public.areas a on a.name = v.area_name
on conflict do nothing;

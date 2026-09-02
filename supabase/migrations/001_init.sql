create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null unique,
  whatsapp_number_hash text not null,
  display_name text,
  patient_full_name text,
  dni_received boolean not null default false,
  insurance_member_number text,
  insurance_card_received boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'bot_active' check (status in ('bot_active', 'waiting_operator', 'human_takeover', 'takeover_expired', 'closed')),
  current_intent text,
  current_step text,
  assigned_operator_id uuid references public.operators(id) on delete set null,
  bot_paused_until timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_activity_at timestamptz not null default now(),
  unread_count int not null default 0,
  priority text not null default 'normal',
  source text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  intent_key text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'waiting_operator', 'closed', 'cancelled')),
  current_step text,
  required_fields_status jsonb not null default '{}'::jsonb,
  case_data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('patient', 'bot', 'operator', 'system')),
  operator_id uuid references public.operators(id) on delete set null,
  body text,
  normalized_body text,
  twilio_message_sid text unique,
  twilio_status text,
  media_received boolean not null default false,
  media_count int not null default 0,
  media_content_types text[],
  media_reference_hash text,
  media_metadata_expires_at timestamptz,
  intent_detected text,
  confidence numeric,
  needs_manual_review boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  intent_key text not null unique,
  parent_intent_key text,
  title text not null,
  response_text text not null,
  options jsonb,
  required_fields jsonb,
  routing_type text not null check (routing_type in ('bot_only', 'explicit_number', 'operator_queue')),
  routing_numbers text[],
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  intent_key text not null,
  routing_type text not null check (routing_type in ('bot_only', 'explicit_number', 'operator_queue')),
  routing_numbers text[],
  queue_name text,
  priority text not null default 'normal',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.twilio_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  content_sid text,
  friendly_name text not null,
  fallback_text text not null,
  variables jsonb,
  approved boolean not null default false,
  use_case text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.twilio_callbacks (
  id uuid primary key default gen_random_uuid(),
  message_sid text,
  message_status text,
  error_code text,
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('patient', 'bot', 'operator', 'system')),
  actor_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at before update on public.cases
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_base_set_updated_at on public.knowledge_base;
create trigger knowledge_base_set_updated_at before update on public.knowledge_base
for each row execute function public.set_updated_at();

drop trigger if exists twilio_templates_set_updated_at on public.twilio_templates;
create trigger twilio_templates_set_updated_at before update on public.twilio_templates
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

create index if not exists contacts_whatsapp_hash_idx on public.contacts(whatsapp_number_hash);
create index if not exists conversations_contact_status_idx on public.conversations(contact_id, status);
create index if not exists conversations_status_activity_idx on public.conversations(status, last_activity_at desc);
create index if not exists conversations_takeover_expiry_idx on public.conversations(status, bot_paused_until);
create index if not exists cases_conversation_status_idx on public.cases(conversation_id, status);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists messages_contact_created_idx on public.messages(contact_id, created_at);
create index if not exists messages_expires_idx on public.messages(expires_at);
create index if not exists messages_media_metadata_expires_idx on public.messages(media_metadata_expires_at);
create index if not exists knowledge_base_parent_idx on public.knowledge_base(parent_intent_key);
create index if not exists routing_rules_intent_idx on public.routing_rules(intent_key);
create unique index if not exists routing_rules_intent_unique_idx on public.routing_rules(intent_key);
create index if not exists twilio_callbacks_sid_idx on public.twilio_callbacks(message_sid);

create or replace function public.is_ccs_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operators
    where auth_user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_ccs_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operators
    where auth_user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

alter table public.operators enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.cases enable row level security;
alter table public.messages enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.routing_rules enable row level security;
alter table public.twilio_templates enable row level security;
alter table public.twilio_callbacks enable row level security;
alter table public.conversation_events enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists operators_select_ccs on public.operators;
create policy operators_select_ccs on public.operators
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists contacts_select_ccs on public.contacts;
create policy contacts_select_ccs on public.contacts
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists conversations_select_ccs on public.conversations;
create policy conversations_select_ccs on public.conversations
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists cases_select_ccs on public.cases;
create policy cases_select_ccs on public.cases
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists messages_select_ccs on public.messages;
create policy messages_select_ccs on public.messages
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists knowledge_base_select_ccs on public.knowledge_base;
create policy knowledge_base_select_ccs on public.knowledge_base
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists routing_rules_select_ccs on public.routing_rules;
create policy routing_rules_select_ccs on public.routing_rules
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists twilio_templates_select_ccs on public.twilio_templates;
create policy twilio_templates_select_ccs on public.twilio_templates
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists conversation_events_select_ccs on public.conversation_events;
create policy conversation_events_select_ccs on public.conversation_events
for select to authenticated
using (public.is_ccs_operator());

drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin on public.app_settings
for select to authenticated
using (public.is_ccs_admin());

create or replace function public.purge_ccs_expired_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set
    media_content_types = null,
    media_reference_hash = null,
    media_metadata_expires_at = null,
    raw_payload = case
      when media_received then null
      else raw_payload
    end
  where media_metadata_expires_at is not null
    and media_metadata_expires_at < now();

  delete from public.twilio_callbacks
  where created_at < now() - interval '30 days';

  delete from public.messages
  where expires_at is not null
    and expires_at < now();

  delete from public.conversations
  where status = 'closed'
    and expires_at is not null
    and expires_at < now();
end;
$$;

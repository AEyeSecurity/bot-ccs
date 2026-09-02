create table if not exists public.bot_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null default 0,
  status text not null check (status in ('draft', 'published', 'archived')),
  payload jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.operators(id) on delete set null,
  updated_by uuid references public.operators(id) on delete set null,
  published_by uuid references public.operators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists bot_catalog_one_draft_idx
on public.bot_catalog_versions ((status)) where status = 'draft';

create unique index if not exists bot_catalog_one_published_idx
on public.bot_catalog_versions ((status)) where status = 'published';

create unique index if not exists bot_catalog_published_version_idx
on public.bot_catalog_versions (version) where status in ('published', 'archived');

drop trigger if exists bot_catalog_versions_set_updated_at on public.bot_catalog_versions;
create trigger bot_catalog_versions_set_updated_at before update on public.bot_catalog_versions
for each row execute function public.set_updated_at();

alter table public.bot_catalog_versions enable row level security;

drop policy if exists bot_catalog_versions_select_admin on public.bot_catalog_versions;
create policy bot_catalog_versions_select_admin on public.bot_catalog_versions
for select to authenticated
using (public.is_ccs_admin());

grant select on public.bot_catalog_versions to authenticated;
grant all privileges on public.bot_catalog_versions to service_role;

alter table public.conversations
add column if not exists unanswered_release_at timestamptz;

create index if not exists conversations_unanswered_release_idx
on public.conversations (last_inbound_at)
where status = 'bot_active' and unanswered_release_at is not null;

create or replace function public.publish_bot_catalog(
  p_draft_id uuid,
  p_expected_revision integer,
  p_actor uuid
)
returns setof public.bot_catalog_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_row public.bot_catalog_versions%rowtype;
  next_version integer;
begin
  select * into draft_row
  from public.bot_catalog_versions
  where id = p_draft_id and status = 'draft'
  for update;

  if not found then
    raise exception 'Draft catalog not found';
  end if;
  if draft_row.revision <> p_expected_revision then
    raise exception 'Catalog revision conflict';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.bot_catalog_versions
  where status in ('published', 'archived');

  update public.bot_catalog_versions
  set status = 'archived', updated_at = now()
  where status = 'published';

  return query
  update public.bot_catalog_versions
  set
    status = 'published',
    version = next_version,
    revision = revision + 1,
    published_by = p_actor,
    published_at = now(),
    updated_by = p_actor,
    updated_at = now()
  where id = p_draft_id
  returning *;
end;
$$;

create or replace function public.restore_bot_catalog(
  p_version_id uuid,
  p_actor uuid
)
returns setof public.bot_catalog_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.bot_catalog_versions%rowtype;
begin
  select * into source_row
  from public.bot_catalog_versions
  where id = p_version_id and status in ('published', 'archived');

  if not found then
    raise exception 'Catalog version not found';
  end if;

  delete from public.bot_catalog_versions where status = 'draft';

  return query
  insert into public.bot_catalog_versions (
    version,
    status,
    payload,
    revision,
    created_by,
    updated_by
  ) values (
    0,
    'draft',
    source_row.payload,
    1,
    p_actor,
    p_actor
  )
  returning *;
end;
$$;

create or replace function public.close_unanswered_released_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
begin
  with targets as (
    select id
    from public.conversations
    where status = 'bot_active'
      and unanswered_release_at is not null
      and last_inbound_at is not null
      and last_inbound_at <= now() - interval '24 hours'
    for update skip locked
  ), cancelled_cases as (
    update public.cases
    set
      status = 'cancelled',
      current_step = null,
      completed_at = now(),
      updated_at = now()
    where conversation_id in (select id from targets)
      and status in ('in_progress', 'waiting_operator')
    returning conversation_id
  ), closed as (
    update public.conversations
    set
      status = 'closed',
      current_intent = null,
      current_step = null,
      assigned_operator_id = null,
      bot_paused_until = null,
      unanswered_release_at = null,
      unread_count = 0,
      updated_at = now()
    where id in (select id from targets)
    returning id, last_inbound_at
  ), events as (
    insert into public.conversation_events (
      conversation_id,
      event_type,
      actor_type,
      actor_id,
      payload
    )
    select
      id,
      'conversation_closed_after_unanswered_release',
      'system',
      null,
      jsonb_build_object('last_inbound_at', last_inbound_at, 'inactive_hours', 24)
    from closed
    returning conversation_id
  )
  select count(*) into closed_count from closed;

  return closed_count;
end;
$$;

revoke all on function public.publish_bot_catalog(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.restore_bot_catalog(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_unanswered_released_conversations() from public, anon, authenticated;
grant execute on function public.publish_bot_catalog(uuid, integer, uuid) to service_role;
grant execute on function public.restore_bot_catalog(uuid, uuid) to service_role;
grant execute on function public.close_unanswered_released_conversations() to service_role;

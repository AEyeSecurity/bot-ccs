-- Iteración 1, entrega 2: estado de resolución humano por conversación.
-- Valores según el Excel "Tareas": abierta, pendiente, resuelta.

alter table public.conversations
  add column if not exists resolution_status text
  not null default 'abierta'
  check (resolution_status in ('abierta', 'pendiente', 'resuelta'));

alter table public.conversations
  add column if not exists resolved_at timestamptz;

alter table public.conversations
  add column if not exists resolved_by uuid references public.operators(id) on delete set null;

create index if not exists conversations_resolution_status_idx
  on public.conversations(resolution_status);

-- El cierre automático por abandono (liberación sin respuesta a las 24 h) deja el caso
-- en "pendiente", nunca "resuelta".
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
      resolution_status = 'pendiente',
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

revoke all on function public.close_unanswered_released_conversations() from public, anon, authenticated;
grant execute on function public.close_unanswered_released_conversations() to service_role;


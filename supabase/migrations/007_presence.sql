-- Iteración 1, entrega 3: presencia de operadores (último latido del panel).
alter table public.operators
  add column if not exists last_seen_at timestamptz;

create index if not exists operators_last_seen_idx
  on public.operators(last_seen_at);

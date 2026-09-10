-- Esegui questo script una sola volta nel SQL Editor di Supabase.
create table if not exists public.beyside_state (
  id text primary key check (id = 'global'),
  state jsonb not null default '{"events": [], "teams": [], "clubs": [], "clubRequests": []}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.beyside_state enable row level security;

drop policy if exists "BeySide legge lo stato" on public.beyside_state;
create policy "BeySide legge lo stato"
on public.beyside_state for select
to anon
using (true);

drop policy if exists "BeySide aggiorna lo stato" on public.beyside_state;
create policy "BeySide aggiorna lo stato"
on public.beyside_state for update
to anon
using (id = 'global')
with check (id = 'global');

insert into public.beyside_state (id)
values ('global')
on conflict (id) do nothing;

alter publication supabase_realtime add table public.beyside_state;

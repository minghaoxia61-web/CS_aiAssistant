create table if not exists public.learning_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.learning_snapshots enable row level security;

create policy "Users can read their own learning snapshot"
on public.learning_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own learning snapshot"
on public.learning_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own learning snapshot"
on public.learning_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

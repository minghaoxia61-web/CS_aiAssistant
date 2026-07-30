create table if not exists public.learning_snapshot_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists learning_snapshot_versions_user_created_idx
on public.learning_snapshot_versions (user_id, created_at desc);

alter table public.learning_snapshot_versions enable row level security;

create policy "users read own snapshot versions"
on public.learning_snapshot_versions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own snapshot versions"
on public.learning_snapshot_versions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users delete own snapshot versions"
on public.learning_snapshot_versions for delete
to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subject_id text,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric,
  mastery jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

create index if not exists courses_owner_idx on public.courses (owner_id);
create index if not exists classes_course_idx on public.classes (course_id);
create index if not exists assignments_class_idx on public.assignments (class_id);

create or replace function public.is_course_owner(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.courses
    where id = target_course_id and owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_members
    where class_id = target_class_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_class_owner(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes
    join public.courses on courses.id = classes.course_id
    where classes.id = target_class_id and courses.owner_id = (select auth.uid())
  );
$$;

create or replace function public.join_class_by_code(target_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select id into target_class_id
  from public.classes
  where upper(join_code) = upper(trim(target_code));
  if target_class_id is null then
    raise exception 'invalid class code';
  end if;
  insert into public.class_members (class_id, user_id)
  values (target_class_id, auth.uid())
  on conflict do nothing;
  return target_class_id;
end;
$$;

alter table public.courses enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

create policy "course owners manage courses"
on public.courses for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "members read courses"
on public.courses for select to authenticated
using (
  exists (
    select 1 from public.classes
    where classes.course_id = courses.id
      and public.is_class_member(classes.id)
  )
);

create policy "owners manage classes"
on public.classes for all to authenticated
using (public.is_course_owner(course_id))
with check (public.is_course_owner(course_id));

create policy "members read classes"
on public.classes for select to authenticated
using (public.is_class_member(id));

create policy "owners read class members"
on public.class_members for select to authenticated
using (public.is_class_owner(class_id) or user_id = (select auth.uid()));

create policy "members leave classes"
on public.class_members for delete to authenticated
using (user_id = (select auth.uid()));

create policy "owners manage assignments"
on public.assignments for all to authenticated
using (public.is_class_owner(class_id))
with check (public.is_class_owner(class_id));

create policy "members read assignments"
on public.assignments for select to authenticated
using (public.is_class_member(class_id));

create policy "students manage own submissions"
on public.assignment_submissions for all to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.is_class_member((
    select class_id from public.assignments
    where id = assignment_id
  ))
);

create policy "owners read submissions"
on public.assignment_submissions for select to authenticated
using (
  public.is_class_owner((
    select class_id from public.assignments
    where id = assignment_id
  ))
);

grant execute on function public.join_class_by_code(text) to authenticated;

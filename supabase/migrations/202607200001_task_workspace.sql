-- KAI/KIRA: real workspaces for assigned measures and user-created subtasks.
-- Apply through the linked Supabase project before deploying the matching UI.

alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;

create index if not exists tasks_parent_task_id_idx on public.tasks(parent_task_id);

create table if not exists public.task_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  entry_type text not null check (entry_type in ('answer','comment','number','evidence')),
  label text,
  text_value text,
  numeric_value numeric,
  unit text,
  object_path text,
  file_name text,
  mime_type text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_entries_value_check check (
    text_value is not null or numeric_value is not null or object_path is not null
  )
);

create index if not exists task_entries_task_id_created_at_idx
  on public.task_entries(task_id, created_at);

alter table public.task_entries enable row level security;

create or replace function public.kaikira_can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks task
    join public.project_members member on member.project_id = task.project_id
    where task.id = target_task_id and member.user_id = auth.uid()
  ) or exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.global_role = 'admin'
  );
$$;

create or replace function public.kaikira_can_work_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks task
    where task.id = target_task_id and task.assigned_to = auth.uid()
  ) or exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.global_role = 'admin'
  );
$$;

revoke all on function public.kaikira_can_access_task(uuid) from public;
revoke all on function public.kaikira_can_work_task(uuid) from public;
grant execute on function public.kaikira_can_access_task(uuid) to authenticated;
grant execute on function public.kaikira_can_work_task(uuid) to authenticated;

drop policy if exists task_entries_project_read on public.task_entries;
create policy task_entries_project_read on public.task_entries
  for select to authenticated
  using (public.kaikira_can_access_task(task_id));

drop policy if exists task_entries_assignee_insert on public.task_entries;
create policy task_entries_assignee_insert on public.task_entries
  for insert to authenticated
  with check (created_by = auth.uid() and public.kaikira_can_work_task(task_id));

drop policy if exists task_entries_author_update on public.task_entries;
create policy task_entries_author_update on public.task_entries
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.kaikira_can_work_task(task_id));

drop policy if exists task_entries_author_delete on public.task_entries;
create policy task_entries_author_delete on public.task_entries
  for delete to authenticated
  using (created_by = auth.uid());

-- Existing task policies remain in place. This additional policy only permits an
-- assignee to create a child below one of their own tasks.
drop policy if exists tasks_assignee_create_subtasks on public.tasks;
create policy tasks_assignee_create_subtasks on public.tasks
  for insert to authenticated
  with check (
    parent_task_id is not null
    and assigned_to = auth.uid()
    and created_by = auth.uid()
    and public.kaikira_can_work_task(parent_task_id)
  );

insert into storage.buckets (id, name, public)
values ('task-evidence', 'task-evidence', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists task_evidence_project_read on storage.objects;
create policy task_evidence_project_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-evidence'
    and public.kaikira_can_access_task(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists task_evidence_assignee_insert on storage.objects;
create policy task_evidence_assignee_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-evidence'
    and owner_id = auth.uid()::text
    and public.kaikira_can_work_task(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists task_evidence_owner_delete on storage.objects;
create policy task_evidence_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-evidence' and owner_id = auth.uid()::text);

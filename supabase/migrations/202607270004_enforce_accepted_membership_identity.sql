-- LUMINA Phase 2: accepted, UUID-bound identities and least-privilege task access.
-- No authorization in this migration relies on member/deputy e-mail addresses.

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_project_id_id_key'
  ) then
    alter table public.tasks add constraint tasks_project_id_id_key unique (project_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_project_responsible_member_fkey'
  ) then
    alter table public.tasks add constraint tasks_project_responsible_member_fkey
      foreign key (project_id, responsible_member_id)
      references public.project_members(project_id, id);
  end if;
end;
$constraints$;

do $task_project_constraints$
declare
  item record;
begin
  for item in
    select * from (values
      ('documents', 'documents_project_task_fkey'),
      ('task_activity_events', 'task_activity_events_project_task_fkey'),
      ('task_approvals', 'task_approvals_project_task_fkey'),
      ('task_notifications', 'task_notifications_project_task_fkey'),
      ('task_review_notes', 'task_review_notes_project_task_fkey')
    ) as constraints_to_add(table_name, constraint_name)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', item.table_name)::regclass
        and conname = item.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (project_id, task_id) references public.tasks(project_id, id) on delete cascade',
        item.table_name,
        item.constraint_name
      );
    end if;
  end loop;
end;
$task_project_constraints$;

create or replace function private.current_project_member_id(target_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select pm.id
  from public.project_members pm
  where pm.project_id = target_project_id
    and pm.user_id = (select auth.uid())
    and pm.invitation_status = 'accepted'
  order by pm.id
  limit 1;
$function$;

create or replace function private.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.invitation_status = 'accepted'
  );
$function$;

create or replace function private.can_manage_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.invitation_status = 'accepted'
      and pm.can_manage_members = true
  );
$function$;

create or replace function private.can_view_project_team(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.invitation_status = 'accepted'
      and (pm.can_view_all_tasks = true or pm.can_manage_members = true)
  );
$function$;

create or replace function private.has_active_task_substitution(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.tasks t
    join public.project_members principal
      on principal.project_id = t.project_id
     and principal.id = t.responsible_member_id
     and principal.invitation_status = 'accepted'
     and principal.user_id is not null
    join public.project_member_substitutions substitution
      on substitution.project_id = t.project_id
     and substitution.principal_member_id = principal.id
     and substitution.status = 'active'
     and (substitution.valid_from is null or substitution.valid_from <= now())
     and (substitution.valid_until is null or substitution.valid_until > now())
    join public.project_members substitute
      on substitute.project_id = substitution.project_id
     and substitute.id = substitution.substitute_member_id
     and substitute.invitation_status = 'accepted'
     and substitute.user_id = (select auth.uid())
    where t.id = target_task_id
      and t.status not in ('declined', 'approved', 'completed')
  );
$function$;

create or replace function private.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.tasks t
    join public.project_members actor
      on actor.project_id = t.project_id
     and actor.user_id = (select auth.uid())
     and actor.invitation_status = 'accepted'
    where t.id = target_task_id
      and (
        actor.can_view_all_tasks = true
        or t.responsible_member_id = actor.id
        or private.has_active_task_substitution(t.id)
      )
  );
$function$;

create or replace function private.can_edit_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.tasks t
    join public.project_members actor
      on actor.project_id = t.project_id
     and actor.user_id = (select auth.uid())
     and actor.invitation_status = 'accepted'
    where t.id = target_task_id
      and (
        actor.can_manage_members = true
        or (actor.can_edit = true and actor.can_view_all_tasks = true)
        or t.responsible_member_id = actor.id
        or private.has_active_task_substitution(t.id)
      )
  );
$function$;

create or replace function private.can_upload_to_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.invitation_status = 'accepted'
      and pm.can_upload = true
  );
$function$;

create or replace function private.can_approve_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.can_access_task(target_task_id)
    and exists (
      select 1
      from public.tasks t
      join public.project_members pm
        on pm.project_id = t.project_id
       and pm.user_id = (select auth.uid())
       and pm.invitation_status = 'accepted'
       and pm.can_approve = true
      where t.id = target_task_id
    );
$function$;

revoke all on function private.current_project_member_id(uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_project_member(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_manage_project(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_view_project_team(uuid) from public, anon, authenticated, service_role;
revoke all on function private.has_active_task_substitution(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_access_task(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_edit_task(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_upload_to_project(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_approve_task(uuid) from public, anon, authenticated, service_role;
grant execute on function private.current_project_member_id(uuid) to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.can_manage_project(uuid) to authenticated;
grant execute on function private.can_view_project_team(uuid) to authenticated;
grant execute on function private.has_active_task_substitution(uuid) to authenticated;
grant execute on function private.can_access_task(uuid) to authenticated;
grant execute on function private.can_edit_task(uuid) to authenticated;
grant execute on function private.can_upload_to_project(uuid) to authenticated;
grant execute on function private.can_approve_task(uuid) to authenticated;

drop policy if exists "Eigentümer und Mitglieder sehen Projektteam" on public.project_members;
drop policy if exists "Projektverwalter entfernen Mitglieder" on public.project_members;
drop policy if exists "Projektverwalter legen Mitglieder an" on public.project_members;
drop policy if exists "Projektverwalter ändern Mitglieder" on public.project_members;
create policy "Aktive Mitglieder sehen freigegebene Projektteamdaten"
on public.project_members for select to authenticated
using (
  (user_id = (select auth.uid()) and invitation_status = 'accepted')
  or private.can_view_project_team(project_id)
);
create policy "Projektverwalter bereiten sichere Einladungen vor"
on public.project_members for insert to authenticated
with check (
  private.can_manage_project(project_id)
  and user_id is null
  and invitation_status in ('pending', 'invited')
  and cockpit_profile is null
  and access_level in ('member', 'viewer')
  and can_upload = false
  and can_edit = false
  and can_approve = false
  and can_manage_members = false
  and can_view_all_tasks = false
);

drop policy if exists "Aktive Mitglieder sehen Stellvertretungen" on public.project_member_substitutions;
create policy "Aktive Mitglieder sehen Stellvertretungen"
on public.project_member_substitutions for select to authenticated
using (
  principal_member_id = private.current_project_member_id(project_id)
  or substitute_member_id = private.current_project_member_id(project_id)
  or private.can_view_project_team(project_id)
);

drop policy if exists "Eigentümer und Mitglieder sehen Projekte" on public.projects;
drop policy if exists "Projektersteller löschen Projekte" on public.projects;
drop policy if exists "Projektverwalter ändern Projekte" on public.projects;
create policy "Aktive Mitglieder sehen Projekte"
on public.projects for select to authenticated
using (private.is_project_member(id));
create policy "Explizite Projektverwalter ändern Projekte"
on public.projects for update to authenticated
using (private.can_manage_project(id))
with check (private.can_manage_project(id));
create policy "Explizite Projektverwalter löschen Projekte"
on public.projects for delete to authenticated
using (private.can_manage_project(id));

drop policy if exists "Projektmitglieder sehen Maßnahmen" on public.tasks;
create policy "Berechtigte sehen Maßnahmen"
on public.tasks for select to authenticated
using (private.can_access_task(id));

drop policy if exists "Projektmitglieder protokollieren Aktivitäten" on public.task_activity_events;
drop policy if exists "Projektmitglieder sehen Aktivitäten" on public.task_activity_events;
create policy "Berechtigte protokollieren eigene Aktivitäten"
on public.task_activity_events for insert to authenticated
with check (created_by = auth.uid() and private.can_access_task(task_id));
create policy "Berechtigte sehen Aktivitäten"
on public.task_activity_events for select to authenticated
using (private.can_access_task(task_id));

drop policy if exists "Berechtigte entscheiden Freigaben" on public.task_approvals;
drop policy if exists "Projektmitglieder sehen Freigaben" on public.task_approvals;
drop policy if exists "Projektverwalter legen Freigaben an" on public.task_approvals;
drop policy if exists "Projektverwalter löschen Freigaben" on public.task_approvals;
create policy "Berechtigte sehen Freigaben"
on public.task_approvals for select to authenticated
using (private.can_access_task(task_id));
create policy "Berechtigte legen Freigaben an"
on public.task_approvals for insert to authenticated
with check (created_by = auth.uid() and private.can_approve_task(task_id));
create policy "Verantwortliche entscheiden Freigaben"
on public.task_approvals for update to authenticated
using ((responsible_user_id = auth.uid() and private.can_access_task(task_id)) or private.can_approve_task(task_id))
with check ((responsible_user_id = auth.uid() and private.can_access_task(task_id)) or private.can_approve_task(task_id));
create policy "Explizite Projektverwalter löschen Freigaben"
on public.task_approvals for delete to authenticated
using (private.can_manage_project(project_id));

drop policy if exists "Berechtigte erfassen Kommentare" on public.task_comments;
create policy "Berechtigte erfassen eigene Benutzerkommentare"
on public.task_comments for insert to authenticated
with check (
  private.can_access_task(task_id)
  and user_id = auth.uid()
  and author_type = 'human'
  and comment_type <> 'system'
);

drop policy if exists "Projektmitglieder legen Review Notes an" on public.task_review_notes;
drop policy if exists "Projektmitglieder sehen Review Notes" on public.task_review_notes;
drop policy if exists "Projektmitglieder bearbeiten Review Notes" on public.task_review_notes;
drop policy if exists "Projektverwalter löschen Review Notes" on public.task_review_notes;
create policy "Berechtigte sehen Review Notes"
on public.task_review_notes for select to authenticated
using (private.can_access_task(task_id));
create policy "Berechtigte legen Review Notes an"
on public.task_review_notes for insert to authenticated
with check (created_by = auth.uid() and private.can_access_task(task_id));
create policy "Berechtigte bearbeiten Review Notes"
on public.task_review_notes for update to authenticated
using (((created_by = auth.uid()) or (assigned_to = auth.uid()) or private.can_approve_task(task_id)) and private.can_access_task(task_id))
with check (((created_by = auth.uid()) or (assigned_to = auth.uid()) or private.can_approve_task(task_id)) and private.can_access_task(task_id));
create policy "Explizite Projektverwalter löschen Review Notes"
on public.task_review_notes for delete to authenticated
using (private.can_manage_project(project_id));

drop policy if exists "Projektverwalter sehen Versandprotokoll" on public.task_notifications;
create policy "Berechtigte sehen aufgabenbezogene Versandprotokolle"
on public.task_notifications for select to authenticated
using ((task_id is not null and private.can_access_task(task_id)) or private.can_manage_project(project_id));

drop policy if exists "Projektmitglieder lesen LUMINA-Dateien" on storage.objects;
create policy "Aufgabenberechtigte lesen LUMINA-Dateien"
on storage.objects for select to authenticated
using (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_access_task(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "Projektmitglieder mit Uploadrecht laden LUMINA-Dateien hoch" on storage.objects;
create policy "Aktive Mitglieder mit Uploadrecht laden LUMINA-Dateien hoch"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
  and private.can_access_task(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "Projektmitglieder mit Uploadrecht aktualisieren LUMINA-Dateien" on storage.objects;
create policy "Aktive Mitglieder mit Uploadrecht aktualisieren LUMINA-Dateien"
on storage.objects for update to authenticated
using (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
  and private.can_access_task(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
  and private.can_access_task(((storage.foldername(name))[2])::uuid)
);

drop policy if exists "Projektverwalter löschen LUMINA-Dateien" on storage.objects;
create policy "Explizite Projektverwalter löschen LUMINA-Dateien"
on storage.objects for delete to authenticated
using (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_manage_project(((storage.foldername(name))[1])::uuid)
  and private.can_access_task(((storage.foldername(name))[2])::uuid)
);

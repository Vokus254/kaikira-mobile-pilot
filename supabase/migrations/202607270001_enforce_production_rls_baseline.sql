-- Phase 1A: remove permissive test access and require explicit upload permission.
-- Scope intentionally excludes project/member read or delete policy expansion.

drop policy if exists "Testzugriff Dokumente anlegen" on public.documents;
drop policy if exists "Testzugriff Dokumente lesen" on public.documents;
drop policy if exists "Testzugriff Kommentare anlegen" on public.task_comments;
drop policy if exists "Testzugriff Antworten anlegen" on public.task_responses;
drop policy if exists "Testzugriff Dateien hochladen" on storage.objects;
drop policy if exists "Testzugriff Dateien lesen" on storage.objects;

drop policy if exists "Projektmitglieder laden LUMINA-Dateien hoch" on storage.objects;
create policy "Projektmitglieder mit Uploadrecht laden LUMINA-Dateien hoch"
on storage.objects
as permissive
for insert
to authenticated
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and exists (
    select 1
    from public.project_members pm
    where pm.project_id = ((storage.foldername(name))[1])::uuid
      and pm.invitation_status <> 'inactive'
      and pm.can_upload = true
      and (
        pm.user_id = (select auth.uid())
        or lower(pm.email) = private.current_user_email()
        or lower(coalesce(pm.deputy_email, '')) = private.current_user_email()
      )
  )
);

drop policy if exists "Projektmitglieder aktualisieren LUMINA-Dateien" on storage.objects;
create policy "Projektmitglieder mit Uploadrecht aktualisieren LUMINA-Dateien"
on storage.objects
as permissive
for update
to authenticated
using (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and exists (
    select 1
    from public.project_members pm
    where pm.project_id = ((storage.foldername(name))[1])::uuid
      and pm.invitation_status <> 'inactive'
      and pm.can_upload = true
      and (
        pm.user_id = (select auth.uid())
        or lower(pm.email) = private.current_user_email()
        or lower(coalesce(pm.deputy_email, '')) = private.current_user_email()
      )
  )
)
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and exists (
    select 1
    from public.project_members pm
    where pm.project_id = ((storage.foldername(name))[1])::uuid
      and pm.invitation_status <> 'inactive'
      and pm.can_upload = true
      and (
        pm.user_id = (select auth.uid())
        or lower(pm.email) = private.current_user_email()
        or lower(coalesce(pm.deputy_email, '')) = private.current_user_email()
      )
  )
);

-- Follow-up for the test-only rollout of 202607270001.
-- The SECURITY DEFINER helper evaluates the caller's own upload permission
-- without broadening project_members visibility through RLS.

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
      and pm.invitation_status <> 'inactive'
      and pm.can_upload = true
      and (
        pm.user_id = (select auth.uid())
        or lower(pm.email) = private.current_user_email()
        or lower(coalesce(pm.deputy_email, '')) = private.current_user_email()
      )
  );
$function$;

revoke all on function private.can_upload_to_project(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_upload_to_project(uuid) to authenticated;

drop policy if exists "Projektmitglieder mit Uploadrecht laden LUMINA-Dateien hoch" on storage.objects;
create policy "Projektmitglieder mit Uploadrecht laden LUMINA-Dateien hoch"
on storage.objects
as permissive
for insert
to authenticated
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Projektmitglieder mit Uploadrecht aktualisieren LUMINA-Dateien" on storage.objects;
create policy "Projektmitglieder mit Uploadrecht aktualisieren LUMINA-Dateien"
on storage.objects
as permissive
for update
to authenticated
using (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'lumina-datarooms'
  and array_length(storage.foldername(name), 1) >= 3
  and private.can_upload_to_project(((storage.foldername(name))[1])::uuid)
);

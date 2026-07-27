-- LUMINA Phase 2: member management must not imply destructive project deletion.

drop policy if exists "Explizite Projektverwalter löschen Projekte" on public.projects;
drop policy if exists "Aktive Projektersteller löschen eigene Projekte" on public.projects;

create policy "Aktive Projektersteller löschen eigene Projekte"
on public.projects
for delete
to authenticated
using (
  created_by = (select auth.uid())
  and private.is_project_member(id)
);

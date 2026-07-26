# Deaktivierte Migrationen

`202607200001_task_workspace.sql` wurde in Phase 1A unverändert aus dem aktiven
Migrationspfad verschoben. Sie wurde nie auf das aktuell verknüpfte Remote-Projekt
angewandt und ist mit dessen maßgeblichem Schema nicht kompatibel.

Die Migration setzt unter anderem `profiles`, `tasks.assigned_to`,
`tasks.created_by` und den Bucket `task-evidence` voraus beziehungsweise führt
diese alternative Modellrichtung ein. Das maßgebliche Remote-Modell verwendet
hingegen `tasks.responsible_member_id`, bestehende Feldnamen und den Bucket
`lumina-datarooms`.

Die Datei darf erst nach einem separat freigegebenen Migrationsvorschlag angepasst
oder reaktiviert werden. Sie wird ausdrücklich nicht ersatzlos gelöscht.

Die aktive Remote-Schema-Baseline wurde am 2026-07-26 erfolgreich auf einer
leeren lokalen Supabase-Datenbank aufgebaut. Dieser PASS macht die hier
deaktivierte, fachlich abweichende Migration nicht kompatibel und ändert ihren
Status nicht.

# Vorschlag: Migrationshistorie konsolidieren

Dieser Plan ist vorbereitet, aber nicht remote ausgeführt.

## Aktueller Zustand

- Das Remote-Schema enthält die produktiv genutzten Objekte.
- Die Remote-Migrationshistorie enthält keinen passenden Baseline-Eintrag.
- Die aktive Datei `202607260001_remote_schema_baseline.sql` bildet den
  tatsächlichen Ist-Stand ohne fachliche Daten ab.
- Die frühere Migration `202607200001_task_workspace.sql` ist inkompatibel und
  deaktiviert.

## Freigabepunkte vor einer History-Reparatur

1. **Lokal erfüllt am 2026-07-26:** Baseline auf einer leeren lokalen
   Supabase-Datenbank vollständig angewandt; `npm run test:migrations` endete
   mit Exit-Code 0.
2. **Lokal erfüllt:** 13 Tabellen, 54 Policies und ein Storage-Bucket wurden
   nach dem Nullaufbau tatsächlich gezählt. Der vollständige Objektvergleich
   mit einer getrennten Remote-Testinstanz bleibt offen.
3. **Offen:** Die vollständige RLS-Matrix in der getrennten Testinstanz grün
   ausführen.
4. **Offen:** Bestätigen, dass seit der Erfassung kein Schema-Drift im
   produktiven Remote-Projekt entstanden ist.
5. Backup- und Rollback-Verantwortung festlegen.
6. Konkreten `migration repair`-Befehl in einem Change-Review freigeben.

## Vorgeschlagener späterer Ablauf

Erst nach den Freigabepunkten soll die Baseline-Version im bestehenden Remote
als bereits angewandt markiert werden, ohne ihre DDL erneut auszuführen. Der
vorgesehene Mechanismus ist `supabase migration repair ... --status applied`.
Der exakte Befehl wird bewusst erst nach erneutem `migration list` und
Schema-Diff festgelegt.

Danach beginnen neue, vorwärtsgerichtete Migrationen mit einer höheren Version.
Die deaktivierte Task-Workspace-Migration darf nicht einfach als angewandt
markiert werden.

## In Phase 1A nicht erfolgt

- kein `migration repair`,
- kein `db push`,
- kein Baseline-DDL gegen das bestehende Remote-Schema,
- keine Änderung produktiver Migrationsmetadaten.

Der bestandene lokale Migration-from-zero-Test ändert diese Grenzen nicht und
ist ausdrücklich keine Freigabe für eine Reparatur der produktiven
Migrationshistorie.

# Phase-0: Storage-Inventar

Stand: 2026-07-26. Es wurden keine Dateien hochgeladen, heruntergeladen, verändert oder gelöscht.

## Remote-Bucket

| Eigenschaft | Wert |
| --- | --- |
| ID / Name | `lumina-datarooms` |
| Öffentlich | nein |
| Dateigrößenlimit | nicht gesetzt |
| Erlaubte MIME-Typen | nicht gesetzt |

## Frontend-Nutzung

`task.html` verwendet den Bucket direkt:

- Upload mit `upsert: false`
- anschließend Insert der Metadaten in `public.documents`
- Download über einen signierten Link mit 300 Sekunden Gültigkeit
- Objektpfad: `<project_id>/<task_id>/<folder_id>/<random_uuid>/<bereinigter_dateiname>`

Die Metadaten umfassen Projekt, Aufgabe, Ordner, Bucket, Storage-Pfad, Dateiname, MIME-Typ, Größe, Uploader, Versionsnummer und Dokumentstatus.

## Policies auf `storage.objects`

Remote vorhanden sind Policies für:

- authentifizierte Projektmitglieder: Lesen, Hochladen und Aktualisieren,
- Projektverwalter: Löschen,
- Testzugriff `{anon,authenticated}`: Lesen und Hochladen.

Die anonymen Testzugriffe sollten vor einem produktiven Sicherheitsfreigabeprozess separat bewertet und mit realen RLS-Tests verifiziert werden.

## Lokale, nicht angewandte Migration

`202607200001_task_workspace.sql` definiert zusätzlich den privaten Bucket `task-evidence`. Dessen Pfadmodell erwartet die Task-ID im ersten Pfadsegment und verwendet die neuen Funktionen `kaikira_can_access_task` und `kaikira_can_work_task`. Dieser Bucket existiert remote nicht; das aktuelle Frontend schreibt stattdessen nach `lumina-datarooms`.

## Risiken und offene Punkte

1. Bucket und Frontend setzen weder ein serverseitiges Größenlimit noch eine MIME-Allowlist.
2. Gelingt der Storage-Upload, aber der anschließende Insert in `documents` scheitert, verbleibt laut aktuellem Code potenziell ein verwaistes Storage-Objekt.
3. Für fehlgeschlagene oder abgebrochene Uploads wurde kein automatischer Cleanup erkannt.
4. Der Aufgabenraum erzeugt signierte Downloadlinks; deren Berechtigung hängt vollständig an RLS und der aktuell angemeldeten Session.
5. Die Admin-Löschung von Ordner-Metadaten wurde nicht als kaskadierende Storage-Objektlöschung verifiziert.
6. Die konkurrierenden Bucketmodelle `lumina-datarooms` und `task-evidence` sind vor einer Migration fachlich und technisch zu konsolidieren.
7. Upload, Download, Delete und RLS sind ohne Testbenutzer und ohne Datenmutation in Phase 0 „nicht verifiziert“.

## Fortschreibung 2026-07-27: validiertes Test-Zielmodell

Auf `LUMINA-RLS-TEST` wurden die beiden anonymen Storage-Testpolicies entfernt.
SELECT bleibt an Projektmitgliedschaft und DELETE an Projektverwaltung gebunden.
INSERT und UPDATE verlangen jetzt zusätzlich eine aktive eigene Mitgliedschaft
mit `project_members.can_upload = true`.

Die gezielten Nachweise bestätigen:

- Anonymous kann ein frisches Objekt weder lesen, signieren noch hochladen.
- Nutzer A mit `can_upload = false` kann weder anlegen noch ersetzen.
- Bearbeiter mit `can_upload = true` kann anlegen und ersetzen.
- Es blieben null temporäre Storage-Testobjekte zurück.

Diese Änderung wurde nicht auf Produktion angewandt.

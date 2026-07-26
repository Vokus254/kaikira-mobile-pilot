# Phase-0: Datenbank-Inventar

Stand: 2026-07-26. Alle Remote-Abfragen waren lesend. Es wurde kein `db push`, `db reset`, `migration repair` oder DDL/DML ausgeführt.

## Verknüpftes Supabase-Projekt

- Projektname: `LUMINA-FRAGEBOGEN`
- Project Ref: `mslbzypjtvvznyewupco`
- Region: `eu-west-2`
- Status bei der Bestandsaufnahme: `ACTIVE_HEALTHY`
- Herleitung: Der Project Ref entspricht dem Supabase-Endpunkt, den die aktuelle Frontend-Konfiguration verwendet.

## Migrationsvergleich

Ausgeführt:

```powershell
npx.cmd --yes supabase@latest migration list
```

Ergebnis, Exit-Code 0:

| Version | Lokal | Remote |
| --- | --- | --- |
| `202607200001` | vorhanden | nicht vorhanden |

Damit enthält die Remote-Migrationshistorie keinen Eintrag für die einzige lokale Migration. Das umfangreiche bestehende Remote-Schema wurde demnach nicht aus den im Repository vorhandenen Migrationen aufgebaut oder seine Historie wurde nicht in Git übernommen. Es wurde ausdrücklich keine automatische Reparatur vorgenommen.

## Remote-Schema `public`

Alle 13 Remote-Tabellen haben Row Level Security aktiviert:

| Tabelle | Statische Frontend-Nutzung |
| --- | --- |
| `companies` | Projektanlage: Select/Insert |
| `projects` | Projektanlage: Insert; Cockpit/Admin: Select |
| `project_members` | Projektanlage: Insert; Admin: Select |
| `tasks` | Projektanlage/Admin: Insert; Admin: Update; mehrere Ansichten: Select |
| `task_rooms` | Projektanlage/Admin: Insert; mehrere Ansichten: Select |
| `task_room_folders` | Projektanlage/Admin: Insert; Admin: Update/Delete; mehrere Ansichten: Select |
| `documents` | Aufgabenraum: Insert; Cockpit/Admin/Aufgabenraum: Select |
| `task_comments` | Aufgabenraum: Insert; Cockpit/Admin/Aufgabenraum: Select |
| `task_activity_events` | Aufgabenraum: Select/Insert |
| `task_approvals` | Aufgabenraum: Select/Insert/Update |
| `task_review_notes` | Aufgabenraum: Select/Insert/Update |
| `task_notifications` | Cockpit: Select |
| `task_responses` | Cockpit: Select |

Remote-Views oder materialisierte Views wurden nicht gefunden.

## Remote-Funktionen / RPC-Kandidaten

| Funktion | Typ | Security Definer |
| --- | --- | --- |
| `normalize_project_name()` | Triggerfunktion | nein |
| `project_name_available(p_name text)` | Boolean-Funktion | ja |
| `set_updated_at()` | Triggerfunktion | nein |

Im aktuellen Frontend wurde kein statischer `.rpc(...)`-Aufruf erkannt. Die Triggerfunktionen werden serverseitig verwendet; `project_name_available` ist als RPC verfügbar, aber aktuell nicht statisch aufgerufen.

## Lokale Migration `202607200001_task_workspace.sql`

Die Migration würde unter anderem:

- `tasks.parent_task_id` hinzufügen,
- `task_entries` mit RLS anlegen,
- `kaikira_can_access_task(uuid)` und `kaikira_can_work_task(uuid)` anlegen,
- Policies für `task_entries` und Unteraufgaben anlegen,
- den privaten Bucket `task-evidence` samt Storage-Policies anlegen.

## Kritische Drift und Inkompatibilität

Die Migration darf im aktuellen Zustand nicht auf das verknüpfte Projekt angewandt werden:

1. Sie referenziert `public.profiles`, diese Tabelle existiert im Remote-`public`-Schema nicht.
2. Sie verwendet `tasks.assigned_to`; remote besitzt `tasks` stattdessen unter anderem `responsible_member_id`, `responsible_name` und `responsible_email`.
3. Die Insert-Policy verwendet `tasks.created_by`; diese Spalte existiert remote nicht.
4. `task_entries.created_by` referenziert zwar `auth.users`, die Zugriffsfunktionen können wegen der fehlenden Tabellen/Spalten aber nicht erfolgreich erstellt werden.
5. Der im Frontend tatsächlich verwendete Bucket heißt `lumina-datarooms`; die Migration führt einen zweiten, anders strukturierten Bucket `task-evidence` ein.
6. Das Frontend enthält bereits UI-/Testannahmen zu `task_entries` und `parent_task_id`, obwohl diese Remote-Objekte nicht vorhanden sind.

Ein späterer Reparaturschritt benötigt zuerst eine belastbare Baseline-Migration des realen Remote-Schemas und eine fachliche Entscheidung, ob das aktuelle Aufgabenmodell (`responsible_member_id`) oder das neue Modell (`assigned_to`) maßgeblich sein soll.

## RLS-/Policy-Befund

- Alle fachlichen Tabellen sind RLS-aktiviert.
- Es existieren rollenbezogene Policies für authentifizierte Projektmitglieder und Projektverwalter.
- Auf `documents`, `task_comments`, `task_responses` sowie `storage.objects` existieren zusätzlich als „Testzugriff“ bezeichnete Policies für `{anon,authenticated}`.
- Diese anonymen Test-Policies sind ein sicherheitsrelevanter Prüfpunkt. In Phase 0 wurden sie weder getestet noch verändert.

## Nicht verifiziert

- Fachliche Korrektheit und vollständige Wirksamkeit aller RLS-Policies mit realen Rollen.
- Triggerzuordnung und Triggerverhalten.
- Auth-Flows mit realen Benutzerkonten.
- Datenqualität, Datensätze und Produktionsvolumen; es wurden bewusst keine fachlichen Daten ausgelesen.
- Wiederherstellbarkeit des Remote-Schemas ausschließlich aus Git.

## Fortschreibung 2026-07-27: globale Administration

Eine echte globale Administratorrolle ist im aktuellen Schema weiterhin nicht
nachgewiesen. Der synthetische Admin der Sicherheitsfixtures ist ausschließlich
Projektadministrator von Projekt A und darf keine Mitgliedschaften in Projekt B
verwalten. Es wurde keine breite projektübergreifende RLS-Policy vorbereitet.

Eine spätere globale Administration soll bevorzugt über eine eng autorisierte
Security-Definer-RPC oder Edge Function mit serverseitiger Rollenprüfung,
Audit-Protokollierung und projektgenauer Eingabevalidierung erfolgen.

Offener Punkt „Projektmitglieder verwalten“: Direkte UPDATE- und
DELETE-Mutationen auf fremde `project_members`-Zeilen bleiben für Browserclients
gesperrt. Eine sichere, projektgebundene Verwaltungs-RPC oder Edge Function ist
als separates Arbeitspaket erforderlich und wurde in Phase 1A nicht umgesetzt.

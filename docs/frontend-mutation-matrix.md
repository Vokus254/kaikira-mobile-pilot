# Phase-0: Frontend-Mutationsmatrix

Stand: 2026-07-26. Die Matrix basiert auf statischer Codeanalyse. In Phase 0 wurde keine der Mutationen ausgelöst.

| Oberfläche | Objekt / Ziel | Lesen | Schreiben | Hinweise |
| --- | --- | --- | --- | --- |
| `index.html` | Kontaktziel `CONTACT_ENDPOINT` | nein | optionaler HTTP-POST | Endpoint derzeit leer; daher E-Mail-Fallback statt Netzwerkmutation |
| `index.html` | Browser-/Demozustand | ja | lokal | Keine statische Supabase-Tabellenmutation erkannt |
| `abschlussplaner.html` | `companies` | Select | Insert | Anlage eines Unternehmens |
| `abschlussplaner.html` | `projects` | indirekt/nach Insert | Insert | Anlage des Abschlussprojekts |
| `abschlussplaner.html` | `project_members` | nein | Insert | Teammitglieder und Berechtigungsdaten |
| `abschlussplaner.html` | `tasks` | Select | Insert | Generierte Aufgaben |
| `abschlussplaner.html` | `task_rooms` | Select | Insert | Aufgabenbezogene Datenräume |
| `abschlussplaner.html` | `task_room_folders` | Select | Insert | Ordnerstruktur |
| `abschlussplaner.html` | `luminaAbschlussplanerV1` | Get | Set | Lokaler Browserzustand über `localStorage` |
| `cockpit.html` | `projects`, `tasks`, `task_rooms`, `task_room_folders`, `documents` | Select | nein | Management-/Statusauswertung |
| `cockpit.html` | `task_comments`, `task_notifications`, `task_responses` | Select | nein | Kommunikations- und Reaktionsauswertung |
| `cockpit.html` | `luminaCockpitProject` | Get | Set | Lokale Projektauswahl über `localStorage` |
| `admin.html` | `projects`, `project_members`, `documents`, `task_comments` | Select | nein | Adminübersicht |
| `admin.html` | `tasks` | Select | Insert, Update | Neue Maßnahme und fachliche Status-/Verantwortlichkeitsänderungen |
| `admin.html` | `task_rooms` | Select | Insert | Datenraumanlage |
| `admin.html` | `task_room_folders` | Select | Insert, Update, Delete | Ordnerverwaltung |
| `task.html` | `tasks`, `task_rooms`, `task_room_folders`, `documents` | Select | Dokumentmetadaten: Insert | Aufgaben- und Datenraumkontext |
| `task.html` | `task_comments` | Select | Insert | Kommunikation |
| `task.html` | `task_activity_events` | Select | Insert | Aktivitätsprotokoll |
| `task.html` | `task_approvals` | Select | Insert, Update | Freigabeschritte und Entscheidungen |
| `task.html` | `task_review_notes` | Select | Insert, Update | Review Notes und Status |
| `task.html` | Storage `lumina-datarooms` | signierter Download | Upload | 300-Sekunden-Link; kein Upsert |

## Authentifizierung

`abschlussplaner.html`, `cockpit.html`, `admin.html` und `task.html` erzeugen jeweils einen Supabase-Client mit persistierter Session, Auto-Refresh und URL-Session-Erkennung. Die Konfigurationsnamen `SUPABASE_URL` und `SUPABASE_ANON_KEY` sind dupliziert in den HTML-Dateien eingebettet. Es wurde kein Service-Role-Key im analysierten Frontend festgestellt.

## RPCs und Views

- Keine statischen `.rpc(...)`-Aufrufe erkannt.
- Keine Remote-Views vorhanden.
- Die Remote-Funktion `project_name_available` ist vorhanden, wird im aktuellen statischen Zugriffsmuster aber nicht aufgerufen.

## Mutationsrisiken

1. `abschlussplaner.html` führt eine mehrstufige Publikation über mehrere Tabellen aus. Es wurde keine serverseitige Transaktion über die gesamte Kette erkannt; Teilzustände sind bei Zwischenfehlern möglich.
2. Storage-Upload und Dokumentmetadaten-Insert sind getrennte Operationen; dadurch sind verwaiste Dateien möglich.
3. `admin.html` kann Ordner löschen. Ob abhängige Dokumente und Storage-Objekte konsistent behandelt werden, ist nicht verifiziert.
4. Rollen- und RLS-Verhalten ist statisch sichtbar, aber ohne authentifizierte Testidentitäten nicht verifiziert.
5. Das Frontend und der vorhandene Test referenzieren teilweise das nicht remote vorhandene neue Task-Workspace-Modell.

## Schutzumfang für Folgephasen

Landingpage, LUMINA-Header, Management-Cockpit und Rollenansichten bilden die visuelle Baseline. Änderungen an diesen Bereichen benötigen künftig mindestens lokalen Build, HTTP-Smoke-Test, Desktop-Visualvergleich und gezielte Rollen-/RLS-Tests. In Phase 0 wurden diese Bereiche nicht verändert.

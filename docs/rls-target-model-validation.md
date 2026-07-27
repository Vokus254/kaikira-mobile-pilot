# RLS-Zielmodell: Sicherheitsmigration und Validierung

> Phase-2-Hinweis (27. Juli 2026): Der historische Hauptteil dieses Dokuments beschreibt Phase 1A. Die Migrationen `202607270003` bis `202607270005` wurden inzwischen ausschließlich auf `LUMINA-RLS-TEST` angewandt und dort mit 420/420 RLS-Fällen, 37/37 Privilege-Probes und 24/24 gezielten Sicherheitsnachweisen validiert. Produktion blieb unverändert. Details stehen in `phase-2-implementation-report.md`.

Stand: 27. Juli 2026  
Testinstanz: `LUMINA-RLS-TEST` (`vcozprjecsprgyeqfahn`)  
Produktionsänderung: nein

## Verbindliches Zielmodell

- `companies.DELETE` bleibt für normale Browserrollen verboten.
- Anonymous darf keine Dokumentzeilen und keine Storage-Objekte lesen, signieren oder hochladen.
- Storage-INSERT und Storage-UPDATE in `lumina-datarooms` setzen eine aktive eigene `project_members`-Zeile mit `can_upload = true` voraus.
- Nutzer A besitzt `can_upload = false`; Bearbeiter besitzt `can_upload = true`.
- Der synthetische Admin ist ausschließlich Projektadministrator von Projekt A.
- Projektadministrator A darf keine Mitgliedschaften in Projekt B verwalten.
- Eine globale Administratorrolle ist im aktuellen Schema nicht nachgewiesen.

## Migrationen

### `202607270001_enforce_production_rls_baseline.sql`

Die Migration entfernt genau die sechs anonymen beziehungsweise permissiven `Testzugriff`-Policies auf `documents`, `task_comments`, `task_responses` und `storage.objects`. Sie ersetzt ausschließlich die Storage-INSERT- und Storage-UPDATE-Policies durch Varianten, die `can_upload = true` prüfen. Die bestehenden Storage-SELECT- und Storage-DELETE-Policies sowie Policies auf `companies`, `projects` und `project_members` werden nicht verändert.

### `202607270002_fix_storage_upload_permission_evaluation.sql`

Beim ersten Testlauf wurden berechtigte Uploads trotz `can_upload = true` mit Storage-Code 403 abgelehnt. Ursache war, dass die direkt in der Storage-Policy ausgeführte Abfrage auf `project_members` ihrerseits durch dessen RLS eingeschränkt wurde.

Die revisionssichere Folgemigration führt ausschließlich `private.can_upload_to_project(uuid)` als stabilen Security-Definer-Helper ein und verwendet ihn in denselben beiden Storage-Policies. Der Helper:

- prüft nur die eigene Identität über `user_id`, E-Mail oder Stellvertreter-E-Mail;
- verlangt eine aktive Mitgliedschaft und `can_upload = true`;
- ist nur für `authenticated` ausführbar;
- erweitert weder Storage-Lesen noch Storage-Löschen;
- verleiht keinen globalen oder projektübergreifenden Zugriff.

Die bereits auf der Testinstanz registrierte erste Migration wurde nicht nachträglich verändert oder per `migration repair` umgeschrieben.

## Anwendung

Beide Migrationen wurden ausschließlich mit expliziter `SUPABASE_TEST_DB_URL` auf `LUMINA-RLS-TEST` angewandt. Der Schutzwrapper meldete für jeden Lauf `linked: false`, `productionApplied: false` und `secretsPrinted: false`.

Die Migrationshistorie wurde danach lesend verifiziert: lokal und remote sind `202607260001`, `202607270001` und `202607270002` identisch registriert.

## Gezielte Sicherheitsnachweise

24 Nachweise wurden ausgeführt. Ergebnis: 24 PASS, 0 FAIL.

Bestanden:

- Anonymous sieht exakt null Dokumentzeilen.
- Anonymous kann ein frisch erzeugtes, nicht gecachtes Objekt weder herunterladen noch signieren noch hochladen.
- Nutzer A mit `can_upload = false` kann weder neu hochladen noch ein vorhandenes Objekt ersetzen; Objektbestand und Inhalt bleiben unverändert.
- Bearbeiter mit `can_upload = true` kann hochladen und ein vorhandenes Objekt ersetzen; Existenz und Inhaltsänderung sind bestätigt.
- Bearbeiter kann keines der fünf eigenen oder fremden Felder `can_read`, `can_upload`, `can_edit`, `can_approve`, `can_manage_members` verändern; jeder Versuch wurde per Service-Read-back bestätigt.
- Projektadministrator A kann ein Mitglied in Projekt A einfügen.
- Direkte UPDATE- und DELETE-Versuche des Projektadministrators auf fremde Mitgliedschaften in Projekt A verändern null Zeilen und gelten als erwartete Ablehnung.
- Projektadministrator A kann in Projekt B weder einfügen noch ändern noch löschen.

Explizit bestätigte Browser-Ablehnungen:

| Nachweis | HTTP | betroffen | Datenzustand |
|---|---:|---:|---|
| Projektadministrator A ändert fremde Mitgliedschaft in Projekt A | 204 | 0 | Zeile unverändert |
| Projektadministrator A löscht fremde Mitgliedschaft in Projekt A | 204 | 0 | Zeile vorhanden |

## Vollständige RLS-Matrix

Der abschließende Lauf nach Storage-Korrektur ergab:

- geplant: 420
- ausgeführt: 420
- bestanden: 420
- Abweichungen: 0
- Exit-Code: 0

Die Fälle `RLS-079` und `RLS-080` prüfen jetzt die verbindlich erwartete Ablehnung mit null betroffenen Zeilen. Alle Anonymous-, Storage- und Mitgliedschaftsfälle entsprechen dem Zielmodell.

## Fachlich entschiedene Browsergrenze

Die unveränderte SELECT-Policy erlaubt nur dem Projekteigentümer, der eigenen Identität beziehungsweise E-Mail oder der eigenen Stellvertretung das Lesen einer Mitgliedschaft. Ein Projektadministrator mit `can_manage_members = true`, der nicht Projekteigentümer ist, sieht fremde Mitgliedschaften daher nicht und verändert oder löscht bei direkten Browsermutationen null Zeilen. Dieses Verhalten ist fachlich bestätigt und wird nicht durch eine zusätzliche SELECT-Policy erweitert.

Offener Punkt „Projektmitglieder verwalten“:

- Direkte Tabellenmutationen auf fremde `project_members`-Zeilen bleiben für Browserclients gesperrt.
- Eine sichere, projektgebundene RPC oder Edge Function ist als separates Arbeitspaket erforderlich.
- In dieser Phase wurde keine solche Funktion implementiert und keine bestehende UI-Datei verändert.

## Globale Administration

Eine echte globale Administratorrolle ist im vorhandenen Schema nicht nachgewiesen. Insbesondere existiert keine belastbare globale Rollenquelle, kein verifiziertes Custom-Claim-Modell und keine autorisierte globale Verwaltungs-RPC.

Der synthetische Projektadministrator A darf nicht als globaler Administrator interpretiert werden. Für eine spätere globale Administration wird eine explizit autorisierte RPC oder Edge Function mit serverseitiger Rollenprüfung, Audit-Protokollierung und projektgenauer Eingabevalidierung empfohlen. Eine breite projektübergreifende RLS-Policy wurde nicht erstellt.

## Artefaktfreiheit

Der abschließende Check prüfte alle 13 Tabellen auf Zeilen außerhalb der deterministischen Fixture-IDs, bekannte Matrix-/Probe-Präfixe und beide Storage-Fixture-Ordner. Ergebnis: null temporäre Testartefakte, Exit-Code 0.

## Befehle und Exit-Codes

| Befehl | Ergebnis | Exit-Code |
|---|---|---:|
| `npm.cmd run test:env` | getrennte Testinstanz und Write-Guard gültig | 0 |
| `npm.cmd run test:migrations` | Neuaufbau mit 13 Tabellen, 48 Policies, 10 Funktionen und einem Bucket | 0 |
| `npm.cmd run test:migrations:list` | lokale und Test-Migrationshistorie identisch | 0 |
| `npm.cmd run test:migrations:push` | `202607270001` ausschließlich auf Test angewandt | 0 |
| `npm.cmd run test:migrations:push` | `202607270002` ausschließlich auf Test angewandt | 0 |
| `npm.cmd run test:fixtures` | sechs Nutzer, sechs Mitgliedschaften, zwei Projekte; idempotenter Neuaufbau | 0 |
| erster vollständiger `npm.cmd run test:rls` | 420 ausgeführt, 413 bestanden | 1 |
| `npm.cmd run test:rls:proofs` vor Helper | 24 ausgeführt, 19 bestanden | 1 |
| `npm.cmd run test:rls:proofs` nach finaler Zielmodellentscheidung | 24 ausgeführt, 24 bestanden | 0 |
| abschließender vollständiger `npm.cmd run test:rls` | 420 ausgeführt, 420 bestanden | 0 |
| `npm.cmd run test:artifacts` | 0 temporäre Testartefakte | 0 |

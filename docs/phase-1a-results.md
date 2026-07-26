# Ergebnisbericht Phase 1A

Stand: 2026-07-26

## Einordnung

Phase 1A ist lokal vorbereitet und die Migration-from-zero ist bestanden. Eine
ausdrücklich getrennte Supabase-Testinstanz wurde inzwischen eingerichtet; die
RLS-Matrix wurde dort vollständig ausgeführt, endete aber mit 22 Abweichungen.
Auf Produktion wurde nichts angewandt. Daher wird weder „sicher“ noch
„produktionsreif“ behauptet.

## Phase-0-Übergabe

- Commit: `a033d2b4c379297e0117b8b69c79f017a6d17bcb`
- Branch: `codex/phase-0-inventory`
- Push: erfolgreich ausschließlich auf den gleichnamigen Remote-Branch
- Vercel: beide verbundenen Projekte erzeugten für diesen Commit eine
  erfolgreiche Preview
- Kein Merge und kein Push nach `main`
- Keine geheimen Preview-URLs oder Tokenwerte protokolliert

## Geänderte oder neu angelegte Dateien

Konfiguration und reproduzierbare Laufzeit:

- `.env.test.example`
- `.gitignore`
- `.nvmrc`
- `package.json`
- `package-lock.json`
- `supabase/config.toml`

Schema und Migrationspfad:

- `supabase/migrations/202607260001_remote_schema_baseline.sql`
- `supabase/disabled_migrations/202607200001_task_workspace.sql` (unverändert
  aus dem aktiven Migrationspfad verschoben)
- `supabase/disabled_migrations/README.md`

Tests und nicht eingreifende Hilfsprogramme:

- `tests/security/fixture-plan.json`
- `tests/security/rls-model.mjs`
- `tests/security/test-env.mjs`
- `tools/check-test-environment.mjs`
- `tools/check-syntax.mjs`
- `tools/prepare-test-fixtures.mjs`
- `tools/test-http-smoke.mjs`
- `tools/test-migrations-from-zero.mjs`
- `tools/test-rls-matrix.mjs`

Dokumentation:

- `docs/migration-history-plan.md`
- `docs/phase-1a-security-baseline.md`
- `docs/phase-1a-results.md`
- `docs/rls-policy-assessment.md`
- `docs/test-environment-setup.md`

## Migrationen und Zweck

Die aktive Migration `202607260001_remote_schema_baseline.sql` bildet den
per Systemkatalogen gelesenen Remote-Iststand ohne fachliche Daten ab. Statisch
erfasst wurden 13 Tabellen, 64 Constraints, 22 zusätzliche Indizes, 9
Funktionen, 6 Trigger, 54 Policies und ein Storage-Bucket. Ein Guard verhindert
die Anwendung auf einem Schema, in dem `public.companies` bereits existiert.

Die ältere Datei `202607200001_task_workspace.sql` bleibt inhaltlich erhalten,
ist wegen ihres abweichenden Zielmodells aber unter `disabled_migrations`
quarantänisiert. Es erfolgte weder `db push` noch `migration repair`.

## Ausgeführte Befehle und Ergebnisse

| Befehl | Prozess-Exit-Code | Ergebnis |
| --- | ---: | --- |
| `npm.cmd install --package-lock-only --ignore-scripts` | 0 | Lockdatei erzeugt; Audit ohne Befund |
| `npm.cmd install --ignore-scripts` | 0 | 9 Pakete installiert; Audit ohne Befund |
| `npm.cmd run test:syntax` | 0 | 11 von 11 JavaScript-Dateien syntaktisch gültig |
| `npm.cmd test` | 0 | Syntax 11/11, HTTP 9/9, RLS-Plan erzeugt |
| `npm.cmd run test:migrations` (erster Phase-1A-Lauf) | 1 | `NOT_VERIFIED`; Docker war im Codex-PATH nicht erreichbar |
| `npm.cmd run test:migrations` (abschließender Lauf) | 0 | `PASS`; leere lokale Datenbank vollständig migriert und numerisch geprüft |
| `npm.cmd run test:env` | 0 | `READY`; getrennte Testinstanz und Schreibguard bestätigt, keine Secrets ausgegeben |
| `npm.cmd run test:fixtures` (Sandbox) | 1 | `fetch failed`; Netzwerk-Sandbox, kein neuer Remote-Teilbestand |
| `npm.cmd run test:fixtures` (Testinstanz) | 0 | 6 Nutzer, 6 Mitgliedschaften und 2 Projekte vorbereitet |
| `npm.cmd run test:fixtures` (Idempotenzlauf) | 0 | Erneut vollständig bestanden; `$LASTEXITCODE=0` |
| `npm.cmd run test:rls` | 1 | 420 Fälle ausgeführt, 398 bestanden, 22 Abweichungen |
| `npm.cmd run test:financial:legacy` | 1 | Bekannter Fehler: `projectData.trialBalance` nicht initialisiert |
| `npx.cmd --yes vercel@latest build --yes --no-color` | kein Exit-Code | Ohne Ausgabe hängen geblieben und gezielt beendet; nicht verifiziert |
| `git diff --check` | 0 | Keine Fehler im bereits erfassten Rename-Diff |
| Baseline-Prüfung auf führende Patch-Artefakte | 0 | Keine Artefakte gefunden |

Die Tests liefen lokal mit Node.js 22.17.1 und npm 10.9.2. Die reproduzierbare
Zielversion ist in `.nvmrc` und `package.json` auf Node.js 24.18.0 festgelegt,
war auf diesem Rechner aber nicht installiert. Ein erneuter Lauf unter der
Zielversion ist deshalb noch erforderlich.

Der offizielle Schema-Dump mit `supabase db dump --linked --schema public`
endete zuvor mit Exit-Code 1, weil Docker Desktop nicht verfügbar war. Die
Baseline wurde deshalb ersatzweise ausschließlich über lesende Abfragen der
PostgreSQL-Systemkataloge erzeugt. Diese Abfragen veränderten keine Remote-Daten.

## Migration-from-zero

Status: **PASS**, Prozess-Exit-Code 0.

### Ursprünglicher Fehler

Der erste reale lokale Neuaufbau scheiterte bei Statement 21 mit SQLSTATE
`42830`: `documents_folder_id_fkey` referenzierte
`task_room_folders(id)`, bevor `task_room_folders_pkey` in der alphabetisch
sortierten Constraint-Liste angelegt worden war.

Lesende Remote-Katalogabfragen mit Exit-Code 0 belegten:

- Primärschlüssel `task_room_folders_pkey` auf `id`, gültig und eindeutig,
- Unique-Constraint
  `task_room_folders_task_room_id_folder_number_key` auf
  `(task_room_id, folder_number)`,
- 612 Zeilen, 612 nicht-null IDs und 612 verschiedene IDs,
- alle 33 öffentlichen Foreign Keys besitzen im Remote-Schema einen passenden
  Primär- oder Unique-Schlüssel auf der Zielspalte.

### Konkrete Korrektur

In der Baseline wurden keine Constraint-Definitionen geändert. Alle 31
PK-/Unique-/Check-Constraints werden nun vor den 33 Foreign Keys angelegt.
Dadurch sind auch alle weiteren Fremdschlüssel gegen dieselbe
Reihenfolgeproblematik abgesichert.

Der folgende lokale Neuaufbau deckte zusätzlich eine gleichartige
Funktionsabhängigkeit auf: `private.can_access_task()` wurde vor
`private.is_project_member()` erzeugt. Die neun unveränderten Funktionskörper
wurden deshalb ausschließlich nach Abhängigkeit geordnet:
`current_user_email` und die Basisprüfungen vor `can_manage_project`,
`can_access_task` und `can_edit_task`.

Der Windows-Test-Runner wurde technisch stabilisiert: `npx.cmd` läuft dort über
die Shell, die für Migrationen nicht benötigten und unter Windows instabilen
lokalen Dienste Analytics und Vector werden ausgeschlossen, und die
Abschlussprüfung läuft direkt per `psql` im lokalen Datenbankcontainer. Ein PASS
setzt jetzt zwingend die exakten Istzahlen voraus.

### Abschließender lokaler Lauf

| Teilschritt | Exit-Code |
| --- | ---: |
| `supabase start --exclude analytics,vector` | 0 |
| `supabase db reset --local --no-seed` | 0 |
| lokale `psql`-Zählprüfung im Datenbankcontainer | 0 |
| gesamtes `npm.cmd run test:migrations` | 0 |

Erwartet und tatsächlich vorhanden waren jeweils 13 Tabellen, 54 Policies und
ein Bucket. Die lokale Supabase-Testumgebung wurde im `finally`-Block ohne
Backup gestoppt. Gegen die produktive Datenbank wurde nichts angewandt.

### Diagnose- und Zwischenläufe

| Befehl oder Prüfgruppe | Exit-Code | Befund |
| --- | ---: | --- |
| vier getrennte `supabase db query --linked`-Katalogabfragen | jeweils 0 | Constraints, Indizes, aggregierte ID-Zahlen und alle FK-Ziele ausschließlich lesend bestätigt |
| `npm.cmd run test:migrations` ohne ergänzten Docker-Pfad | 1 | `NOT_VERIFIED`, Docker-CLI im Codex-PATH nicht gefunden |
| direkter lokaler `supabase start` nach FK-Reihenfolgekorrektur | 1 | FK-Fehler behoben; nächster Reihenfolgefehler bei `private.can_access_task()` sichtbar |
| lokaler Lauf nach Funktionsreihenfolgekorrektur | 1 | Start, Reset und SQL-Abfrage jeweils Exit 0; nur JSON-Reporter schlug fehl |
| lokaler Start mit allen optionalen Diensten | 1 | Windows-Analytics-Container blieb ungesund; kein SQL-Fehler |
| erster Reporter-Lauf mit CSV | 0 | manuell nicht als Nachweis akzeptiert, weil die Istwerte als `null` erschienen |
| verschärfte Reporter-Läufe | 1 | fehlende/ungeeignete CLI-Ausgabe korrekt als Fehler behandelt |
| finaler Lauf mit direkter lokaler `psql`-Prüfung | 0 | belastbarer PASS mit 13 / 54 / 1 |

## Numerische RLS-Matrix

Live-Status in der getrennten Testinstanz: `FAIL`.

| Kennzahl | Wert |
| --- | ---: |
| Ressourcen | 14 |
| Rollen/Identitäten | 7 |
| Operationen je Grundmatrix | 4 |
| Grundfälle | 392 |
| Prüfungen mit direkt bekannter UUID | 98 |
| zusätzliche projektübergreifende Fälle | 28 |
| geplante ausführbare Fälle | 420 |
| erwartete Erlaubnisse | 181 |
| erwartete Ablehnungen | 239 |
| tatsächlich ausgeführte Fälle | 420 |
| bestandene / fehlgeschlagene Fälle | 398 / 22 |
| erwartete / tatsächlich sichtbare Zeilen | 72 / 74 |
| erwartete / tatsächlich abgelehnte Mutationen | 185 / 181 |

Die 98 UUID-Prüfungen sind Teil der Grund- und projektübergreifenden
Fallmodellierung und werden deshalb nicht zusätzlich zu den 420 ausführbaren
Fällen addiert.

Die 22 Abweichungen verteilen sich auf `companies` (6), `projects` (9),
`project_members` (4), `task_review_notes` (2) und Storage (1). Es wurde keine
Policy automatisch verändert. Der Befund muss zwischen tatsächlicher
Policy-Lücke, falscher Erwartung und möglicher Testadapter-Semantik getrennt
analysiert werden.

## Fixture-Korrektur und Teilbestandskontrolle

Das tatsächliche Schema der getrennten Testinstanz wurde ohne `--linked`
gelesen. `project_members` besitzt 17 Spalten. Die fünf Berechtigungsfelder
`can_read`, `can_upload`, `can_edit`, `can_approve` und
`can_manage_members` sind jeweils `NOT NULL` und besitzen Datenbank-Defaults.

Der erste Bulk-Upsert enthielt heterogene Objekt-Keys: Sobald eine Rolle
`can_approve` mitsendete, behandelte PostgREST das bei anderen Zeilen fehlende
Feld als `NULL`, statt den Default anzuwenden. Deshalb schlug der Lauf mit der
Not-null-Verletzung für `can_approve` fehl.

Korrigiert wurden:

- explizite Werte für alle fünf Berechtigungsfelder bei jeder Identität,
- explizite fachliche Defaultwerte für alle weiteren Fixture-Nutzfelder mit
  Not-null-Anforderung,
- `defaultToNull: false` für alle Upserts,
- eine statische Pflichtfeldprüfung vor jedem Tabellen-Upsert,
- kontrollierte Bereinigung bekannter Fixture-IDs und Storage-Pfade vor jedem
  Lauf,
- erneute Bereinigung von Tabellen, Storage, Statusdatei und synthetischen
  Auth-Nutzern bei einem Fixture-Fehler.

Zwei aufeinanderfolgende Fixture-Läufe endeten mit Exit-Code 0. Die anschließend
gespeicherte Rollenmatrix wurde read-only verifiziert. Nach der RLS-Matrix
ergab die aggregierte Nachkontrolle exakt 0 temporäre `Matrix`-Artefakte.

## Synthetische Rollenrechte

| Identität | Projekt | Lesen | Upload | Bearbeiten | Freigeben | Mitglieder verwalten |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Nutzer A | A | ja | nein | nein | nein | nein |
| Nutzer B | B | ja | nein | nein | nein | nein |
| Bearbeiter | A | ja | ja | ja | nein | nein |
| Freigeber | A | ja | nein | nein | ja | nein |
| Prüfer | A | ja | nein | nein | nein | nein |
| Admin | A | ja | ja | ja | ja | ja |
| Anonymous | keines | nein | nein | nein | nein | nein |

Alle fünf Berechtigungsfelder werden für jede Identität explizit im
Fixture-Plan geführt. Der Bulk-Upsert verwendet zusätzlich
`defaultToNull: false`.

## Secret- und Konfigurationsbefund

Die neu angelegten Phase-1A-Dateien enthalten nur Variablennamen und keine
Test- oder Service-Role-Werte. Ein statischer Suchlauf fand in fünf bestehenden,
unveränderten HTML-Dateien bereits eingebettete Supabase-Anon-Clientwerte. Die
Werte werden hier nicht wiedergegeben. In Phase 1A wurden diese fachlichen
Frontend-Dateien wegen der festgelegten Grenzen nicht geändert.

## Vorbereitet, lokal geprüft, remote angewandt

- **Vorbereitet:** Schema-Baseline, deaktivierter Legacy-Migrationspfad,
  Testidentitäten, synthetische Fixtures, RLS-Matrix, Testumgebungs-Guard und
  Dokumentation.
- **Lokal geprüft:** Syntax, statische HTTP-Routen, numerischer RLS-Plan,
  Lockdatei/Audit, Migration-from-zero auf leerer lokaler Datenbank, statische
  Migrationsinventur und Git-Diff-Integrität.
- **Nicht grün:** lokaler Vercel-Build und Live-RLS mit 22 Abweichungen.
- **Getrennte Testinstanz:** ausschließlich synthetische Nutzer, Basis-Fixtures
  und temporäre Matrixfälle wurden geschrieben.
- **Produktion:** keine Migration, keine Fixtures, keine Testnutzer, kein
  Deployment und keine Änderung der Migrationshistorie.

## Offene Punkte

1. Die 22 RLS-Abweichungen einzeln als Policy-Lücke, Erwartungsfehler oder
   Testadapter-Effekt klassifizieren.
2. Erst nach dieser Klassifikation eine minimale Ersatzmigration für ungewollte
   anonyme „Testzugriff“-Policies vorbereiten.
3. Den Legacy-Finanztest anhand eines eindeutig bestätigten Einstiegspunkts
   reparieren; nicht spekulativ an die Landingpage koppeln.
4. Den lokalen Vercel-Build erneut mit funktionierender CLI-Verbindung prüfen.
5. Vor jeder Freigabe Remote-Schema und Migrationsliste erneut lesend auf Drift
   vergleichen.

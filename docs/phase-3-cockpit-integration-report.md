# Phase 3 – Rollenspezifische Cockpitintegration

## 1. Ausgangspunkt und Umfang

- Ausgangsbranch: `codex/phase-2-role-security`
- Ausgangs-HEAD: `45d480a0e80dd6407fb7914eea8dc12d2dfdd0d6`
- Vorbestand im Arbeitsbaum: ausschließlich `.gitignore` verändert; diese Datei wurde in Phase 3 nicht bearbeitet.
- Keine Migration, Policy, RLS-Regel, Auth-Identität, Remote-Datenbank oder Produktionsumgebung wurde verändert.
- Kein Commit, Push, Merge oder Deployment wurde ausgeführt.

Phase 3 integriert vier Einstiegsprofile in das bestehende `cockpit.html`. Die Referenz wurde nicht als Parallel-App übernommen.

## 2. Geänderte und neue Dateien

- `cockpit.html`: sichere Ladefolge, vier Cockpitprofile, neutraler Mitgliedschafts-Gate, Projektkontext im Header, Drilldowns, Stellvertretung und berechtigungsabhängige Navigation.
- `assets/cockpit-security.mjs`: Projekt-/Mitgliedschaftskontexte, sichere Projektauswahl, Navigation und zeitliche Stellvertretungsprüfung.
- `assets/cockpit-filters.mjs`: erlaubte Filterwerte und deterministische Aufgabenfilter.
- `assets/cockpit-model.mjs`: echte, aus sichtbaren Daten berechnete Cockpitkennzahlen.
- `tools/test-auth-guard.mjs`: Auth- und Neutralzustand einschließlich Abfrageverbot erweitert.
- `tools/test-role-cockpits.mjs`: 32 verbindliche Phase-3-Kriterien plus drei Datenmodellnachweise.
- `tests/visual/phase3-cockpit-preview.html`: rein lokale, deutlich gekennzeichnete visuelle Prüffixture; keine produktive Rollenumschaltung.
- `docs/screenshots/phase-3/*.png`: zehn lokale Browserprüfbilder.

## 3. Resolver- und Sicherheitsintegration

Die Anwendung importiert `assets/role-resolver.mjs` als ES-Modul. Eine zweite Rollenliste oder unscharfe Rollenheuristik im HTML wurde entfernt.

Die Ladefolge lautet:

1. gültige Supabase-Session,
2. ausschließlich `project_members` mit `user_id = auth.user.id`,
3. Auflösung je Projekt durch `classifyMemberContext`,
4. ausschließlich eindeutig aufgelöste `accepted`-Kontexte,
5. Abfrage der erlaubten Projekt-UUIDs; RLS bestätigt die Sichtbarkeit,
6. erst danach Aufgaben, Dokumente, Kommunikation und gegebenenfalls Teamdaten.

Kein auflösbarer Kontext führt zum neutralen `membershipGate`. In diesem Zustand werden keine Projekte, Tasks, Dokumente, Teammitglieder, Kommentare, Kennzahlen oder Adminbereiche abgefragt beziehungsweise gerendert. URL- und Local-Storage-Projektwerte müssen UUIDs sein und zugleich in der Menge der aufgelösten Mitgliedschaften und RLS-sichtbaren Projekte liegen.

## 4. Rollenmatrix

| Fachliche Rolle | Cockpitprofil |
|---|---|
| CFO / Geschäftsführung | `cfo` |
| Projektleitung Abschluss | `project` |
| Leiter Rechnungswesen | `accounting_lead` |
| Bilanzbuchhaltung | `worker` |
| Controlling | `worker` |
| Externe Beratung | `worker` |
| IT | `worker` |
| Investor Relations | `worker` |
| Konsolidierung | `worker` |
| Nachhaltigkeit | `worker` |
| Personal / HR | `worker` |
| Recht | `worker` |
| Steuern | `worker` |
| Treasury | `worker` |
| Wirtschaftsprüfung | `worker` |

Die fachliche Rolle bleibt im Header und bei Worker-Profilen in `Mein Tag – <project_role>` sichtbar.

## 5. Darstellung je Profil

- `cfo`: Ist-/Planfortschritt, Planabweichung, Tage bis Abschluss, Risiken, Engpässe, Entscheidungen und kompakte KIRA-Einschätzung. Operativer Gesamtfeed und Administration sind kein Hauptinhalt.
- `project`: Gesamtkoordination, offene/überfällige/kritische/nicht zugeordnete Aufgaben, Reviews, sichtbare Einladungen und Stellvertretungen. Adminzugang nur bei `can_manage_members`.
- `accounting_lead`: Teamfortschritt, kritische Teamaufgaben, Reviews, Nachbesserung, fehlende Zuordnung und Auslastung; keine automatisch globale Administration.
- `worker`: eigene Aufgaben über `responsible_member_id`, konkrete Tagespriorität, Rückfragen/Nacharbeit, Einreichungen, Fortschritt und separat gekennzeichnete Stellvertretungsaufgaben.

Für Wirtschaftsprüfung wird das Worker-Profil konservativ verwendet. Das operative Managementdashboard ist verborgen; die Ansicht weist ausdrücklich darauf hin, dass interne Budget- und Managementinformationen nicht angezeigt werden. Eine endgültige Klassifikation einzelner Kommentare und Dokumentzustände bleibt Phase 4 vorbehalten; es wurde keine breite RLS-Erweiterung improvisiert.

## 6. KPI-Datenquellen

| Kennzahl | Quelle und Filter | Berechnung | Berechtigung / fehlende Daten |
|---|---|---|---|
| Ist-Fortschritt | `tasks`, RLS-sichtbares Projekt | `completed`/`approved` geteilt durch sichtbare Tasks | vorhandene Task-Sicht; leer = 0 % |
| Planfortschritt | `tasks.due_date` | Anteil der terminierten Tasks mit Fälligkeit bis heute | keine Termine = „Plan nicht konfiguriert“ |
| Planabweichung | Ist- minus Planfortschritt | Prozentpunktdifferenz | ohne Plan nicht konfiguriert |
| Tage bis Abschluss | `projects.closing_date` | Kalendertage bis Stichtag | ohne Datum nicht konfiguriert |
| Überfällig | `tasks` | offen und `due_date < heute` | RLS-sichtbare Tasks |
| Heute fällig | `tasks` | offen und `due_date = heute` | RLS-sichtbare Tasks |
| Kritisch | `tasks` | überfällig, `blocked` oder `declined` | RLS-sichtbare Tasks |
| Blockierend | `tasks.status = blocked` | Anzahl | RLS-sichtbare Tasks |
| Rückfragen | `tasks.status = question`, ergänzend RLS-sichtbare `task_comments` | Anzahl/Drilldown | nur sichtbare Aufgaben |
| Nachbesserung | `tasks.status in (declined, question)` | Anzahl/Drilldown | nur sichtbare Aufgaben |
| Reviews | `tasks.status in (submitted, in_review)` | Anzahl | nur sichtbare Aufgaben |
| Entscheidungen | `tasks.status in (submitted, in_review, question)` | Anzahl | nur sichtbare Aufgaben |
| Ohne Zuständigkeit | `tasks` ohne Member-ID und E-Mail | Anzahl | Projekt-/Teamsicht erforderlich |
| Einladungen | RLS-sichtbare `project_members.invitation_status` | nicht `accepted` | Teamabfrage nur bei `can_view_all_tasks` oder `can_manage_members` |
| Stellvertretungen | `project_member_substitutions` | nur eigenes Projekt, eigener Substitute, `active`, gültiger Datumsbereich | RLS bleibt abschließend |
| Budget Plan/Ist | keine belastbare Schemaquelle vorhanden | keine Berechnung | „Budget nicht konfiguriert“, keine Ersatzwerte |

## 7. Navigation und Drilldowns

- Cockpit, Aufgaben, erlaubte Datenräume, erlaubte Kommunikation und Logout bleiben im bestehenden Header.
- Abschlussplaner: nur `cfo`, `project` oder `accounting_lead` plus `can_edit`.
- Admin/Mitgliederverwaltung: ausschließlich `can_manage_members`; das Profil selbst erzeugt kein Recht.
- Das aktive Projekt und die fachliche Rolle werden im Header angezeigt.
- KPI-Drilldowns verwenden nur die Allowlist aus `COCKPIT_FILTERS`. Unbekannte URL-Filter werden auf `all` normalisiert.
- Unterstützt sind unter anderem `overdue`, `today`, `critical`, `blocked`, `questions`, `rework`, `review`, `decisions`, `unassigned` und `substitutions`.
- Der aktive Filter ist sichtbar und über „Filter aufheben“ rücksetzbar.

## 8. Stellvertretung

Eine Stellvertretung wird nur angezeigt, wenn Projekt-ID und `substitute_member_id` zum aktiven Kontext passen, der Status `active` ist und Start-/Enddatum heute einschließen. Die Aufgabe bleibt dem `principal_member_id` zugeordnet und wird als „Vertretung für <Hauptperson>“ gekennzeichnet. Eigene und stellvertretungsweise sichtbare Aufgaben werden nicht vermischt.

## 9. Responsive und visuelle Prüfung

Die lokale Prüffixture übernimmt LUMINA-Farbwelt, Header-, Karten- und Breakpointlogik, ist als synthetische Prüfansicht markiert und enthält keine Produktdaten. Geprüft wurden 1440 px Desktop, 805/820 px Tablet und 375/390 px Mobil. Bei allen zehn Läufen galt `scrollWidth === clientWidth`.

Screenshots:

- `docs/screenshots/phase-3/cfo-desktop.png`
- `docs/screenshots/phase-3/cfo-mobile.png`
- `docs/screenshots/phase-3/project-desktop.png`
- `docs/screenshots/phase-3/accounting-lead-desktop.png`
- `docs/screenshots/phase-3/worker-bilanzbuchhaltung.png`
- `docs/screenshots/phase-3/worker-hr.png`
- `docs/screenshots/phase-3/worker-it.png`
- `docs/screenshots/phase-3/worker-auditor.png`
- `docs/screenshots/phase-3/active-substitution.png`
- `docs/screenshots/phase-3/neutral-security.png`

Der echte lokale `cockpit.html`-Auth-Guard wurde zusätzlich im Browser geprüft: `protectedApp.hidden = true`, Login sichtbar, keine horizontale Hauptseiten-Überbreite und keine Browser-Warnungen/Fehler.

## 10. Automatisierte Ergebnisse

`npm test` endete mit Exit-Code 0:

- Syntax: 24/24 Dateien bestanden.
- Rollenresolver: 10/10 bestanden.
- Phase-2-Schema: 8/8 bestanden.
- HTTP-Smoke: 12/12 Routen bestanden.
- Auth-Guard: 15/15 bestanden, einschließlich datenfreiem Neutralzustand.
- Phase-3-Cockpitkriterien: 36/36 bestanden; alle 32 verbindlichen Kriterien enthalten.
- RLS-Matrixplan: 420 Fälle geplant, keine Remote-Ausführung.
- Secret-Scan: PASS, 87 Dateien, 0 Funde, keine Secretwerte ausgegeben.

## 11. Bekannte Einschränkungen und Risiken

- Das aktuelle Schema besitzt keine belastbare Quelle für Budget Plan/Ist; deshalb werden keine Zahlen angezeigt.
- Planfortschritt nutzt ausschließlich vorhandene Task-Fälligkeiten. Ein späterer expliziter Baseline-Plan wäre fachlich genauer.
- Projektleitungen sehen nur die durch bestehende RLS tatsächlich sichtbaren Team-/Einladungs-/Vertretungsdaten.
- Für Wirtschaftsprüfung fehlt weiterhin eine endgültige fachliche Klassifikation interner Kommentare, Eskalationsnotizen und Dokumentfreigabestufen. Die UI blendet Managementbereiche konservativ aus; RLS bleibt maßgeblich.
- Die visuelle Prüffixture enthält bewusst synthetische Werte und wird nicht von der produktiven Oberfläche verlinkt.

## 12. Empfehlung für Phase 4

Phase 4 sollte ein explizites Plan-/Budgetmodell und eine fachlich freigegebene Prüfer-Datenklassifikation entwerfen. Erst danach sollten Budgetdrilldowns oder feinere Prüferansichten ergänzt werden. Mitgliederverwaltung und projektübergreifende Administration bleiben weiterhin serverseitigen, autorisierten RPC-/Edge-Function-Arbeitspaketen vorbehalten.

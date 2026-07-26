# Phase 1A: Schema- und Sicherheitsbaseline

Stand: 2026-07-26

## Ziel und Grenzen

Phase 1A schafft eine reproduzierbare Schema-Baseline und ein automatisierbares
Sicherheitstestgerüst. Sie verändert weder die fachliche LUMINA-Anwendung noch
Landingpage, Header, Management-Cockpit oder Rollenansichten.

Nicht durchgeführt wurden:

- `supabase db push` gegen das verknüpfte Remote-Projekt,
- `migration repair`,
- Anlage von Testnutzern oder Testdaten in einem bestehenden Projekt,
- Änderung oder Löschung einer Vercel-Projektverknüpfung,
- Push oder Merge nach `main`,
- Produktionsdeployment.

## Schema-Baseline

Aktive Migration:

`supabase/migrations/202607260001_remote_schema_baseline.sql`

Sie wurde aus PostgreSQL-Systemkatalogen des tatsächlich verwendeten
Remote-Projekts erzeugt und enthält keine fachlichen Daten. Erfasst sind:

- 13 Tabellen und 171 Spalten,
- 64 Primär-/Fremdschlüssel, Unique- und Check-Constraints,
- 22 zusätzliche Indizes,
- 3 öffentliche und 6 private Hilfsfunktionen,
- 6 Trigger,
- RLS-Aktivierung für alle 13 Tabellen,
- 54 Policies auf `public` und `storage`,
- Tabellen- und Funktions-Grants,
- der private Bucket `lumina-datarooms` ohne Dateidaten.

Die Migration besitzt am Anfang einen Guard: Wenn `public.companies` bereits
existiert, bricht sie vor jeder Schemaänderung ab. Sie ist ausschließlich für
Migration-from-zero gedacht und kann daher nicht versehentlich über das
bestehende Remote-Schema gelegt werden.

## Maßgebliches Zielmodell

Bis zu einem separat freigegebenen Fachmigrationsvorschlag gilt das bestehende
Remote-Modell:

- `tasks.responsible_member_id`,
- `tasks.responsible_name` und `tasks.responsible_email`,
- bestehende Tabellen- und Feldnamen,
- Bucket `lumina-datarooms`,
- Pfad `<project_id>/<task_id>/<folder_id>/<uuid>/<dateiname>`.

Nicht parallel eingeführt werden insbesondere `tasks.assigned_to`,
`tasks.created_by`, `public.profiles` oder `task-evidence`. Bestehende Felder mit
ähnlichen Namen in anderen Remote-Tabellen, zum Beispiel
`task_review_notes.assigned_to`, sind Bestandteil der unveränderten
Ist-Baseline und nicht das alternative Taskmodell.

## Deaktivierte Migration

`202607200001_task_workspace.sql` liegt unverändert unter
`supabase/disabled_migrations/`. Sie ist aus dem aktiven Pfad entfernt, aber
nicht gelöscht. Gründe und Reaktivierungsbedingungen stehen in der dortigen
`README.md`.

## Automatisierte Testbasis

- Festgelegte Runtime: Node.js 24.18.0 LTS
- Supabase JS: exakt 2.110.8
- Lockdatei: `package-lock.json`
- Syntaxprüfung: `npm run test:syntax`
- HTTP-Smoke: `npm run test:http`
- numerischer RLS-Plan: `npm run test:rls:plan`
- Testinstanz-Guard: `npm run test:env`
- Live-RLS-Matrix: `npm run test:rls`
- Test-Fixtures: `npm run test:fixtures`
- Migration-from-zero: `npm run test:migrations`
- Legacy-Finanztest: `npm run test:financial:legacy`

`npm test` führt nur nicht schreibende lokale Prüfungen und den numerischen
RLS-Plan aus. Live-RLS- und Fixture-Befehle sind getrennt und geschützt.

Der Migration-from-zero-Test wurde am 2026-07-26 nach Korrektur der reinen
Constraint- und Funktions-Anlagereihenfolge auf einer leeren lokalen
Supabase-Datenbank mit Exit-Code 0 ausgeführt. Tatsächlich geprüft wurden 13
Tabellen, 54 Policies und der Bucket `lumina-datarooms`. Es erfolgte keine
Remote-Anwendung.

## Testidentitäten und Projekte

Vorbereitet sind ausschließlich synthetische Identitäten:

- Nutzer A und Nutzer B,
- Bearbeiter,
- Freigeber,
- Prüfer,
- Admin,
- Anonymous ohne Benutzerkonto,
- Projekt A und Projekt B.

Eine ausdrücklich getrennte Supabase-Testinstanz ist inzwischen konfiguriert.
Dort wurden sechs synthetische Nutzer, sechs Projektmitgliedschaften, zwei
Projekte und die zugehörigen synthetischen Fixtures idempotent erzeugt. Der
zweite Fixture-Lauf endete ebenfalls mit Exit-Code 0. In Produktion wurden keine
Benutzer oder Fixtures angelegt.

Die anschließende RLS-Matrix führte alle 420 Fälle aus: 398 bestanden, 22
weichen vom erwarteten Modell ab. Der Stand ist deshalb nicht grün und nicht als
produktionsreif bewertet.

## Vercel-Doppelverknüpfung

Empfehlung für eine spätere Bereinigung: `kaikira-mobile-pilot-v2-3` als
alleiniges Produktionsprojekt beibehalten, weil dort die produktive Domain
`lumina.volkerkusch.de` zugeordnet ist. `kaikira-mobile-pilot` sollte erst nach
Übernahme relevanter Einstellungen und ausdrücklicher Freigabe von der
Git-Produktionsstrecke getrennt werden. In Phase 1A wurde keine Verknüpfung
geändert.

## Legacy-Finanztest

`tools/test-financial-pipeline.mjs` gehört zur früheren Financial-Pipeline mit
`projectData`, Index-39-Reporting, SuSa/Mapping und Import-Workspace. Die aktuelle
`index.html` ist die Landingpage und enthält Vercel-Scripts vor den vom Test fest
indizierten Scriptblöcken. Ein eindeutiger neuer Einstiegspunkt ist aus dem
aktuellen Repository nicht beweisbar. Der Test bleibt deshalb erhalten und wird
als Legacy-Test separat ausgeführt, aber in Phase 1A nicht spekulativ umgebaut.

# LUMINA Zielmodell für Stellvertretungen

Stand: Phase 2 – Schema/RLS implementiert und auf der getrennten Testinstanz validiert, 27. Juli 2026

## Anforderungen

Jeder Stellvertreter besitzt einen eigenen Supabase-Auth-Benutzer und eine eigene `project_members`-Zeile mit eigener `user_id`. Aktionen werden stets mit der tatsächlich angemeldeten Identität protokolliert. Eine Vertretung ist projektgebunden, zeitlich und fachlich begrenzbar und überträgt keine globalen Rechte.

## Variantenvergleich

| Kriterium | A: `membership_kind` + `principal_member_id` in `project_members` | B: separate `project_member_substitutions` |
|---|---|---|
| RLS | Einfach für genau eine feste Hauptperson; zusätzliche Sonderlogik direkt in Mitgliedschaften | Klare `exists`-Prüfung; Beziehung kann projekt- und zeitgebunden geprüft werden |
| Audit-Trail | Eigene `user_id` bleibt erhalten | Eigene `user_id` bleibt erhalten; Beziehung ist zusätzlich nachvollziehbar |
| Aufgabenfilterung | Direkter Principal-Verweis | Aktive Beziehung zwischen eigener Mitgliedschaft und Aufgabenverantwortlichem |
| Laufzeitvertretung | Status/Fenster müssten weitere Spalten in `project_members` werden | `valid_from`, `valid_until` und `status` gehören natürlich zur Beziehung |
| Mehrfachvertretung | Eine Mitgliedschaft kann nur eine Hauptperson referenzieren; Duplikate erzeugen Mehrdeutigkeit | Mehrere Hauptpersonen oder Stellvertreter sauber modellierbar |
| Rückwärtskompatibilität | Bestehende Zeilen werden mit Beziehungssemantik belastet | Bestehende Mitgliedschaften bleiben unverändert; `deputy_*` kann weiter angezeigt werden |
| Aufwand | Anfangs kleiner | Eine Tabelle, zwei projektgebundene Fremdschlüssel und Policies zusätzlich |
| Langfristige Eindeutigkeit | Begrenzt | Hoch |

## Empfehlung

Variante B wird verbindlich empfohlen. Sie ist trotz einer zusätzlichen Tabelle die kleinste sichere Lösung, weil Identität und Vertretungsbeziehung getrennte Sachverhalte bleiben. `membership_kind` wird für die versionierbare Testkontenkonfiguration verwendet, muss aber für den Pilot nicht redundant in `project_members` gespeichert werden: Ob eine Mitgliedschaft Stellvertreter ist, ergibt sich aus einer aktiven Beziehung.

## Vorgeschlagene Beziehung

`project_member_substitutions`:

- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null`
- `principal_member_id uuid not null`
- `substitute_member_id uuid not null`
- `valid_from timestamptz null`
- `valid_until timestamptz null`
- `status text not null default 'pending'`
- `created_at`, `updated_at`

Constraints:

- `status in ('pending','active','inactive','declined','expired')`
- `principal_member_id <> substitute_member_id`
- `valid_until is null or valid_from is null or valid_until > valid_from`
- beide Mitglieder müssen über projektgebundene Composite-FKs zum selben `project_id` gehören
- höchstens eine Zeile mit `status = 'active'` je Projekt/Principal/Substitute
- Indexe auf `(project_id, principal_member_id, status)` und `(project_id, substitute_member_id, status)`

## Aufgabenmodell

`tasks.deputy_member_id` wird für den Pilot nicht ergänzt.

Begründung:

1. Die Aufgabe bleibt dauerhaft über `responsible_member_id` der Hauptperson zugeordnet.
2. Ein Stellvertreter erhält Zugriff dynamisch, wenn eine aktive Vertretungsbeziehung zu dieser Hauptmitgliedschaft besteht.
3. Bei einem Stellvertreterwechsel wirkt die neue Beziehung sofort auf offene Aufgaben; alte Stellvertreter verlieren den Zugriff.
4. Bereits erledigte Aufgaben und protokollierte Aktionen werden nicht umgeschrieben. `task_activity_events.created_by`, Kommentare und Entscheidungen behalten die tatsächliche Auth-Identität.
5. Projektfremde Vertretungen werden durch Composite-FKs und RLS auf identische `project_id` verhindert.
6. Die bestehenden `tasks.deputy_name` und `tasks.deputy_email` bleiben vorübergehend für Import, Anzeige und Rückwärtskompatibilität erhalten, sind aber nicht mehr die Zugriffsquelle.

Falls später aufgabenspezifische oder eingefrorene Delegationen benötigt werden, ist eine eigene `task_delegations`-Historientabelle fachlich sauberer als ein einzelnes `deputy_member_id`.

## RLS-Grundsätze

- Nur `accepted`-Mitgliedschaften dürfen Vertretungen nutzen.
- Die Beziehung muss `status = 'active'` haben und innerhalb des Gültigkeitsfensters liegen.
- Direkte Browsermutationen der Vertretungstabelle sind gesperrt.
- Anlage, Widerruf und Laufzeitänderung erfolgen später über eine autorisierte RPC/Edge Function oder einen kontrollierten Serviceprozess.
- Principal und Substitute dürfen ihre eigene Beziehung lesen; Projektverwalter dürfen Beziehungen ihres Projekts lesen.
- Die Vertretung überträgt nur Aufgaben- und Kontextzugriffe, nicht automatisch `can_manage_members`, `can_approve` oder globale Projektsteuerung.

## Tatsächliche Phase-2-Umsetzung

- Composite-FKs binden Principal und Substitute an dasselbe `project_id`.
- `private.has_active_task_substitution(uuid)` verlangt zwei `accepted`, UUID-gebundene Mitgliedschaften, Status `active`, ein gültiges Zeitfenster und eine noch offene Aufgabe.
- Die Aufgabe behält `responsible_member_id` der Hauptperson; es wurde keine `tasks.deputy_member_id`-Spalte angelegt.
- Browserrollen besitzen nur SELECT auf zulässige Beziehungen. Anlage und Änderung bleiben Service-/späteren RPC-Prozessen vorbehalten.
- Der RLS-Probe `P2-RLS-024` weist nach, dass ein Stellvertreter als eigene `auth.uid()` protokolliert wird und die Principal-ID nicht vortäuschen kann.

# Phase 2 – Implementierungsbericht

Stand: 27. Juli 2026

Branch: `codex/phase-2-role-security`

Produktions-Project-Ref (gesperrt): `mslbzypjtvvznyewupco`

## Ergebnisstatus

Die additive Implementierung, die DOM-freie Rollenauflösung und die Sicherheitsprüfungen sind erstellt. `npm test` ist grün. Die lokale Migration-from-zero-Verifikation hat auch nach der finalen Folgemigration zwei vollständige Neuaufbauten mit Exit-Code 0 bestanden. Die Migrationen wurden ausschließlich auf die bestätigte Testinstanz `vcozprjecsprgyeqfahn` angewandt. Es gab kein `--linked`, kein Produktionsdeployment und keine Änderung an `mslbzypjtvvznyewupco`.

## Geänderte Bereiche

- `assets/role-resolver.mjs`: zentraler, fail-closed arbeitender Resolver ohne DOM-Abhängigkeit.
- `tests/role-resolver.test.mjs`: 15 Rollen, vier Profile, Schreibweisen, Lifecycle-, Konflikt- und Mehrdeutigkeitsfälle.
- `supabase/migrations/202607270003_add_cockpit_profiles_and_substitutions.sql`: Profile, `can_view_all_tasks`, Backfill und Vertretungstabelle.
- `supabase/migrations/202607270004_enforce_accepted_membership_identity.sql`: UUID-/Lifecycle-Helfer, Task-/Vertretungszugriff, RLS-Härtung und Composite-FKs.
- `supabase/migrations/202607270005_restrict_project_deletion_to_active_creator.sql`: trennt Mitgliederverwaltung von destruktiver Projektlöschung.
- `tests/phase2-migrations.test.mjs`: statische Sicherheits- und Migrationsinvarianten.
- `tests/security/fixture-plan.json`, `tools/prepare-test-fixtures.mjs`: synthetische Rollen mit explizitem Profil und allen NOT-NULL-Berechtigungen.
- `tests/security/rls-model.mjs`, `tools/test-rls-matrix.mjs`: 420 Matrixfälle plus 37 verpflichtende Privilege-/Phase-2-Probes und getrennte Ergebniszähler.
- `tools/test-migrations-from-zero.mjs`: zwei lokale Neuaufbauten mit semantischer Schema-Verifikation.
- `tools/prepare-test-fixtures.mjs`: expliziter, read-back-verifizierter Cleanup-Modus für Testzeilen, Testnutzer und Fixture-Storageobjekte.
- `package.json`, `tools/check-syntax.mjs`: offizielle Resolver-, Schema- und Privilege-Testskripte.

Keine HTML-, CSS-, sichtbare Cockpit-, Onboarding- oder Provisionierungsdatei wurde in Phase 2 verändert.

## Migration 202607270003

`project_members` erhält additiv:

- `cockpit_profile text null` mit Check auf `cfo`, `project`, `accounting_lead`, `worker`;
- `can_view_all_tasks boolean not null default false`;
- Unique-Constraint `(project_id, id)` als Composite-FK-Ziel;
- partielle Indizes für aktive UUID-Mitgliedschaften und Profile.

`private.cockpit_profile_for_project_role(text)` bildet die 15 freigegebenen Rollen deterministisch ab. CFO, Projektleitung und Leiter Rechnungswesen erhalten beim Backfill `can_view_all_tasks = true`; Worker bleiben `false`; unbekannte Rollen bleiben `cockpit_profile = null`. `access_level` wird dabei nicht zur Rechteableitung verwendet.

`project_member_substitutions` enthält projektgebundene Principal-/Substitute-FKs, fünf Statuswerte, Zeitfensterprüfung, Selbstvertretungsverbot, einen partiellen Unique-Index für aktive Beziehungen und Suchindizes. `deputy_name`/`deputy_email` bleiben erhalten; `tasks.deputy_member_id` wurde nicht eingeführt.

## Migration 202607270004

Aktive Identität bedeutet ausschließlich:

```text
project_members.invitation_status = accepted
AND project_members.user_id = auth.uid()
```

E-Mail, `deputy_email`, Projekteigentum, `access_level` und `cockpit_profile` autorisieren keine Mitgliedschaft. Der Taskzugriff erlaubt nur eigene Aufgaben, offene Aufgaben einer aktiven gültigen Vertretung oder explizite projektweite Sicht über `can_view_all_tasks`. Mitgliederverwaltung hängt ausschließlich an `can_manage_members`; CFO-/Projektprofil erzeugen das Flag nicht automatisch.

Direkte Browser-UPDATEs und -DELETEs auf `project_members` bleiben gesperrt. Ein expliziter Projektverwalter kann nur eine ungebundene, nicht privilegierte Einladung vorbereiten. Eine vollständige Mitgliederverwaltung benötigt weiterhin eine autorisierte RPC/Edge Function.

## Migration 202607270005

Der erste vollständige Remote-RLS-Lauf zeigte, dass die in `202607270004` an `can_manage_members` gekoppelte Projekt-DELETE-Policy einem Projektadministrator die Löschung des gesamten Projekts erlaubte. Dieses Flag ist fachlich ausschließlich Mitgliederverwaltung. Die additive Korrektur entfernt diese Kopplung und erlaubt Projekt-DELETE nur noch, wenn `created_by = auth.uid()` und gleichzeitig eine aktive `accepted` Mitgliedschaft vorliegt.

## Behobene Sicherheitsbefunde

- Kommentar-Impersonation: Browsernutzer dürfen nur `author_type = 'human'`, nicht `kai`, `kira`, `system` oder `comment_type = 'system'` schreiben; `user_id` muss `auth.uid()` entsprechen.
- Actor-Integrität: Aktivitätsereignisse binden `created_by` an die tatsächlich angemeldete Identität; eine Vertretung schreibt nicht als Principal.
- Projekt-/Task-Konsistenz: Composite-FKs schützen `documents`, `task_activity_events`, `task_approvals`, `task_notifications` und `task_review_notes` vor Kombinationen aus Projekt A und Task B. Auch `tasks.responsible_member_id` muss zum Taskprojekt gehören.
- Storage: Lesen folgt dem Taskzugriff; INSERT/UPDATE verlangen zusätzlich `can_upload = true` einer `accepted`, UUID-gebundenen Mitgliedschaft.

## Rollenresolver-Schnittstelle

- `normalizeProjectRole(role)` liefert nur bei exakter freigegebener Rolle/Synonym ein kanonisches Rollen-/Profilpaar.
- `validateCockpitProfile(profile)` akzeptiert nur vier Profile.
- `resolveCockpitProfile(member)` bevorzugt ein gültiges DB-Profil, verlangt aber Konsistenz zur fachlichen Rolle; Konflikte schließen den Zugriff.
- `isActiveMembership(member)` verlangt `accepted` und `user_id`.
- `classifyMemberContext(members, user)` priorisiert `user_id`; ungebundene eindeutige E-Mail-Altzeilen werden diagnostisch erkannt, aber nicht aktiviert. Mehrdeutigkeit und Widersprüche enden fail-closed.

Verbleibender E-Mail-Fallback: nur diagnostisch im Frontendresolver (`legacy_email_membership_requires_user_id`), niemals als RLS-Autorisierung.

## RLS- und Reportingtests

Der Basisplan umfasst weiterhin 420 Fälle (14 Ressourcen × 7 Identitäten × 4 Operationen plus 28 Cross-Project-SELECTs). Der normale Remote-Befehl `npm run test:rls` führt zusätzlich alle 37 Privilege-Probes aus; `npm run test:rls:privileges` führt sie isoliert aus. Die Zusammenfassung trennt:

- erwartete und tatsächliche SELECT-Sichtbarkeit;
- erfolgreiche Mutationen;
- Sichtbarkeit nach Mutationen;
- ausgeführte/bestandene/fehlgeschlagene Privilege-Probes.

Die 37 Probes bestehen aus 10 bisherigen Flag-/Mitgliedschaftsprobes und 27 Phase-2-Probes für Lifecycle, Vertretung, `can_view_all_tasks`, CFO-/Projektprofil ohne Administration, sichere Manager-Einladung, Feldübernahme, Cross-Project-FKs sowie Actor-/Kommentar-Impersonation.

## Lokale Testergebnisse

| Befehl | Ergebnis | Exit-Code |
|---|---|---:|
| `npm run test:role-resolver` | 10/10 Tests bestanden | 0 |
| `npm test` | Syntax 21/21, Resolver 10/10, Schema 8/8, HTTP 12/12, Auth 14/14, Cockpit 11/11, RLS-Plan 420 Fälle + 37 Probes, Secret-Scan 72 Dateien | 0 |
| `npm run test:migrations` | zwei lokale Neuaufbauten; je 14 Tabellen, 47 Policies, 1 Bucket; semantische Phase-2-Prüfungen bestanden | 0 |

Der erste Versuch meldete `DOCKER_UNAVAILABLE`. Nach Start der vorhandenen Benutzerinstallation von Docker Desktop war die Engine erreichbar; der anschließende doppelte Lauf bestand vollständig. Der Harness stoppte die lokale Supabase-Umgebung am Ende ohne Backup. Es gab keinen Remote-Zugriff.

## Remote-Testinstanz

Bestätigte Project-Ref: `vcozprjecsprgyeqfahn`. Die Produktions-Ref `mslbzypjtvvznyewupco` wurde technisch abgewiesen. Alle Migrationsbefehle verwendeten `--db-url` über den Schutzwrapper; dessen Abschluss meldete jeweils `linked: false`, `productionApplied: false`, `secretsPrinted: false`.

| Remote-Befehl | Ergebnis | Exit-Code |
|---|---|---:|
| `npm run test:migrations:list` vor Phase 2 | nur `003`/`004` ausstehend | 0 |
| `npm run test:migrations:push` | `003`/`004` auf Testinstanz angewandt | 0 |
| erster `npm run test:fixtures` | fehlendes weitergereichtes `can_view_all_tasks`; automatische Bereinigung PASS | 1 |
| korrigierter `npm run test:fixtures` | 6 Nutzer, 6 Mitgliedschaften, 2 Projekte | 0 |
| erster `npm run test:rls` | 420 ausgeführt, 415 bestanden, 5 Modell-/Adapterabweichungen; 37/37 Probes | 1 |
| lokale Prüfung und Push `202607270005` | jeweils bestanden | 0 |
| finaler `npm run test:rls` | 420/420, 0 Abweichungen; 37/37 Probes | 0 |
| erster `npm run test:rls:proofs` | 23/24; veralteter `accepted`-Insert-Payload | 1 |
| präzisierter `npm run test:rls:proofs` | 24/24 | 0 |
| `npm run test:artifacts` | zweimal 0 temporäre Artefakte | 0 |
| zweiter `npm run test:fixtures` | idempotenter Neuaufbau bestanden | 0 |
| `npm run test:fixtures:cleanup` | Read-back: 0 Zeilen, 0 Nutzer, 0 Storageobjekte | 0 |

Finale Remote-Zähler:

- 420 RLS-Fälle ausgeführt, 420 bestanden, 0 Abweichungen;
- 37 Privilege-Probes ausgeführt, 37 bestanden;
- 24 gezielte Sicherheitsnachweise ausgeführt, 24 bestanden;
- 0 temporäre Matrix-/Proof-Artefakte;
- 0 synthetische Fixture-Zeilen, Auth-Nutzer oder Storageobjekte nach Cleanup.

## Offene Risiken und Phase 3

1. Mitglieder- und Vertretungsverwaltung als autorisierte, auditierte RPC/Edge Function umsetzen; direkte Tabellen-UPDATEs/-DELETEs bleiben gesperrt.
2. Inhaltsklassifikation für Wirtschaftsprüfung ergänzen, bevor eine breitere Prüfersicht erwogen wird.
3. Den Resolver erst in Phase 3 in die Cockpit-UI integrieren; aktuell ist keine sichtbare UI verändert.
4. Eine spätere Produktionsmigration benötigt eine eigene Freigabe und ist nicht Bestandteil dieser Phase.

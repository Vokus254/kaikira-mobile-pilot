# RLS-Abweichungsanalyse

Stand: 27. Juli 2026  
Branch: `codex/phase-1a-security-baseline`  
Untersuchungsziel: ausschließlich Ursachenanalyse und Präzisierung des Testadapters auf `LUMINA-RLS-TEST`

## Sicherheitsgrenzen

- Es wurde keine Policy geändert, gedroppt oder neu angelegt.
- Es wurde keine Migration verändert oder angewandt.
- Es wurde weder `--linked` noch `db push` noch `migration repair` verwendet.
- Die produktive Supabase-Instanz wurde nicht angesprochen.
- Temporäre Matrixdatensätze und Storage-Objekte werden mit dem Service-Client ausschließlich in der getrennten Testinstanz erzeugt, per Read-back geprüft und im `finally`-Pfad entfernt.
- Geheimnisse werden nur aus der ignorierten Datei `.env.test` eingelesen und weder protokolliert noch in Ergebnisdateien geschrieben.

## Methodik und präzisierte Semantik

Der ursprüngliche Lauf meldete 420 Fälle, 398 PASS und 22 Abweichungen. Der alte Adapter setzte bei UPDATE und DELETE einen erfolgreichen HTTP-Status mit einer erfolgreichen Mutation gleich. Das ist bei PostgREST unzulässig: Eine durch RLS herausgefilterte Zielzeile kann mit HTTP 204 und ohne Fehler beantwortet werden, obwohl null Zeilen verändert wurden.

Der präzisierte Adapter misst deshalb:

- SELECT mit direkter UUID, `count: exact` und erwarteter Zeilenanzahl;
- UPDATE/DELETE ohne nachgeschaltetes `.select()`, damit eine SELECT-Policy das Mutationsergebnis nicht verfälscht;
- Sichtbarkeit vor und nach der Operation mit dem Rollenclient;
- tatsächliche Existenz und Feldwerte vor und nach der Operation mit dem Test-Service-Client;
- betroffene Zeilen aus dem verifizierten Datenzustand statt aus dem HTTP-Status;
- Storage-Existenz über Objektmetadaten und Inhaltsvergleich vor und nach Upload/Update/Delete;
- Signed-URL-Erzeugung und tatsächlichen HTTP-Download als getrennte Prüfungen;
- eigene Ergebnisdateien für den gezielten Matrixlauf und die Rechteerhöhungsproben.

Die folgenden Werte stammen aus der gezielten Wiederholung der fünf betroffenen Ressourcen nach dieser Präzisierung. In der Spalte „Erwartung“ steht bei korrigierten Fällen `alt → neu`.

## Vollständige Liste der 22 ursprünglichen Abweichungen

| Fall-ID | Ressource | Identität/Rolle | Projekt | Operation | direkte UUID | Erwartung | HTTP | PG-/Storage-Code | sichtbar vorher | betroffen | sichtbar danach | tatsächlicher Datenzustand | erste Einordnung |
|---|---|---|---|---|---:|---|---:|---|---:|---:|---:|---|---|
| RLS-004 | companies | Nutzer A / Eigentümer | A | DELETE | ja | erlaubt → verweigert | 204 | keiner | 1 | 0 | 1 | Zeile vorhanden | `WRONG_EXPECTATION_MODEL`: keine DELETE-Policy |
| RLS-006 | companies | Nutzer B | A | INSERT | nein | erlaubt | 201 | keiner | 0 | 1 | 1 | Zeile eingefügt | `TEST_ADAPTER_SEMANTICS`: `created_by` muss Akteur sein |
| RLS-010 | companies | Bearbeiter | A | INSERT | nein | erlaubt | 201 | keiner | 0 | 1 | 1 | Zeile eingefügt | `TEST_ADAPTER_SEMANTICS`: `created_by` muss Akteur sein |
| RLS-014 | companies | Freigeber | A | INSERT | nein | erlaubt | 201 | keiner | 0 | 1 | 1 | Zeile eingefügt | `TEST_ADAPTER_SEMANTICS`: `created_by` muss Akteur sein |
| RLS-018 | companies | Prüfer | A | INSERT | nein | erlaubt | 201 | keiner | 0 | 1 | 1 | Zeile eingefügt | `TEST_ADAPTER_SEMANTICS`: `created_by` muss Akteur sein |
| RLS-022 | companies | Admin | A | INSERT | nein | erlaubt | 201 | keiner | 0 | 1 | 1 | Zeile eingefügt | `TEST_ADAPTER_SEMANTICS`: `created_by` muss Akteur sein |
| RLS-035 | projects | Nutzer B / projektfremd | A | UPDATE | ja | verweigert | 204 | keiner | 0 | 0 | 0 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Testziel darf nicht vom Akteur erstellt sein |
| RLS-036 | projects | Nutzer B / projektfremd | A | DELETE | ja | verweigert | 204 | keiner | 0 | 0 | 0 | Zeile vorhanden | `TEST_ADAPTER_SEMANTICS`: Testziel darf nicht vom Akteur erstellt sein |
| RLS-039 | projects | Bearbeiter / Mitglied | A | UPDATE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-040 | projects | Bearbeiter / Mitglied | A | DELETE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile vorhanden | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-043 | projects | Freigeber / Mitglied | A | UPDATE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-044 | projects | Freigeber / Mitglied | A | DELETE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile vorhanden | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-047 | projects | Prüfer / Mitglied | A | UPDATE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-048 | projects | Prüfer / Mitglied | A | DELETE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile vorhanden | `TEST_ADAPTER_SEMANTICS`: Eigentümerschaft des Testziels korrigiert |
| RLS-052 | projects | Admin / Verwalter | A | DELETE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile vorhanden | `TEST_ADAPTER_SEMANTICS`: DELETE gilt nur für Projektersteller |
| RLS-061 | project_members | Nutzer B / projektfremd | A | SELECT | ja | verweigert | 200 | keiner | 0 | 0 | 0 | Zeile verborgen | `TEST_ADAPTER_SEMANTICS`: echte fremde Mitglieds-UUID verwendet |
| RLS-079 | project_members | Projektadministrator A | A | UPDATE | ja | erlaubt → verweigert | 204 | keiner | 0 | 0 | 0 | Zeile unverändert | `WRONG_EXPECTATION_MODEL`: direkte Browsermutation fremder Mitgliedschaft bleibt gesperrt |
| RLS-080 | project_members | Projektadministrator A | A | DELETE | ja | erlaubt → verweigert | 204 | keiner | 0 | 0 | 0 | Zeile vorhanden | `WRONG_EXPECTATION_MODEL`: direkte Browsermutation fremder Mitgliedschaft bleibt gesperrt |
| RLS-291 | task_review_notes | Bearbeiter / Mitglied | A | UPDATE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Akteur darf nicht künstlich Ersteller sein |
| RLS-299 | task_review_notes | Prüfer / Mitglied | A | UPDATE | ja | verweigert | 204 | keiner | 1 | 0 | 1 | Zeile unverändert | `TEST_ADAPTER_SEMANTICS`: Akteur darf nicht künstlich Ersteller sein |
| RLS-367 | Storage `lumina-datarooms` | Nutzer A / Mitglied | A | UPDATE | ja | verweigert → erlaubt | 200 | keiner | 1 | 1 | 1 | Objekt aktualisiert | `WRONG_EXPECTATION_MODEL`: Policy erlaubt jedem Projektmitglied UPDATE |
| RLS-398 | project_members | Nutzer B / projektfremd | A | SELECT | ja | verweigert | 200 | keiner | 0 | 0 | 0 | Zeile verborgen | `TEST_ADAPTER_SEMANTICS`: Cross-Project-Fall auf echte fremde UUID korrigiert |

## Kategorien

| Kategorie | Anzahl | Fälle |
|---|---:|---|
| `CONFIRMED_POLICY_GAP` | 0 | keine |
| `WRONG_EXPECTATION_MODEL` | 4 | RLS-004, RLS-079, RLS-080, RLS-367 |
| `TEST_ADAPTER_SEMANTICS` | 18 | RLS-006, RLS-010, RLS-014, RLS-018, RLS-022, RLS-035, RLS-036, RLS-039, RLS-040, RLS-043, RLS-044, RLS-047, RLS-048, RLS-052, RLS-061, RLS-291, RLS-299, RLS-398 |
| `NOT_YET_EXPLAINED` | 0 | keine |

Es wurde kein unerlaubter Zugriff und keine unerlaubte Mutation anhand des Datenzustands nachgewiesen. Insbesondere sind HTTP 200/204 ohne Fehler bei SELECT/UPDATE/DELETE kein Beleg für eine erfolgreiche Operation. Daher wird kein Fall als `CONFIRMED_POLICY_GAP` klassifiziert.

## Besondere Prüfungen

### companies

- INSERT ist für authentifizierte Identitäten nur mit `created_by = auth.uid()` zulässig. Der ursprüngliche Adapter setzte fälschlich den Fixture-Eigentümer ein.
- SELECT und UPDATE sind an `created_by` gebunden; Projektmitgliedschaft allein vermittelt keine Leserechte.
- Fremde direkte UUIDs bleiben unsichtbar; `count: exact` ergibt null.
- Für DELETE existiert keine Policy. Der Eigentümer erhält HTTP 204, aber null betroffene Zeilen; der Datensatz bleibt bestehen.
- Das präzisierte Erwartungsmodell behandelt DELETE deshalb als verweigert. Ob Eigentümer fachlich löschen dürfen sollen, ist eine separate Produktentscheidung.

### projects

- SELECT: Eigentümer und Projektmitglieder sehen das Projekt; projektfremde Nutzer sehen bei direkter UUID null Zeilen.
- INSERT: nur der Ersteller für ein eigenes Unternehmen.
- UPDATE: Projektersteller oder Identitäten mit `can_manage_project`.
- DELETE: ausschließlich Projektersteller, nicht allgemein Projektverwalter.
- Der ursprüngliche Adapter setzte bei temporären UPDATE-/DELETE-Zielen den jeweiligen Akteur als `created_by`. Dadurch wurden Bearbeiter, Freigeber, Prüfer und projektfremde Nutzer künstlich zu Eigentümern.
- Nach Korrektur sind alle betroffenen Projektfälle konsistent; verweigerte Mutationen ändern/löschen exakt null Zeilen.

### project_members und Rechteerhöhung

Zusätzlich zur Matrix wurden zehn gezielte Read-back-Proben ausgeführt:

| Probe | Versuch | Erwartung | HTTP / Code | betroffen | Read-back | Ergebnis |
|---|---|---|---|---:|---|---|
| PM-ESC-001 | Bearbeiter ändert eigene Rolle | verweigert | 204 / keiner | 0 | `Bearbeiter` unverändert | PASS |
| PM-ESC-002 | Bearbeiter ändert eigenes `can_read` | verweigert | 204 / keiner | 0 | `true` unverändert | PASS |
| PM-ESC-003 | Bearbeiter ändert eigenes `can_upload` | verweigert | 204 / keiner | 0 | `true` unverändert | PASS |
| PM-ESC-004 | Bearbeiter ändert eigenes `can_edit` | verweigert | 204 / keiner | 0 | `true` unverändert | PASS |
| PM-ESC-005 | Bearbeiter erhöht eigenes `can_approve` | verweigert | 204 / keiner | 0 | `false` unverändert | PASS |
| PM-ESC-006 | Bearbeiter erhöht eigenes `can_manage_members` | verweigert | 204 / keiner | 0 | `false` unverändert | PASS |
| PM-ESC-007 | Bearbeiter ändert fremdes `can_approve` | verweigert | 204 / keiner | 0 | `true` unverändert | PASS |
| PM-ESC-008 | Admin ändert fremdes `can_approve` | erlaubt | 204 / keiner | 0 | `true` unverändert | FAIL |
| PM-ESC-009 | Bearbeiter fügt neues Mitglied ein | verweigert | 403 / `42501` | 0 | nicht vorhanden | PASS |
| PM-ESC-010 | Admin fügt neues Mitglied ein | erlaubt | 201 / keiner | 1 | per Service-Read-back vorhanden | PASS |

Die UPDATE-/DELETE-Policies verwenden `private.can_manage_project(project_id)`, die SELECT-Policy zeigt jedoch nur Projekteigentümern sowie der eigenen Identität/E-Mail/Stellvertretung eine Mitgliedschaft. Effektiv kann der Projektadministrator eine fremde Mitgliedschaft nicht direkt ändern oder löschen. Dieses Verhalten ist nun das verbindliche Browser-Zielmodell. Die spätere Mitgliederverwaltung benötigt eine sichere RPC oder Edge Function als separates Arbeitspaket.

### task_review_notes

- SELECT und INSERT setzen Projektzugriff voraus; INSERT bindet `created_by` an den Akteur.
- UPDATE ist für Ersteller, zugewiesenen Prüfer (`assigned_to`) oder Projektverwalter zulässig.
- Bearbeiter und Prüfer ohne eine dieser Eigenschaften verändern null Zeilen; der Status bleibt im Read-back unverändert.
- Freigeber/zugewiesener Prüfer und Projektverwalter werden im vollständigen Ressourcenlauf entsprechend dem Zielmodell geprüft.
- Projektfremde direkte UUIDs bleiben unsichtbar und unverändert.

### Storage

Der einzige ursprüngliche Storage-Fall war RLS-367:

- Identität: Nutzer A, authentifiziert und Mitglied von Projekt A
- Bucket: `lumina-datarooms`
- Objektpfad: `20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001/matrix-d44d0d56-e45f-434b-ad61-05baea0bc402.txt` (nach dem Test entfernt)
- Operation: UPDATE/Upsert eines vorhandenen Objekts
- Erwartung: ursprünglich verweigert, nach Policy-Abgleich erlaubt
- tatsächliches Ergebnis: HTTP 200, kein PostgreSQL-/Storage-Fehler, eine durch den Vorher-/Nachher-Inhaltsvergleich bestätigte Objektänderung
- Objekt vorher vorhanden: ja
- Objekt nachher vorhanden: ja
- Signed URL vor der Mutation erzeugbar: ja; Download HTTP 200
- Signed URL nach der Mutation erzeugbar: ja; Download HTTP 200

Die UPDATE-Policy prüft Projektmitgliedschaft und nicht `can_edit`. Daher war die ursprüngliche Erwartung falsch. Signed-URL-Erzeugung und Download werden separat erfasst; die URL selbst wird nicht protokolliert.

## Vorgeschlagene minimale Änderungen

Bereits ausschließlich im Testcode umgesetzt:

1. Datenzustandsbasierte Bewertung für UPDATE und DELETE.
2. Exakte Counts und echte Fremd-UUIDs für SELECT.
3. Rollenrichtige Eigentümer-, Ersteller- und Zuweisungsdaten in temporären Testzielen.
4. Objektmetadaten, Signed-URL-Erzeugung und Download als getrennte Storage-Signale.
5. Erwartungsmodell: `companies.DELETE = verweigert`; Storage-UPDATE für Nutzer A als Projektmitglied = erlaubt.
6. Separate Read-back-Proben für jede eigene Berechtigung, fremde Mitgliedschaften und INSERT.

Noch nicht umzusetzen, bis das fachliche Zielmodell bestätigt ist:

- Falls Projektverwalter alle Mitgliedschaften verwalten sollen, wäre die kleinste denkbare Policyänderung eine SELECT-Sichtbarkeit für `private.can_manage_project(project_id)`. Erst danach wären UPDATE und DELETE gegen fremde Mitgliedschaften erneut zu prüfen. Diese Änderung wurde nicht erstellt oder angewandt.
- Falls Unternehmenseigentümer DELETE erhalten sollen, wäre dafür eine eigene fachlich bestätigte DELETE-Policy erforderlich. Aktuell bildet der Test das vorhandene Schema ab.

## Ausgeführte Prüfungen und Exit-Codes

| Befehl | Ergebnis | Exit-Code |
|---|---|---:|
| `node --check tests/security/rls-model.mjs` | Syntax gültig | 0 |
| `node --check tools/test-rls-matrix.mjs` | Syntax gültig | 0 |
| erster präzisierter Ressourcenlauf | 143/150 PASS; weitere Adaptereffekte sichtbar | 1 |
| zweiter präzisierter Ressourcenlauf | 146/150 PASS; Erwartungsfehler isoliert | 1 |
| `node --env-file-if-exists=.env.test tools/test-rls-matrix.mjs --resources=companies,projects,project_members,task_review_notes,storage:lumina-datarooms` | 148/150 PASS; nur RLS-079/RLS-080 verbleiben | 1 |
| `node --env-file-if-exists=.env.test tools/test-rls-matrix.mjs --probes-only` | 9/10 PASS; nur PM-ESC-008 verbleibt | 1 |
| `npm.cmd test` | Syntax 11/11, HTTP-Routen 9/9, RLS-Plan 420/420 erzeugt | 0 |

Der Exit-Code 1 ist beabsichtigt korrekt: Der Adapter verdeckt die zwei noch nicht mit dem effektiven Modell übereinstimmenden `project_members`-Erwartungen nicht.

## Fortschreibung nach verbindlicher Zielmodellentscheidung

Am 27. Juli 2026 wurden `companies.DELETE = verweigert`, Storage-Upload und
-Update nur mit `can_upload = true` sowie der synthetische Admin als
Projektadministrator A bestätigt. Nach Entfernung der sechs Testzugriff-Policies
und Präzisierung der Storage-Policies bestehen nach der finalen
Zielmodellentscheidung 420 von 420 Matrixfällen ohne Abweichung.

Die Fälle RLS-079/RLS-080 betreffen eine fremde Mitgliedschaft in Projekt A.
Direkte UPDATE- und DELETE-Mutationen bleiben für Browserclients absichtlich
gesperrt und werden als erwartete Ablehnung mit null betroffenen Zeilen geprüft.
Die spätere Mitgliederverwaltung über eine sichere RPC oder Edge Function ist
als separates Arbeitspaket in `docs/rls-target-model-validation.md` festgehalten.

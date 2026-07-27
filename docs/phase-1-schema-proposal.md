# Phase 1 – minimaler additiver Schema- und RLS-Entwurf

Stand: in Phase 2 additiv implementiert, zweimal lokal von null verifiziert und ausschließlich auf `LUMINA-RLS-TEST` validiert

## Bestehende Lifecycle-Werte

Das Schema kennt `pending`, `invited`, `accepted`, `declined` und `inactive`. Onboarding setzt derzeit keinen Wert und erhält dadurch den Default `pending`.

| Status | Bedeutung | Projektdaten lesen | Provisionierung/Auth-Verknüpfung | Folgezustand |
|---|---|:---:|---|---|
| `pending` | Datensatz vorbereitet, Einladung noch nicht versandt | Nein | Auth-Benutzer darf vorbereitet werden; noch keine Aktivierung | `invited` oder unmittelbar `accepted` bei kontrollierter Testprovisionierung |
| `invited` | Einladung versandt, noch nicht angenommen/verknüpft | Nein | auf erfolgreiche Annahme warten | `accepted`, `declined` oder `inactive` |
| `accepted` | aktive, eindeutig mit `user_id` verknüpfte Mitgliedschaft | Ja | Provisionierung setzt diesen Wert erst nach erfolgreicher Auth-Verknüpfung | `inactive` oder bei Ablehnung vor Aktivierung `declined` |
| `declined` | Einladung abgelehnt | Nein | keine automatische Reaktivierung | neue Einladung setzt bewusst `invited`; Historie bleibt nachvollziehbar |
| `inactive` | entzogene oder beendete Mitgliedschaft | Nein | keine automatische Reaktivierung | nur kontrollierte Reaktivierung |

`invitation_status` bleibt die einzige Lifecycle-Wahrheit. Eine unabhängige `is_active`-Spalte wird nicht vorgeschlagen. Alle aktiven RLS-Helfer müssen exakt `invitation_status = 'accepted'` verlangen.

## Vorgeschlagene Schemaänderungen

### `project_members.cockpit_profile`

| Eigenschaft | Festlegung |
|---|---|
| Zweck | stabiles, getestetes Einstiegsprofil unabhängig von freien Rollentexten |
| Datentyp | `text` |
| Constraint | nullable mit `check (cockpit_profile in ('cfo','project','accounting_lead','worker'))`; `null` bleibt der sichere Zustand für unbekannte Altrollen |
| Foreign Key | keiner |
| Index | `(project_id, cockpit_profile)` nur bei nachgewiesenem Abfragebedarf; für den Pilot nicht zwingend |
| Backfill | deterministische Zuordnung der 15 bekannten Rollen; unbekannte Rollen bleiben zunächst `null` und inaktiv/neutral |
| RLS-Auswirkung | Profil darf nie allein Zugriff gewähren; Browser darf es nicht direkt ändern |
| Rückwärtskompatibilität | `project_role` bleibt unverändert sichtbar |
| Pilot erforderlich | Ja |

### `project_members.can_view_all_tasks`

| Eigenschaft | Festlegung |
|---|---|
| Zweck | trennt projektweite Aufgaben-/Teamansicht von der reinen Sicht auf eigene und vertretene Aufgaben |
| Datentyp | `boolean not null default false` |
| Constraint | `not null`; Berechtigungsänderung nicht direkt durch Browserclients |
| Foreign Key | keiner |
| Index | keiner für den Pilot erforderlich |
| Backfill | `true` nur für eindeutig zugeordnete CFO-, Projektleitungs- und Accounting-Lead-Mitgliedschaften; Worker bleiben `false` |
| RLS-Auswirkung | Task-SELECT erlaubt projektweite Zeilen nur bei aktiver Mitgliedschaft und diesem Flag |
| Rückwärtskompatibilität | additive, standardmäßig restriktive Spalte |
| Pilot erforderlich | Ja; sonst wäre das aufgabenzentrierte Worker-Modell nicht von Team-/Managementsicht trennbar |

### `project_member_substitutions`

| Eigenschaft | Festlegung |
|---|---|
| Zweck | projektgebundene, zeitlich steuerbare Beziehung zwischen Hauptperson und eigenständigem Stellvertreter |
| Datentyp | neue Tabelle, Spalten gemäß `substitution-model.md` |
| Constraints | Status-, Identitäts- und Zeitfensterchecks; Principal ungleich Substitute |
| Foreign Keys | Composite-FKs `(project_id, principal_member_id)` und `(project_id, substitute_member_id)` auf `project_members(project_id,id)` |
| Indexe | Principal- und Substitute-Zugriff je Projekt und Status |
| Backfill | aus eindeutigen `deputy_email`-Werten erst nach Anlage/Verknüpfung eigener Mitgliedschaften; keine automatische Zuordnung mehrdeutiger Sammeladressen |
| RLS-Auswirkung | Taskzugriff kann aktive Beziehung berücksichtigen; direkte Browsermutationen gesperrt |
| Rückwärtskompatibilität | `deputy_name`/`deputy_email` bleiben bestehen |
| Pilot erforderlich | Ja, für getrennt anmeldbare Stellvertreter und sicheren Audit-Trail |

### `project_members(project_id,id)`

Für projektgebundene Composite-FKs wird ein Unique-Constraint oder eindeutiger Index auf `(project_id,id)` benötigt. Der bestehende Primärschlüssel `id` bleibt unverändert.

### Nicht vorgeschlagen: `tasks.deputy_member_id`

Die aktive Vertretung wird dynamisch aus `project_member_substitutions` ermittelt. Dadurch erzeugt ein Stellvertreterwechsel keine veralteten Aufgabenverweise. Historische Aktionen bleiben über ihre Actor-IDs erhalten.

### Noch nicht Bestandteil der Pilotmigration: Prüferklassifikation

Eine spätere additive Migration muss Klassifikationsfelder an Aufgaben, Kommentaren, Dokumenten, Review Notes, Aktivitäten und gegebenenfalls Freigaben ergänzen. Ohne diese Felder wird keine breite Auditor-SELECT-Policy erstellt.

## Fachlicher RLS-Entwurf

### Identität und aktive Mitgliedschaft

- `private.is_active_project_member(project_id)` prüft ausschließlich eine `accepted`-Zeile mit `user_id = auth.uid()`.
- E-Mail und `deputy_email` werden nicht dauerhaft als RLS-Identität verwendet.
- Unverknüpfte Zeilen mit `user_id is null` bleiben inaktiv.
- Mehrere aktive Mitgliedschaften derselben `user_id` im selben Projekt sind für den Pilot unzulässig oder führen im Resolver zu `ambiguous`.

### Projekt- und Aufgabenleserechte

- Projektzugriff nur bei aktiver Mitgliedschaft im selben Projekt. Projekteigentum darf lediglich einen kontrollierten Bootstrap-/RPC-Pfad zur Anlage der ersten akzeptierten Mitgliedschaft autorisieren, nicht die normale SELECT-Policy umgehen.
- Eigene Aufgaben: `tasks.responsible_member_id` verweist auf die eigene aktive Mitgliedschaft.
- Stellvertretungsaufgaben: aktive eigene Mitgliedschaft ist Substitute einer aktiven Principal-Mitgliedschaft, die `responsible_member_id` der Aufgabe ist.
- Projektleitung, Accounting Lead und CFO erhalten erweiterte Projektansichten nur über konkrete RLS-Fähigkeiten; das Profil selbst ist kein Policy-Schlüssel.
- Worker erhalten keine allgemeine `is_project_member => alle tasks`-Lesepolicy.

### Mutationsschutz

- Browserclients dürfen `project_members.user_id`, `project_id`, `project_role`, `cockpit_profile` und Berechtigungsflags nicht direkt erhöhen oder übertragen.
- Direkte UPDATE-/DELETE-Mutationen an fremden `project_members` bleiben gesperrt.
- Mitglieder- und Vertretungsverwaltung erfolgt später über eine autorisierte RPC/Edge Function mit Projektprüfung.
- Taskmutationen müssen die unveränderte `project_id` sowie gültige Mitgliedschaftsreferenzen prüfen.
- Storagezugriff bleibt zusätzlich an Bucket, Projektpfad und `can_upload` gebunden.

### Unbekannte oder inaktive Mitgliedschaft

- keine Projektdatenabfrage
- keine Navigation in geschützte Projektbereiche
- neutrales Resolverergebnis mit technischem Grundcode, aber ohne vertrauliche Details im Browser

### Auditor-Erweiterungspunkt

Wirtschaftsprüfung bleibt `worker` mit `access_level = 'auditor'`. Bis zur Inhaltsklassifikation sind nur eigene Aufgaben und ausdrücklich freigegebene Inhalte zulässig. Eine breite projektweite SELECT-Policy wird nicht vorgesehen.

## In Phase 2 angelegte Migrationen

1. `202607270003_add_cockpit_profiles_and_substitutions.sql`
   - Profilspalte und Check
   - restriktives `can_view_all_tasks`
   - deterministischer Backfill
   - projektgebundener Unique-Constraint
   - Vertretungstabelle, Constraints und Indexe

2. `202607270004_enforce_accepted_membership_identity.sql`
   - aktive Helfer ausschließlich für `accepted` und `user_id`
   - projekt- und aufgabenbezogene RLS-Neufassung
   - Privilegschutz für Identitäts-, Profil- und Berechtigungsfelder
   - keine Auditor-Vollfreigabe

Die Migrationen `202607270003` und `202607270004` wurden nach zwei vollständigen lokalen Neuaufbauten ausschließlich über die explizite DB-URL auf `LUMINA-RLS-TEST` (`vcozprjecsprgyeqfahn`) angewandt. Der Testlauf machte zusätzlich eine zu breite Projekt-DELETE-Kopplung sichtbar; `202607270005_restrict_project_deletion_to_active_creator.sql` begrenzt DELETE deshalb auf den aktiven, UUID-gebundenen Projektersteller. Auch diese Folgemigration bestand vorher zwei lokale Neuaufbauten. Produktion und `--linked` blieben ausgeschlossen.

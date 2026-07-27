# LUMINA Rollen- und Berechtigungsmatrix

Stand: Phase 2 – technisch umgesetzt, lokal von null und auf `LUMINA-RLS-TEST` verifiziert, 27. Juli 2026

## Leseschlüssel

- **A** – für dieses Profil fachlich standardmäßig erlaubt, sofern eine aktive Mitgliedschaft im eigenen Projekt besteht.
- **Z** – nur mit einer zusätzlichen, ausdrücklich gespeicherten Berechtigung, konkreten Zuweisung oder Inhaltsfreigabe erlaubt.
- **V** – für dieses Profil verboten; kein Frontend-Fallback.

Das Cockpitprofil steuert Darstellung und fachlichen Einstieg. RLS entscheidet unabhängig davon über den tatsächlichen Datenzugriff. `project` verleiht insbesondere kein automatisches `can_manage_members`; `cfo` ebenfalls nicht.

## Verbindliche Matrix

| Fähigkeit | `cfo` | `project` | `accounting_lead` | `worker` |
|---|:---:|:---:|:---:|:---:|
| Eigenes Projekt sehen | A | A | A | A |
| Projektstatus sehen | A | A | A | A |
| Eigene Aufgaben sehen | A | A | A | A |
| Aktive Stellvertretungsaufgaben sehen | A | A | A | A |
| Alle Projektaufgaben sehen | A | A | A | V |
| Teamfortschritt sehen | A | A | A | V |
| Budget sehen | A | Z | V | V |
| Managemententscheidungen sehen | A | Z | V | V |
| Mitglieder verwalten | Z | Z | Z | V |
| Aufgaben zuweisen | Z | A | A | V |
| Datenräume verwalten | Z | A | Z | V |
| Dokumente hochladen | Z | Z | Z | Z |
| Dokumente freigeben | A | Z | A | V |
| Kommentare im eigenen zulässigen Kontext lesen | A | A | A | A |
| Interne Kommentare lesen | A | A | A | Z |
| Explizit freigegebene Prüferinhalte sehen | A | A | A | Z |

## Auslegung der Zusatzberechtigungen

- Dokumentupload setzt immer `can_upload = true` voraus.
- Mitgliederverwaltung setzt immer `can_manage_members = true` voraus und wird später bevorzugt über eine autorisierte RPC oder Edge Function umgesetzt. Direkte Tabellen-UPDATEs und -DELETEs bleiben gesperrt.
- CFO-Aufgabenverwaltung oder Datenraumverwaltung setzt eine zusätzliche Projektberechtigung voraus; die Managementsicht allein reicht nicht.
- Projektleitung erhält Aufgaben- und Datenraumsteuerung nur im eigenen Projekt. Technische oder globale Administration entsteht nicht.
- Leiter Rechnungswesen erhält Teamdaten und Reviews. Aufgabenverteilung oder Datenraumverwaltung benötigen eine gesonderte Projektberechtigung.
- Worker sehen ausschließlich eigene Aufgaben, aktive Vertretungsaufgaben und dafür freigegebene Kontextdaten.
- Die fachliche Rolle Wirtschaftsprüfung verwendet zwar `worker`, erhält aber zusätzlich eine restriktive Auditor-Überlagerung. Interne Management-, Personal-, Budget- und nicht freigegebene Kommentare bleiben verboten.

## Abbildung auf bestehende Felder

| Fachliche Fähigkeit | Bestehende oder geplante technische Grundlage |
|---|---|
| Projekt lesen | aktive `project_members`-Zeile im selben Projekt |
| Eigene Aufgabe | `tasks.responsible_member_id` entspricht eigener Mitgliedschaft |
| Stellvertretungsaufgabe | aktive Zeile in `project_member_substitutions` |
| Alle Projektaufgaben/Teamfortschritt | geplantes `project_members.can_view_all_tasks = true` |
| Upload | `project_members.can_upload = true` plus erlaubter Projektpfad |
| Bearbeiten | konkrete Aufgabenzuweisung/aktive Vertretung oder `can_edit` zusammen mit `can_view_all_tasks`; nicht allein das Profil |
| Freigeben | `can_approve = true` und konkreter Freigabekontext |
| Mitglieder verwalten | `can_manage_members = true` plus autorisierter Serverpfad |
| Prüferzugriff | aktive Mitgliedschaft, Auditorrolle und explizite Inhaltsfreigabe |

## Inhaltsklassifikation für Wirtschaftsprüfung

Eine belastbare Prüfer-RLS ist erst möglich, wenn Inhalte klassifiziert sind. Vorgesehene Erweiterungspunkte:

| Tabelle/Bereich | Benötigte Klassifikation | Begründung |
|---|---|---|
| `tasks` | `visibility_scope` oder `released_to_auditor` | Nicht jede interne oder Managementaufgabe gehört in die Prüfersicht. |
| `task_comments` | `audience`/`comment_classification` | Interne Kommentare, Personal-, Budget- und Managementnotizen müssen abgrenzbar sein. |
| `documents` | `released_to_auditor` | Metadaten und Dateiinhalt müssen gemeinsam freigegeben werden. |
| `task_room_folders` | vorhandenes `can_auditor_read` präzisieren | Ordnerfreigabe kann als zusätzliche Schranke dienen. |
| `storage.objects` | Freigabe über verknüpfte Dokumentmetadaten | Der Objektpfad allein enthält keine Inhaltsklassifikation. |
| `task_review_notes` | `audience` oder `released_to_auditor` | Interne Review Notes dürfen nicht automatisch sichtbar sein. |
| `task_activity_events` | `audience` | Aktivitätsmeldungen können interne Vorgänge offenlegen. |
| `task_approvals` | `visibility_scope` | Managemententscheidungen und interne Freigaben sind nicht generell Prüferinhalt. |

Diese Klassifikation ist nicht Bestandteil der minimalen Phase-2-Migration. Bis zu ihrer Umsetzung darf die Wirtschaftsprüfung keine breite projektweite Lesepolicy erhalten.

## Technische Phase-2-Abgrenzung

`cockpit_profile` gewährt selbst keine RLS-Rechte. Projektweite Aufgabensicht verlangt `can_view_all_tasks = true`; Mitgliederverwaltung verlangt separat `can_manage_members = true`. CFO und Projektleitung ohne dieses Flag können keine Mitgliedschaft anlegen oder direkt verändern. Direkte UPDATE-/DELETE-Mutationen an `project_members` bleiben auch für Projektverwalter gesperrt. Ein expliziter Projektverwalter darf lediglich eine ungebundene, nicht privilegierte Einladung (`pending`/`invited`) vorbereiten. Verknüpfung, Rechtevergabe sowie spätere Änderungen benötigen weiterhin einen kontrollierten Serverpfad.

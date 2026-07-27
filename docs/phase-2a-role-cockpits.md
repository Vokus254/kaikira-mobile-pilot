# Phase 2A – Rollenspezifische Cockpit-Einstiege

## Bestandsaufnahme vor Implementierung

### Routing

- Vercel stellt die statischen HTML-Dateien mit `cleanUrls: true` bereit.
- `/cockpit` wird durch `cockpit.html` bedient; es wurde keine neue Route eingeführt.
- Die vorhandenen Unterbereiche Cockpit, Aufgaben, Datenräume und Kommunikation bleiben clientseitige Ansichten derselben Seite.
- Der Abschlussplaner (`/abschlussplaner`) und die Projektverwaltung (`/admin`) bleiben eigenständige Seiten.

### Login und Sitzung

- Die Anmeldung erfolgt weiterhin per Supabase-Magic-Link.
- Der Redirect nach erfolgreicher Anmeldung bleibt `/cockpit`.
- `cockpit.html` prüft vor jedem Aufbau des Kundenbereichs die persistierte Supabase-Session.
- Während der Prüfung ist ausschließlich ein neutraler Ladezustand sichtbar. Ohne Session wird nur die Zugangssperre mit Magic-Link-Login und Rücklink zur Landingpage angezeigt.
- Header, Hauptnavigation, Projektauswahl, Rollenansicht, Feed sowie KAI/KIRA liegen vollständig im standardmäßig versteckten `protectedApp`-Container.
- Erst nach erfolgreicher Sessionprüfung werden sichtbare Projekte und die eigene Projektmitgliedschaft geladen.
- `SIGNED_OUT` leert den lokalen Nutzer-, Projekt- und Rollenstatus und verbirgt den geschützten Container ohne Seitenneuladung.

### Rollenmodell

- Die fachliche Projektrolle steht in `public.project_members.project_role`; ergänzend existieren `access_level` und die Felder `can_read`, `can_upload`, `can_edit`, `can_approve` und `can_manage_members`.
- Vor Phase 2A enthielt das Cockpit einen rein lokalen Umschalter für CFO, Buchhaltung, Berater und Prüfer. Dieser Umschalter war nicht an eine Projektmitgliedschaft gebunden.
- Aufgaben referenzieren ihre Zuständigkeit über `responsible_member_id` und ergänzende E-Mail-Felder.

### Bestehendes Cockpit

- Header, LUMINA-Logo, Projektauswahl, Schnellzugriffe, Aktivitätsfeed sowie KAI/KIRA bleiben bestehen.
- Die bisherige Management-Sicht war für alle Nutzer identisch und wurde lediglich über den lokalen Rollenumschalter gefiltert.
- Das Referenzdokument `lumina-rollen-einstieg-chatgpt.html` lieferte die fachliche Informationshierarchie für die drei Einstiege; sein Rollenumschalter wurde ausdrücklich nicht übernommen.

## Implementierung

Die eigene Mitgliedschaft wird nach der Projektauswahl aus `project_members` geladen. Falls die Select-Policy für Projekteigentümer mehrere Mitgliedschaften liefert, wird ausschließlich die zum angemeldeten Nutzer passende Zeile verwendet. Die Zuordnung erfolgt deterministisch in dieser Reihenfolge:

1. `user_id` entspricht der ID des angemeldeten Nutzers.
2. `email` entspricht der Session-E-Mail.
3. `deputy_email` entspricht der Session-E-Mail.

Inaktive Mitgliedschaften werden nicht verwendet. Fehlt eine eigene Mitgliedschaft oder ist die hinterlegte Rolle keinem der drei Zielprofile zugeordnet, wird keine privilegierte Ersatzrolle gewählt.

| Zielprofil | Datenbankmerkmale | Einstieg |
|---|---|---|
| CFO | `access_level = cfo` oder CFO/Geschäftsführung/Finanzvorstand in `project_role` | Gesamtstatus, Entscheidungsbedarf, Engpässe, Prüfungsreife und Terminlage |
| Leiter Rechnungswesen | Leiter/Leitung Rechnungswesen in `project_role` | Teamsteuerung, kritische Aufgaben, Reviews, Zuordnung und Auslastung |
| Bearbeiter/Bilanzbuchhalter | Bearbeiter, Bilanzbuchhaltung oder Buchhaltung in `project_role` | „Mein Tag“, nächste eigene Aufgabe, eigene Rückfragen/Nacharbeit und persönlicher Fortschritt |

Abschlussplaner und Projektverwaltung werden erst nach Rollenauflösung eingeblendet. Der Abschlussplaner erfordert das CFO- oder Leiter-Profil zusammen mit `can_edit`; die Projektverwaltung erfordert `can_manage_members`. Diese UI-Regeln ersetzen keine serverseitige Autorisierung.

## Geänderte Dateien

- `cockpit.html`: Mitgliedschaftsauflösung, drei Einstiegsbilder, rollenabhängige Navigation und responsive Darstellung.
- `vercel.json`: Geschützte Direktpfade `/aufgaben`, `/datenraeume` und `/kommunikation` auf den bewachten Cockpit-Einstieg geführt.
- `tools/test-auth-guard.mjs`: Verhaltensprüfung für Session-Gate, fehlende Projektabfragen, Rollenstart, Abmeldung und Direktpfade.
- `tools/test-role-cockpits.mjs`: statische Regressionstests für Bindung, Profile, sicheren Fallback und fehlenden Rollenumschalter.
- `tools/test-http-smoke.mjs`: Geschützte Direktpfade in die Routenprüfung aufgenommen.
- `package.json`: Regressionstest in die vorhandene Testsuite aufgenommen.
- `docs/phase-2a-role-cockpits.md`: Bestandsaufnahme, Zielmodell und Prüfumfang.

## Sicherheits- und Scope-Grenzen

- Keine RLS-Policy wurde geändert.
- Keine Supabase-Migration wurde angelegt oder verändert.
- Es erfolgt keine Datenmutation an `project_members`.
- Es wurden keine Produktionsdaten gelesen oder verändert.
- Die Rollenauflösung steuert Darstellung und Navigation; die Datenzugriffe bleiben zusätzlich durch die bestehenden Policies begrenzt.

## Verifikation

- Syntaxprüfung aller Node-Testwerkzeuge.
- Syntaxprüfung des Inline-Skripts in `cockpit.html`.
- Verhaltensprüfung des Auth-Guards mit synthetischer Supabase-Session und protokollierten Tabellenzugriffen.
- Statischer Regressionstest für die drei Rollenprofile und das Entfernen des manuellen Rollenumschalters.
- Bestehender HTTP-Smoke-Test und RLS-Plan-Test.
- Responsive Sichtprüfung der Cockpit-Seite auf Desktop- und Mobilbreite.

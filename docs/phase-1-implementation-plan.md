# Phase 1 – Implementierungsplan für Phase 2 bis 7

Stand: verbindliche Spezifikation, 27. Juli 2026

## Zentrale Rollenresolver-Schnittstelle

Geplante Datei: `assets/role-resolver.mjs`

### `normalizeProjectRole(role)`

- Eingabe: beliebiger Rollenwert.
- Rückgabe: `{ canonicalRole, displayRole, expectedProfile }` für eine bekannte Rolle, sonst `null`.
- Normalisierung: trimmen, Unicode/Diakritika robust vergleichen, Groß-/Kleinschreibung und definierte Synonyme berücksichtigen.
- Sicherheit: keine Teilwort-Heuristik, die unbekannte Rollen privilegiert; `admin` allein erzeugt kein Profil.

### `validateCockpitProfile(profile)`

- Eingabe: beliebiger Profilwert.
- Rückgabe: normalisierter Wert aus `cfo|project|accounting_lead|worker`, sonst `null`.
- Sicherheit: kein Defaultprofil.

### `isActiveMembership(member)`

- Eingabe: eine Mitgliedschaft.
- Rückgabe: `true` nur bei `invitation_status === 'accepted'` und vorhandener `user_id`; sonst `false`.
- E-Mail oder `deputy_email` allein aktiviert keine Mitgliedschaft.

### `resolveCockpitProfile(member)`

- Eingabe: eine bereits eindeutig identifizierte Mitgliedschaft.
- Rückgabe: `{ status:'resolved', profile, canonicalRole, displayRole }` oder `{ status:'neutral', reason }`.
- Ein gespeichertes `cockpit_profile` muss gültig sein und zur normalisierten fachlichen Rolle passen.
- Fehlende, unbekannte, inaktive oder widersprüchliche Werte führen zu `neutral`, niemals zu CFO/Projektleitung.

### `classifyMemberContext(members, identity)`

- Eingaben: Mitgliedschaften des aktuellen Projekts und `{ userId, email? }`.
- Primärabgleich: ausschließlich `member.user_id === identity.userId`.
- Rückgabe als discriminated union: `active`, `inactive`, `missing`, `ambiguous` oder `unlinked`.
- Genau eine aktive, passende Pilotmitgliedschaft ergibt `active`.
- Mehrere aktive Treffer ergeben `ambiguous` und eine neutrale Sicherheitsansicht.
- Fehlende `user_id` ergibt `unlinked`; E-Mail darf nur als Diagnosehinweis dienen, nicht als Zugriffsfreigabe.
- E-Mail-Fallback ist ausschließlich in Onboarding/Provisionierung zulässig. Mehrere E-Mail-Treffer dürfen nie zusammengeführt werden.

## Aktuelle E-Mail-Fallbacks, die Phase 2/3 ablösen muss

- Cockpit-Priorisierung über `email` und `deputy_email`.
- `private.is_project_member` über Mitglieds- oder Stellvertreter-E-Mail.
- `private.can_manage_project` über Mitglieds-E-Mail.
- `private.can_access_task` und `private.can_edit_task` über `responsible_email`/`deputy_email`.
- Storage-Uploadhelper über Mitglieds- und Stellvertreter-E-Mail.
- Abschlussplaner ordnet Aufgaben momentan über Namen und E-Mail zu.

Übergangsregel: Die E-Mail darf die passende noch unverknüpfte Zeile während der kontrollierten Provisionierung finden. Erst nach Eindeutigkeitsprüfung wird `user_id` gesetzt und `invitation_status` auf `accepted` geändert.

## Phase 2 – Migration und Resolver

Geplante Änderungen:

- neue Migrationen gemäß `phase-1-schema-proposal.md`
- explizites `can_view_all_tasks` für Management-, Projektleitungs- und Teamansichten
- `assets/role-resolver.mjs`
- Resolver-Unit-Tests für 15 Rollen, vier Profile, unbekannt, inaktiv, fehlende `user_id` und Mehrdeutigkeit
- Migration-from-zero
- gezielte RLS-Tests für `accepted`, alle inaktiven Statuswerte, eigenes/fremdes Projekt und Vertretung

Keine Produktionsmigration. Anwendung zunächst nur lokal und gegen die ausdrücklich konfigurierte Testinstanz.

## Phase 3 – bestehende Cockpitintegration

- `cockpit.html` importiert den zentralen Resolver.
- Projektleitungs-Cockpit wird innerhalb der bestehenden Komponenten ergänzt.
- alle operativen Rollen starten mit „Mein Tag – <fachliche Rolle>“.
- bei neutralem Resolverzustand werden vor jeder Projektabfrage geschützte Navigation und Projekt-DOM entfernt.
- Adminnavigation bleibt ausschließlich an `can_manage_members` gebunden.
- CFO erhält kein globales oder technisches Adminrecht aus dem Profil.

## Phase 4 – Onboarding und Konfiguration

- `abschlussplaner.html` erfasst Anzeigenamen, eindeutige E-Mail, Rolle, vorgeschlagenes Profil, Stellvertreter und Lifecycle-Status.
- versionierbare Datei `config/lumina-test-users.json` enthält die 30 nicht geheimen Testidentitäten.
- Haupt- und Stellvertreter werden als getrennte Mitgliedschaften vorbereitet.
- Vertretungsbeziehungen werden getrennt von Identitäten erzeugt.
- Browsercode legt weiterhin keine Auth-Benutzer mit Service-Role-Rechten an.

## Phase 5 – lokale Provisionierung

Geplante Datei: `tools/provision-lumina-test-users.mjs`.

- verlangt `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LUMINA_TEST_PASSWORD`, erwartete Test-Project-Ref und Zielprojekt
- blockiert Produktions-Ref `mslbzypjtvvznyewupco`
- zeigt die ermittelte Ziel-Ref und verlangt exakte interaktive Bestätigung
- unterstützt `--dry-run` und einen separaten Passwortänderungsschalter
- erstellt fehlende Auth-Benutzer, verwendet vorhandene Testbenutzer kontrolliert weiter und setzt keine bestehenden Passwörter ohne Schalter zurück
- verknüpft `auth.users.id` eindeutig mit `project_members.user_id`
- aktiviert erst nach erfolgreicher Verknüpfung mit `accepted`
- erzeugt Vertretungsbeziehungen idempotent
- gibt nur nicht geheime Statusdaten aus

## Phase 6 – Tests

- Rollen-Normalisierung für jede der 15 Rollen
- vier Profile und neutrale Zustände
- Hauptperson und Stellvertreter
- Lifecycle-Werte `pending`, `invited`, `accepted`, `declined`, `inactive`
- eigenes und fremdes Projekt
- Aufgabenfilter Hauptperson/Stellvertretung
- kein Admin für Worker oder CFO ohne Flag
- Projektleitung nur mit ausdrücklich gesetzten Verwaltungsrechten
- Wirtschaftsprüfung ohne interne Inhalte
- Manipulation von `user_id`, `project_id`, `project_role`, `cockpit_profile` und Berechtigungsflags
- Provisionierung idempotent, Dry Run schreibfrei, Produktions-Ref blockiert, Secrets fehlen => sauberer Abbruch
- manueller E2E-Leitfaden für den vollständigen Abschlussprozess

## Phase 7 – Abschluss und späterer Auditor-Ausbau

- vollständiger Secret-Scan, Git-Diff und Testergebnisse
- noch keine breite Auditor-RLS ohne gesondert freigegebene Inhaltsklassifikation
- Mehrfachrollen später über mehrere explizite Rollenbeziehungen oder eine eigene Zuordnungstabelle; nicht über heuristische Zusammenführung im Resolver

## Offene fachliche Entscheidungen

Phase 2 kann ohne weitere Annahmen beginnen. Vor Phase 3/4 sind nur folgende Produktentscheidungen erforderlich:

1. Soll der CFO-Testnutzer `can_manage_members` ausdrücklich erhalten? Standard dieser Spezifikation ist **Nein**, obwohl die Excel-Datei derzeit „Ja“ enthält.
2. Soll der Projektleitungs-Stellvertreter Mitglieder verwalten dürfen? Standard ist **Nein**; nur die Hauptperson erhält das explizite Flag.
3. Welche Accounting-Lead-Nutzer dürfen Aufgaben neu zuweisen oder Datenräume verwalten? Standard ist **nur mit Zusatzberechtigung**.
4. Welche Inhalte dürfen an Wirtschaftsprüfung freigegeben werden? Dies erfordert ein separates Klassifikations- und Freigabemodell.

## Hauptrisiken

- Bestehende RLS behandelt derzeit auch `pending`, `invited` und `declined` als Mitgliedschaft.
- Inaktive Manager können in der aktuellen Helferfunktion weiter als Projektverwalter gelten.
- Entfernen des E-Mail-Fallbacks vor vollständiger `user_id`-Verknüpfung würde legitime Altzugänge sperren; Rolloutreihenfolge ist kritisch.
- Die breite heutige Projektmitgliedschaftslese-Policy passt nicht zum aufgabenzentrierten Worker-Modell.
- Eine Prüferfreigabe nur über UI-Verbergen wäre unzureichend; Datenklassifikation und RLS müssen gemeinsam folgen.
- Direkte, mehrstufige Browserveröffentlichung kann Teilzustände erzeugen und sollte später durch kontrollierte serverseitige Operationen ersetzt werden.

## Empfehlung für Phase 2

Phase 2 soll zunächst nur die beiden additiven Migrationen, den zentralen Resolver und die dazugehörigen lokalen/Testinstanz-Tests implementieren. Die Reihenfolge lautet:

1. Schema additiv erweitern und Rollen deterministisch backfillen.
2. Resolver mit Fail-Closed-Verhalten implementieren und vollständig unit-testen.
3. 30 Mitgliedschaften in der Testinstanz vorbereiten/provisionieren, bevor E-Mail-RLS entfernt wird.
4. Accepted-/`user_id`-basierte Policies ausschließlich auf der Testinstanz aktivieren.
5. Migration-from-zero, Lifecycle-, Mandanten-, Vertretungs- und Privilegtests bestehen lassen.
6. Erst danach Cockpit und Onboarding in Phase 3/4 umstellen.

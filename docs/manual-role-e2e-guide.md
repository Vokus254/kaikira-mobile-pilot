# Manueller Rollen-E2E-Leitfaden

Stand: Phase 4, lokale Vorbereitung. Zielsystem für spätere Tests: `vcozprjecsprgyeqfahn` (LUMINA Remote-Test). Produktion `mslbzypjtvvznyewupco` ist ausgeschlossen.

## Voraussetzungen

- Catch-all-Empfang separat nachweisen; er ist aktuell **nicht verifiziert**.
- `config/lumina-test-users.json` muss unverändert validieren.
- Die 30 Auth-Nutzer und Mitgliedschaften dürfen erst nach geprüftem Dry Run und der exakten Freigabe `BESTÄTIGE PROVISIONIERUNG vcozprjecsprgyeqfahn` angelegt werden.
- Das gemeinsame Testpasswort wird ausschließlich lokal aus `LUMINA_TEST_PASSWORD` gelesen und weder notiert noch protokolliert.

## Catch-all-Nachweis vor der Provisionierung

1. Eine Nachricht an `catchall-test-01@volkerkusch.de` senden.
2. Eingang im Postfach `info@volkerkusch.de` bestätigen.
3. Im vollständigen Mailheader prüfen, dass die ursprüngliche Empfängeradresse `catchall-test-01@volkerkusch.de` erhalten ist.
4. Zeitpunkt, Absender, Ergebnis und Header-Nachweis in einem nicht versionierten Prüfprotokoll festhalten.

Der Test darf nicht durch die spätere Existenz eines gleichnamigen Supabase-Auth-Nutzers ersetzt werden. Catch-all-Empfang und Auth-Identität sind getrennte Sachverhalte.

## Loginmatrix

Für jede der 15 Hauptadressen aus der Konfiguration:

1. Mit E-Mail und Testpasswort anmelden.
2. Projekt- und Rollenanzeige prüfen.
3. Erwartetes Cockpit prüfen: CFO → `cfo`, Projektleitung → `project`, Leitung Rechnungswesen → `accounting_lead`, alle übrigen Rollen → `worker`.
4. Sichtbare Aufgaben gegen eigene Zuständigkeit und `can_view_all_tasks` prüfen.
5. Direkten Aufruf von `/cockpit`, `/aufgaben`, `/datenraeume` und `/kommunikation` nach Login prüfen.
6. Abmelden und bestätigen, dass geschützte UI sofort verschwindet.
7. Erneut anmelden und identische Rolle/Projektzuordnung bestätigen.

Mindestens für `cfo2`, `projektleitung2`, `leitung-rewe2`, `bilanzbuchhaltung2` und `wirtschaftspruefung2` zusätzlich:

- Eigene Auth-Identität und eigene `project_members`-Zeile prüfen.
- Kennzeichnung „Stellvertretung“ und aktive Beziehung zur richtigen Hauptperson prüfen.
- Zugriff nur im selben Projekt und nur im Umfang der Stellvertreterrechte prüfen.

## Negative und besondere Nachweise

- Falsches Passwort: neutrale Fehlermeldung, keine Aussage zur Existenz der E-Mail.
- Passwort-Reset: Zustellung über den manuell bestätigten Catch-all-Weg; Recovery-Seite nur mit gültigem Recovery-Flow.
- Worker: keine Adminnavigation und keine fremden Projektdaten.
- CFO: keine Mitgliederverwaltung, weil `can_manage_members = false`.
- Projektleitung Hauptperson: Mitgliederverwaltung nur für die ausdrücklich konfigurierte Hauptperson.
- Projektleitung Stellvertretung: keine Mitgliederverwaltung.
- Wirtschaftsprüfung: kein Upload, keine Bearbeitung, keine Freigabe, keine Mitgliederverwaltung und keine internen Managementbereiche.

## Ergebnisprotokoll

Je Identität festhalten: E-Mail, Rolle, erwartetes/angezeigtes Cockpit, Projekt, Stellvertretungsstatus, Login, Logout, Fremddatenprüfung, Ergebnis und Abweichung. Bis dieser Lauf gegen die getrennte Testinstanz erfolgt ist, bleiben die manuellen Loginfälle **nicht verifiziert**.

# Phase 4 – Onboarding und sichere Testnutzer-Provisionierung

## 1. Ausgangsstand

- Branch: `codex/phase-2-role-security`
- Phase-2-HEAD: `45d480a0e80dd6407fb7914eea8dc12d2dfdd0d6`
- separat gesicherter Phase-3-Commit: `1609257 feat: integrate role-specific cockpit experiences`
- `.gitignore` war bereits lokal verändert und wurde weder in den Phase-3-Commit aufgenommen noch in Phase 4 verändert.

## 2. Geänderte Dateien

- `abschlussplaner.html`: kontrollierte Mapping-Vorschau, explizite Bestätigung, Profile/Rechte, getrennte vorbereitete Mitgliedschaften und Stellvertretungsbeziehungen.
- `config/lumina-test-users.json`: versionierbare Matrix ohne Secrets.
- `assets/test-user-onboarding.mjs`: Mapping und Planervalidierung.
- `assets/test-user-provisioning.mjs`: gemeinsame sichere Planungs-, Validierungs- und Cleanup-Logik.
- `tools/provision-lumina-test-users.mjs`: lokaler Dry-Run/Apply/Cleanup-Client.
- `tests/test-user-onboarding.test.mjs` und `tests/provision-lumina-test-users.test.mjs`: automatisierte Nachweise.
- `package.json`: Einbindung beider Tests in `npm test`.
- `docs/manual-role-e2e-guide.md`: manueller Rollen-, Login- und Catch-all-Test.

## 3. Testidentitätsmatrix

Die Konfiguration enthält exakt 30 eindeutige `@volkerkusch.de`-Adressen: 15 Hauptpersonen und 15 Stellvertreter. Die Hauptrollen sind CFO/Geschäftsführung, Projektleitung Abschluss, Leiter Rechnungswesen, Bilanzbuchhaltung, Controlling, Externe Beratung, IT, Investor Relations, Konsolidierung, Nachhaltigkeit, Personal/HR, Recht, Steuern, Treasury und Wirtschaftsprüfung.

Vier Cockpitprofile werden zentral aufgelöst: `cfo`, `project`, `accounting_lead` und `worker`. Jede Stellvertretung verweist per `principal_email` auf genau eine Hauptperson derselben Rolle.

## 4. Onboarding-Anpassungen

Der bestehende Abschlussplaner wurde erweitert; es wurde keine Parallelseite angelegt. Die Aktion „Testidentitäten zuordnen“ zeigt 30 Zeilen im Format „alte Adresse → neue Testadresse → Rolle → Haupt/Stellvertretung“. Ohne gesetzte Bestätigungscheckbox erfolgt keine Übernahme.

Nach Bestätigung enthält der Planer 15 Hauptzeilen mit separaten Stellvertreterdaten, automatischem Profil, Einladungsstatus und jeweils sechs expliziten Berechtigungen für Hauptperson und Stellvertretung. `deputy_name` und `deputy_email` bleiben befüllt. Bei einer Browser-Veröffentlichung werden Hauptperson und Stellvertretung als getrennte, noch nicht angenommene `project_members`-Zeilen vorbereitet; ihre Beziehung wird separat in `project_member_substitutions` vorbereitet. Es werden dabei keine Auth-Nutzer angelegt und keine `user_id` fremder Nutzer zugewiesen.

## 5. Validierungsregeln

Geprüft werden: 15 Hauptrollen, eindeutige Rollen und Adressen, keine Überschneidung von Haupt-/Stellvertreteradresse, gültige Principal-Beziehung, bekannte Rolle, passendes Profil und exakte Berechtigungskombination. Worker erhalten kein `can_view_all_tasks`; CFO und Projektleitungsvertretung erhalten kein automatisches `can_manage_members`; Wirtschaftsprüfung bleibt konservativ eingeschränkt.

## 6. Lokales Provisionierungsskript

`tools/provision-lumina-test-users.mjs` liest ausschließlich die vorgegebenen Umgebungsvariablen. Ohne `--apply` arbeitet es als Dry Run. Apply verlangt die exakte interaktive Bestätigung. Fehlende Auth-Nutzer werden mit eigener UUID angelegt; vorhandene Nutzer werden nur bei exakter E-Mail-Übereinstimmung wiederverwendet. Passwörter vorhandener Nutzer werden nur mit `--update-passwords` **und** `LUMINA_ALLOW_PASSWORD_UPDATE=true` geändert.

## 7. Sicherheitsmaßnahmen

- Kein Service-Role-Key, Passwort oder Admin-Aufruf im Browser.
- Keine Secrets in JSON, Quelltext, Dokumentation oder Testausgabe.
- Konflikte bei User-ID, E-Mail oder Mitgliedschaft führen zum Abbruch statt zum Überschreiben.
- Reports kürzen UUIDs und geben keine Passwort-/Key-Werte aus.
- Keine Datenbankmigration und keine Policyänderung in Phase 4.

## 8. Project-Ref-Schutz

`mslbzypjtvvznyewupco` ist unveränderbar als Produktion blockiert. Zulässig ist ausschließlich `vcozprjecsprgyeqfahn`; zusätzlich muss `LUMINA_EXPECTED_PROJECT_REF` exakt dazu passen. Zielprojekt-ID und Project Ref werden vor einem Lauf angezeigt.

## 9. Dry-Run-Ergebnis

Der schreibfreie Ablauf wurde mit einem zustandsbehafteten Supabase-Testadapter geprüft: ohne `--apply` und mit `--dry-run` jeweils 0 Schreiboperationen. Ein echter Remote-Dry-Run gegen `vcozprjecsprgyeqfahn` wurde in diesem lokalen Umsetzungsschritt bewusst **nicht ausgeführt**; dafür werden lokal gesetzte Secrets sowie der nächste kontrollierte Remote-Schritt benötigt. Ein Remote-Apply wurde nicht ausgeführt.

## 10. Auth-Verknüpfung

Der lokale Apply-Plan erstellt fehlende Auth-Nutzer, übernimmt deren UUID und setzt sie ausschließlich in der passenden Mitgliedschaft derselben normalisierten E-Mail. E-Mail-Adressen werden klein geschrieben und getrimmt. Bestehende widersprüchliche Bindungen werden nicht repariert, sondern gemeldet.

## 11. `project_members`-Verknüpfung

Jede der 30 Identitäten erhält eine eigene Mitgliedschaft mit Rolle, Profil, `accepted` nach erfolgreicher lokaler Verknüpfung und allen sechs Berechtigungswerten aus der Konfiguration. Das Schema besitzt kein redundantes `membership_kind`; diese Planungsinformation bleibt in der Konfiguration, während die echte Stellvertretung über die Relationstabelle modelliert wird.

## 12. Stellvertretungsbeziehungen

Für jede Stellvertretung wird die Hauptmitgliedschaft eindeutig innerhalb desselben Projekts ermittelt. Angelegt oder wiederverwendet wird eine aktive Relation mit verschiedenen Principal-/Substitute-IDs. Projektfremde Beziehungen werden weder als Treffer akzeptiert noch vom Cleanup erfasst.

## 13. Idempotenz

Der automatisierte zweite Voll-Lauf erzeugt keine weiteren Auth-Nutzer, Mitgliedschaften oder Beziehungen. Korrekte bestehende Nutzer/Mitglieder werden tatsächlich als `correct` erkannt; dieser Test wurde gegenüber der ersten Fassung verschärft.

## 14. Cleanup

`--cleanup` entfernt zuerst konfigurierte Beziehungen und Mitgliedschaften. Auth-Nutzer werden nur mit `--delete-auth-users`, `--apply`, einer zweiten exakten Bestätigung und dem beim Anlegen gesetzten Metadatum `lumina_synthetic_test = true` entfernt. Ein gleichnamiger, aber nicht als synthetisch markierter Bestandsnutzer blockiert die Auth-Löschung. Auswahl und Read-back sind auf die 30 konfigurierten Adressen und das bestätigte Zielprojekt begrenzt.

## 15. Automatisierte und Browser-Tests

- Onboarding: 7/7 bestanden, Exit-Code 0.
- Provisionierung: 31/31 bestanden, Exit-Code 0.
- Syntax: 29/29 Module bestanden, Exit-Code 0.
- Browser Desktop: Vorschau 30 Zeilen, Bestätigungssperre wirksam, Übernahme 15 Hauptzeilen/15 Stellvertretungen, keine Konsolenfehler.
- Browser Mobil 390×844: kein Seitenüberlauf; die 1180 px breite Matrix scrollt innerhalb ihres 304 px breiten Containers.
- Vollständiges `npm test`: PASS, Exit-Code 0. Secret-Scan: PASS, 95 Dateien, 0 Funde, Exit-Code 0. `git diff --check`: PASS, Exit-Code 0.

## 16. Manuelle Schritte

Catch-all, 30 reale Logins, Passwort-Reset und Rollenoberflächen gegen die Remote-Testinstanz bleiben bis zur kontrollierten Provisionierung **nicht verifiziert**. Der Ablauf steht in `docs/manual-role-e2e-guide.md`.

## 17. Offene Risiken

- Catch-all-Funktion ist nicht technisch aus Supabase ableitbar und benötigt den manuellen Mailnachweis.
- Browser-Veröffentlichung bleibt von den wirksamen RLS-Regeln abhängig; sie besitzt bewusst keinen privilegierten Fallback.
- Der Remote-Bestand kann erst durch den ausdrücklich erlaubten Dry Run konfliktfrei bewertet werden.
- Keine Aussage über vollständige E2E-Funktion vor realer Provisionierung der getrennten Testinstanz.

## 18. Empfehlung für Phase 5

Nach Prüfung dieses lokalen Diffs: Secrets ausschließlich lokal setzen, Catch-all manuell nachweisen, Remote-Dry-Run gegen `vcozprjecsprgyeqfahn` ausführen und vollständig vorlegen. Erst nach der separaten exakten Freigabe darf `--apply` erfolgen; anschließend Read-back, zweiter Idempotenzlauf und manueller Rollen-E2E-Test. Produktion, Deployment und `main` bleiben dabei ausgeschlossen.

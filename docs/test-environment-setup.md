# Strikt getrennte Supabase-Testumgebung

Stand: 2026-07-26

Die lokale Schema-Baseline ist mit `npm run test:migrations` und Exit-Code 0
bestanden. Für die 420 echten RLS-Fälle wird trotzdem ein eigenes
Supabase-Cloud-Projekt benötigt. `LUMINA-FRAGEBOGEN` darf dafür weder verlinkt
noch beschrieben werden.

Aktueller Stand: Die getrennte Testinstanz ist eingerichtet. `test:env` und zwei
aufeinanderfolgende Fixture-Läufe endeten mit Exit-Code 0. Die RLS-Matrix führte
420 Fälle aus und endete mit 398 bestandenen sowie 22 abweichenden Fällen.

## 1. Neues Testprojekt anlegen

Im Supabase-Dashboard ein vollständig neues Projekt anlegen, zum Beispiel
`LUMINA-RLS-TEST`.

- keine Produktionsdaten kopieren oder importieren,
- keine bestehenden Produktionsnutzer übernehmen,
- einen eigenen Datenbank- und Auth-Kontext verwenden,
- Project Ref und API-URL müssen sich vom Produktionsprojekt unterscheiden,
- das Projekt ausschließlich für synthetische Sicherheits-Fixtures verwenden.

## 2. Lokale Secret-Datei vorbereiten

Im Repository einmalig ausführen:

```powershell
Copy-Item .env.test.example .env.test
```

`.env.test` ist durch `.gitignore` ausgeschlossen. Dort ausschließlich Werte
des neuen Testprojekts eintragen:

- `SUPABASE_TEST_URL`: API-URL des Testprojekts,
- `SUPABASE_TEST_PROJECT_REF`: Project Ref des Testprojekts,
- `SUPABASE_TEST_DB_URL`: percent-encodierte direkte oder Session-Pooler-
  PostgreSQL-Verbindung des Testprojekts,
- `SUPABASE_TEST_ANON_KEY`: Anon-Key des Testprojekts,
- `SUPABASE_TEST_SERVICE_ROLE_KEY`: Service-Role-Key des Testprojekts,
- `SUPABASE_TEST_USER_PASSWORD`: eigenes Passwort nur für synthetische Nutzer,
- `SUPABASE_TEST_EMAIL_DOMAIN`: reservierte Testdomain,
- `ALLOW_TEST_FIXTURE_WRITES=I_UNDERSTAND_TEST_ONLY`.

Keine Werte im Chat, in Screenshots, Terminalprotokollen oder Git ablegen.

## 3. Schutzprüfung ausführen

```powershell
npm run test:env
```

Erwartet: Exit-Code 0 und Status `READY`. Der Befehl gibt keine Secretwerte aus.
Fehlende Variablen, die bekannte Produktions-Project-Ref oder eine fehlende
Schreibbestätigung führen vor jedem Netzwerkzugriff zu `BLOCKED`.

## 4. Baseline ausschließlich auf TEST anwenden

Die Datenbank-URL für die aktuelle PowerShell-Sitzung aus einem sicheren lokalen
Speicher setzen, ohne sie auszugeben. Danach zuerst nur den Plan prüfen:

```powershell
npx.cmd --yes supabase@2.109.1 db push --db-url $env:SUPABASE_TEST_DB_URL --include-all --dry-run
```

Der Plan darf ausschließlich
`202607260001_remote_schema_baseline.sql` für das neue Testprojekt nennen. Erst
danach auf dieselbe explizite Test-URL anwenden:

```powershell
npx.cmd --yes supabase@2.109.1 db push --db-url $env:SUPABASE_TEST_DB_URL --include-all
```

Dabei bewusst weder `--linked` noch `migration repair` verwenden. Das bestehende
Repository-Linking zum Produktionsprojekt bleibt unangetastet.

## 5. Synthetische Identitäten und Fixtures erzeugen

```powershell
npm run test:fixtures
```

Erwartet werden sechs synthetische Auth-Nutzer, Anonymous als siebte Identität,
Projekt A, Projekt B und ausschließlich synthetische Tabellen- und
Storage-Fixtures. Der lokale Zustand wird in der ignorierten Datei
`.test-state/fixtures.json` gespeichert.

Der Aufbau ist idempotent: Vor jedem Lauf werden ausschließlich die bekannten
synthetischen IDs und Storage-Pfade entfernt. Bei einem Fehler werden diese
Datensätze, die Statusdatei und die synthetischen Auth-Nutzer erneut
kontrolliert bereinigt. Ein zweiter erfolgreicher Lauf ist die verbindliche
Idempotenzprüfung.

## 6. RLS-Matrix ausführen

```powershell
npm run test:rls
```

Der Bericht muss 420 ausgeführte Fälle sowie numerische Werte für erlaubte und
abgelehnte Zugriffe liefern. PASS gilt nur bei null Fehlfällen. Insbesondere
werden direkte fremde UUIDs, projektübergreifende Zugriffe, Anonymous sowie
SELECT, INSERT, UPDATE und DELETE geprüft.

## 7. Ergebnis und Aufräumen

- JSON-Ausgabe ohne Secrets archivieren,
- bei Fehlern zuerst Policy und erwartetes Modell vergleichen,
- keine fehlgeschlagene Erwartung durch Lockerung des Testguards umgehen,
- das separate Testprojekt nach Abschluss im Supabase-Dashboard pausieren oder
  löschen, sofern es nicht für Wiederholungsläufe benötigt wird,
- niemals Fixtures oder Testnutzer nach `LUMINA-FRAGEBOGEN` übertragen.

## Schutzmechanismen

- bekannte Produktions-Project-Refs stehen in einer Denylist,
- URL und Project Ref werden beide geprüft,
- Service-Role-, Datenbank- und Passwortwerte werden nie geloggt,
- `.env.test` und `.test-state/` sind von Git ausgeschlossen,
- Fixtures verwenden ausschließlich synthetische Namen, E-Mails und UUIDs,
- ohne vollständige Variablen oder Schreibbestätigung endet der Befehl vor dem
  ersten schreibenden Netzwerkzugriff mit Status `BLOCKED`.

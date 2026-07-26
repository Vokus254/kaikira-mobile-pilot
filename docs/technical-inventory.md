# Phase-0: Technisches Inventar

Stand: 2026-07-26 (Europe/Berlin)

## Unveränderter Ausgangspunkt

- GitHub: `https://github.com/Vokus254/kaikira-mobile-pilot.git`
- Ausgangs-Commit: `f2ffdcd5a65b6b8160c0e2a988a9211d6e5a2481`
- Ausgangsbranch: `main`, sauber und identisch mit `origin/main`
- Arbeitsbranch: `codex/phase-0-inventory`, direkt von diesem Commit erstellt
- Remote: `origin` für Fetch und Push auf das oben genannte Repository
- Es wurde nicht gepusht, deployed oder eine Datenbankmigration angewandt.

Vor jeder lokalen Änderung wurden Commit, Branch, Status und Remotes erfasst. Lokale Service-Metadaten (`.vercel/`, `.env.local`, `supabase/.temp/` und die von Vercel erzeugte untracked `.gitignore`) sind nur über `.git/info/exclude` ausgeblendet und nicht Teil des Branch-Diffs.

## Branches

| Ref | Commit | Einordnung |
| --- | --- | --- |
| `origin/main` | `f2ffdcd` | Produktionsbranch beider Vercel-Projekte |
| `origin/vercel/install-vercel-web-analytics-yw90g6` | `f436180` | Nicht gemergter Vercel-Analytics-Branch; enthält unter anderem `package.json` und Analytics-Änderungen |
| `origin/vercel/vercel-web-analytics-to-projec-o1e8yg` | `586a765` | Weiterer Vercel-Integrationsbranch |

Es existieren keine Tags.

## Architektur und Repository-Struktur

Das Projekt ist eine statische, dateibasierte HTML/CSS/JavaScript-Anwendung ohne `package.json` auf `main`. Es gibt keinen Bundler, kein Komponentenframework und keinen regulären Paketmanager-Build. Supabase JS und XLSX werden auf den Anwendungsseiten per CDN geladen.

| Pfad | Aufgabe |
| --- | --- |
| `index.html` | Öffentliche LUMINA-Landingpage, Potenzialrechner, Demo-/Kontaktlogik und Vercel Analytics/Speed Insights |
| `cockpit.html` | Management-Cockpit, Rollenansichten und überwiegend lesende Supabase-Auswertungen |
| `abschlussplaner.html` | Projektanlage, Team, Aufgaben und Datenraumstruktur; umfangreiche Supabase-Schreibstrecke |
| `admin.html` | Admin-Cockpit; Tasks und Datenraumordner lesen und verändern |
| `task.html` | Operativer Aufgabenraum mit Kommentaren, Review Notes, Freigaben, Aktivitäten und Dokument-Upload |
| `lumina-cockpit-demo.html` | Statische Cockpit-Demo |
| `reporting/index39-template.html` | Generiertes, rund 1,1 MB großes Reporting-Template mit zwölf Berichtsseiten |
| `supabase/migrations/202607200001_task_workspace.sql` | Einzige versionierte lokale Migration; remote nicht angewandt |
| `tools/test-financial-pipeline.mjs` | Vorhandener Node-Test für einen früheren/anderen `index.html`-Scriptaufbau; derzeit fehlschlagend |
| `tools/convert-test-workbooks.mjs` | Konvertierungshilfe für XLSX-Testdateien; benötigt `@oai/artifact-tool` und Argumente |
| `tools/build-index39-template.mjs` | Generiert das Reporting-Template aus einer historischen Git-Revision und verändert dabei eine fachliche Datei |
| `Testdateien/Test 2/` | CSV-/XLSX-Testdaten für SuSa, Berichtsstruktur und Mapping |
| `vercel.json` | Clean URLs, keine Trailing Slashes, global `Cache-Control: no-store` |

## Start- und Buildmöglichkeiten

Empfohlener lokaler Start:

```powershell
npx.cmd --yes vercel@latest dev --yes --listen 127.0.0.1:3100 --no-color
```

Damit werden die in `vercel.json` konfigurierten Clean URLs korrekt simuliert. Ein einfacher statischer Server wäre möglich, bildet diese Redirect-/Routingregeln aber nicht vollständig ab.

Lokaler Preview-Build:

```powershell
npx.cmd --yes vercel@latest pull --yes --environment preview --no-color
npx.cmd --yes vercel@latest build --yes --no-color
```

Der zweite Befehl war nach dem Pull erfolgreich. Es wurde kein `vercel deploy` ausgeführt.

## Vercel-Inventar

Der lokale Ordner ist mit `lumina21/kaikira-mobile-pilot-v2-3` verbunden.

| Projekt | GitHub-Repository | Production Branch | Produktionsdomains |
| --- | --- | --- | --- |
| `kaikira-mobile-pilot-v2-3` | `Vokus254/kaikira-mobile-pilot` | `main` | `lumina.volkerkusch.de`, `kaikira-mobile-pilot-v2-3.vercel.app`, Team- und Branch-Alias |
| `kaikira-mobile-pilot` | `Vokus254/kaikira-mobile-pilot` | `main` | `kaikira-mobile-pilot.vercel.app`, Team- und Branch-Alias |

Beide Projekte verwenden Framework-Preset `Other`, Root Directory `.`, Node.js 24.x und deployen derzeit denselben Produktionsbranch. Dadurch kann ein Push nach `main` zwei Produktionsdeployments auslösen. In Phase 0 erfolgte kein Push.

## Environment-Konfiguration (nur Namen)

- Beide Vercel-Projekte: keine projektseitigen Environment-Variablen vorhanden.
- Lokale, von Vercel erzeugte Datei: nur `VERCEL_OIDC_TOKEN`; Wert wurde nicht ausgegeben und die Datei ist ignoriert.
- Repository: keine getrackte `.env`-Datei.
- Frontend-Konstanten: `SUPABASE_URL` und `SUPABASE_ANON_KEY` sind in mehreren HTML-Dateien eingebettet. Der Anon-Key ist für Browserverwendung bestimmt, die Duplizierung erschwert aber Rotation und Umgebungswechsel.
- `CONTACT_ENDPOINT` in `index.html` ist leer; der Kontaktflow fällt deshalb auf das lokale E-Mail-Programm zurück.
- Es wurden keine geheimen Werte in diese Dokumentation übernommen.

## Visuelle Baseline

- Öffentliche Landingpage: LUMINA-Header, Hero und Management-Beispiel rendern erwartungsgemäß.
- Cockpit: Header, Management-Cockpit und Rollen `CFO`, `Buchhaltung`, `Berater`, `Prüfer` sichtbar; kein horizontaler Überlauf im geprüften Desktop-Viewport.
- Admin: Header und Inhalte sichtbar; bereits im Ausgangsstand horizontaler Seitenüberlauf durch die breite Admin-Tabelle.
- Browserkonsole bei der read-only Prüfung: keine Warnungen oder Fehler.
- Es wurden keine Formulare abgeschickt, Logins ausgelöst oder Daten geschrieben.

## Wesentliche Phase-0-Risiken

1. Die Datenbank ist nicht vollständig durch die einzige lokale Migration reproduzierbar; Remote-Schema und Git-Migrationshistorie sind deutlich auseinander.
2. Die lokale Migration ist mit dem aktuell verbundenen Remote-Schema nicht direkt kompatibel. Details stehen in `database-inventory.md`.
3. Zwei Vercel-Projekte deployen `main`; Produktionsauswirkungen eines späteren Pushs müssen daher für beide Projekte geprüft werden.
4. Der einzige fachliche Node-Test ist rot und an den aktuellen Scriptaufbau von `index.html` nicht angepasst.
5. Es gibt keine automatisierten Browser-, Auth-, RLS-, Storage- oder End-to-End-Tests.
6. Der Admin-Desktop-Viewport weist bereits vor Änderungen horizontalen Überlauf auf.

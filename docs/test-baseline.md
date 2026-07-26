# Phase-0: Test-Baseline

Stand: 2026-07-26, Windows, Node.js `v22.17.1`, Supabase CLI `2.109.1`, Vercel CLI `57.0.0`.

## Ausgeführte Befehle

| Befehl | Exit-Code | Ergebnis |
| --- | ---: | --- |
| `node --check tools/test-financial-pipeline.mjs` | 0 | Syntax gültig |
| `node --check tools/convert-test-workbooks.mjs` | 0 | Syntax gültig |
| `node --check tools/build-index39-template.mjs` | 0 | Syntax gültig |
| `node tools/test-financial-pipeline.mjs` | 1 | Fehlgeschlagen: `window.projectData` ist in Zeile 57 `undefined` |
| `npx.cmd --yes vercel@latest build --no-color` | 1 | Erwartbarer Setupfehler: lokale Project Settings fehlten vor dem Pull |
| `npx.cmd --yes vercel@latest pull --yes --environment preview --no-color` | 0 | Preview-Settings lokal geladen; keine Secrets protokolliert |
| `npx.cmd --yes vercel@latest build --yes --no-color` | 0 | Lokaler Preview-Build erfolgreich, Ausgabe `.vercel/output`; kein Deployment |
| Lokaler HTTP-Smoke-Lauf über neun URLs | 1 | Acht Kernseiten 200; explizite `.html`-URL des Reporting-Templates lieferte den erwarteten 308-Clean-URL-Redirect |
| HTTP-Follow-up `/reporting/index39-template` | 0 | 200, rund 1,1 MB ausgeliefert |

Der lokale Vercel-Entwicklungsserver wurde erfolgreich auf `127.0.0.1:3100` gestartet und nach den Prüfungen manuell mit `Ctrl+C` beendet. Der Abbruchprozess endet technisch mit Exit 1 und ist kein Anwendungsfehler.

## Ursache des vorhandenen Testfehlers

`tools/test-financial-pipeline.mjs` extrahiert alle Inline-`<script>`-Blöcke aus `index.html` und führt fest `scripts[0]` sowie `scripts[1]` als fachliche Anwendungsscripts aus. Die aktuelle `index.html` beginnt jedoch mit Vercel Analytics/Speed-Insights-Scripts und ist inhaltlich eine Landingpage. Dadurch wird `window.projectData` nicht initialisiert, bevor der Test darauf zugreift.

Zusätzlich erwartet der Test umfangreiche Reporting-, Task-Workspace- und Importfunktionen, die nicht dem aktuell ausgeführten Landingpage-Script an diesen Positionen entsprechen. Der Test ist deshalb als „vorhanden, aber Baseline rot“ dokumentiert. Eine Anpassung oder fachliche Dateiänderung erfolgte nicht.

## HTTP-Smoke-Ergebnisse

Folgende Routen lieferten lokal Status 200:

- `/`
- `/cockpit`
- `/admin`
- `/abschlussplaner`
- `/task`
- `/datenschutz`
- `/impressum`
- `/lumina-cockpit-demo`
- `/reporting/index39-template`

Der 308-Redirect von `/reporting/index39-template.html` auf die Clean URL entspricht `vercel.json` und wurde im Follow-up bestätigt.

## Read-only Browser-Baseline

- Landingpage: Header/Hero und Management-Beispiel sichtbar.
- Cockpit: Header, Management-Cockpit und vier Rollen-Schaltflächen sichtbar; kein horizontaler Desktop-Overflow.
- Admin: Seite sichtbar, aber bestehender horizontaler Overflow wegen breiter Tabellen-/Filterfläche.
- Browserkonsole: keine Warnungen oder Fehler während der geprüften Navigation.
- Keine Klicks auf Mutationsaktionen, keine Formularübermittlung, kein Login und keine Datenbankoperation.

## Nicht verifiziert

- `npm test` und `npm run build`: nicht ausführbar, da auf `main` kein `package.json` vorhanden ist.
- Automatisierte UI-/E2E-Tests: nicht vorhanden.
- Mobile/responsive visuelle Regression: nicht ausgeführt.
- Authentifizierte Rollenansichten und echte Rollentrennung: nicht verifiziert.
- Supabase-RLS mit realen Testnutzern: nicht verifiziert.
- Storage Upload/Download/Delete: nicht verifiziert, weil dies Remote-Daten verändern würde.
- `tools/convert-test-workbooks.mjs`: nicht ausgeführt; benötigt Argumente und `@oai/artifact-tool`.
- `tools/build-index39-template.mjs`: bewusst nicht ausgeführt, weil es `reporting/index39-template.html` neu generiert und damit eine fachliche Datei ändern würde.
- Remote- oder Production-Deployment: nicht ausgeführt.

## Baseline-Gesamtstatus

- Git/Repository: **PASS**
- Lokaler Vercel-Preview-Build: **PASS**
- HTTP-Smoke: **PASS mit dokumentiertem Clean-URL-Redirect**
- Node-Syntax: **PASS**
- Vorhandener fachlicher Test: **FAIL**
- Auth/RLS/Storage/E2E: **NICHT VERIFIZIERT**

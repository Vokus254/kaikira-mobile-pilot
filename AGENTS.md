# Codex – Arbeitsmodus für das Projekt KaiKira

Arbeite im Projektordner:
`C:\Users\vkusc\Documents\Claude\KaiKira-Mobile-App`

Die zentrale Hauptdatei ist:
`index.html`

## Wichtige Arbeitsregel: Keine technischen Erlaubnisfragen

Du sollst mich nicht um technische Zustimmung oder Erlaubnis bitten, bevor du normale Entwicklungsarbeiten ausführst.
Ich möchte insbesondere keine Unterbrechungen durch Fragen oder Buttons wie:

- „Darf ich diese Datei ändern?"
- „Soll ich den Code jetzt schreiben?"
- „Darf ich den Befehl ausführen?"
- „Soll ich die Datei speichern?"
- „Soll ich diese Änderung anwenden?"
- „Darf ich mehrere Dateien bearbeiten?"
- „Soll ich fortfahren?"
- „Möchtest du die Änderungen übernehmen?"
- „Darf ich Tests ausführen?"
- „Darf ich Git verwenden?"
- „Darf ich committen?"

Wenn ich dir eine Entwicklungsaufgabe erteile, gilt die technische Erlaubnis zur notwendigen Umsetzung grundsätzlich als erteilt.

Du sollst dann selbstständig:

- den bestehenden Code analysieren,
- relevante Dateien lesen,
- benötigte Änderungen durchführen,
- Dateien speichern,
- technisch notwendige Hilfsdateien anlegen oder ändern,
- bestehende Funktionen refaktorieren,
- Fehler beheben,
- Tests und lokale Prüfungen ausführen,
- Syntax und Funktionsfähigkeit prüfen,
- Git-Diffs prüfen,
- und die Umsetzung vollständig bis zu einem sinnvoll abgeschlossenen Stand durchführen.

## Inhaltliche Rückfragen sind ausdrücklich erlaubt

Du sollst mich weiterhin fragen, wenn eine fachliche oder produktseitige Entscheidung nicht eindeutig ist.

Beispiele:

- Soll KIRA einen Vorgang blockieren oder nur warnen?
- Soll der Anlagenspiegel nach HGB oder IFRS aufgebaut werden?
- Welche Nutzerrolle darf eine Freigabe erteilen?
- Welche der zwei fachlich unterschiedlichen Varianten bevorzuge ich?
- Soll eine Funktion bewusst anders funktionieren als bisher?

Hier darfst und sollst du nachfragen, wenn meine Entscheidung für das Produkt notwendig ist.

## Technische Entscheidungen triffst du selbst

Bei rein technischen Fragen entscheide selbst nach professionellen Softwareentwicklungsprinzipien.

Beispiele:

- Welche Funktion muss angepasst werden?
- Wie soll der Code strukturiert werden?
- Ist Refactoring erforderlich?
- Welche CSS-Regel verursacht das Problem?
- Welche JavaScript-Funktion ist besser geeignet?
- Muss eine bestehende Funktion ersetzt oder erweitert werden?
- Welche Dateien müssen geändert werden?
- Welche Tests sind sinnvoll?

Ich kann technische Implementierungsdetails nicht zuverlässig beurteilen. Deshalb sollst du diese Entscheidungen selbst treffen.

## Transparenz statt Erlaubnis

Anstatt vorher um Erlaubnis zu fragen, informierst du mich nach der Umsetzung präzise darüber:

1. Was du untersucht hast.
2. Was die Ursache war.
3. Welche Dateien du geändert hast.
4. Welche Funktionen oder Codebereiche du verändert hast.
5. Warum du diese Lösung gewählt hast.
6. Welche Tests oder Prüfungen du durchgeführt hast.
7. Welche Risiken oder offenen Punkte noch bestehen.

Ich beurteile die Umsetzung anhand dieser Informationen und des sichtbaren Ergebnisses.

## Ausnahme: Keine irreversiblen oder externen Aktionen ohne ausdrücklichen Auftrag

Ohne ausdrücklichen Auftrag sollst du keine Aktionen durchführen, die über die normale lokale Projektentwicklung hinausgehen, insbesondere:

- produktive Daten löschen,
- Datenbanken zurücksetzen,
- Secrets oder Zugangsdaten verändern,
- produktive Systeme verändern,
- kostenpflichtige externe Dienste auslösen,
- Deployments in Produktion starten,
- fremde Daten überschreiben.

Git-Commits darfst du durchführen, wenn ich dir ausdrücklich sage, dass du committen sollst. Ein Push auf ein Remote-Repository erfolgt nur, wenn dies Bestandteil meines Auftrags ist.

## Grundprinzip

Bei technischen Umsetzungsaufträgen: nicht fragen – analysieren, entscheiden, umsetzen, prüfen und anschließend berichten.
Bei fachlich unklaren Produktentscheidungen: nachfragen.

Mein Ziel ist ein flüssiger Entwicklungsprozess ohne ständige technische Zustimmungsunterbrechungen.

## Dauerhafte Veröffentlichungsstrecke

Nach jedem erfolgreich abgeschlossenen Coding-Auftrag führt Codex die vollständige Veröffentlichungsstrecke aus:

1. Tests durchführen.
2. Git-Diff vollständig prüfen.
3. Nur beabsichtigte Dateien committen.
4. Zum konfigurierten GitHub-Produktionsbranch pushen.
5. Das automatische Vercel-Deployment abwarten.
6. Die Produktions-URL prüfen.
7. Den Auftrag erst danach als vollständig abgeschlossen melden.

Diese Strecke darf nur ausgesetzt werden, wenn:

- der Nutzer Push oder Deployment ausdrücklich untersagt,
- Tests fehlschlagen,
- die erforderliche Authentifizierung fehlt,
- Branch Protection eine externe Freigabe verlangt,
- oder der Auftrag ausdrücklich nur Analyse oder Review umfasst.

Der verbindliche Ablauf lautet:

`ÄNDERN → TESTEN → COMMITTEN → PUSHEN → VERCEL ABWARTEN → LIVE-APP PRÜFEN → BERICHTEN`

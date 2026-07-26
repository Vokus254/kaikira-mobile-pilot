# Phase 1A: Bewertung anonymer Test-Policies

Die folgenden Policies sind im Remote-Schema vorhanden. Sie wurden in Phase 1A
nicht entfernt oder remote verändert.

| Policy | Ressource | Operation | Statisch erlaubter Zugriff | Vorgesehener Ersatz |
| --- | --- | --- | --- | --- |
| `Testzugriff Dokumente anlegen` | `public.documents` | INSERT | `anon` und `authenticated`, `WITH CHECK true` | Bestehende authentifizierte Policy `Berechtigte legen Dokumentmetadaten an`; anonyme Policy nach grünem Test entfernen |
| `Testzugriff Dokumente lesen` | `public.documents` | SELECT | `anon` und `authenticated`, `USING true` | Bestehende Policy `Berechtigte sehen Dokumentmetadaten`; anonyme Policy nach grünem Test entfernen |
| `Testzugriff Kommentare anlegen` | `public.task_comments` | INSERT | `anon` und `authenticated`, `WITH CHECK true` | Bestehende Policy `Berechtigte erfassen Kommentare`; Testpolicy nach grünem Test entfernen |
| `Testzugriff Antworten anlegen` | `public.task_responses` | INSERT | `anon` und `authenticated`, `WITH CHECK true` | Bestehende Policy `Berechtigte erfassen Aufgabenreaktionen`; Testpolicy nach grünem Test entfernen |
| `Testzugriff Dateien hochladen` | `storage.objects` | INSERT | `anon` und `authenticated` für Bucket `lumina-datarooms` | Bestehende mitgliedsgebundene Upload-Policy; Testpolicy nach grünem Storage-Test entfernen |
| `Testzugriff Dateien lesen` | `storage.objects` | SELECT | `anon` und `authenticated` für Bucket `lumina-datarooms` | Bestehende mitgliedsgebundene Lese-Policy; Testpolicy nach grünem Storage-Test entfernen |

## Bewertung

Die Definitionen erlauben statisch anonyme Zugriffe, die das sonstige
projektgebundene RLS-Modell umgehen. Ein tatsächlicher Live-Nachweis wurde nicht
gegen Produktion durchgeführt. Deshalb wird noch keine Sicherheitsmigration als
bewiesen wirksam oder produktionsreif bezeichnet.

Die RLS-Matrix enthält für alle sechs Policies explizite Anonymous-Fälle und
misst sichtbare Zeilen beziehungsweise erfolgreiche/abgelehnte Mutationen.

## Minimaler späterer Migrationsvorschlag

Nach einem grünen Live-Test in der getrennten Testinstanz soll eine eigene kleine
Migration ausschließlich diese sechs `Testzugriff`-Policies droppen. Die bereits
vorhandenen authentifizierten Ersatzpolicies bleiben bestehen. Diese Migration
wurde in Phase 1A noch nicht angelegt, weil der tatsächliche Zugriff noch nicht
in einer freigegebenen Testinstanz ausgeführt wurde.

## Numerische Testabdeckung

Der Plan umfasst:

- 14 Ressourcen einschließlich Storage,
- 7 Identitäten einschließlich Anonymous,
- SELECT, INSERT, UPDATE und DELETE,
- direkte bekannte UUIDs,
- Zugriff Nutzer A auf Projekt B und Nutzer B auf Projekt A,
- erwartete und tatsächliche Sichtbarkeit,
- erwartete und tatsächliche Ablehnungen.

Solange `npm run test:rls` nicht mit `PASS` und null Fehlfällen in der getrennten
Testinstanz endet, erfolgt keine Aussage „sicher“ oder „produktionsreif“.

Der am 2026-07-26 bestandene Migration-from-zero-Test bestätigt ausschließlich
die technische Reproduzierbarkeit des Schemas. Er weist keine Rollen- oder
Policy-Wirkung nach und ersetzt keinen der 420 Live-RLS-Fälle.

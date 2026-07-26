# Phase 1A: Bewertung und Entfernung anonymer Test-Policies

Stand: 27. Juli 2026

## Entfernte Policies

Die folgenden sechs permissiven Testpolicies wurden in
`202607270001_enforce_production_rls_baseline.sql` entfernt und ausschließlich
auf `LUMINA-RLS-TEST` angewandt:

| Policy | Ressource | Operation |
|---|---|---|
| `Testzugriff Dokumente anlegen` | `public.documents` | INSERT |
| `Testzugriff Dokumente lesen` | `public.documents` | SELECT |
| `Testzugriff Kommentare anlegen` | `public.task_comments` | INSERT |
| `Testzugriff Antworten anlegen` | `public.task_responses` | INSERT |
| `Testzugriff Dateien hochladen` | `storage.objects` | INSERT |
| `Testzugriff Dateien lesen` | `storage.objects` | SELECT |

Die vorhandenen fachlichen Policies für authentifizierte Identitäten bleiben
maßgeblich. Es wurde keine produktive Instanz verändert.

## Storage-Präzisierung

INSERT und UPDATE im Bucket `lumina-datarooms` verlangen jetzt eine aktive
eigene Projektmitgliedschaft mit `can_upload = true`. Der eng begrenzte Helper
`private.can_upload_to_project(uuid)` wertet diese Berechtigung als
Security-Definer aus, ohne Mitgliedslisten oder andere Projekte sichtbar zu
machen. SELECT und DELETE wurden nicht erweitert.

## Nachweise

- Anonymous: null sichtbare Dokumentzeilen.
- Anonymous: kein Download, keine Signed URL, kein Upload für ein frisches Objekt.
- Nutzer A mit `can_upload = false`: INSERT und UPDATE verweigert, Datenzustand unverändert.
- Bearbeiter mit `can_upload = true`: INSERT und UPDATE mit bestätigtem Datenzustand erlaubt.
- Migration-from-zero: Exit-Code 0.
- Temporäre Testartefakte: 0.

## Finaler RLS-Stand und offener Punkt

Die Gesamtmatrix endet mit 420/420 und null Abweichungen. RLS-079 und RLS-080
prüfen die fachlich bestätigte Ablehnung direkter UPDATE- und DELETE-Mutationen
auf fremde Mitgliedschaften. Beide Operationen verändern null Zeilen.

Es wurde keine projektübergreifende oder globale Admin-Policy erstellt. Vor einer
späteren Mitgliederverwaltung ist eine sichere, projektgebundene RPC oder Edge
Function als separates Arbeitspaket umzusetzen. Die SELECT-Policy bleibt
unverändert; direkte Tabellenmutationen bleiben für Browserclients gesperrt.

# LUMINA Rollen- und Testidentitätenmatrix

Stand: Phase 1 – verbindliche Spezifikation, 27. Juli 2026

## Verbindliche Auflösungsregeln

- Die fachliche Rolle bleibt als `project_role` sichtbar und wird nicht durch das Cockpitprofil ersetzt.
- Zulässige Cockpitprofile sind ausschließlich `cfo`, `project`, `accounting_lead` und `worker`.
- Das Profil steuert das Einstiegsbild, nicht automatisch die technische Berechtigung.
- `can_manage_members` und alle weiteren Berechtigungsfelder bleiben orthogonal zum Profil.
- Eine Mitgliedschaft ist nur mit `invitation_status = 'accepted'` aktiv.
- Nach der Provisionierung ist `project_members.user_id` die primäre Identität. E-Mail ist kein dauerhafter Zugriffsersatz.
- Jede Pilot-Testadresse besitzt genau eine primäre fachliche Rolle. Mehrdeutigkeit führt zur neutralen Sicherheitsansicht.

## Rollenmatrix

| Kanonische fachliche Rolle | Akzeptierte Schreibweisen | Cockpitprofil | Einstieg | Fachliche Anzeige |
|---|---|---|---|---|
| CFO / Geschäftsführung | CFO, Geschäftsführung, Geschaeftsfuehrung, Vorstand | `cfo` | CFO-Cockpit | CFO / Geschäftsführung |
| Projektleitung Abschluss | Projektleitung Abschluss, Projektleitung, Abschlussprojektleitung | `project` | Projektleitungs-Cockpit | Projektleitung Abschluss |
| Leiter Rechnungswesen | Leiter Rechnungswesen, Leiterin Rechnungswesen, Leitung Rechnungswesen | `accounting_lead` | Leiter-Rechnungswesen-Cockpit | Leiter Rechnungswesen |
| Bilanzbuchhaltung | Bilanzbuchhaltung, Bilanzbuchhalter, Bilanzbuchhalterin, Bearbeiter | `worker` | Mein Tag | jeweilige Originalrolle |
| Controlling | Controlling, Controller, Controllerin | `worker` | Mein Tag | Controlling |
| Externe Beratung | Externe Beratung, externer Berater, externe Beraterin, Beratung | `worker` | Mein Tag | Externe Beratung |
| IT | IT, Informationstechnologie | `worker` | Mein Tag | IT |
| Investor Relations | Investor Relations, IR | `worker` | Mein Tag | Investor Relations |
| Konsolidierung | Konsolidierung, Konzernrechnungslegung | `worker` | Mein Tag | Konsolidierung |
| Nachhaltigkeit | Nachhaltigkeit, ESG, Sustainability | `worker` | Mein Tag | Nachhaltigkeit |
| Personal / HR | Personal / HR, Personal, HR, Human Resources | `worker` | Mein Tag | Personal / HR |
| Recht | Recht, Legal, Rechtsabteilung | `worker` | Mein Tag | Recht |
| Steuern | Steuern, Tax | `worker` | Mein Tag | Steuern |
| Treasury | Treasury | `worker` | Mein Tag | Treasury |
| Wirtschaftsprüfung | Wirtschaftsprüfung, Wirtschaftspruefung, Abschlussprüfung, Prüfer, Auditor | `worker` | Mein Tag | Wirtschaftsprüfung |

Eine nicht aufgeführte, leere oder widersprüchliche Rolle ergibt kein Profil und keine Projektdatenansicht.

## Standardberechtigungen der Testidentitäten

Abkürzungen: `R` = `can_read`, `U` = `can_upload`, `E` = `can_edit`, `A` = `can_approve`, `M` = `can_manage_members`, `T` = geplantes `can_view_all_tasks`.

- Hauptperson CFO: `R,U,E,A,T`; kein `M` als Rollenstandard.
- Hauptperson Projektleitung: `R,U,E,M,T`; das `M` wird in der Konfiguration ausdrücklich gesetzt, nicht aus `project` abgeleitet.
- Hauptperson Leiter Rechnungswesen: `R,U,E,A,T`; kein `M`.
- Operative Hauptpersonen: `R,U`; Bearbeitung eigener Aufgaben folgt aus der Aufgabenzuordnung, nicht aus globalem `E`.
- Stellvertreter erhalten dieselben fachlichen Aufgabenrechte, aber standardmäßig weder `M` noch andere technische Administrationsrechte. CFO- und Rechnungswesen-Stellvertretung erhalten `A` nur für explizit zugeordnete Freigaben.
- Wirtschaftsprüfung erhält `R,U` nur für freigegebene Prüferinhalte; bis zur Inhaltsklassifikation ist dies als RLS-Erweiterungspunkt zu behandeln.

## Verbindliche 30 Testidentitäten

Nach der Provisionierung lautet `invitation_status` für alle Zeilen `accepted`. Vor erfolgreicher Auth-Verknüpfung bleiben Onboarding-Zeilen `pending` oder `invited` und damit inaktiv.

| E-Mail | Anzeigename | Fachliche Rolle | Profil | Art | Hauptperson | R | U | E | A | M | T | Status nach Provisionierung |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|
| cfo@volkerkusch.de | Udo CFO | CFO / Geschäftsführung | `cfo` | `primary` | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | `accepted` |
| cfo2@volkerkusch.de | Gerd Müller | CFO / Geschäftsführung | `cfo` | `substitute` | cfo@volkerkusch.de | ✓ | ✓ | ✓ | ✓ | – | ✓ | `accepted` |
| projektleitung@volkerkusch.de | Volker Kusch | Projektleitung Abschluss | `project` | `primary` | – | ✓ | ✓ | ✓ | – | ✓ | ✓ | `accepted` |
| projektleitung2@volkerkusch.de | Peter Projekt | Projektleitung Abschluss | `project` | `substitute` | projektleitung@volkerkusch.de | ✓ | ✓ | ✓ | – | – | ✓ | `accepted` |
| leitung-rewe@volkerkusch.de | Lars Rewe | Leiter Rechnungswesen | `accounting_lead` | `primary` | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | `accepted` |
| leitung-rewe2@volkerkusch.de | Ralf Bilanz | Leiter Rechnungswesen | `accounting_lead` | `substitute` | leitung-rewe@volkerkusch.de | ✓ | ✓ | ✓ | ✓ | – | ✓ | `accepted` |
| bilanzbuchhaltung@volkerkusch.de | Udo Bibu | Bilanzbuchhaltung | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| bilanzbuchhaltung2@volkerkusch.de | Dieter Debitor | Bilanzbuchhaltung | `worker` | `substitute` | bilanzbuchhaltung@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| controlling@volkerkusch.de | Kurt Control | Controlling | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| controlling2@volkerkusch.de | Mina Rett | Controlling | `worker` | `substitute` | controlling@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| beratung@volkerkusch.de | Kurt Consult | Externe Beratung | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| beratung2@volkerkusch.de | Gerda Rat | Externe Beratung | `worker` | `substitute` | beratung@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| it@volkerkusch.de | Ingo Itter | IT | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| it2@volkerkusch.de | Susanne Host | IT | `worker` | `substitute` | it@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| investor-relations@volkerkusch.de | Ingo Relator | Investor Relations | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| investor-relations2@volkerkusch.de | Wolfgang Ratt | Investor Relations | `worker` | `substitute` | investor-relations@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| konsolidierung@volkerkusch.de | Agnes Conso | Konsolidierung | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| konsolidierung2@volkerkusch.de | Erna Elimina | Konsolidierung | `worker` | `substitute` | konsolidierung@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| nachhaltigkeit@volkerkusch.de | Nora Sustain | Nachhaltigkeit | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| nachhaltigkeit2@volkerkusch.de | Simone Haltinger | Nachhaltigkeit | `worker` | `substitute` | nachhaltigkeit@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| hr@volkerkusch.de | Peter Payrol | Personal / HR | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| hr2@volkerkusch.de | Berta Lohn | Personal / HR | `worker` | `substitute` | hr@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| recht@volkerkusch.de | Ralf Law | Recht | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| recht2@volkerkusch.de | Silke Mohn | Recht | `worker` | `substitute` | recht@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| steuern@volkerkusch.de | Theo Tax | Steuern | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| steuern2@volkerkusch.de | Lasse Buchen | Steuern | `worker` | `substitute` | steuern@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| treasury@volkerkusch.de | Peter Cash | Treasury | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| treasury2@volkerkusch.de | Monika Lushi | Treasury | `worker` | `substitute` | treasury@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |
| wirtschaftspruefung@volkerkusch.de | Axel Audit | Wirtschaftsprüfung | `worker` | `primary` | – | ✓ | ✓ | – | – | – | – | `accepted` |
| wirtschaftspruefung2@volkerkusch.de | Wima Buchen | Wirtschaftsprüfung | `worker` | `substitute` | wirtschaftspruefung@volkerkusch.de | ✓ | ✓ | – | – | – | – | `accepted` |

## Excel-Abweichungen und Importregel

Die Excel-Datei enthält dieselben 15 Rollen und Namen, aber überwiegend die Sammeladresse `info@volkerkusch.de`. Beim Pilotimport werden die Adressen anhand der obigen Matrix ersetzt. Namen und fachliche Rollen bleiben erhalten. Keine Rolle wird ausgelassen; Externe Beratung bleibt auch dann als Mitgliedschaft vorhanden, wenn ihr noch keine Maßnahme zugeordnet ist.

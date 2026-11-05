# Analyse der Tesla-Zeitüberschreitung

Stand: 0.1.93, 05.11.2026.

Die laufende Version 0.1.92 meldete `Time limit reached` im Modus „Nur Tesla-Mindeststand“. Die bisherige Meldung enthielt keine Optimierungsstufe oder Suchstatistik. Aus ihr lässt sich weder Unlösbarkeit noch die konkrete langsame Stufe ableiten.

Der gemeinsame Fahrplan enthält ganzzahlige Ampere-Werte und binäre Zustände je Viertelstunde. Er löst nacheinander Ladeziel und Speicherreserve (bei „Speicher bevorzugen“ in umgekehrter Reihenfolge), danach Kosten und Ladestarts. Viele ähnliche Ladezeitfolgen können den Optimalitätsnachweis erschweren. Ein Zeitlimit bedeutet nicht zwangsläufig, dass überhaupt keine zulässige Lösung gefunden wurde; die Freigabe verlangt weiterhin den bestätigten Status innerhalb der bestehenden Toleranzen und die unabhängige physikalische Prüfung.

## Gefundene Modellschwäche

Die Startvariable war nur nach unten durch `started >= on - previous_on` begrenzt. Bei bereits laufender Ladung konnte sie unnötig 1 sein. In den ersten beiden Optimierungsstufen wird die Zahl der Starts nicht minimiert. Die Ergänzungen `started <= on` und `started <= 1 - previous_on` definieren den Einschaltwechsel eindeutig und beseitigen diese Mehrdeutigkeit. Die vorgesehenen Lade- und Schutzregeln bleiben erhalten.

## Lokaler Vergleich

Ein synthetischer Fall mit Hausakku 99 %, Tesla 30 % → 50 %, wechselnden PV-/Last-/Preisfenstern und einem angeschnittenen ersten Intervall wurde auf demselben Rechner vor und nach dieser Änderung gerechnet:

| Stufe | Vorher | Nachher |
| --- | ---: | ---: |
| Tesla-Ladeziel | 0,243 s | 0,215 s |
| Speicherreserve | 0,129 s | 0,238 s |
| Kosten und Ladestarts | 3,317 s / 343 Knoten | 0,238 s / 1 Knoten |

Einzelmessungen sind keine allgemeine Laufzeitgarantie. Der lokale Test hat die konkrete Zeitüberschreitung in HA nicht reproduziert; Rechenleistung und Eingangsdaten unterscheiden sich. Er zeigt aber, dass die Modellverschärfung die Suche deutlich vereinfachen kann.

## Weitere Diagnose

0.1.93 erhöht das Limit auf 60 Sekunden je Solve-Stufe. Bei einem Abbruch nennt das Panel Stufe, Laufzeit und Knotenanzahl; das HA-Protokoll enthält zusätzlich Zielfunktionswert, Schranke, Optimalitätslücke und Modellgröße. Erfolgreiche Pläne enthalten die Diagnosen in `solver_diagnostics`. Es wird kein zweiter Planerlauf gestartet, solange der laufende beschäftigt ist. Die Berechnung läuft weiterhin außerhalb der HA-Ereignisschleife mit einem Solver-Thread.

Erst die neue Stufendiagnose einer gegebenenfalls erneut auftretenden Zeitüberschreitung kann die langsame Stufe des tatsächlichen HA-Falls belegen. Ein Timeout führt weiterhin zur bestehenden Rückfallregelung; ein nur vorläufiges Ergebnis wird nicht ungeprüft gesteuert.

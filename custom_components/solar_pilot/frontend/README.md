# Frontend bearbeiten

Das Panel ist eine native Web Component mit Shadow DOM. Es verwendet keine
Diagrammbibliothek und keinen Build-Schritt.

## Wo ändere ich was?

| Datei | Aufgabe |
| --- | --- |
| `panel.js` | Panel-Lebenszyklus, HA-Daten, Bedienaktionen und Zusammensetzen der Kacheln |
| `panel.css` | Gestaltung, Farben, responsive Regeln und Dark Mode |
| `panel-styles.js` | Lädt das CSS einmal pro Modulversion; kein erneuter Abruf je Render |
| `consumption-chart-view.js` | SVG/HTML für Verbrauchsverlauf, Tagesbilanz und historische Vergleiche |
| `battery-chart-view.js` | Blaue SoC-Kurve, grüner/roter Abdeckungsbalken und Deckungslücken-Text |
| `view-format.js` | Gemeinsame Zahlenformatierung, HTML-Escaping und Template-Tag |
| `consumption-chart.js` | Verbrauchsdaten für die Darstellung aufbereiten |
| `battery-forecast.js` | Akku-Prognose berechnen; keine Gerätebefehle |

Die View-Funktionen erzeugen Markup. Daten und benötigte Panel-Helfer werden
als `panel` übergeben. Sie rufen keine HA-Services auf. Das `html`-Tag dient nur
der lesbaren Formatierung der Templates; dynamische Texte weiterhin explizit
mit `esc()` maskieren.

## Prüfen

Vom Repository-Verzeichnis:

```sh
python3 tools/check.py
node --test tests/*.mjs
```

`tests/test_chart_views.mjs` vergleicht vier Diagrammvarianten mit dem SVG
vor der Aufteilung (Version 0.1.40). Nur Formatierungs-Whitespace wird ignoriert.
Änderungen an Koordinaten, Farben, Werten oder Beschriftungen werden erkannt.

Bei Veröffentlichungen die Versionsparameter der geänderten JS- und CSS-Imports
aktualisieren. Die Integration liefert den gesamten `frontend`-Ordner aus.

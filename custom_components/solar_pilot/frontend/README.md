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
| `pv-benefit.js` | Einnahmen und Ersparnis aus HA-Energiestatistiken, Kalenderwochen und konfigurierten Tarifen; keine Gerätebefehle |
| `power-consumers.js` | HA-weite Leistungssensoren filtern, sortieren und als kompakte Heatmap darstellen; keine Gerätebefehle |
| `battery-history.js` | Gemessenen Akku-SoC aus Recorder-Historie aufbereiten; Lücken bleiben sichtbar |
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

## Verbraucher jetzt

Die Kachel nutzt die aktuellen HA-Zustände aller Sensoren mit W/kW und
Leistungsklasse (oder ohne Geräteklasse). Sie aktualisiert sich mit dem
HA-Zustandsstrom. Acht Messungen sind direkt sichtbar, weitere aufklappbar.
Unbekannte, nicht verfügbare, wiederhergestellte und negative Werte werden
nicht als Null dargestellt. PV-, Netz-, Speicher-, Prognose- und Grenzwerte
werden anhand konfigurierter Quellen und Namensmustern ausgefiltert.
Diese Erkennung ist eine Heuristik; HA kennzeichnet Verbraucher nicht eindeutig.
Gerätegruppen wie „TV Gesamt“ bleiben sichtbar. Es gibt bewusst keine
addierte Gesamtsumme, da Gruppen- und Einzelmessungen sich überlappen können.
Farben verwenden feste Leistungsbereiche (unter 200 / 800 / 2.000 W und
ab 2.000 W); die Balkenlänge vergleicht mit dem aktuell größten Verbraucher.

## PV-Vorteil

Die Kachel lädt Tagesänderungen aus der HA-Langzeitstatistik für `pv_daily`
(AC-Wechselrichterertrag), `benefit_garage_energy`, `benefit_shed_energy` und
`benefit_export_energy`. Alle Änderungen werden von HA in kWh umgerechnet.
Ersparnis = (AC-Ertrag + Garage + Schuppen − Einspeisung) × Bezugspreis.
Die Batterie darf nicht nochmals addiert werden: ihre abgegebene Energie ist
im AC-Ertrag enthalten. Netzgeladene Speicherenergie lässt sich anhand dieser
Zähler nicht von PV-Energie unterscheiden. Bei solchen Anlagen ist die
Ersparnis keine reine PV-Herkunftsbilanz. Fehlende oder widersprüchliche Werte
bleiben unbekannt. Die frühere Verbrauchs-Template-Statistik wird nicht genutzt.

Heute wird alle fünf Minuten aktualisiert, abgeschlossene Kalenderwochen
werden pro Quelle einen Tag im Browser-Arbeitsspeicher gehalten (maximal
18 Cache-Einträge). Beim Blättern werden nur ausgewählte Woche und heutiger
Tag abgefragt. Preise `feed_in_eur_kwh` und `purchase_eur_kwh` gelten auch für
die Bewertung historischer Tage; die Kachel ist keine Abrechnungsdatenbank.

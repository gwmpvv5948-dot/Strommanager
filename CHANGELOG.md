# Änderungen

## 0.1.89

- Separate Kachel „Dein Fahrzeug“ entfernt; die Fahrzeugdarstellung steht zentral im Energie-Fahrplan.

- Hausspeicher als gefüllter Akku mit Grenzmarkierungen und Tesla als Fahrzeugvisualisierung im Energie-Fahrplan.
- Ladezustand, Leistung, Ziele und modellierter Energieinhalt aus bestehenden HA-Daten; keine Mockup-Beispielwerte im Betrieb.

## 0.1.88

- PV-Tagesverteilung übernimmt zukünftige PV-Flüsse aus dem Energie-Fahrplan bis Mitternacht; historische Bilanz bleibt erhalten.
- Netz- und Akkuenergie werden nicht als PV gezählt. Ohne gültigen vollständigen Fahrplan bleiben Zukunftswerte offen.

## 0.1.87

- Animiertes Zahnrad mit „Wird berechnet …“ während der Fahrplanberechnung, auch bei Neuberechnung eines vorhandenen Plans.
- Konkrete Fehler bleiben nach Ende der Berechnung sichtbar; reduzierte Bewegung des Betriebssystems wird berücksichtigt.

## 0.1.86

- Einfarbige Sonne-Haus-Blitz-Variante als eigenes Icon in der HA-Seitenleiste. Verwendet die vom HA-Theme vorgegebene Iconfarbe.
- Icon wird global geladen, damit es auch vor dem Öffnen des Strommanager-Panels verfügbar ist.

## 0.1.85

- Eigenes Strommanager-Icon im Panel, in der HACS-Beschreibung und als lokale Home-Assistant-Markenbilder (256/512 Pixel).
- Das Listen-Icon hängt von der Unterstützung lokaler Markenbilder in der verwendeten HACS-Version ab.

## 0.1.84

- „Dein PV-Vorteil“ zeigt nach dem Neuladen die aktuelle Kalenderwoche. Frühere Wochen bleiben per Pfeil wählbar.
- Börsenpreisdiagramm zusammen mit dem EE-Anteil im gemeinsamen Bereich „EE-Anteil & Börsenpreis“ ein- und ausklappbar.

## 0.1.83

- HACS-Metadaten für Installation und Updates als benutzerdefiniertes Integrations-Repository.
- Dokumentierte Übernahme bestehender Installationen mit Sicherung und Datenprüfung.
- Domain, Config-Entry-ID, Lern-Datenbank und Speicherschlüssel bleiben unverändert; keine Änderung der Regelung.

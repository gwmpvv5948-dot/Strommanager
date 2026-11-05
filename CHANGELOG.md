# Änderungen

## 0.1.96

- Festtarifplanung: Börsenpreis beeinflusst weder HiGHS-Ziel noch Tesla-Netzfreigabe oder laufende Steuerung. Preis bleibt reine Anzeige.
- EE-Modellgewicht auf 25 % des bisherigen Gewichts reduziert; EE-Freigabeschwelle für flexible Tesla-Netzladung bleibt erhalten.
- Preisgrenzen-Einstellungen und irreführende Ladegründe entfernt.

## 0.1.95

- Schnellbedienung „Tesla-Sofortladen“ mit maximal zulässigem Strom bis 16 A und gesperrter Hausspeicherentladung. Preis-/PV-Planung wird übergangen, technische Schutzprüfung bleibt erhalten.
- Nach Fahrzeuglimit oder Beenden: Rückkehr zum vorherigen Modus nach bestätigtem Ladestopp; Zustand bleibt über Neustarts erhalten.
- Eingestellten Ladestrom in der Tesla-Kachel anzeigen.

## 0.1.94

- Zusammenhängende Tesla-Ladeblöcke durch höheres Startgewicht (0,05 € Modellgewicht/Start) bevorzugt; keine zusätzliche Netzfreigabe bei Wolken.

- Tesla-Fahrplan plant nur Aus oder 10–16 A. Ein kleines Ladezeit-Modellgewicht bevorzugt höhere Ströme bei vergleichbaren Bedingungen. Schutz- und Geräteobergrenzen bleiben verbindlich.
- Tesla-Zielübersicht und Preisprognose-Status unten bei der Fahrplan-Erklärung.

## 0.1.93

- Tesla-Optimierung: 60 Sekunden je Solve-Stufe statt 15 Sekunden; ein Thread und bestehende Lösungsprüfungen bleiben erhalten.
- Fehlermeldung nennt die betroffene Stufe, Laufzeit und Suchknoten. HA-Protokoll ergänzt Zielwert, Schranke, Lücke und Modellgröße. Erfolgreiche Pläne enthalten Stufendiagnosen.
- Ladestart-Variablen exakt an den Wechsel von Aus nach Ein gekoppelt; unnötige ganzzahlige Mehrdeutigkeiten entfernt.

## 0.1.92

- Tesla-Optimierung: Zeitlimit je Solve-Stufe von 5 auf 15 Sekunden erhöht. Prüfungen und Fallback bleiben erhalten.
- „Schorschi Ladegerät-Leistung“ aus der Verbraucheranzeige ausgeschlossen.

## 0.1.91

- Akku- und Tesla-Angaben aus „Energie jetzt“ entfernt.
- Hausspeicher und Tesla als eigene Kacheln direkt unter dem Energie-Fahrplan.

## 0.1.90

- Akku-Grenzwerte rechts neben dem Akku statt als Fußlegende; große Ladestandsanzeige darüber.
- Tesla mit überarbeiteter Fahrzeug-Silhouette und Anordnung näher am Mockup: Fahrzeug, Prozent, Energieinhalt, Ladebalken, Status und Ziel-Felder.

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

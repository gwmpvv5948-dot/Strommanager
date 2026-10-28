# Strommanager

Eigene Home-Assistant-Integration mit einem Panel in der Seitenleiste für PV, Hausspeicher und Tesla. Interner Integrationsname: `solar_pilot`.

**Entwicklungsstand 0.1.3.** Eigenes HA-Panel, persistente Tagesbilanz und einstellbare Tesla-/Speicher-Ladehysterese. 73 Python- und 20 JavaScript-Tests prüfen Berechnung, Befehlsplanung und Adapter-Verträge. Die neue Grenzwertsteuerung ist noch nicht durch einen vollständigen echten Ladezyklus live abgenommen.

## Was die erste Version enthält

- Übersicht mit Livewerten, aktueller Entscheidung und nachvollziehbarer Begründung.
- Einstellbare Abendreserve (Vorgabe 70 %), Speichergröße (5 kWh) und Tesla-Mindeststand (50 %).
- PV-Restprognose, aktuelle Hauslast, Verluste und Sicherheitsreserve im Ladebudget.
- Beobachten, Automatik, Speicher bevorzugen, nur Tesla-Mindeststand und Pause.
- Diagnose, Befehlsverlauf, Datenalter und Konfliktschutz.
- Keine neuen Tesla-Zugangsdaten: nutzt die bereits eingerichteten Huawei-, Tesla-Fleet- und Solcast-Entitäten.

## Verhalten

Unter der einstellbaren Tesla-Untergrenze (Vorgabe 20 %) startet eine Mindestladung mit erlaubtem Netzstrom bis zum Mindestziel (Vorgabe 50 %). Diese Freigabe bleibt nach Überschreiten der Untergrenze bestehen, bis das Mindestziel oder das kleinere Fahrzeuglimit erreicht ist. Der Hausspeicher bleibt dabei auf 0 W Entnahme begrenzt. Die Freigabe wird dauerhaft gespeichert, auch über Neustarts.

Sonst beginnt Laden bei Netzeinspeisung mit ausreichendem PV-Budget oder oberhalb der Speicherfreigabe (Vorgabe 80 %). Die Speicherfreigabe bleibt bis zur Abendreserve erhalten. Entladung wird dort für Tesla auf 0 W begrenzt; falls PV weiter reicht, kann das Auto weiterladen. Ohne PV und Speicherfreigabe wird pausiert. Das Fahrzeuglimit bleibt die obere Grenze. Die Entladeleistung ist eine gemeinsame Obergrenze für Haus und Auto. Im Modus „Nur Tesla-Mindeststand“ endet jede Ladung am Mindestziel. Untergrenze < Mindestziel und Speicherfreigabe >= Abendreserve werden validiert.

Aktuelle Messungen sind Voraussetzung für Befehle. Start- und Strombefehle warten auf die bestätigte erlaubte Entladegrenze und abgeschaltete Netzladung des Hausspeichers. Cloud- und Messverzögerungen können kurze Netzbezüge sowie Abweichungen an SoC-Grenzen verursachen; es handelt sich nicht um eine hardwareseitige SoC-Sperre. Ohne Autoladung bleibt die bisherige Hausversorgung erhalten.

70 % sind **keine Obergrenze**: Strommanager verändert weder die Speicher-Ladeobergrenze noch die normale minimale Entladeschwelle. Ohne ausreichend PV ist das Abendziel nicht garantiert. Der aktuelle Hausverbrauch dient als Schätzung des Restbedarfs; es gibt in dieser Version noch kein gelerntes Lastprofil. Die PV-Prognose wird so verwendet, wie die ausgewählte Entität sie liefert. Bei Solcast kann das beispielsweise `estimate10` sein.

Die Berechnung entfernt Batterieentladung aus dem vermeintlichen PV-Überschuss. Strommanager fragt Tesla nicht zusätzlich ab. Tesla-Befehle werden nur bei Bedarf und mit einstellbarem Mindestabstand gesendet. Bestehende Tesla-Fleet-Abfragen und Befehle können API-Kosten verursachen. Die erste Version weckt schlafende Fahrzeuge **nicht automatisch**; für automatisches Wiederanlaufen muss das Fahrzeug über die bestehende Integration erreichbar sein.

## Installation zur Erprobung

1. Home-Assistant-Backup erstellen.
2. Den Ordner `custom_components/solar_pilot` nach `/config/custom_components/solar_pilot` kopieren. Bestehende andere Integrationen nicht überschreiben.
3. Home Assistant neu starten.
4. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen → Strommanager** die Zuordnung wählen. Die vorausgefüllten Entity-IDs stammen aus der ursprünglichen Anlage und sind editierbar.
5. In der Seitenleiste **Strommanager** öffnen. Es startet bei der ersten Einrichtung im **Beobachtungsmodus** und sendet keine Befehle.
6. Ist- und Sollwerte, Einheiten, Vorzeichen, Anzahl der Ladephasen und Gerätegrenzen prüfen. Die bisherige Automation bleibt währenddessen aktiv.
7. Erst nach Prüfung **Automatik übernehmen** wählen. Dieser explizite Vorgang deaktiviert die zugeordnete bisherige Automation. Ist sie nicht verfügbar, wird die Übernahme verweigert.

HACS-Veröffentlichung oder automatisches Update sind noch nicht eingerichtet. Keine Anmeldung, Tokens oder privaten Fahrzeugschlüssel in dieses Repository legen.

### Pausieren und Deinstallation

**Pause** und **Beobachten** senden keine Gerätebefehle. Zuletzt gesetzte Gerätewerte bleiben bestehen. Es gibt keine automatische Rückkehr zur bisherigen Automation. Vor Deinstallation die Regelung pausieren und gewünschte Gerätewerte sowie eine gegebenenfalls benötigte Automation manuell einstellen.

Ein aktiver Modus und seine Befehlsabstände werden über Neustarts erhalten. Beim Entladen der Integration werden keine Geräte verändert. Vor Deinstallation deshalb pausieren und die Gerätewerte kontrollieren. Nach einem Neustart wird bei aktiver oder nicht prüfbarer alter Automation jede automatische Steuerung blockiert. Weitere, nicht zugeordnete Automationen oder externe Energiemanager kann der Konfliktschutz nicht erkennen.

## Entwicklungsumgebung

Python 3.12 oder neuer und Node.js 22. Für die lokalen Tests sind keine externen Pakete nötig:

```sh
python3 -m unittest discover -s tests -v
python3 tools/check.py
python3 tools/package.py
python3 -m http.server 8765 --bind 127.0.0.1
```

UI-Demo anschließend unter `http://127.0.0.1:8765/docs/demo.html`. Sie verwendet ausschließlich gekennzeichnete Beispieldaten und hat keine Geräteverbindung. Das ZIP liegt nach dem Paketbau unter `dist/`.

Die Laufzeit-Anbindung zielt auf Home Assistant 2026.10; für das eigene Panel werden die offiziellen Frontend-, Panel- und Service-APIs genutzt. Der Config Flow unterstützt die Schema-Bibliothek `probatio` sowie ältere Installationen mit `voluptuous`. Weitere Prüfungen des schreibenden Gerätebetriebs, Langzeittests und `hassfest` stehen noch aus.

Mehr zu Aufbau, Schutzmaßnahmen und Grenzen: [Architektur](docs/ARCHITECTURE.md).

### Neu in 0.1.1

Kurze Erklärungen unter allen Einstellwerten, kompakte Tesla-Kachel mit schematischer Fahrzeugdarstellung, Akkubalken und Wallbox-Leistung. Fahrzeugdaten werden ohne zusätzliche Tesla-Abfragen angezeigt; eine Reichweite wird ohne zugeordneten Reichweitensensor nicht geschätzt. Die Rückgabe-Funktion zur alten Automation ist entfernt.

### UI-Erweiterung: Prognose und Speicherschutz

Solcast-Tagesdiagramm (P50 und P10) mit PV-Verlauf aus der HA-Historie. Der Verlauf wird ausschließlich beim geöffneten Panel und höchstens alle fünf Minuten aus HA gelesen, ohne zusätzliche Solcast- oder Tesla-Abfragen. Fehlende Kurven oder Historie werden angezeigt. Die Tagesprognose wird aus der zugeordneten Solcast-Restprognose abgeleitet; der WR-Tagesertrag aus der PV-Eingangsleistungsentität. Andere Benennungen zeigen fehlende Daten statt erfundener Werte.

Im Speicherbalken zeigt eine Schraffur das mögliche PV-Ladepotenzial ohne weitere Autoladung: zeitlich aufgelöste P50-Restkurve nach Prognosefaktor, geschätztem Hausverbrauch, Ladeverlusten und maximaler Ladeleistung je Intervall, begrenzt auf 100 %. Der Energiepuffer der EV-Regelung wird nicht abgezogen: Diese zurückgehaltene Energie kann weiterhin den Speicher laden. Das ist eine Schätzung unter diesen Annahmen, keine Garantie. Ein Schutz-Hinweis erscheint bei gemessener Wallbox-Leistung über 10 W und tatsächlich reduzierter Entladegrenze; eine noch nicht bestätigte Anforderung wird getrennt gekennzeichnet.

Der Tesla-Ladestrom wird im aktiven Modus aus dem PV-Budget berechnet: maximal 16 A laut Vorgabe, Weiterladen ab 6 A, Start ab 8 A. Tesla-Befehlsrunden haben standardmäßig fünf Minuten Abstand, ein Neustart der Ladung mindestens drei Minuten Pause. Die Cloud-Anbindung verhindert keine kurzen Netzbezüge.

Zusätzlich zu den Python-Tests: `node --test tests/test_solar_chart.mjs` für Zeitumstellung, Zeitreihen, Datenlücken und Speicherpotenzial.

### Vier-Tage-Ausblick

Die Übersicht zeigt Heute, Morgen und die nächsten zwei Wochentage als kompakte Vergleichstabelle mit Solcast-P50-Tagesertrag und vorsichtiger P10-Schätzung. Eine kleine Kurve vergleicht die Tagessummen P50 und P10; fehlende Tage werden nicht verbunden. Die kombinierten `estimate`-Attribute werden verwendet, weil der Sensorzustand je nach Solcast-Einstellung P10 enthalten kann. Die Zuordnung erfolgt nach Datum der Detailprognose in der HA-Zeitzone; fehlende oder nicht verfügbare Tagesdaten werden nicht durch andere Tage ersetzt.

Wetter, Niederschlag, erwartete Sonnenstunden und astronomische Tageslänge stammen aus [Open-Meteo](https://open-meteo.com/en/docs). Sonnenstunden sind die wetterabhängige modellierte Sonnenscheindauer, Tageslänge die Dauer des Tageslichts. Alle Werte sind Tagessummen, auch heute. Die Wetterabfrage verwendet ausschließlich öffentliche Stadtkoordinaten von Dresden (51,05 / 13,74), keine genaue HA- oder Fahrzeugposition. Sie erfolgt nur im geöffneten Übersichtsbereich, höchstens stündlich, ohne API-Schlüssel oder Tesla-Abfragen. Der letzte Wetterstand wird lokal im Browser gespeichert, bei Fehlern mit Hinweis bis sechs Stunden angezeigt und frühestens nach 15 Minuten erneut abgefragt. Wetterdaten dienen nur der Anzeige, nicht der Geräteentscheidung. Die Stadtzuordnung ist in dieser Version Dresden; sie ist noch nicht konfigurierbar.

### Neu in 0.1.2: ein gemeinsamer Tagesbalken

Ein Balken auf gemeinsamer kWh-Skala teilt die aktuelle Tageserwartung auf Haus, Speicher, Tesla und Puffer/Einspeisung auf. Jede Kategorie enthält einen vollen bisherigen PV-Anteil und einen schraffierten zukünftigen Plananteil. Eine kompakte Tabelle zeigt bisher, noch und gesamt. Netzladung der Wallbox wird ausdrücklich nicht vollständig als PV-Ladung gezählt.

Eigene Sensoren `PV heute Haus`, `PV heute Speicher`, `PV heute Tesla`, `PV heute Einspeisung und Rest` und `PV heute Bilanziert` werden automatisch auf dem Strommanager-Gerät angelegt. Die Tageswerte liegen dauerhaft im HA-Speicher unter `solar_pilot.budget.<entry_id>`. Es werden keine manuellen Helfer benötigt. Die Bilanz wird auch bei geschlossenem Panel alle fünf Minuten fortgeschrieben, am HA-Kalendertag zurückgesetzt und beim Start aus der Recorder-Historie rekonstruiert. Bei Abfragen wird ein überlappendes Zeitfenster ersetzt, damit ein Neustart oder erneute Abfrage nicht doppelt zählt.

**Bilanzmethode:** Minutenwerte der zugeordneten PV-, Netz-, Speicher- und Wallbox-Leistung. Aus PV-Eingangsleistung werden mit 5 % Wechselrichterverlusten AC-seitige PV-Werte geschätzt. Hauslast folgt aus der Leistungsbilanz. Bei zeitgleicher gemischter Versorgung wird verfügbare PV proportional auf Haus, ladenden Speicher und Wallbox verteilt; der übrige PV-Anteil bleibt Einspeisung/Bilanzrest. Batterieentladung und Netzbezug werden nicht als zusätzliche PV-Erzeugung gezählt. Das ist eine Bilanzschätzung, keine direkte Messung der elektrischen Herkunft. Negative/ungültige Werte und veraltete Zeitreihen werden nicht erfunden; fehlende Minuten und ein nicht verfügbarer Recorder werden angezeigt.

Die aktuelle Tageserwartung ist bisher bilanzierte PV plus verbleibende P50-Kurve. Eine frühere, inzwischen nicht mehr realistische Tagesprognose wird nicht als noch verfügbare Energie behandelt. Die zukünftigen Anteile berücksichtigen Prognosefaktor, Energiepuffer, Grundbedarf bis Abend, fehlende Speicherreserve inklusive Ladeverlusten und verbleibendes Tesla-Budget. Bereits erfolgte Speicherladung bleibt im historischen Anteil, auch wenn sie über das heute eingestellte Reserveziel hinausging.

`Zusätzlicher Hausbedarf pro PV-Tag` (Vorgabe 2,5 kWh) wird jetzt zentral in der HA-Konfiguration gespeichert. Aus der bilanzierten Hauslast während PV-Zeiten wird der bereits erfolgte Mehrverbrauch über der Grundlast abgezogen; verbrauchter Zusatzbedarf wird nicht erneut reserviert. Der frühere lokale Browser-Planwert wird nicht übernommen. Die gesamte Budgetberechnung dient der Anzeige, ändert keine Gerätebefehle und garantiert weder Ladeleistung noch das Abendziel. Die bestehende Regelung bleibt maßgeblich.


### Neu in 0.1.3: Ladegrenzen und Batterieanzeige

Tesla-Untergrenze und Mindestziel sowie Speicherfreigabe und Abendreserve bilden zwei getrennte Hysteresen. Die vertikale Batterieanzeige markiert beide Speichergrenzen und den aktuellen Füllstand; Symbole für Haus, Auto und Freigabe erklären die Bereiche. Der Füllstand wird zusätzlich in kWh angezeigt, unbekannte oder veraltete Daten werden gekennzeichnet. Die Grafik nutzt dieselben Einstellungen wie die Regelung.

Ein notwendiger Ladestopp wartet nicht auf den normalen Cloud-Abstand. Wiederholte Stoppversuche haben weiterhin mindestens zwei Minuten Abstand und Fehler-Backoff.

### Neu in 0.1.6: lokale lernende Hausverbrauchsprognose

Der Strommanager legt automatisch eine separate SQLite-Datenbank unter `.storage/solar_pilot.consumption.<entry_id>.sqlite` an. Sie enthält gültige UTC-Stunden, Temperaturen und vorab gespeicherte Vorhersagen mit später gemessenem Fehler. Die Quelldaten in InfluxDB werden ausschließlich gelesen. Zugangsdaten werden aus der bereits eingerichteten InfluxDB-v1-Integration verwendet und weder in die Prognose-Datenbank kopiert noch im Panel ausgegeben. Es werden keine privaten Messdaten nach GitHub übertragen.

Beim ersten Start werden bis zu zwei Jahre in Wochenabschnitten importiert. Ein gespeicherter Fortschritt erlaubt die Fortsetzung nach Abbruch; derselbe Stundenschlüssel wird nicht doppelt gelernt. Der Admin-Dienst `solar_pilot.import_consumption_history` setzt den Import fort. Unterstützt wird zunächst InfluxDB v1, Messungen `W` und `°C`, Entity-Tags ohne Domain. Für andere Messnamen ist eine Erweiterung nötig. Die Datenbank wird bei Deinstallation nicht automatisch gelöscht; sie sollte in HA-Backups enthalten sein.

**Bilanz:** AC-Wechselrichterleistung + Garage-PV + Schuppen-PV − Netzleistung (positiv Einspeisung) − Wallboxleistung. Batterieentladung bleibt damit als Versorgung des Haushalts enthalten. Die fehlerhaften historischen Tageszähler werden nicht verwendet. Historische Werte sind Näherungen aus Fünfminutenmitteln; nur Stunden mit mindestens elf gültigen Intervallen werden übernommen. Die Netzleistung muss in jedem übernommenen Intervall tatsächlich aufgezeichnet sein; andere Kanäle werden höchstens 15 Minuten, Nullwerte höchstens sechs Stunden fortgeschrieben. Lange Lücken werden nicht aufgefüllt. Historische Netzladung des Speichers kann ohne separates Merkmal die Bilanz verfälschen; solche Zeiten sind gegebenenfalls vor weiterer Verwendung auszuschließen. Die bisherige PV-Zuordnung bleibt davon getrennt.

Aktuell voreingestellte zusätzliche Quellen sind `sensor.inverter_wirkleistung`, `sensor.garage_pv_sonoff_energy_power`, `sensor.schuppen_pv_sonoff_energy_power` und `sensor.dresden_temperatur`; `weather.dresden_stadt` liefert bei Ausfall des Temperatursensors die aktuelle Temperatur und, falls unterstützt, stündliche Vorhersagen. Ein optionaler Entry-Options-Eintrag `consumption_sources` kann diese Schlüssel (`inverter`, `garage`, `shed`, `temperature`, `weather`) ersetzen; Netz- und Wallboxzuordnung stammen aus dem vorhandenen Setup. Historische Außenmessung `wohnzimmer_outdoor_temperatur` dient als Rückfall, Dresden hat bei Überlappung Vorrang; die beiden Quellen sind noch nicht gegeneinander kalibriert. Implausible Temperaturen werden ausgeschlossen. Eine eigene Quellen-Auswahlmaske ist noch nicht enthalten.

Live lernt die Erweiterung auch bei geschlossenem Panel alle 30 Sekunden. Nur frische verfügbare Leistungswerte, ausgeschaltete Speicher-Netzladung und mindestens 85 % Stundenabdeckung werden zugelassen. Neustarts und Messausfälle erzeugen fehlende Zeit statt erfundenem Verbrauch. Neu gemessene Stunden haben Vorrang vor historischen Importen.

Das Modell gewichtet frühere Stunden nach lokaler Uhrzeit, Wochentag/Wochenende, Temperatur und Aktualität. Pro Stunde sind mindestens fünf wirksame Vergleichsstunden nötig. Bei zu wenigen passenden Wetter-/Wochentagsbeispielen wird auf das einfache Uhrzeitprofil zurückgegriffen, sofern mindestens fünf gültige historische Stunden dieser Uhrzeit existieren. Die Anzahl dieser vereinfachten Stunden wird in den Prognosedetails angezeigt. Die vorhandene HA-Wetterintegration wird höchstens stündlich nach ihrer Stundenprognose gefragt. Fehlende Vorhersagestunden verwenden die aktuelle Außentemperatur. Fehlt auch diese, wird ohne Temperaturmerkmal gerechnet; die Kachel kennzeichnet diesen Rückfall. Angezeigt werden die verbleibende Energie bis Mitternacht, die bisher erfassten vollen Stunden, Lernumfang und später der mittlere absolute Stundenfehler. Streuungsgrenzen sind keine garantierten Konfidenzintervalle. Eine Prognose wird vor Beginn ihrer Zielstunde eingefroren und erst danach bewertet. Ein begrenzter gleitender Korrekturwert lernt aus den letzten echten Prognosefehlern; der Fehler einer einfachen Vergleichsprognose wird ebenfalls gespeichert.

Automatisch angelegte Sensoren: `Hausverbrauch Restprognose`, `Verbrauchsprognose Lernstunden`, `Verbrauchsprognose mittlerer Fehler`. Ohne geprüfte Vorhersagen ist der Fehler unbekannt, nicht null. Die neue Kachel zeigt den Lernstand. **Die Prognose läuft zunächst im Beobachtungsbetrieb und beeinflusst weder Tesla-Befehle noch das bisherige PV-Ladebudget.** Eine Qualitätsfreigabe für die Steuerung ist ein separater Schritt.

### Neu in 0.1.7: vollständige Quellenübersicht

Unter Diagnose → Verwendete Entitäten stehen zusätzlich die tatsächlich konfigurierten Quellen der lernenden Verbrauchsprognose, die für die PV-Anzeige automatisch abgeleiteten Tagesentitäten, die historischen Temperaturreihen aus InfluxDB und die registrierten eigenen Strommanager-Sensoren. Live-Quellen zeigen ihren aktuellen Zustand; historische Reihen sind als InfluxDB-Historie gekennzeichnet, auch wenn ihre HA-Entität inzwischen fehlt. Der direkt abgefragte Open-Meteo-Wetterausblick ist ausdrücklich als Quelle ohne HA-Entität erklärt. Die Anzeige verändert keine Gerätezuordnungen.

### Neu in 0.1.9: stabile Ansicht bei Live-Aktualisierungen

Die Oberfläche aktualisiert weiterhin alle zehn Sekunden. Geöffnete Details werden bereits außerhalb der sichtbaren Seite wiederhergestellt, bevor der neue Inhalt eingesetzt wird. Der vorhandene Scrollcontainer bleibt erhalten; auch ein von HA verwendeter äußerer Container bzw. der Dokument-Scroller wird berücksichtigt. Ein sichtbarer Inhaltsanker gleicht Höhenänderungen oberhalb der betrachteten Stelle aus; vertikale Position, horizontale Diagrammpositionen und der Tastaturfokus werden ohne automatisches Scrollen wiederhergestellt. Beim bewussten Tabwechsel beginnt die Ansicht weiterhin oben. Das verhindert insbesondere Sprünge in der langen aufgeklappten Quellenübersicht.

### Neu in 0.1.10: Y-Achse der Verbrauchsprognose

Das Diagramm der lernenden Hausverbrauchsprognose zeigt eine beschriftete Y-Achse für den prognostizierten Verbrauch je Stunde in kWh. Die Skala beginnt bei null, passt sich an die erwarteten Werte einschließlich Streuung an und verwendet horizontale Hilfslinien. Uhrzeiten und Prognoseberechnung bleiben bestehen.

### Neu in 0.1.11: umschaltbare Verbrauchsbalken

Die lernende Hausverbrauchskachel bietet **Tagesverlauf** und **Tagesbilanz**. Die Auswahl wird lokal im Browser je Integration gespeichert; initial ist die Tagesbilanz gewählt. Beide Ansichten verwenden dieselben Bilanzdaten ohne Tesla. Volle grüne Flächen zeigen bereits bilanzierte Messwerte, goldene Schraffur die verbleibende Prognose.

Der Tagesverlauf enthält alle realen UTC-Stunden des lokalen Tages (auch 23/25 Stunden bei Zeitumstellung), eine kWh-Achse, Stundenmarken, einen Datenstand und Detailwerte je Balken. Fehlende vergangene Stunden bleiben Lücken mit Fragezeichen. Die laufende Stunde enthält nur die bereits erfasste Energie aus dem persistenten Stundenakkumulator plus die Prognose für den verbleibenden Stundenanteil; eine volle Stundenprognose wird nicht zusätzlich gezählt.

Die Tagesbilanz teilt einen gemeinsamen Balken zwischen bislang bilanzierter Energie und verbleibender Prognose auf. Nur bei vollständigen abgeschlossenen Stunden, mindestens 85 % bisheriger Abdeckung der laufenden Stunde und vollständiger Restprognose heißt die Summe „Tag insgesamt erwartet“. Andernfalls heißt sie **„Erfasst + Restprognose“** und trägt einen Lückenhinweis: Sie ist dann ausdrücklich kein vollständiger Tagesverbrauch. Der fehlerbehaftete historische Tageszähler und ein Tageswert einschließlich Tesla werden dafür nicht vermischt. Lernumfang und Fehler bleiben unter dem Diagramm sichtbar. Die Ladesteuerung bleibt unverändert.

### Neu in 0.1.12: PV-Kurven über dem Verbrauchsverlauf

Der Tagesverlauf überlagert die Verbrauchsbalken mit einer blauen PV-Ist-Kurve bis zur gemeinsamen Datenstandsmarke und einer gestrichelten Solcast-P50-Kurve danach. Beide Linien verwenden dieselbe Achse wie die Stundenbalken. Die Skala berücksichtigt auch PV-Werte oberhalb des Hausverbrauchs.

Datenquelle ist wie im bestehenden PV-Diagramm die **Hauptanlage**: Historie der zugeordneten PV-Eingangsleistung und die abgeleitete Solcast-Tagesprognose. Batterieentladung wird damit nicht als PV-Erzeugung dargestellt. Garage und Schuppen sind in diesen Kurven nicht enthalten; dies steht unmittelbar beim Diagramm. Zusätzliche HA-, Solcast- oder Tesla-Abfragen werden nicht eingeführt: Die bereits höchstens alle fünf Minuten geladene HA-PV-Historie und bestehende Solcast-Attribute werden wiederverwendet.

Die Linien zeigen **Stundenmittel in kWh je Stunde**. In vollen Stunden entspricht der Wert dem integrierten Stundenertrag. Für angeschnittene Stunden wird das innerhalb des gemessenen bzw. noch prognostizierten Zeitanteils ermittelte Mittel auf eine volle Stunde umgerechnet; es ist keine zusätzliche tatsächlich erzeugte Tagesenergie. Diese Darstellung verändert weder Tagesbilanz noch Gerätesteuerung. Messwerte werden begrenzt fortgeschrieben (maximal 15 Minuten zwischen Historienpunkten, maximal fünf Minuten am offenen Ende); Stunden mit weniger als 85 % Abdeckung bleiben Lücken. Fehlende Prognoseintervalle werden ebenfalls nicht als Nullproduktion ergänzt oder durch eine Linie überbrückt.

### Neu in 0.1.13: Garage und Schuppen in der PV-Ist-Kurve

Die gemessene PV-Kurve im Verbrauchs-Tagesverlauf summiert jetzt die Hauptanlage (zugeordnete PV-Eingangsleistung) und die konfigurierten Leistungsquellen für Garage und Schuppen aus der Verbrauchsprognose. Die drei Historien werden in einer gemeinsamen HA-Historienabfrage geladen und anhand ihrer Entity-ID zugeordnet. Die bisherige Aktualisierung höchstens alle fünf Minuten bleibt bestehen.

Die Addition erfolgt auf zeitgleichen gültigen Intervallen aller drei Anlagen, erst danach werden Stundenmittel gebildet. Unbekannte Nebenanlagen werden nicht stillschweigend als Nullproduktion behandelt; unzureichend abgedeckte Stunden bleiben Lücken. Die rohe Hauptanlagen-Eingangsleistung wird wie bisher verwendet, ohne eine neue Verlustannahme einzuführen.

Die gestrichelte Zukunftskurve bleibt ausdrücklich **Solcast P50 der Hauptanlage**. Für Garage und Schuppen sind bisher keine eigenen Prognosen hinterlegt; es werden keine zusätzlichen Zukunftserträge erfunden. Legende und Datenquellenhinweis benennen diesen Unterschied. Das separate ursprüngliche PV-Diagramm, die Tagesbilanz und die Ladesteuerung werden nicht geändert.

### Neu in 0.1.15: Werte beim Überfahren und Fokussieren der Balken

Im Tagesverlauf zeigt ein direkt eingeblendeter Tooltip das Stundenintervall, bilanzierten Hausverbrauch, gegebenenfalls verbleibende Stundenprognose und Vergleichsstreuung sowie die verfügbaren PV-Stundenmittel. Messlücken sind ausdrücklich benannt. Die beiden Summenabschnitte der Tagesbilanz haben ebenfalls Wertanzeigen. Die Informationen erscheinen mit Mauszeiger oder Tastaturfokus; Escape schließt sie. Ein geöffneter Tooltip wird bei automatischen Aktualisierungen derselben Ansicht mit aktualisierten Werten wiederhergestellt.

**Vorhandene Historie:** Die lokale SQLite-Datenbank speichert gültige Verbrauchsstunden und in der Tabelle `predictions` je Zielstunde die erste vor Stundenbeginn gespeicherte Vorhersage (`INSERT OR IGNORE`), ihren Ausgabezeitpunkt, eine Vergleichsprognose und später tatsächlichen Verbrauch/Fehler. Spätere Revisionen derselben Zielstunde und vollständige Tagesprognose-Snapshots werden nicht archiviert. Mit den Pfeilen in der Verbrauchskachel lassen sich abgeschlossene Vergleichstage durchblättern; dargestellt werden nur Stunden mit einer damals gespeicherten Prognose. Historische Istwerte können älter sein als die seit Einrichtung des Lernens gespeicherten echten Prognosen; fehlende damalige Prognosen werden nicht rückwirkend erfunden.

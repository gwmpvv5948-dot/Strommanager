# Strommanager

Eigene Home-Assistant-Integration mit einem Panel in der Seitenleiste für PV, Hausspeicher und Tesla. Interner Integrationsname: `solar_pilot`.

**Entwicklungsstand 0.1.1 — unter Home Assistant 2026.10.4 im Beobachtungsmodus erprobt.** Einrichtung, fünf Sensoren, eigenes Panel mit Livewerten, Neuberechnung sowie Speichern der Einstellungen mit Integrations-Neuladen wurden geprüft. 47 lokale Tests und die GitHub-Prüfung bestehen. Schreibender Gerätebetrieb und Langzeitregelung sind noch nicht live abgenommen. Die vorhandene Ladeautomation bleibt bis zur ausdrücklichen Übernahme aktiv.

## Was die erste Version enthält

- Übersicht mit Livewerten, aktueller Entscheidung und nachvollziehbarer Begründung.
- Einstellbare Abendreserve (Vorgabe 70 %), Speichergröße (5 kWh) und Tesla-Mindeststand (50 %).
- PV-Restprognose, aktuelle Hauslast, Verluste und Sicherheitsreserve im Ladebudget.
- Beobachten, Automatik, Speicher bevorzugen, nur Tesla-Mindeststand und Pause.
- Diagnose, Befehlsverlauf, Datenalter und Konfliktschutz.
- Keine neuen Tesla-Zugangsdaten: nutzt die bereits eingerichteten Huawei-, Tesla-Fleet- und Solcast-Entitäten.

## Verhalten

Das Auto lädt ausschließlich mit verfügbarem PV-Überschuss, auch unterhalb des Tesla-Mindeststands. Der Mindeststand von 50 % ist ein Ziel ohne zeitliche Garantie. Der eingestellte Fahrzeug-Ladegrenzwert hat immer Vorrang. Oberhalb des Mindeststands wird PV-orientiert bis zu diesem Fahrzeuglimit geladen. Während Autoladung bleibt die Entladegrenze des Hausspeichers bei 0 W. Tagsüber unter der Abendreserve wird die Entladung ebenfalls gesperrt; das kann Netzbezug für andere Hausverbraucher verursachen. Nachts ohne Autoladung wird die normale Entladeleistung freigegeben.

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

Im Speicherbalken zeigt eine Schraffur das mögliche PV-Ladepotenzial ohne weitere Autoladung: verfügbare Restenergie nach Hausverbrauch, Prognosefaktor, Energiepuffer, Ladeverlusten und maximaler Ladeleistung, begrenzt auf 100 %. Das ist eine Obergrenze unter diesen Annahmen, keine garantierte Regelprognose. Ein Schutz-Hinweis erscheint bei gemessener Wallbox-Leistung über 10 W und tatsächlich reduzierter Entladegrenze; eine noch nicht bestätigte Anforderung wird getrennt gekennzeichnet.

Der Tesla-Ladestrom wird im aktiven Modus aus dem PV-Budget berechnet: maximal 16 A laut Vorgabe, Weiterladen ab 6 A, Start ab 8 A. Tesla-Befehlsrunden haben standardmäßig fünf Minuten Abstand, ein Neustart der Ladung mindestens drei Minuten Pause. Die Cloud-Anbindung verhindert keine kurzen Netzbezüge.

Zusätzlich zu den Python-Tests: `node --test tests/test_solar_chart.mjs` für Zeitumstellung, Zeitreihen, Datenlücken und Speicherpotenzial.

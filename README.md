# Strommanager

Eigene Home-Assistant-Integration mit einem Panel in der Seitenleiste für PV, Hausspeicher und Tesla. Interner Integrationsname: `solar_pilot`.

**Entwicklungsstand 0.1.0 — noch nicht im echten Home-Assistant-Laufzeitsystem installiert oder abgenommen.** Berechnung, Befehlsplanung und HA-Adapter sind lokal getestet; diese Tests ersetzen keine Inbetriebnahme. Die vorhandene Ladeautomation bleibt bis zur ausdrücklichen Übernahme aktiv.

## Was die erste Version enthält

- Übersicht mit Livewerten, aktueller Entscheidung und nachvollziehbarer Begründung.
- Einstellbare Abendreserve (Vorgabe 70 %), Speichergröße (5 kWh) und Tesla-Mindeststand (50 %).
- PV-Restprognose, aktuelle Hauslast, Verluste und Sicherheitsreserve im Ladebudget.
- Beobachten, Automatik, Speicher bevorzugen, nur Tesla-Mindeststand und Pause.
- Diagnose, Befehlsverlauf, Datenalter und Konfliktschutz.
- Keine neuen Tesla-Zugangsdaten: nutzt die bereits eingerichteten Huawei-, Tesla-Fleet- und Solcast-Entitäten.

## Verhalten

Unterhalb des Tesla-Mindeststands ist Netzstrom fürs Auto erlaubt. Der eingestellte Fahrzeug-Ladegrenzwert hat immer Vorrang. Oberhalb des Mindeststands wird PV-orientiert bis zu diesem Fahrzeuglimit geladen. Während Autoladung bleibt die Entladegrenze des Hausspeichers bei 0 W. Tagsüber unter der Abendreserve wird die Entladung ebenfalls gesperrt; das kann Netzbezug für andere Hausverbraucher verursachen. Nachts ohne Autoladung wird die normale Entladeleistung freigegeben.

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

### Pause und Rückgabe

**Pause** bedeutet: keine weiteren Schreibzugriffe, die zuletzt gesetzten Werte bleiben erhalten. Beobachten nach aktiver Steuerung hat denselben Effekt auf Geräte; es berechnet weiter Vorschläge. **Zur bisherigen Automation** stellt die von Strommanager geänderten Zahlenwerte nur dann zurück, wenn sie noch dem letzten eigenen Stellwert entsprechen, und aktiviert eine zuvor übernommene Automation wieder. Eine zwischenzeitliche manuelle Änderung wird nicht überschrieben. Ladefreigaben werden bei Rückgabe oder Entladen der Integration nicht automatisch umgeschaltet.

Ein aktiver Modus und seine Befehlsabstände werden über Neustarts erhalten. Beim Entladen der Integration werden keine Geräte verändert. Vor Deinstallation deshalb explizit zurückgeben und die Gerätewerte kontrollieren. Nach einem Neustart wird bei aktiver oder nicht prüfbarer alter Automation jede automatische Steuerung blockiert. Weitere, nicht zugeordnete Automationen oder externe Energiemanager kann der Konfliktschutz nicht erkennen.

## Entwicklungsumgebung

Python 3.12 oder neuer und Node.js 22. Für die lokalen Tests sind keine externen Pakete nötig:

```sh
python3 -m unittest discover -s tests -v
python3 tools/check.py
python3 tools/package.py
python3 -m http.server 8765 --bind 127.0.0.1
```

UI-Demo anschließend unter `http://127.0.0.1:8765/docs/demo.html`. Sie verwendet ausschließlich gekennzeichnete Beispieldaten und hat keine Geräteverbindung. Das ZIP liegt nach dem Paketbau unter `dist/`.

Die Laufzeit-Anbindung zielt auf Home Assistant 2026.10; für das eigene Panel werden die offiziellen Frontend-, Panel- und Service-APIs genutzt. Der Config Flow unterstützt die Schema-Bibliothek `probatio` sowie ältere Installationen mit `voluptuous`. Eine vollständige HA-Laufzeitprüfung und `hassfest` stehen noch aus.

Mehr zu Aufbau, Schutzmaßnahmen und Grenzen: [Architektur](docs/ARCHITECTURE.md).

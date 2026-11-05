# Strommanager

<img src="https://raw.githubusercontent.com/gwmpvv5948-dot/Strommanager/main/custom_components/solar_pilot/brand/icon%402x.png" alt="Strommanager" width="96" height="96">

**Version 0.1.96** · Home-Assistant-Integration für Photovoltaik, Hausspeicher und Tesla – mit eigener Übersicht in der Seitenleiste.

## Funktionen

- **Energie jetzt:** PV-Leistung, Hausverbrauch, Netzbezug, Akku- und Tesla-Ladestand sowie aktive Verbraucher auf einen Blick.
- **Energie-Fahrplan:** Lokale Planung mit HiGHS für die nächsten 24 Stunden im Viertelstundenraster. Haus und Speicher werden gemeinsam optimiert; die Tesla-Planung lässt sich zuschalten. Leistung, Ladestände, Börsenpreise und Erneuerbaren-Anteil werden nachvollziehbar dargestellt.
- **Lernende Verbrauchsprognose:** Lernt lokal aus Verbrauchsstunden, Uhrzeit, Wochentag und Außentemperatur. Unterstützt den Import vorhandener InfluxDB-v1-Historie und zeigt Messwerte, Prognosen und historische Vergleiche.
- **Tesla-Ladesteuerung:** PV-Überschussladen, einstellbare Mindestladung, Speicherfreigabe und flexible Netzladung nach Erneuerbaren-Anteil. Fahrzeuglimit, Speicherreserve und Befehlsabstände werden berücksichtigt.
- **PV und Wetter:** Solcast-Prognosen mit P50/P10, gemessener PV-Verlauf und Sieben-Tage-Ausblick für Ertrag und Wetter in Dresden.
- **Bilanz und Vorteil:** Tagesbilanz der PV-Nutzung für Haus, Speicher und Tesla sowie geschätzte Ersparnis und Einspeisevergütung im Wochenvergleich.
- **Konfiguration und Diagnose:** Entitäten, Reserven, Ladegrenzen, Tarife und Planungsgewichte direkt im Panel einstellen. Betriebsarten: Automatik, Speicher bevorzugen, nur Tesla-Mindeststand, Beobachten und Pause.

**Tesla-Sofortladen:** Lädt unabhängig vom Fahrplan mit dem zulässigen Maximalstrom bis 16 A. Die Hausspeicherentladung bleibt gesperrt; fehlende Leistung kommt aus dem Netz. Nach Fahrzeuglimit oder manuellem Beenden geht es nach bestätigtem Ladestopp in den vorherigen Modus zurück. In der Tesla-Kachel steht der eingestellte Ladestrom.

Die Planung verwendet den eingestellten Festtarif. Börsenpreise sind reine Information; der Erneuerbaren-Anteil wirkt mit 25 % des eingestellten EE-Modellgewichts.

## Installation und Updates

1. In **HACS → ⋮ → Benutzerdefinierte Repositories** dieses Repository hinzufügen: `https://github.com/gwmpvv5948-dot/Strommanager`, Typ **Integration**.
2. **Strommanager** herunterladen und Home Assistant neu starten.
3. Nur bei der ersten Einrichtung unter **Einstellungen → Geräte & Dienste → Integration hinzufügen → Strommanager** die Entitäten zuordnen. Anschließend im Beobachtungsmodus prüfen und die gewünschte Regelung aktivieren.

Bestehende Installationen verwenden dieselbe Integration weiter: **nicht löschen oder neu anlegen**. Einstellungen und Lerndaten bleiben unter `/config/.storage` erhalten. Vor Updates ein Backup erstellen. Neue freigegebene Versionen werden über GitHub-Releases bereitgestellt und können über HACS aktualisiert werden.

Details zu Sicherung, Übernahme und Direktinstallation: [Installationsanleitung](INSTALLATION.md).

## Daten und Regelung

Planung und Verbrauchslernen laufen lokal in Home Assistant. Die Lerndaten liegen in einer eigenen SQLite-Datenbank; vorhandene InfluxDB-Daten werden nur gelesen. Die Integration nutzt bestehende HA-Entitäten, etwa von Huawei, Tesla Fleet und Solcast. Wetter-, Preis- und Erneuerbaren-Prognosen benötigen externe Datenquellen; Energyforecast verwendet einen eigenen API-Key.

Die aktuelle Wechselrichter-Untergrenze und die konfigurierten Gerätegrenzen bleiben maßgeblich. Bei ungültigen oder veralteten Planungsdaten greift die hinterlegte Rückfallregelung. **Beobachten** und **Pause** senden keine Gerätebefehle; zuletzt gesetzte Gerätewerte bleiben bestehen. Schlafende Tesla-Fahrzeuge werden nicht automatisch geweckt. Prognosen und Einsparungen sind Schätzungen.

Weitere technische Informationen: [Architektur](docs/ARCHITECTURE.md) · [Änderungen](CHANGELOG.md) · [Releases](https://github.com/gwmpvv5948-dot/Strommanager/releases).

### Lokales Icon in HACS 2.0.5

Das Icon liegt bereits in `custom_components/solar_pilot/brand/`. HACS 2.0.5
verwendet in seinem Frontend und seiner Update-Entität noch den externen
Brands-Server. Für `solar_pilot` existiert dort kein Bild. Reparaturen verwenden
dagegen die lokale HA-Brands-API.

Der optionale, lokale Kompatibilitätsfix `tools/fix_hacs_brand.py` ersetzt für
**ausschließlich `solar_pilot`** diese URL durch
`/solar_pilot_frontend/strommanager-icon.png`. Er verändert HACS-Dateien nur bei
explizitem Aufruf mit `--apply`, sichert alle Änderungen unter `/config/backups`
und prüft die erwartete HACS-Codeform. Ohne `--apply` ist der Aufruf lesend.
Andere Integrationen und das Updateverhalten bleiben unverändert. Nach Anwendung
HA neu starten und die Oberfläche neu laden. Ein späteres HACS-Update kann den
Fix überschreiben; dann erneut prüfen/anwenden. Bei Marketplace mit nativer
Unterstützung lokaler Markenbilder wird dieser Fix nicht benötigt.


### Kompakte Tesla-Kachel (0.1.102)

Der Tesla-Ladestand steht im Mittelpunkt. Veraltete oder aus der lokalen Historie
wiederhergestellte Werte werden mit `~`, Schraffur und Alter dargestellt. SoC und
Meldezeit bleiben über Neustarts gespeichert und werden ausschließlich angezeigt,
nicht als aktuelle Werte zur Steuerung verwendet. Ohne gespeicherten gültigen
Stand wird kein Beispielwert eingesetzt. Zeitangaben beruhen auf der HA-Meldung.

Mindestladegrenze (rot), Mindestziel (amber) und Fahrzeuglimit liegen als Marken
im Balken. Mindestziel und Fahrzeuglimit lassen sich per Button gezielt bearbeiten;
ein Speichern löst die entsprechende Einstellungsänderung aus.

Beim bestätigten Laden zuhause erscheinen Leistung, rechnerischer momentaner
PV-Anteil und der Tesla-Sitzungszähler. Zielzeiten sind Näherungen bei konstantem
Ladestrom mit konfigurierter Kapazität und Ladewirkungsgrad; Ladepausen und
Abregelung sind nicht vorhersehbar. Reichweite und Sitzungsenergie kommen aus
konfigurierbaren Tesla-Sensoren unter Verwendete Entitäten. Fehlende/veraltete
Sensordaten bleiben offen; es werden keine zusätzlichen Tesla-Cloud-Abrufe oder
Wake-up-Befehle ausgelöst.


### Kompakte Hausspeicher-Kachel (0.1.104)

Waagerechter SoC-Balken mit Endreserve (rot), Abendreserve (amber) und
Tesla-Speicherfreigabe (blau). Die Wechselrichter-Untergrenze steht als Fußnote.
Die Endreserve ist ein Ziel für das Ende des Optimierungsfahrplans und keine
zusätzliche feste Entladegrenze fürs Haus.

Energie und Zeiten beruhen auf der eingestellten nutzbaren Kapazität und der
aktuellen gemeldeten Hausspeicherleistung. Nutzbar bis Endreserve berücksichtigt
eine gegebenenfalls höhere Wechselrichter-Untergrenze. Die nächste Schwelle,
Restdauer und Voll-Zeit sind Näherungen bei konstanter Leistung, keine Zusagen
des Optimierers. Fehlende/veraltete SoC- und Leistungsdaten bleiben offen.

Der Tagesverlauf nutzt die bereits geladene HA-SoC-Historie ab lokaler Mitternacht.
Explizite Messlücken unterbrechen die Linie; Min/Max beziehen sich auf die
verfügbaren Tagesmesspunkte. Keine zusätzlichen Gerätebefehle und keine
Änderung von Betriebsart, Schwellen oder Regelung.

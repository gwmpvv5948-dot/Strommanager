# Strommanager

<img src="https://raw.githubusercontent.com/gwmpvv5948-dot/Strommanager/main/custom_components/solar_pilot/brand/icon%402x.png" alt="Strommanager" width="96" height="96">

**Version 0.1.93** · Home-Assistant-Integration für Photovoltaik, Hausspeicher und Tesla – mit eigener Übersicht in der Seitenleiste.

## Funktionen

- **Energie jetzt:** PV-Leistung, Hausverbrauch, Netzbezug, Akku- und Tesla-Ladestand sowie aktive Verbraucher auf einen Blick.
- **Energie-Fahrplan:** Lokale Planung mit HiGHS für die nächsten 24 Stunden im Viertelstundenraster. Haus und Speicher werden gemeinsam optimiert; die Tesla-Planung lässt sich zuschalten. Leistung, Ladestände, Börsenpreise und Erneuerbaren-Anteil werden nachvollziehbar dargestellt.
- **Lernende Verbrauchsprognose:** Lernt lokal aus Verbrauchsstunden, Uhrzeit, Wochentag und Außentemperatur. Unterstützt den Import vorhandener InfluxDB-v1-Historie und zeigt Messwerte, Prognosen und historische Vergleiche.
- **Tesla-Ladesteuerung:** PV-Überschussladen, einstellbare Mindestladung, Speicherfreigabe und flexible Netzladung nach Preisgrenze beziehungsweise Erneuerbaren-Anteil. Fahrzeuglimit, Speicherreserve und Befehlsabstände werden berücksichtigt.
- **PV und Wetter:** Solcast-Prognosen mit P50/P10, gemessener PV-Verlauf und Sieben-Tage-Ausblick für Ertrag und Wetter in Dresden.
- **Bilanz und Vorteil:** Tagesbilanz der PV-Nutzung für Haus, Speicher und Tesla sowie geschätzte Ersparnis und Einspeisevergütung im Wochenvergleich.
- **Konfiguration und Diagnose:** Entitäten, Reserven, Ladegrenzen, Tarife und Planungsgewichte direkt im Panel einstellen. Betriebsarten: Automatik, Speicher bevorzugen, nur Tesla-Mindeststand, Beobachten und Pause.

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

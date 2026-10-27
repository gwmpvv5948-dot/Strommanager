# Architektur und Inbetriebnahme

## Komponenten

| Datei | Aufgabe |
|---|---|
| `model.py` | Reine Berechnung aus einem zeitgestempelten Snapshot; keine I/O |
| `executor.py` | Änderungen planen, Aufrufe begrenzen, Fehler-Backoff und Besitzverfolgung |
| `controller.py` | HA-Zustände und Einheiten normalisieren; Services ausführen; Zustand speichern |
| `config_flow.py` | Entitätszuordnung und Optionen über die HA-Oberfläche |
| `sensor.py` | Kleine Status- und Empfehlungssensoren, ohne umfangreichen Befehlsverlauf im Recorder |
| `frontend/panel.js` | Eigenes responsives Panel mit Übersicht, Einstellungen und Diagnose |
| `__init__.py` | Lebenszyklus, Admin-Services, authentifizierter WebSocket-Status, Panelregistrierung |

Die Gerätekommunikation bleibt vollständig bei den bestehenden Integrationen. Der Browser erhält keinen neuen Zugangsschlüssel. Panel und Statusabfrage sind Administratoren vorbehalten; Services prüfen Administratorrechte über den HA-Helper. Statische JS-Dateien enthalten ausschließlich Anwendungscode.

## Entscheidungsfolge

1. Verfügbarkeit, Zahlenbereiche, Einheiten und Alter der Eingangsdaten prüfen.
2. Heimischen Ladepunkt anhand Fahrzeugstandort, Kabel und Wallboxfreigabe bestimmen.
3. Verfügbaren PV-Anteil aus Netz-, Wallbox- und Batterie-Leistung bestimmen. Batterieentladung zählt nicht als PV.
4. Speicherbedarf bis zur Abendreserve bestimmen. Konservativen PV-Restertrag um geschätzte Hauslast und Puffer reduzieren.
5. Wenn das Abendziel knapp erscheint: volles Speicher-Ladebudget reservieren. Sonst das fehlende Ladebudget vorgezogen auf die verbleibende Zeit verteilen.
6. Tesla ausschließlich mit PV-Überschuss laden, auch unter Mindeststand. PV-Budget in Ampere für 1 oder 3 Phasen umrechnen. Start ab 8 A, Weiterladen ab 6 A. Das Fahrzeuglimit bleibt maßgeblich.
7. Speicherschutz vor Ladestart setzen. Start/Stromänderungen warten auf Rückmeldung der 0-W-Grenze und ausgeschalteter Speicher-Netzladung.

Die Schwellen und Vorzeichen sind konfigurierbar. Geräteseitige Grenzen und Schrittweiten werden vor Zahlenbefehlen geprüft. Bei fehlenden Messdaten wird die Speicherentladung konservativ gesperrt. Das kann Netzbezug erhöhen; die Oberfläche weist auf die fehlenden Daten hin.

## Übernahme und Fehlerfälle

Erste Einrichtung immer im Beobachtungsmodus. Aktivierung ist ein separater Admin-Vorgang, der ausschließlich die ausgewählte bisherige Ladeautomation deaktiviert. Alle weiteren möglicherweise schreibenden Systeme müssen vor Inbetriebnahme geprüft werden. Ein Service-Erfolg ist keine physikalische Erfolgsgarantie; Istwerte und Verlauf müssen kontrolliert werden.

Befehle werden serialisiert. Bei fehlgeschlagenem Speicherschutz wird kein Autoladestart gesendet. Fehlgeschlagene Stromänderungen verhindern den folgenden Start. Bei Fehlern steigt die Wiederholpause bis maximal 30 Minuten. Tesla-Befehle haben zusätzlich einen globalen Mindestabstand. Mehrere notwendige Befehle innerhalb einer Regelrunde (zum Beispiel Ladestrom setzen, dann starten) können gemeinsam ausgeführt werden.

Pause oder Entladen startet und stoppt keine Fahrzeuge. Bei expliziter Rückgabe werden Zahlenwerte nur bei weiterhin eigenem Besitz zurückgesetzt. Ein Ladestrom wird dabei nur am erreichbaren heimischen Fahrzeug zurückgesetzt. Speicher-Netzladung wird nie eingeschaltet. Eine zuvor durch Strommanager ausgeschaltete Automation wird nur bei expliziter Rückgabe wieder aktiviert.

## Bereits geprüft

- Rechenmodell: Mindeststand, Fahrzeuglimit, Prognosepuffer, Tag/Nacht, 1/3 Phasen und Start-Hysterese.
- Datenverlust: veraltete Messwerte, fehlende Prognose, unbekannter Sonnenstand, NaN/Infinity.
- Befehlsplanung: keine Änderungen bei identischen Werten, Backoff, Startblockade nach Schutzfehlern, manuelle Übersteuerung bei Rückgabe.
- Adapter-Vertragstests mit In-Memory-Zuständen und Services: Beobachtung ohne Schreibzugriff, Konflikte, Übernahme/Rückgabe, Einheiten und Gerätegrenzen.
- Python- und JavaScript-Syntax sowie JSON/Übersetzungsdateien.

Die Adapter-Vertragstests simulieren Home Assistant. Sie sind **kein Test eines echten HA-Core-Prozesses**.

## Vor einer aktiven Installation noch prüfen

- Integration in einem echten HA 2026.10 installieren und Einrichtung/Neuladen/Entladen testen.
- UI auf Desktop und Telefon, Statusrechte und Fehlermeldungen prüfen.
- Beobachtungsmodus mit echten Messwerten gegen die bisherige Automation vergleichen.
- 0-W-Rückmeldung, Tesla-Start/Stopp/Stromänderung und Geräte-Schrittweiten kontrolliert prüfen.
- Ausfall von Tesla/Huawei/Prognose und Neustarts im Beobachtungsmodus durchspielen.
- Rückgabe an die bisherige Automation prüfen; erst danach dauerhaft übernehmen.

## Grenzen der ersten Version

Kein gelerntes Hauslastmodell, keine Garantie für 70 % ohne Sonne, keine zeitgenaue Null-Netzbezugsregelung über die Cloud. Kein automatisches Tesla-Aufwecken. Kein App-/HACS-Release und keine direkte Huawei-/Tesla-API. Entitätszuordnung wird bei Ersteinrichtung gewählt; eine UI zum späteren Umverdrahten ist noch nicht implementiert. Automationen außerhalb der expliziten Zuordnung können nicht zuverlässig als konkurrierende Schreiber erkannt werden.

## Referenzen

- [Custom Panels](https://contributors.home-assistant.io/frontend/custom-ui/panel/)
- [Config Flow](https://developers.home-assistant.io/docs/config_entries_config_flow_handler/)
- [Tesla Fleet](https://www.home-assistant.io/integrations/tesla_fleet/)
- [Huawei Solar](https://github.com/wlcrs/huawei_solar)

# Strommanager in Home Assistant installieren

Direktinstallation aus diesem GitHub-Repository, ohne HACS. Der interne
Integrationsordner heißt weiterhin `solar_pilot`.

## Voraussetzungen

- Home Assistant mit Zugriff auf `/config`, beispielsweise Home Assistant OS mit
  dem Add-on **Terminal & SSH** oder **Advanced SSH & Web Terminal**.
- Im Terminal sind `curl`, `tar` und die Home-Assistant-CLI `ha` verfügbar.
- Die benötigten Sensoren und Geräte sind bereits in HA eingerichtet.
- Vor der ersten Installation ein vollständiges HA-Backup erstellen.

Die folgenden Befehle mit `ha core` gelten für Installationen mit Supervisor.
Bei Home Assistant Container/Core den Ordner im dort eingebundenen
Konfigurationsverzeichnis installieren und Prüfung/Neustart entsprechend der
jeweiligen Installation ausführen.

## 1. Integration herunterladen und installieren

Das HA-Terminal öffnen und den gesamten folgenden Block einfügen. Er installiert
Version **0.1.43**, festgelegt durch Commit
`324c7afcdebf161236a7dd2c56e43f19fcd92016`.

Es wird ausschließlich `custom_components/solar_pilot` aus dem Archiv übernommen.
Ein vorhandener Integrationsordner wird gesichert und zusätzlich als alter Ordner
behalten. Andere Integrationen und HA-Konfigurationsdateien werden nicht verändert.

```sh
(
  set -e

  commit=324c7afcdebf161236a7dd2c56e43f19fcd92016
  temp_dir=$(mktemp -d)
  install_stamp=$(date +%Y%m%d-%H%M%S)

  mkdir -p /config/custom_components

  if [ -d /config/custom_components/solar_pilot ]; then
    backup="/config/solar_pilot-backup-$install_stamp.tar.gz"
    tar -czf "$backup" -C /config/custom_components solar_pilot
    echo "Sicherung: $backup"
  fi

  curl -fL \
    "https://github.com/gwmpvv5948-dot/Strommanager/archive/$commit.tar.gz" \
    -o "$temp_dir/source.tar.gz"

  tar -xzf "$temp_dir/source.tar.gz" -C "$temp_dir"
  source_dir="$temp_dir/Strommanager-$commit/custom_components/solar_pilot"
  test -f "$source_dir/manifest.json"
  cp -a "$source_dir" "$temp_dir/solar_pilot"

  if [ -d /config/custom_components/solar_pilot ]; then
    previous_dir="/config/solar_pilot-alt-$install_stamp"
    mv /config/custom_components/solar_pilot "$previous_dir"
    echo "Vorheriger Ordner: $previous_dir"
  fi

  cp -a "$temp_dir/solar_pilot" /config/custom_components/
  ha core check
)
```

Falls Download, Kopieren oder Prüfung fehlschlagen: Fehlermeldung prüfen und
Home Assistant noch nicht neu starten. Der Block beendet sich beim ersten Fehler.

## 2. Nach erfolgreicher Prüfung neu starten

Nur wenn `ha core check` erfolgreich abgeschlossen wurde:

```sh
ha core restart
```

Warten, bis HA und die verwendeten Sensoren wieder verfügbar sind.

## 3. Erstinstallation einrichten

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen → Strommanager** öffnen.
2. Die Sensoren und Geräte der eigenen Anlage zuordnen. Vorausgefüllte Entity-IDs
   stammen aus der ursprünglichen Anlage und müssen auf einem anderen HA angepasst werden.
3. Das Panel **Strommanager** in der Seitenleiste öffnen.
4. Die Erstinstallation startet im **Beobachtungsmodus**. Werte, Einheiten,
   Vorzeichen der Netz- und Batterieleistung sowie Ladephasen prüfen.
5. Erst anschließend bei gewünschter aktiver Steuerung **Steuerung aktivieren** wählen.
   Andere HA-Automationen werden durch Strommanager nicht verändert.

## Bestehende Installation aktualisieren

Denselben Ablauf verwenden: sichern, Integrationsordner ersetzen, prüfen,
neu starten. Die Integration nicht löschen und neu hinzufügen.

Gespeicherte Zuordnungen, Betriebsmodus und Geräteeinstellungen werden durch den
Dateiaustausch nicht neu gesetzt. Ein bereits aktiver Betriebsmodus bleibt aktiv;
Beobachtungsmodus gilt nur bei einer neuen Einrichtung.

Nach dem Neustart das Panel neu laden und die Versionsangabe im Fußbereich prüfen.
Falls noch die alte Darstellung erscheint, den Browser vollständig neu laden oder
in der HA-App die Frontend-Ansicht neu öffnen.

Für eine andere Version die Variable `commit` auf den vollständigen, geprüften
Commit-SHA setzen. Die Anleitung folgt absichtlich keiner automatisch wechselnden
`main`-Version.

## Vorherigen Integrationsordner wiederherstellen

Bei einem Update nennt das Terminal den alten Ordner, beispielsweise
`/config/solar_pilot-alt-20261030-203000`. Diesen Pfad im folgenden Block anpassen.
Die derzeit installierte Fassung wird ebenfalls behalten:

```sh
(
  set -e
  previous_dir=/config/solar_pilot-alt-20261030-203000
  test -f "$previous_dir/manifest.json"
  mv /config/custom_components/solar_pilot \
    "/config/solar_pilot-zurueckgenommen-$(date +%Y%m%d-%H%M%S)"
  cp -a "$previous_dir" /config/custom_components/solar_pilot
  ha core check
)
```

Nach erfolgreicher Prüfung erneut `ha core restart` ausführen.
Dies stellt nur die Integrationsdateien wieder her. Für eine vollständige
Wiederherstellung von HA-Konfiguration und Daten das vollständige HA-Backup verwenden.

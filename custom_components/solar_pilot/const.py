"""Integration constants; entity names are editable during setup."""
DOMAIN = "solar_pilot"
VERSION = "0.1.24"
PANEL_PATH = "solar-pilot"
MODES = ("observe", "auto", "storage_first", "charge_minimum", "paused")
ENTITY_DEFAULTS = {
    "house_soc": "sensor.batteries_batterieladung",
    "battery_power": "sensor.batteries_lade_entladeleistung",
    "discharge_limit": "number.batterien_maximale_entladeleistung",
    "grid_charge": "switch.batterien_laden_aus_dem_netz",
    "pv_power": "sensor.inverter_eingangsleistung",
    "grid_power": "sensor.power_meter_wirkleistung",
    "wallbox_power": "sensor.30a_breaker_energy_power",
    "wallbox_enabled": "switch.30a_breaker",
    "car_soc": "sensor.schorschi_batteriestand",
    "car_limit": "number.schorschi_ladelimit",
    "car_current": "number.schorschi_ladestromstarke",
    "car_charge": "switch.schorschi_aufladung",
    "car_home": "device_tracker.schorschi_standort",
    "car_cable": "binary_sensor.schorschi_ladekabel",
    "car_online": "binary_sensor.schorschi_status",
    "forecast": "sensor.solcast_pv_forecast_prognose_verbleibende_leistung_heute",
    "forecast_updated": "sensor.solcast_pv_forecast_zeitpunkt_letzter_api_abruf",
    "sun": "sun.sun",
    "legacy_automation": "automation.wallbox_akkuentladung_begrenzen_und_freigeben",
}
ENTITY_LABELS = {
    "house_soc": "Hausspeicher · Ladestand",
    "battery_power": "Batterieleistung (+ Laden)",
    "discharge_limit": "Maximale Entladeleistung (steuerbar)",
    "grid_charge": "Netzladung des Hausspeichers",
    "pv_power": "PV-Istleistung",
    "grid_power": "Netzleistung (+ Einspeisung)",
    "wallbox_power": "Wallbox-Leistung",
    "wallbox_enabled": "Wallbox eingeschaltet",
    "car_soc": "Fahrzeug · Ladestand",
    "car_limit": "Fahrzeug · Ladelimit",
    "car_current": "Fahrzeug · Ladestrom",
    "car_charge": "Fahrzeug · Ladefreigabe",
    "car_home": "Fahrzeug · Standort",
    "car_cable": "Fahrzeug · Ladekabel",
    "car_online": "Fahrzeug · Online",
    "forecast": "PV-Restprognose heute",
    "forecast_updated": "Letzter Prognoseabruf",
    "sun": "Sonnenstand",
    "legacy_automation": "Bisherige Ladeautomation (für Übernahme)",
}

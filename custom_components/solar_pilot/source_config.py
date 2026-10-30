"""Entity mappings shared by settings, chart display and consumption learning."""
import re
from .const import ENTITY_DEFAULTS

LEARNING_DEFAULTS = {
    "inverter": "sensor.inverter_wirkleistung",
    "garage": "sensor.garage_pv_sonoff_energy_power",
    "shed": "sensor.schuppen_pv_sonoff_energy_power",
    "temperature": "sensor.dresden_temperatur",
    "weather": "weather.dresden_stadt",
}
DISPLAY_LABELS = {
    "pv_daily": "WR-Tagesertrag · Monatsreferenz", "roof_daily": "Dach-Tagesertrag",
    "total_consumption": "Tagesverbrauch · Haus + Tesla", "battery_min_soc": "Akku · Entladeuntergrenze",
    **{f"forecast_day_{i}": f"PV-Prognose Tag {i}" for i in range(1, 8)},
}
LEARNING_LABELS = {"inverter":"AC-Wechselrichterleistung", "garage":"PV Garage", "shed":"PV Schuppen", "temperature":"Außentemperatur", "weather":"HA-Wetterquelle"}
ENTITY_ID = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def display_sources(entities, overrides=None):
    forecast = entities.get("forecast_day") or entities.get("forecast", "").replace("prognose_verbleibende_leistung_heute", "prognose_heute").replace("forecast_remaining_today", "forecast_today")
    suffixes = ["prognose_heute","prognose_morgen",*[f"prognose_tag_{i}" for i in range(3,8)]] if forecast.endswith("prognose_heute") else ["forecast_today","forecast_tomorrow",*[f"forecast_day_{i}" for i in range(3,8)]]
    days = [forecast.removesuffix(suffixes[0])+suffix if forecast.endswith(suffixes[0]) else forecast for suffix in suffixes]
    return {"pv_daily":entities.get("pv_daily") or entities.get("pv_power", "").replace("eingangsleistung","tagesertrag"),
        "roof_daily":"sensor.sum_dach_tagesertrag", "total_consumption":"sensor.real_tagesverbrauch",
        "battery_min_soc":"number.batterien_entlade_ende_ladestand",
        **{f"forecast_day_{i}":value for i,value in enumerate(days,1)}, **(overrides or {})}


def validate_mapping(hass, values, current, defaults):
    """Validate changed IDs only; existing unavailable mappings remain editable."""
    for key, value in values.items():
        if key not in defaults or not isinstance(value,str) or not ENTITY_ID.fullmatch(value):
            raise ValueError(f"Ungültige Zuordnung: {key}")
        if value == current.get(key):
            continue
        domain = defaults[key].split('.')[0]
        if value.split('.')[0] != domain or hass.states.get(value) is None:
            raise ValueError(f"{key}: vorhandene Entität aus {domain} erforderlich")

        units = {"house_soc":("%",),"car_soc":("%",),"car_limit":("%",),"battery_min_soc":("%",),
            "car_current":("A",),"temperature":("°C",),
            **{k:("W","kW") for k in ("pv_power","battery_power","grid_power","wallbox_power","discharge_limit","inverter","garage","shed")},
            **{k:("Wh","kWh") for k in ("forecast","pv_daily","roof_daily","total_consumption",*[f"forecast_day_{i}" for i in range(1,8)])}}
        state=hass.states.get(value)
        if key in units and state.attributes.get("unit_of_measurement") not in units[key]:
            raise ValueError(f"{key}: Einheit muss {' / '.join(units[key])} sein")

"""Pure decision engine. No Home Assistant imports, network or side effects."""
from __future__ import annotations

from dataclasses import dataclass, fields
from math import floor, isfinite


@dataclass(frozen=True)
class Settings:
    reserve_soc: float = 70
    capacity_kwh: float = 5
    car_min_soc: float = 50
    phases: int = 1
    min_amps: int = 6
    max_amps: int = 16
    start_amps: int = 8
    normal_discharge_w: float = 2500
    max_charge_w: float = 2500
    forecast_factor: float = .85
    buffer_kwh: float = .5
    efficiency: float = .9
    margin_w: float = 200
    budget_extra_kwh: float = 2.5
    minimum_house_w: float = 300
    cloud_interval_s: int = 300
    meter_max_age_s: int = 300
    car_max_age_s: int = 1800
    forecast_max_age_s: int = 28800
    minimum_pause_s: int = 180
    grid_export_positive: bool = True
    battery_charge_positive: bool = True

    def __post_init__(self):
        for f in fields(self):
            value = getattr(self, f.name)
            if f.name not in ("grid_export_positive", "battery_charge_positive") and (type(value) not in (int, float)):
                raise ValueError(f.name)
            if isinstance(value, (int, float)) and not isfinite(value):
                raise ValueError(f.name)
        for name in ("phases", "min_amps", "max_amps", "start_amps", "cloud_interval_s",
                     "meter_max_age_s", "car_max_age_s", "forecast_max_age_s", "minimum_pause_s"):
            if type(getattr(self, name)) is not int:
                raise ValueError(name)
        for name in ("grid_export_positive", "battery_charge_positive"):
            if type(getattr(self, name)) is not bool:
                raise ValueError(name)
        ranges = {
            "reserve_soc": (0, 100), "capacity_kwh": (.1, 200),
            "car_min_soc": (0, 100), "normal_discharge_w": (0, 30000),
            "max_charge_w": (0, 30000), "forecast_factor": (.1, 1),
            "buffer_kwh": (0, 30), "budget_extra_kwh": (0, 30), "efficiency": (.5, 1),
            "margin_w": (0, 3000), "minimum_house_w": (0, 5000),
            "cloud_interval_s": (120, 3600), "meter_max_age_s": (30, 900),
            "car_max_age_s": (60, 3600), "forecast_max_age_s": (300, 86400),
            "minimum_pause_s": (60, 1800),
        }
        for name, (low, high) in ranges.items():
            if not low <= getattr(self, name) <= high:
                raise ValueError(name)
        if self.phases not in (1, 3):
            raise ValueError("phases")
        if not (6 <= self.min_amps <= self.start_amps <= self.max_amps <= 48):
            raise ValueError("amps")


@dataclass(frozen=True)
class Snapshot:
    """All powers in W, energy in kWh, ages in seconds; None is never zero."""
    now: float
    daylight: bool | None
    hours_left: float | None
    house_soc: float | None
    house_soc_age: float
    pv_w: float | None
    grid_export_w: float | None
    battery_charge_w: float | None
    wallbox_w: float | None
    meter_age: float
    forecast_kwh: float | None
    forecast_age: float
    car_soc: float | None
    car_limit: float | None
    car_age: float
    at_home: bool
    cable: bool
    wallbox_enabled: bool
    online: bool
    charging: bool | None
    charge_changed_age: float
    car_current: float | None
    current_discharge_w: float | None
    grid_charge_enabled: bool | None
    location_age: float = 0


@dataclass(frozen=True)
class Decision:
    code: str
    reason: str
    target_amps: int | None
    discharge_w: float
    may_control_car: bool
    reserve_charge_w: float
    available_car_w: float
    forecast_net_kwh: float | None
    reserve_needed_kwh: float | None
    problems: tuple[str, ...]


def valid(value: float | None, low: float = -1e8, high: float = 1e8) -> bool:
    return value is not None and isfinite(value) and low <= value <= high


def decide(s: Snapshot, c: Settings, mode: str = "auto") -> Decision:
    """Compute intent. Executor alone decides whether commands are allowed."""
    problems: list[str] = []
    storage_ok = valid(s.house_soc, 0, 100) and 0 <= s.house_soc_age <= c.meter_max_age_s
    meters_ok = (all(valid(x) for x in (
        s.pv_w, s.grid_export_w, s.battery_charge_w, s.wallbox_w))
        and 0 <= s.meter_age <= c.meter_max_age_s)
    forecast_ok = valid(s.forecast_kwh, 0, 1000) and 0 <= s.forecast_age <= c.forecast_max_age_s
    car_ok = (valid(s.car_soc, 0, 100) and valid(s.car_limit, 0, 100)
              and 0 <= s.car_age <= c.car_max_age_s)
    eligible = s.at_home and s.cable and s.wallbox_enabled and 0 <= s.location_age <= c.car_max_age_s
    if not storage_ok:
        problems.append("Speicher-Ladestand fehlt oder ist veraltet")
    if not meters_ok:
        problems.append("Leistungsmessungen fehlen oder sind veraltet")
    if not forecast_ok:
        problems.append("PV-Prognose fehlt oder ist veraltet; Speicher wird bevorzugt")
    if eligible and not car_ok:
        problems.append("Fahrzeugdaten fehlen oder sind veraltet")
    if s.daylight is None:
        problems.append("Sonnenstand unbekannt; Speicher bleibt geschützt")
    hours_ok = valid(s.hours_left, 0, 24)
    hours = max(.25, s.hours_left or 0)
    needed = max(0, (c.reserve_soc - s.house_soc) * c.capacity_kwh / 100 / c.efficiency) if storage_ok else None
    pv_available = 0.0
    house_w = c.minimum_house_w
    if meters_ok:
        # Remove battery discharge from the apparent surplus; account for charge losses.
        batt = min(s.battery_charge_w, s.battery_charge_w * .95)
        pv_available = max(0, s.wallbox_w + s.grid_export_w + batt)
        house_w = max(c.minimum_house_w, s.pv_w * .95 - pv_available)
    forecast_net = (max(0, s.forecast_kwh * c.forecast_factor - house_w * hours / 1000 - c.buffer_kwh)
                    if forecast_ok and hours_ok and s.daylight else None)
    reserve = 0.0
    if needed is None or needed > 0:
        reserve = c.max_charge_w
        if (needed is not None and forecast_net is not None and forecast_net >= needed
                and mode != "storage_first"):
            reserve = min(c.max_charge_w, max(200, needed * 1000 / max(.5, hours * .5)))
    car_w = max(0, pv_available - reserve - c.margin_w)
    solar_amps = floor(car_w / (230 * c.phases))
    watts_running = valid(s.wallbox_w, 200)
    threshold = c.min_amps if watts_running else c.start_amps
    target = None
    code, reason = "away", "Fahrzeug nicht am heimischen Ladepunkt; keine Fahrzeugbefehle"
    if eligible:
        target = 0
        if not car_ok:
            code, reason = "car_data_missing", "Laden pausieren: Fahrzeugdaten fehlen oder sind veraltet"
        elif s.car_soc >= s.car_limit:
            code, reason = "car_limit", "Fahrzeug-Ladelimit erreicht"
        elif mode == "charge_minimum" and s.car_soc >= c.car_min_soc:
            code, reason = "minimum_reached", "Tesla-Mindeststand erreicht; Modus lädt nicht weiter"
        elif not s.daylight:
            code, reason = "night", "Autoladung wartet auf PV; auch unter dem Tesla-Mindeststand"
        elif not meters_ok or not storage_ok or not hours_ok:
            code, reason = "measurements_missing", "PV-Laden pausieren: keine verlässliche Energiebilanz"
        elif solar_amps < threshold:
            code, reason = "reserve" if reserve else "clouds", "PV reicht noch nicht für Speicherreserve und Autoladung"
        else:
            target = min(c.max_amps, solar_amps)
            code, reason = "solar", "PV-Überschuss nutzen; Ladebudget für die Abendreserve ist berücksichtigt"
    discharge = c.normal_discharge_w
    # Protection is local and independent of cloud availability or vehicle identity.
    if (watts_running or (valid(s.wallbox_w, 10.000001)) or (target or 0) >= c.min_amps
            or not meters_ok
            or s.daylight is None
            or (s.daylight and (not storage_ok or s.house_soc < c.reserve_soc))):
        discharge = 0
    if mode in ("observe", "paused"):
        code = mode
        reason = ("Empfehlung: " + reason if mode == "observe"
                  else "Pausiert: keine Befehle; letzter Gerätezustand bleibt bestehen")
    return Decision(code, reason, target, discharge, eligible and s.online,
                    round(reserve), round(car_w), forecast_net, needed, tuple(problems))

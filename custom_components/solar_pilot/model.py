"""Pure decision engine. No Home Assistant imports, network or side effects."""
from __future__ import annotations

from dataclasses import replace, dataclass, fields
from math import floor, isfinite


@dataclass(frozen=True)
class Settings:
    planner_price_enabled: bool = True
    planner_price_weight: float = 1.0
    planner_ev_price_ct: float = 10.0
    planner_ev_enabled: bool = False
    planner_ev_capacity_kwh: float = 50
    planner_ev_efficiency: float = .9
    planner_ev_grid_share: float = 60
    planner_control_enabled: bool = False
    planner_terminal_soc: float = 20
    planner_ee_weight_eur_kwh: float = .12
    planner_cycle_eur_kwh: float = .02
    grid_renewable_enabled: bool = False
    grid_hold_share: float = 60
    grid_release_share: float = 55
    reserve_soc: float = 70
    capacity_kwh: float = 5
    car_min_soc: float = 50
    car_low_soc: float = 20
    storage_release_soc: float = 80
    phases: int = 1
    min_amps: int = 6
    max_amps: int = 16
    tesla_min_charge_amps: int = 12
    start_amps: int = 8
    normal_discharge_w: float = 2500
    max_charge_w: float = 2500
    forecast_factor: float = .85
    buffer_kwh: float = .5
    efficiency: float = .9
    margin_w: float = 200
    benefit_initial_savings_eur: float = 0.0
    feed_in_eur_kwh: float = .082
    purchase_eur_kwh: float = .27
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
            if f.name not in ("grid_export_positive", "battery_charge_positive", "grid_renewable_enabled", "planner_control_enabled", "planner_ev_enabled", "planner_price_enabled") and (type(value) not in (int, float)):
                raise ValueError(f.name)
            if isinstance(value, (int, float)) and not isfinite(value):
                raise ValueError(f.name)
        for name in ("phases", "min_amps", "max_amps", "start_amps", "tesla_min_charge_amps", "cloud_interval_s",
                     "meter_max_age_s", "car_max_age_s", "forecast_max_age_s", "minimum_pause_s"):
            if type(getattr(self, name)) is not int:
                raise ValueError(name)
        for name in ("grid_export_positive", "battery_charge_positive", "grid_renewable_enabled", "planner_control_enabled", "planner_ev_enabled", "planner_price_enabled"):
            if type(getattr(self, name)) is not bool:
                raise ValueError(name)
        ranges = {
            "planner_price_weight": (0, 10), "planner_ev_price_ct": (-100, 500),
            "planner_ev_capacity_kwh": (1, 200), "planner_ev_efficiency": (.5, 1), "planner_ev_grid_share": (0, 100),
            "planner_terminal_soc": (0, 100), "planner_ee_weight_eur_kwh": (0, 5), "planner_cycle_eur_kwh": (0, 5),
            "grid_hold_share": (0, 100), "grid_release_share": (0, 100),
            "reserve_soc": (0, 100), "capacity_kwh": (.1, 200),
            "car_min_soc": (0, 100), "car_low_soc": (0, 100),
            "storage_release_soc": (0, 100), "normal_discharge_w": (0, 30000),
            "max_charge_w": (0, 30000), "forecast_factor": (.1, 1),
            "buffer_kwh": (0, 30), "budget_extra_kwh": (0, 30), "efficiency": (.5, 1),
            "benefit_initial_savings_eur": (0, 10000000),
            "feed_in_eur_kwh": (0, 5), "purchase_eur_kwh": (0, 5),
            "margin_w": (0, 3000), "minimum_house_w": (0, 5000),
            "cloud_interval_s": (120, 3600), "meter_max_age_s": (30, 900),
            "car_max_age_s": (60, 3600), "forecast_max_age_s": (300, 86400),
            "minimum_pause_s": (60, 1800),
        }
        for name, (low, high) in ranges.items():
            if not low <= getattr(self, name) <= high:
                raise ValueError(name)
        if self.grid_release_share >= self.grid_hold_share:
            raise ValueError("grid_release_share must be below grid_hold_share")
        if self.car_low_soc >= self.car_min_soc:
            raise ValueError("car_low_soc must be below car_min_soc")
        if self.storage_release_soc < self.reserve_soc:
            raise ValueError("storage_release_soc must be at least reserve_soc")
        if self.phases not in (1, 3):
            raise ValueError("phases")
        if not 10 <= self.tesla_min_charge_amps <= 16:
            raise ValueError("Tesla-Mindestladestrom muss zwischen 10 und 16 A liegen")
        if not (6 <= self.min_amps <= self.start_amps <= self.max_amps <= 48):
            raise ValueError("amps")


    @property
    def ev_min_amps(self):
        return max(self.min_amps, self.tesla_min_charge_amps)

    @property
    def ev_start_amps(self):
        return max(self.start_amps, self.ev_min_amps)


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
    grid_hold: bool = False
    battery_min_soc: float | None = None


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


@dataclass(frozen=True)
class ChargingState:
    minimum_active: bool = False
    storage_active: bool = False


def charging_state(s: Snapshot, c: Settings, previous: ChargingState) -> ChargingState:
    """Latch permission, not commands; retain across stale samples and restarts."""
    car_fresh = (valid(s.car_soc, 0, 100) and valid(s.car_limit, 0, 100)
                 and 0 <= s.car_age <= c.car_max_age_s
                 and 0 <= s.location_age <= c.car_max_age_s)
    minimum, storage = previous.minimum_active, previous.storage_active
    if car_fresh:
        if not (s.at_home and s.cable and s.wallbox_enabled) or s.car_soc >= min(c.car_min_soc, s.car_limit):
            minimum = False
        elif s.car_soc < c.car_low_soc:
            minimum = True
    if valid(s.house_soc, 0, 100) and 0 <= s.house_soc_age <= c.meter_max_age_s:
        if s.house_soc <= c.reserve_soc:
            storage = False
        elif s.house_soc > c.storage_release_soc:
            storage = True
    return ChargingState(minimum, storage)


def decide(s: Snapshot, c: Settings, mode: str = "auto", state: ChargingState | None = None) -> Decision:
    """Compute intent. Executor alone decides whether commands are allowed."""
    if mode == "charge_now":
        car_ok=(valid(s.car_soc,0,100) and valid(s.car_limit,0,100) and 0<=s.car_age<=c.car_max_age_s)
        eligible=s.at_home and s.cable and s.wallbox_enabled and 0<=s.location_age<=c.car_max_age_s
        amps=min(16,c.max_amps) if car_ok and eligible and s.car_soc<s.car_limit and c.max_amps>=c.ev_min_amps else 0
        reason="Tesla-Sofortladen · maximaler Ladestrom · Hausspeicher gesperrt" if amps else "Tesla-Sofortladen wartet auf Fahrzeug oder Ladelimit erreicht"
        return Decision("charge_now",reason,amps,0,eligible and s.online,0,amps*230*c.phases,None,None,())
    state = charging_state(s, c, state or ChargingState())
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
        problems.append("PV-Restprognose fehlt oder Abruf älter als zulässig; Schwellen-Fallback bevorzugt Speicher (HiGHS prüft die Zeitprognose separat)")
    if eligible and not car_ok:
        problems.append("Fahrzeugdaten fehlen oder sind veraltet")
    if s.daylight is None:
        problems.append("Sonnenstand unbekannt; PV-Laden eingeschränkt")
    hours_ok = valid(s.hours_left, 0, 24)
    hours = max(.25, s.hours_left or 0)
    needed = max(0, (c.reserve_soc - s.house_soc) * c.capacity_kwh / 100 / c.efficiency) if storage_ok else None
    pv_available = 0.0
    power_balance = 0.0
    house_w = c.minimum_house_w
    if meters_ok:
        # Remove battery discharge from the apparent surplus; account for charge losses.
        batt = min(s.battery_charge_w, s.battery_charge_w * .95)
        power_balance = s.wallbox_w + s.grid_export_w + batt
        pv_available = max(0, power_balance)
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
    threshold = c.ev_min_amps if watts_running else c.ev_start_amps
    storage_allowed = (state.storage_active and storage_ok and meters_ok
                       and valid(s.battery_min_soc, 0, 100) and s.house_soc > max(c.reserve_soc, s.battery_min_soc) and not state.minimum_active
                       and not (c.grid_renewable_enabled and s.grid_hold))
    # Battery power is a shared house+EV ceiling, not extra power solely for the EV.
    if storage_allowed:
        car_w = max(0, power_balance + c.normal_discharge_w - reserve - c.margin_w)
        solar_amps = floor(car_w / (230 * c.phases))
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
        elif not meters_ok or not storage_ok:
            code, reason = "measurements_missing", "Laden pausieren: keine verlässliche Energiebilanz"
        elif c.max_amps < threshold:
            code, reason = "current_limit", "Tesla-Mindestladestrom liegt über dem verfügbaren Ladestrom"
        elif state.minimum_active:
            target = c.max_amps
            code, reason = "minimum_grid", "Mindestladung bis zum Tesla-Mindestziel; Netzstrom erlaubt, Hausspeicher geschützt"
        elif not s.daylight and not storage_allowed:
            code, reason = "night", "Autoladung wartet auf PV oder Speicherfreigabe"
        elif not hours_ok and not storage_allowed:
            code, reason = "measurements_missing", "PV-Laden pausieren: keine verlässliche Energiebilanz"
        elif not storage_allowed and not watts_running and s.grid_export_w <= 0:
            code, reason = "surplus_wait", "Ladestart wartet auf Netzeinspeisung oder Speicherfreigabe"
        elif solar_amps < threshold:
            code, reason = "reserve" if reserve else "clouds", "PV reicht noch nicht für Speicherreserve und Autoladung"
        else:
            target = min(c.max_amps, solar_amps)
            code, reason = (("storage", "Speicher für Tesla freigegeben; Entnahme nur oberhalb der Abendreserve")
                            if storage_allowed else ("solar", "PV-Überschuss nutzen; Ladebudget für die Abendreserve ist berücksichtigt"))
    discharge = c.normal_discharge_w
    # Protection is local and independent of cloud availability or vehicle identity.
    if (watts_running or (valid(s.wallbox_w, 10.000001)) or (target or 0) >= c.min_amps
            or not meters_ok
            or s.daylight is None
            or not storage_ok or not valid(s.battery_min_soc, 0, 100) or s.house_soc <= s.battery_min_soc
            or (c.grid_renewable_enabled and s.grid_hold)):
        discharge = 0
    if storage_allowed and car_ok and (target or 0) >= c.min_amps and not state.minimum_active:
        discharge = c.normal_discharge_w
    if mode in ("observe", "paused"):
        code = mode
        reason = ("Empfehlung: " + reason if mode == "observe"
                  else "Pausiert · Hausspeicher-Freigabe 2.500 W")
    return Decision(code, reason, target, discharge, eligible and s.online,
                    round(reserve), round(car_w), forecast_net, needed, tuple(problems))


def decide_house(s: Snapshot, c: Settings, mode: str) -> Decision:
    """Protect the shared inverter while leaving Tesla commands to charge_now."""
    decision = decide(replace(s, at_home=False), c, mode)
    if mode in ("observe", "paused"):
        return decision
    return replace(decision, code=mode, reason="Hausspeicher-Regelung · Tesla nur im Sofortladen")

def consumption_comparison(s: Snapshot, c: Settings, forecast: dict) -> dict:
    """Read-only comparison for the same remaining daylight window as decide().

    No midnight total or EV energy enters this calculation. Commands continue
    to use decide(); activation requires a separate, reviewed change.
    """
    result = {"mode": "parallel", "available": False, "reason": "Keine frische vollständige Prognose", "legacy_kwh": None,
              "learned_kwh": None, "safe_kwh": None, "delta_kwh": None}
    if not s.daylight or not valid(s.hours_left, 0, 24) or s.hours_left <= 0:
        result["reason"] = "Kein verbleibendes PV-Zeitfenster"
        return result
    hours = max(.25, s.hours_left)
    house_w = c.minimum_house_w
    if (all(valid(v) for v in (s.pv_w, s.grid_export_w, s.battery_charge_w, s.wallbox_w))
            and 0 <= s.meter_age <= c.meter_max_age_s):
        surplus = max(0, s.wallbox_w + s.grid_export_w + min(s.battery_charge_w, s.battery_charge_w * .95))
        house_w = max(house_w, s.pv_w * .95 - surplus)
    result["legacy_kwh"] = house_w * hours / 1000
    updated = forecast.get("updated")
    if not valid(updated, 0, 1e12) or not 0 <= s.now - updated <= 900:
        return result
    end, cursor, learned, upper = s.now + hours * 3600, s.now, 0., 0.
    points = forecast.get("hours", [])
    if not isinstance(points, list) or any(not isinstance(p, dict) or not valid(p.get("stamp"), 0, 1e12) for p in points):
        return result
    for point in sorted(points, key=lambda p: p["stamp"]):
        start = point["stamp"]
        if start + 3600 <= cursor or start >= end:
            continue
        if start > cursor or start < cursor - 3600:
            return result
        value, high = point.get("kwh"), point.get("high")
        if not valid(value, 0, 30) or not valid(high, value, 60):
            return result
        stop = min(end, start + 3600)
        fraction = (stop - cursor) / 3600
        learned += value * fraction
        upper += max(high, value * 1.15) * fraction
        cursor = stop
        if cursor >= end:
            break
    if cursor < end:
        return result
    safe = max(upper, c.minimum_house_w * hours / 1000)
    result.update(available=True, reason="Nur Vergleich · bisherige Regelung bleibt aktiv",
                  learned_kwh=learned, safe_kwh=safe, delta_kwh=safe-result["legacy_kwh"])
    return result


def without_retired_settings(values):
    """Read older installations without retaining the removed software floor."""
    return {key:value for key,value in values.items() if key != "house_min_soc"}

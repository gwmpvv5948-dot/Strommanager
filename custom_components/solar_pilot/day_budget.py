"""Persistent daily PV allocation. Display accounting only, never device control."""
from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timedelta, timezone
from functools import partial
import math

FIELDS = ("house", "storage", "tesla", "other", "solar", "house_load", "pv_hours")

def finite(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None

def allocate(pv, grid, battery, wallbox):
    """Proportional PV attribution among simultaneous loads, using AC proxy."""
    values = [finite(v) for v in (pv, grid, battery, wallbox)]
    if any(v is None for v in values):
        return None
    pv, grid, battery, wallbox = values
    if pv < 0 or wallbox < 0 or any(abs(v) > 200000 for v in values):
        return None
    solar = pv * .95  # Same inverter-loss allowance as the existing power balance.
    house = max(0, solar - grid - battery - wallbox)
    loads = (house, max(0, battery), wallbox)
    total = sum(loads)
    fraction = min(1, solar / total) if total else 0
    assigned = [v * fraction for v in loads]
    return dict(zip(FIELDS, (*assigned, max(0, solar - sum(assigned)), solar,
                              house if solar > 0 else 0, 1 if solar > 0 else 0)))

def integrate(rows, start, end, grid_positive=True, battery_positive=True):
    """One-minute bins with bounded sample age, including explicit unknown gaps."""
    times = {key: [p[0] for p in rows.get(key, [])] for key in ("pv", "grid", "battery", "wallbox")}
    bins = {}
    for minute in range(math.ceil(start / 60), math.floor(end / 60)):
        stamp = minute * 60 + 30
        values = []
        for key in times:
            index = bisect_right(times[key], stamp) - 1
            if index < 0:
                values.append(None)
                continue
            t, value = rows[key][index]
            # Never stretch a non-zero power indefinitely across a recorder gap.
            values.append(value if stamp - t <= 900 or key == "pv" and value == 0 else None)
        if values[0] == 0:
            bins[str(minute)] = [0.0] * len(FIELDS)
            continue
        if not grid_positive and values[1] is not None:
            values[1] *= -1
        if not battery_positive and values[2] is not None:
            values[2] *= -1
        flow = allocate(*values)
        if flow is not None:
            bins[str(minute)] = [flow[k] / (60 if k == "pv_hours" else 60000) for k in FIELDS]
    return bins

def totals(bins):
    return {key: sum(row[i] for row in bins.values()) for i, key in enumerate(FIELDS)}

class DayBudgetTracker:
    def __init__(self, hass, entry, entities, settings, changed):
        from homeassistant.helpers.storage import Store
        self.hass, self.entry, self.entities, self.settings, self.changed = hass, entry, entities, settings, changed
        self.store = Store(hass, 1, f"solar_pilot.budget.{entry.entry_id}")
        self.data = {}
        self.error = None
        self.loading = False
        self.stopped = False

    async def async_start(self):
        from homeassistant.helpers.event import async_track_time_interval
        self.data = await self.store.async_load() or {}
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._tick, timedelta(minutes=5)))
        if self.hass.is_running:
            await self.async_refresh()

    async def _tick(self, _event):
        if not self.loading and not self.stopped:
            self.entry.async_create_background_task(self.hass, self.async_refresh(), "SolarPilot daily PV accounting")

    async def async_refresh(self):
        if self.loading or self.stopped:
            return
        self.loading = True
        try:
            from homeassistant.components.recorder import get_instance, history
            from homeassistant.util import dt as dt_util
            now = dt_util.utcnow()
            local = dt_util.as_local(now)
            midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
            day, start, end = local.date().isoformat(), midnight.timestamp(), now.timestamp()
            ids = {"pv": self.entities["pv_power"], "grid": self.entities["grid_power"],
                   "battery": self.entities["battery_power"], "wallbox": self.entities["wallbox_power"]}
            signature = [ids, self.settings.grid_export_positive, self.settings.battery_charge_positive]
            previous = self.data if self.data.get("day") == day and self.data.get("signature") == signature else {}
            query_start = max(start, previous.get("until", start) - 600)
            recorder = get_instance(self.hass)
            def read_and_integrate():
                states = history.get_significant_states(self.hass, datetime.fromtimestamp(query_start, timezone.utc), now,
                    list(ids.values()), include_start_time_state=True, significant_changes_only=False,
                    minimal_response=False, no_attributes=False)
                rows = {}
                for key, entity_id in ids.items():
                    rows[key] = []
                    for state in states.get(entity_id, []):
                        value = finite(state.state)
                        unit = state.attributes.get("unit_of_measurement")
                        value = value * (1000 if unit == "kW" else 1) if value is not None and unit in ("W", "kW") else None
                        rows[key].append((state.last_updated.timestamp(), value))
                    rows[key].sort(key=lambda row: row[0])
                return integrate(rows, query_start, end, self.settings.grid_export_positive, self.settings.battery_charge_positive)
            fresh = await recorder.async_add_executor_job(read_and_integrate)
            cutoff = math.ceil(query_start / 60)
            bins = {k: v for k, v in previous.get("bins", {}).items() if int(k) < cutoff}
            bins.update(fresh)
            self.data = {"day": day, "start": start, "until": math.floor(end / 60) * 60,
                         "bins": bins, "signature": signature}
            await self.store.async_save(self.data)
            self.error = None
        except Exception as exc:
            self.error = f"Tagesbilanz nicht aktualisiert: {type(exc).__name__}"
        finally:
            self.loading = False
            if not self.stopped:
                self.changed()

    def status(self):
        data = self.data
        result = totals(data.get("bins", {}))
        expected = max(0, int((data.get("until", 0) - data.get("start", 0)) / 60))
        return {"day": data.get("day"), "updated": data.get("until"), "actual": result,
                "minutes": len(data.get("bins", {})), "missing_minutes": max(0, expected-len(data.get("bins", {}))),
                "error": self.error, "method": "proportional_ac95", "available": bool(data.get("bins"))}

    async def async_stop(self):
        self.stopped = True
        if self.data:
            await self.store.async_save(self.data)

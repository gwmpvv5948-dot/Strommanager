"""Home Assistant adapter. Uses existing entities, never Tesla credentials."""
from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import timedelta
import math

from homeassistant.core import callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, ENTITY_DEFAULTS, MODES
from .executor import Command, Executor, plan
from .model import Settings, Snapshot, decide


class Controller:
    def __init__(self, hass, entry):
        self.hass, self.entry = hass, entry
        config = {**entry.data, **entry.options}
        self.entities = config["entities"]
        self.settings = Settings(**config.get("settings", {}))
        self.mode = "observe"
        self.executor = Executor(self._send)
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.lock = asyncio.Lock()
        self.listeners = set()
        self.decision = None
        self.snapshot = None
        self.updated = None
        self.conflict = False
        self.legacy_owned = False
        self.adapter_error = None
        self._stopping = False
        self._saved_payload = None

    def state(self, key):
        state = self.hass.states.get(self.entities[key])
        if state is None or state.state in ("unknown", "unavailable") or state.attributes.get("restored"):
            return None
        return state

    def age(self, key, now):
        state = self.state(key)
        stamp = getattr(state, "last_reported", None) if state else None
        return max(0, now - stamp.timestamp()) if stamp else math.inf

    def number(self, key, energy=False):
        state = self.state(key)
        if state is None:
            return None
        try:
            value = float(state.state)
        except (ValueError, TypeError):
            return None
        if not math.isfinite(value):
            return None
        unit = state.attributes.get("unit_of_measurement")
        if key in ("house_soc", "car_soc", "car_limit"):
            return value if unit == "%" else None
        if key == "car_current":
            return value if unit == "A" else None
        if energy:
            return value / 1000 if unit == "Wh" else value if unit == "kWh" else None
        return value * 1000 if unit == "kW" else value if unit == "W" else None

    def boolean(self, key):
        state = self.state(key)
        return state.state == "on" if state and state.state in ("on", "off") else None

    def read(self):
        now = dt_util.utcnow().timestamp()
        sun = self.state("sun")
        daylight = (sun.state == "above_horizon" if sun and sun.state in ("above_horizon", "below_horizon") else None)
        setting = dt_util.parse_datetime(sun.attributes.get("next_setting", "")) if sun else None
        hours_left = max(0, (setting.timestamp() - now) / 3600) if setting else None
        forecast_state = self.state("forecast_updated")
        forecast_updated = dt_util.parse_datetime(forecast_state.state) if forecast_state else None
        forecast_age = now - forecast_updated.timestamp() if forecast_updated else math.inf
        home = self.state("car_home")
        charging_state = self.state("car_charge")
        grid = self.number("grid_power")
        battery = self.number("battery_power")
        if grid is not None and not self.settings.grid_export_positive:
            grid = -grid
        if battery is not None and not self.settings.battery_charge_positive:
            battery = -battery
        return Snapshot(
            now=now, daylight=daylight, hours_left=hours_left,
            house_soc=self.number("house_soc"), house_soc_age=self.age("house_soc", now),
            pv_w=self.number("pv_power"), grid_export_w=grid,
            battery_charge_w=battery, wallbox_w=self.number("wallbox_power"),
            meter_age=max(self.age(k, now) for k in ("pv_power", "grid_power", "battery_power", "wallbox_power")),
            forecast_kwh=self.number("forecast", energy=True), forecast_age=forecast_age,
            car_soc=self.number("car_soc"), car_limit=self.number("car_limit"),
            car_age=max(self.age(k, now) for k in ("car_soc", "car_limit", "car_cable", "car_online")),
            at_home=bool(home and home.state == "home"),
            cable=self.boolean("car_cable") is True,
            wallbox_enabled=self.boolean("wallbox_enabled") is True,
            online=self.boolean("car_online") is True,
            charging=self.boolean("car_charge"),
            charge_changed_age=max(0, now - charging_state.last_changed.timestamp()) if charging_state else 0,
            car_current=self.number("car_current"),
            current_discharge_w=self.number("discharge_limit"),
            grid_charge_enabled=self.boolean("grid_charge"),
            location_age=self.age("car_home", now),
        )

    async def async_start(self):
        saved = await self.store.async_load() or {}
        self.mode = saved.get("mode", "observe")
        if self.mode not in MODES:
            self.mode = "observe"
        self.legacy_owned = saved.get("legacy_owned", False)
        self.executor.baselines = saved.get("baselines", {})
        self.executor.owned = saved.get("owned", {})
        # Preserve cloud and error cooldowns through integration reloads/restarts.
        self.executor.cloud_last = saved.get("cloud_last", float("-inf"))
        self.executor.attempts = saved.get("attempts", {})
        self.executor.failures = saved.get("failures", {})
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._tick, timedelta(seconds=30)))
        self.entry.async_on_unload(async_track_state_change_event(self.hass, list(self.entities.values()), self._tick))
        if self.hass.is_running:
            await self.async_update()
        else:
            self.entry.async_on_unload(self.hass.bus.async_listen_once("homeassistant_started", self._tick))

    @callback
    def _tick(self, _event):
        if not self._stopping and not self.lock.locked():
            self.entry.async_create_background_task(self.hass, self.async_update(), "SolarPilot decision")

    async def async_update(self):
        if self.lock.locked() or self._stopping:
            return
        async with self.lock:
            self.snapshot = self.read()
            self.decision = decide(self.snapshot, self.settings, self.mode)
            self.conflict = self.boolean("legacy_automation") is not False
            self.adapter_error = None
            if self.mode not in ("observe", "paused") and not self.conflict:
                try:
                    await self.executor.run(
                        self.snapshot.now, plan(self.snapshot, self.decision, self.settings),
                        self.settings.cloud_interval_s, self.current_settings(),
                    )
                except Exception as exc:
                    self.adapter_error = str(exc)[:300]
                await self.persist()
            self.updated = dt_util.utcnow().isoformat()
            self.publish()

    def current_settings(self):
        return {"discharge_limit": self.number("discharge_limit"), "car_current": self.number("car_current")}

    async def _send(self, command):
        key = command.channel
        state = self.state(key)
        if state is None:
            raise ServiceValidationError(f"{key}: Entität nicht verfügbar")
        entity = self.entities[key]
        if key in ("discharge_limit", "car_current"):
            if key == "car_current" and (self.number("discharge_limit") != 0 or self.boolean("grid_charge") is not False):
                raise ServiceValidationError("Warte auf Rückmeldung: Speicherentladung 0 W und Netzladung aus")
            unit = state.attributes.get("unit_of_measurement")
            expected = ("W", "kW") if key == "discharge_limit" else ("A",)
            if unit not in expected:
                raise ServiceValidationError(f"{key}: Einheit {unit!r} ist ungeeignet")
            value = float(command.value) / (1000 if unit == "kW" else 1)
            low, high = state.attributes.get("min"), state.attributes.get("max")
            step = state.attributes.get("step", 1)
            if low is None or high is None or not low <= value <= high:
                raise ServiceValidationError(f"{key}: Sollwert außerhalb der Gerätegrenzen")
            if step and abs((value - low) / step - round((value - low) / step)) > 1e-5:
                raise ServiceValidationError(f"{key}: Sollwert passt nicht zur Schrittweite")
            await self.hass.services.async_call("number", "set_value", {"entity_id": entity, "value": value}, blocking=True)
        else:
            if key == "car_charge" and command.value and (self.number("discharge_limit") != 0 or self.boolean("grid_charge") is not False):
                raise ServiceValidationError("Ladestart wartet auf bestätigten Speicherschutz")
            await self.hass.services.async_call("switch", "turn_on" if command.value else "turn_off", {"entity_id": entity}, blocking=True)

    async def persist(self):
        payload = {
            "mode": self.mode, "legacy_owned": self.legacy_owned,
            "baselines": self.executor.baselines, "owned": self.executor.owned,
            "cloud_last": self.executor.cloud_last if math.isfinite(self.executor.cloud_last) else 0,
            "attempts": dict(self.executor.attempts), "failures": dict(self.executor.failures),
        }
        # Copy mutable ownership maps so comparisons detect subsequent changes.
        payload["baselines"] = dict(self.executor.baselines)
        payload["owned"] = dict(self.executor.owned)
        if payload != self._saved_payload:
            await self.store.async_save(payload)
            self._saved_payload = payload

    async def async_configure(self, changes):
        try:
            settings = Settings(**{**asdict(self.settings), **changes})
        except (ValueError, TypeError) as exc:
            raise ServiceValidationError(f"Ungültige Einstellung: {exc}") from exc
        self.hass.config_entries.async_update_entry(self.entry, options={
            **self.entry.options, "settings": asdict(settings),
        })

    async def async_set_mode(self, mode):
        if mode not in MODES:
            raise ServiceValidationError("Unbekannter Betriebsmodus")
        if mode not in ("observe", "paused") and self.mode in ("observe", "paused"):
            raise ServiceValidationError("Aktive Steuerung zuerst mit 'Übernehmen' freigeben")
        async with self.lock:
            self.mode = mode
            await self.persist()
        await self.async_update()

    async def async_activate(self, mode="auto"):
        """Explicit, admin-authorized takeover; no automatic takeover at setup."""
        async with self.lock:
            if mode not in ("auto", "storage_first", "charge_minimum"):
                raise ServiceValidationError("Ungültiger Modus für Übernahme")
            s = self.read()
            if (s.current_discharge_w is None or s.grid_charge_enabled is None
                    or s.car_current is None):
                raise ServiceValidationError("Steuerbare Entitäten oder Einheiten prüfen")
            if self.boolean("legacy_automation") is None:
                raise ServiceValidationError("Bisherige Automation ist nicht verfügbar; Konfliktschutz kann nicht geprüft werden")
            actuator = self.state("discharge_limit")
            if actuator.attributes.get("min", 1) > 0:
                raise ServiceValidationError("Entladebegrenzung auf 0 W wird vom Gerät nicht unterstützt")
            if self.boolean("legacy_automation") is True:
                await self.hass.services.async_call("automation", "turn_off", {
                    "entity_id": self.entities["legacy_automation"], "stop_actions": True}, blocking=True)
                if self.boolean("legacy_automation") is not False:
                    raise ServiceValidationError("Bisherige Automation konnte nicht deaktiviert werden")
                self.legacy_owned = True
            self.mode = mode
            await self.persist()
        await self.async_update()

    async def async_release(self):
        """Return ownership explicitly; retain records if restoration fails."""
        async with self.lock:
            self.mode = "observe"
            await self.persist()
            for command in self.executor.restoration(self.current_settings()):
                s = self.read()
                if command.channel == "car_current":
                    # Restoring an amperage is still a cloud command. Never send it away from home.
                    if not (s.at_home and s.cable and s.online and s.location_age <= self.settings.car_max_age_s):
                        continue
                    # Restoration is explicitly requested and may follow restoration of discharge power.
                    state = self.state("car_current")
                    if state:
                        if not state.attributes.get("min", 0) <= command.value <= state.attributes.get("max", 0):
                            raise ServiceValidationError("Ursprünglicher Ladestrom liegt außerhalb aktueller Gerätegrenzen")
                        await self.hass.services.async_call("number", "set_value", {
                            "entity_id": self.entities["car_current"], "value": command.value}, blocking=True)
                    self.executor.owned.pop(command.channel, None)
                    continue
                await self._send(command)
                self.executor.owned.pop(command.channel, None)
            if self.legacy_owned:
                await self.hass.services.async_call("automation", "turn_on", {
                    "entity_id": self.entities["legacy_automation"]}, blocking=True)
                self.legacy_owned = False
            self.executor.baselines.clear()
            self.executor.owned.clear()
            await self.persist()
        await self.async_update()

    async def async_stop(self):
        # Unloading never resumes or stops a car. Explicit release is the reversible handover.
        self._stopping = True
        async with self.lock:
            await self.persist()

    def subscribe(self, listener):
        self.listeners.add(listener)
        return lambda: self.listeners.discard(listener)

    @callback
    def publish(self):
        for listener in tuple(self.listeners):
            listener()

    def status(self):
        snapshot = asdict(self.snapshot) if self.snapshot else None
        if snapshot:
            snapshot = {k: (v if not isinstance(v, float) or math.isfinite(v) else None) for k, v in snapshot.items()}
        return {
            "entry_id": self.entry.entry_id, "mode": self.mode,
            "updated": self.updated, "conflict": self.conflict,
            "error": self.adapter_error or self.executor.error,
            "decision": asdict(self.decision) if self.decision else None,
            "snapshot": snapshot, "settings": asdict(self.settings),
            "entities": self.entities, "history": self.executor.history,
            "legacy_owned": self.legacy_owned,
        }

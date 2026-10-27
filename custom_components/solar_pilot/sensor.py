"""Small diagnostic entities; command history is not recorded as state attributes."""
from datetime import datetime, timezone

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass, SensorStateClass
from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN, VERSION

DEFINITIONS = (
    ("daily_house", "PV heute Haus", "kWh", "mdi:home-lightning-bolt"),
    ("daily_storage", "PV heute Speicher", "kWh", "mdi:battery-plus"),
    ("daily_tesla", "PV heute Tesla", "kWh", "mdi:car-electric"),
    ("daily_other", "PV heute Einspeisung und Rest", "kWh", "mdi:transmission-tower-export"),
    ("daily_solar", "PV heute Bilanziert", "kWh", "mdi:solar-power"),
    ("status", "Regelstatus", None, "mdi:state-machine"),
    ("target_amps", "Empfohlener Ladestrom", "A", "mdi:current-ac"),
    ("discharge_w", "Empfohlene Entladegrenze", "W", "mdi:battery-arrow-down"),
    ("reserve_charge_w", "Ladebudget Abendreserve", "W", "mdi:battery-clock"),
    ("available_car_w", "PV-Budget Fahrzeug", "W", "mdi:ev-station"),
)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([PilotSensor(entry, *definition) for definition in DEFINITIONS])


class PilotSensor(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, entry, key, name, unit, icon):
        self.controller = entry.runtime_data
        self.key = key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_native_unit_of_measurement = unit
        if key.startswith("daily_"):
            self._attr_device_class = SensorDeviceClass.ENERGY
            self._attr_state_class = SensorStateClass.TOTAL
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name="Strommanager",
            manufacturer="Strommanager", model="PV-Lademanager", sw_version=VERSION,
            configuration_url="homeassistant://solar-pilot",
        )

    async def async_added_to_hass(self):
        self.async_on_remove(self.controller.subscribe(self._changed))

    @callback
    def _changed(self):
        self.async_write_ha_state()

    @property
    def native_value(self):
        if self.key.startswith("daily_"):
            status = self.controller.day_budget.status()
            return round(status["actual"].get(self.key[6:], 0), 4) if status["available"] else None
        d = self.controller.decision
        if d is None:
            return None
        if self.key == "status":
            return "conflict" if self.controller.conflict and self.controller.mode not in ("observe", "paused") else d.code
        return getattr(d, self.key)

    @property
    def last_reset(self):
        data = self.controller.day_budget.data
        return datetime.fromtimestamp(data["start"], timezone.utc) if self.key.startswith("daily_") and data.get("day") else None

    @property
    def extra_state_attributes(self):
        if self.key.startswith("daily_"):
            status = self.controller.day_budget.status()
            return {"day": status["day"], "missing_minutes": status["missing_minutes"], "method": status["method"], "error": status["error"]}
        if self.key != "status":
            return None
        d = self.controller.decision
        return {"mode": self.controller.mode, "reason": d.reason if d else "Initialisierung",
                "error": self.controller.adapter_error or self.controller.executor.error}

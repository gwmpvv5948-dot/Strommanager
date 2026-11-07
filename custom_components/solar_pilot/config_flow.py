"""UI setup and settings; existing integrations provide all authentication."""
from __future__ import annotations

try:
    import probatio as vol
except ImportError:  # Compatibility with HA releases before the schema migration.
    import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN, ENTITY_DEFAULTS
from .model import Settings, without_retired_settings

ENERGY = tuple(k for k in ENTITY_DEFAULTS if not k.startswith("car_"))
CAR = tuple(k for k in ENTITY_DEFAULTS if k.startswith("car_"))
SETTINGS_FIELDS = (
    "planner_price_enabled", "planner_price_weight", "planner_ev_price_ct",
    "planner_ev_enabled", "planner_ev_capacity_kwh", "planner_ev_efficiency", "planner_ev_grid_share",
    "planner_control_enabled",
    "planner_terminal_soc", "planner_ee_weight_eur_kwh", "planner_cycle_eur_kwh",
    "grid_renewable_enabled", "grid_hold_share", "grid_release_share",
    "reserve_soc", "capacity_kwh", "car_min_soc", "car_low_soc", "storage_release_soc", "phases", "tesla_min_charge_amps", "max_amps",
    "normal_discharge_w", "max_charge_w", "forecast_factor", "buffer_kwh",
    "margin_w", "minimum_house_w", "budget_extra_kwh", "cloud_interval_s", "grid_export_positive",
    "battery_charge_positive", "benefit_initial_savings_eur", "feed_in_eur_kwh", "purchase_eur_kwh",
)


def entity_schema(keys, defaults):
    return vol.Schema({
        vol.Required(key, default=defaults.get(key, ENTITY_DEFAULTS[key])):
            selector.EntitySelector(selector.EntitySelectorConfig(domain=ENTITY_DEFAULTS[key].split(".")[0]))
        for key in keys
    })


def settings_schema(defaults):
    defaults = {**Settings().__dict__, **defaults}
    schema = {}
    for key in SETTINGS_FIELDS:
        value = defaults[key]
        if isinstance(value, bool):
            field = selector.BooleanSelector()
        elif key == "phases":
            field = vol.All(vol.Coerce(int), vol.In((1, 3)))
        else:
            field = vol.Coerce(int if isinstance(value, int) and key not in ("feed_in_eur_kwh", "purchase_eur_kwh", "benefit_initial_savings_eur", "planner_ee_weight_eur_kwh", "planner_cycle_eur_kwh", "planner_price_weight", "planner_ev_price_ct") else float)
        schema[vol.Required(key, default=value)] = field
    return vol.Schema(schema)


def validate_entities(hass, data):
    for key, entity in data.items():
        if entity.split(".")[0] != ENTITY_DEFAULTS[key].split(".")[0] or hass.states.get(entity) is None:
            return {key: "entity_missing"}
    if len(set(data.values())) != len(data):
        return {"base": "duplicate_entity"}
    return {}


class Flow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self):
        self.mapping = {}

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        errors = {}
        if user_input is not None:
            errors = validate_entities(self.hass, user_input)
            if not errors:
                self.mapping.update(user_input)
                return await self.async_step_vehicle()
        return self.async_show_form(step_id="user", data_schema=entity_schema(ENERGY, user_input or {}), errors=errors)

    async def async_step_vehicle(self, user_input=None):
        errors = {}
        if user_input is not None:
            errors = validate_entities(self.hass, {**self.mapping, **user_input})
            if not errors:
                self.mapping.update(user_input)
                return await self.async_step_preferences()
        return self.async_show_form(step_id="vehicle", data_schema=entity_schema(CAR, user_input or {}), errors=errors)

    async def async_step_preferences(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                settings = Settings(**user_input)
                return self.async_create_entry(title="Strommanager", data={
                    "entities": self.mapping, "settings": settings.__dict__,
                })
            except (ValueError, TypeError):
                errors["base"] = "invalid_settings"
        return self.async_show_form(step_id="preferences", data_schema=settings_schema(user_input or {}), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return Options()


class Options(config_entries.OptionsFlow):
    """Do not assign self.config_entry; HA supplies this property."""
    async def async_step_init(self, user_input=None):
        errors = {}
        current = without_retired_settings({**self.config_entry.data.get("settings", {}), **self.config_entry.options.get("settings", {})})
        if user_input is not None:
            try:
                settings = Settings(**{**current, **user_input})
                return self.async_create_entry(title="", data={**self.config_entry.options,"settings": settings.__dict__})
            except (ValueError, TypeError):
                errors["base"] = "invalid_settings"
        return self.async_show_form(step_id="init", data_schema=settings_schema(user_input or current), errors=errors)

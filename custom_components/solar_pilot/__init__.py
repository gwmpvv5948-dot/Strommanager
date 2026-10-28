"""Strommanager integration lifecycle, admin services and custom panel."""
from __future__ import annotations

from pathlib import Path

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service

from .const import DOMAIN, MODES, PANEL_PATH, VERSION
from .controller import Controller
from .model import Settings

PLATFORMS = ["sensor"]


async def async_setup(hass, config):
    hass.data.setdefault(DOMAIN, {"controllers": {}})
    return True


def controller_for(hass, entry_id):
    controller = hass.data[DOMAIN]["controllers"].get(entry_id)
    if controller is None:
        raise ServiceValidationError("Strommanager ist nicht geladen")
    return controller


async def async_setup_entry(hass, entry):
    data = hass.data.setdefault(DOMAIN, {"controllers": {}})
    if not data.get("registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig("/solar_pilot_frontend", str(Path(__file__).parent / "frontend"), False)
        ])
        websocket_api.async_register_command(hass, ws_status)
        schema = {vol.Required("entry_id"): cv.string}

        async def service(call):
            controller = controller_for(hass, call.data["entry_id"])
            if call.service == "set_mode":
                await controller.async_set_mode(call.data["mode"])
            elif call.service == "activate":
                await controller.async_activate(call.data.get("mode", "auto"))
            elif call.service == "import_consumption_history":
                entry = controller.entry
                entry.async_create_background_task(hass, controller.consumption.import_history(), "Strommanager consumption import")
            elif call.service == "configure":
                await controller.async_configure(call.data["settings"])
            else:
                await controller.async_update()

        for name in ("activate", "evaluate", "set_mode", "configure", "import_consumption_history"):
            fields = {**schema}
            if name == "set_mode":
                fields[vol.Required("mode")] = vol.In(MODES)
            elif name == "activate":
                fields[vol.Optional("mode", default="auto")] = vol.In(("auto", "storage_first", "charge_minimum"))
            elif name == "configure":
                fields[vol.Required("settings")] = vol.Schema({vol.Optional(k): object for k in Settings.__dataclass_fields__})
            async_register_admin_service(hass, DOMAIN, name, service, vol.Schema(fields))
        data["registered"] = True
    controller = Controller(hass, entry)
    data["controllers"][entry.entry_id] = controller
    entry.runtime_data = controller
    try:
        await controller.async_start()
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        await async_register_panel(
            hass, frontend_url_path=PANEL_PATH, webcomponent_name="solar-pilot-panel",
            sidebar_title="Strommanager", sidebar_icon="mdi:flash",
            module_url=f"/solar_pilot_frontend/panel.js?v={VERSION}",
            require_admin=True, config={"entry_id": entry.entry_id},
        )
    except Exception:
        data["controllers"].pop(entry.entry_id, None)
        await controller.async_stop()
        raise
    entry.async_on_unload(entry.add_update_listener(async_options_updated))
    return True


async def async_options_updated(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass, entry):
    controller = entry.runtime_data
    # Set flag before waiting so queued listeners cannot restart a stopped controller.
    await controller.async_stop()
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        controller._stopping = False
        return False
    frontend.async_remove_panel(hass, PANEL_PATH)
    hass.data[DOMAIN]["controllers"].pop(entry.entry_id, None)
    return True


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/status",
    vol.Required("entry_id"): cv.string,
})
@websocket_api.async_response
async def ws_status(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator erforderlich")
        return
    try:
        controller = controller_for(hass, msg["entry_id"])
    except ServiceValidationError as exc:
        connection.send_error(msg["id"], "not_loaded", str(exc))
    else:
        connection.send_result(msg["id"], controller.status())

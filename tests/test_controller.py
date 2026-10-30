"""Contract tests for our HA adapter with an in-memory service/state fixture.
These do not substitute for a real HA installation test.
"""
import asyncio
from datetime import datetime, timezone, timedelta
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from test_model import sample

NOW=datetime(2026,10,27,12,tzinfo=timezone.utc)

def module(name, **attrs):
    result=types.ModuleType(name)
    result.__dict__.update(attrs)
    sys.modules[name]=result
    return result

class ValidationError(Exception): pass
class MemoryStore:
    def __init__(self,*args): self.payload=None; self.saves=0
    async def async_load(self): return self.payload
    async def async_save(self,data): self.payload=data; self.saves+=1

def parse_datetime(value):
    try: return datetime.fromisoformat(value)
    except (ValueError,TypeError): return None

module("homeassistant")
module("homeassistant.core",callback=lambda f:f)
module("homeassistant.exceptions",ServiceValidationError=ValidationError)
module("homeassistant.helpers")
module("homeassistant.helpers.event",async_track_state_change_event=lambda *args:lambda:None,
       async_track_time_interval=lambda *args:lambda:None)
module("homeassistant.helpers.storage",Store=MemoryStore)
util=module("homeassistant.util")
util.dt=module("homeassistant.util.dt",utcnow=lambda:NOW,parse_datetime=parse_datetime)
root=Path(__file__).resolve().parents[1]/"custom_components"/"solar_pilot"
for name in ("const","controller"):
    spec=importlib.util.spec_from_file_location(f"pilot_test.{name}",root/f"{name}.py")
    mod=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=mod
    spec.loader.exec_module(mod)
from pilot_test.const import ENTITY_DEFAULTS
from pilot_test.controller import Controller
from pilot_test.executor import Command


def state(value,unit=None,**attrs):
    return SimpleNamespace(state=str(value),attributes={**({"unit_of_measurement":unit} if unit else {}),**attrs},
        last_reported=NOW-timedelta(seconds=10),last_changed=NOW-timedelta(seconds=1000))

class Adapter(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        values={k:state("off") for k in ENTITY_DEFAULTS}
        for key in ("car_cable","car_online","wallbox_enabled","car_charge"):
            values[key]=state("on")
        for key,value in (("house_soc",9),("car_soc",45),("car_limit",80)):
            values[key]=state(value,"%")
        for key,value in (("pv_power",1600),("grid_power",-2500),("battery_power",0),
                          ("wallbox_power",3500)):
            values[key]=state(value,"W")
        values["discharge_limit"]=state(2500,"W",min=0,max=2500,step=1)
        values["car_current"]=state(16,"A",min=0,max=48,step=1)
        values["car_home"]=state("home")
        values["sun"]=state("above_horizon",next_setting=(NOW+timedelta(hours=4)).isoformat())
        values["forecast"]=state(4,"kWh")
        values["forecast_updated"]=state((NOW-timedelta(hours=1)).isoformat())
        self.values=values
        self.states={ENTITY_DEFAULTS[k]:v for k,v in values.items()}
        self.calls=[]
        async def service(domain,action,data,blocking=True):
            self.calls.append((domain,action,data))
            obj=self.states[data["entity_id"]]
            obj.state=str(data["value"]) if domain=="number" else "on" if action=="turn_on" else "off"
        self.hass=SimpleNamespace(states=SimpleNamespace(get=self.states.get),services=SimpleNamespace(async_call=service),
            is_running=True,config_entries=SimpleNamespace(async_update_entry=Mock()))
        self.entry=SimpleNamespace(data={"entities":dict(ENTITY_DEFAULTS)},options={},entry_id="test",
            async_on_unload=Mock(),async_create_background_task=Mock())
        self.c=Controller(self.hass,self.entry)

    async def test_source_mapping_persists_options_without_commands(self):
        self.entry.options={"settings":{"reserve_soc":60},"custom":"keep"}
        self.states["sensor.custom_pv"]=state(123,"W")
        await self.c.async_configure_sources({"entities":{"pv_power":"sensor.custom_pv"},"historical_temperature":["sensor.old_temperature"]})
        options=self.hass.config_entries.async_update_entry.call_args.kwargs["options"]
        self.assertEqual(options["entities"]["pv_power"],"sensor.custom_pv")
        self.assertEqual(options["settings"],{"reserve_soc":60})
        self.assertEqual(options["custom"],"keep")
        self.assertEqual(options["historical_temperature"],["sensor.old_temperature"])
        self.assertEqual(self.calls,[])

    async def test_source_mapping_rejects_invalid_unit_and_unknown_id(self):
        self.states["sensor.wrong_unit"]=state(100,"kWh")
        for value in ("sensor.wrong_unit","sensor.missing","switch.bad"):
            with self.assertRaises(ValidationError):
                await self.c.async_configure_sources({"entities":{"pv_power":value}})
        self.hass.config_entries.async_update_entry.assert_not_called()

    async def test_source_mapping_blocks_actuator_change_while_active(self):
        self.states["number.new_limit"]=state(0,"W")
        self.c.mode="auto"
        with self.assertRaises(ValidationError):
            await self.c.async_configure_sources({"entities":{"discharge_limit":"number.new_limit"}})
        self.c.mode="paused"
        self.c.executor.baselines["discharge_limit"]=2500
        self.c.executor.owned["discharge_limit"]=0
        await self.c.async_configure_sources({"entities":{"discharge_limit":"number.new_limit"}})
        self.assertEqual(self.c.mode,"paused")
        self.assertNotIn("discharge_limit",self.c.executor.baselines)
        self.assertNotIn("discharge_limit",self.c.executor.owned)
        self.assertEqual(self.calls,[])

    async def test_observe_never_writes(self):
        await self.c.async_start()
        self.assertEqual(self.c.mode,"observe")
        self.assertEqual(self.calls,[])
        self.assertEqual(self.c.decision.target_amps,0)

    async def test_activation_never_calls_automations(self):
        await self.c.async_activate()
        self.assertEqual(self.c.mode,"auto")
        self.assertFalse(any(domain=="automation" for domain,_,_ in self.calls))
        self.assertNotIn("legacy_automation",self.c.entities)
        self.assertNotIn("conflict",self.c.status())

    async def test_cannot_enable_auto_without_takeover(self):
        with self.assertRaises(ValidationError): await self.c.async_set_mode("auto")
        self.assertEqual(self.calls,[])

    async def test_unknown_units_are_missing_data(self):
        self.values["grid_power"].attributes["unit_of_measurement"]="VA"
        self.assertIsNone(self.c.read().grid_export_w)

    async def test_kw_wh_conversion(self):
        self.values["grid_power"].attributes["unit_of_measurement"]="kW"
        self.values["grid_power"].state="-2.5"
        self.values["forecast"].attributes["unit_of_measurement"]="Wh"
        self.values["forecast"].state="4000"
        s=self.c.read()
        self.assertEqual((s.grid_export_w,s.forecast_kwh),(-2500,4))

    async def test_restored_state_is_not_live(self):
        self.values["house_soc"].attributes["restored"]=True
        self.assertIsNone(self.c.read().house_soc)

    async def test_out_of_range_command_rejected(self):
        with self.assertRaises(ValidationError): await self.c._send(Command("discharge_limit",5000))
        self.assertEqual(self.calls,[])

    async def test_step_mismatch_rejected(self):
        self.values["discharge_limit"].attributes["step"]=100
        with self.assertRaises(ValidationError): await self.c._send(Command("discharge_limit",1250))

    async def test_settings_validation_preserves_previous_values(self):
        with self.assertRaises(ValidationError): await self.c.async_configure({"reserve_soc":150})
        self.hass.config_entries.async_update_entry.assert_not_called()

    async def test_identical_persistence_does_not_write_again(self):
        await self.c.persist()
        await self.c.persist()
        self.assertEqual(self.c.store.saves,1)

    async def test_unload_does_not_start_or_stop_devices(self):
        await self.c.async_stop()
        self.assertEqual(self.calls,[])
        self.assertTrue(self.c._stopping)

    async def test_minimum_latch_is_persisted_and_restored(self):
        from pilot_test.model import ChargingState
        self.c.mode="auto"
        self.c.charging_state=ChargingState(True,True)
        await self.c.persist()
        saved=self.c.store.payload
        self.assertEqual(saved["charging_state"],{"minimum_active":True,"storage_active":True})
        self.c.store.async_load=AsyncMock(return_value=saved)
        self.values["car_soc"].state="35"
        self.values["house_soc"].state="75"
        await self.c.async_start()
        self.assertTrue(self.c.charging_state.minimum_active)
        self.assertTrue(self.c.charging_state.storage_active)

    async def test_battery_command_requires_confirmed_authorized_limit(self):
        from pilot_test.model import Settings, decide
        self.c.settings=Settings(reserve_soc=60)
        self.c.decision=decide(sample(house_soc=90),self.c.settings)
        self.assertEqual(self.c.decision.discharge_w,2500)
        await self.c._send(Command("car_current",8,True))
        self.values["discharge_limit"].state="0"
        with self.assertRaises(ValidationError):
            await self.c._send(Command("car_charge",True,True))

    async def test_status_is_json_safe(self):
        import json
        await self.c.async_start()
        json.dumps(self.c.status(),allow_nan=False)

if __name__=="__main__": unittest.main()

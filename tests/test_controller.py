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

    async def test_scheduled_wake_is_throttled_and_never_a_charge_command(self):
        from dataclasses import replace
        self.c.settings=replace(self.c.settings,planner_ev_enabled=True,planner_control_enabled=True)
        self.c.mode='auto'
        for key in ('car_soc','car_limit','car_cable','car_home'):
            self.values[key].state='unavailable'
        self.values['car_online'].state='off'
        self.values['car_charge'].state='off'
        self.c.snapshot=self.c.read()
        now=self.c.snapshot.now
        button=SimpleNamespace(entity_id='button.test_wake',device_id='tesla',domain='button',disabled_by=None,unique_id='vin_wake_up',original_name='Wake up')
        registry=SimpleNamespace(async_get=lambda _:SimpleNamespace(device_id='tesla'),entities={'wake':button})
        er=module('homeassistant.helpers.entity_registry',async_get=lambda _:registry)
        sys.modules['homeassistant.helpers'].entity_registry=er
        self.hass.services.async_call=AsyncMock()
        plan={'available':True,'joint':True,'updated':now,'points':[{'start':now,'end':now+900,'ev_amps':16}]}
        await self.c.prepare_vehicle(plan)
        self.hass.services.async_call.assert_awaited_once_with('button','press',{'entity_id':'button.test_wake'},blocking=True)
        self.assertEqual(self.c.car_wake['pending'],now)
        await self.c.prepare_vehicle(plan)
        self.assertEqual(self.hass.services.async_call.await_count,1)
        self.assertEqual(self.c.store.payload['car_wake']['attempts'],[now])
        self.c.snapshot=replace(self.c.snapshot,now=now+901,at_home=True,cable=True)
        plan.update(updated=now+901,points=[{'start':now+901,'end':now+1801,'ev_amps':16}])
        self.c.age=lambda key,now:0
        registry.entities['other']=SimpleNamespace(**{**vars(button),'entity_id':'button.other'})
        await self.c.prepare_vehicle(plan)
        self.assertEqual(self.hass.services.async_call.await_count,1)
        self.assertIn('eindeutige',self.c.car_wake['reason'])

    async def test_car_display_cache_survives_unavailable_state_and_restart(self):
        await self.c.async_update()
        expected = self.c.last_car_soc
        self.assertIsNotNone(expected)
        self.assertEqual(self.c.last_car_seen, (NOW-timedelta(seconds=10)).timestamp())
        self.assertIsNotNone(self.c.last_car_limit)
        saved = dict(self.c.store.payload)
        self.values["car_soc"].state = "unavailable"
        self.values["car_limit"].state = "unavailable"
        await self.c.async_update()
        self.assertEqual(self.c.last_car_soc, expected)
        self.assertEqual(self.c.last_car_seen, saved["last_car_seen"])
        self.c.last_car_soc = self.c.last_car_seen = self.c.last_car_limit = None
        await self.c.async_start()
        self.assertEqual(self.c.last_car_soc, expected)
        self.assertEqual(self.c.last_car_seen, saved["last_car_seen"])

    async def test_immediate_mode_saves_previous_mode_and_protects_storage(self):
        from dataclasses import replace
        self.c.mode="auto"
        self.c.read=Mock(return_value=sample(now=NOW.timestamp(),house_soc=99,car_soc=30,car_limit=50,car_current=15,charging=True,current_discharge_w=2500,grid_charge_enabled=False))
        await self.c.async_activate("charge_now")
        self.assertEqual(self.c.mode,"charge_now")
        self.assertEqual(self.c.immediate_return_mode,"auto")
        self.assertEqual(self.c.energy_control['source'],'charge_now')
        self.assertEqual(self.c.decision.discharge_w,0)
        self.assertEqual(self.c.decision.target_amps,16)
        self.assertEqual(self.c.store.payload['immediate_return_mode'],'auto')

    async def test_immediate_stop_waits_for_confirmation_then_restores_observation(self):
        from dataclasses import replace
        self.c.mode="charge_now";self.c.immediate_return_mode="observe"
        s=sample(now=NOW.timestamp(),car_soc=30,car_limit=50,charging=True,car_current=16,current_discharge_w=0,grid_charge_enabled=False)
        self.c.read=Mock(return_value=s)
        await self.c.async_set_mode("observe")
        self.assertEqual(self.c.mode,"charge_now")
        self.assertTrue(self.c.immediate_stop_requested)
        self.assertEqual(self.c.decision.target_amps,0)
        self.c.read.return_value=replace(s,charging=False)
        await self.c.async_update()
        self.assertEqual(self.c.mode,"observe")
        self.assertFalse(self.c.immediate_stop_requested)

    async def test_immediate_limit_reached_restores_previous_mode_only_after_stop(self):
        from dataclasses import replace
        self.c.mode="charge_now";self.c.immediate_return_mode="paused"
        s=sample(now=NOW.timestamp(),car_soc=50,car_limit=50,charging=True)
        self.c.read=Mock(return_value=s)
        await self.c.async_update()
        self.assertEqual(self.c.mode,"charge_now")
        self.assertEqual(self.c.decision.target_amps,0)
        self.c.read.return_value=replace(s,charging=False)
        await self.c.async_update()
        self.assertEqual(self.c.mode,"paused")

    async def test_immediate_mode_and_return_mode_survive_reload(self):
        self.c.mode="charge_now";self.c.immediate_return_mode="storage_first"
        await self.c.persist()
        saved=self.c.store.payload
        self.c.mode="observe";self.c.immediate_return_mode="observe"
        self.c.store.async_load=AsyncMock(return_value=saved)
        await self.c.async_start()
        self.assertEqual(self.c.mode,"charge_now")
        self.assertEqual(self.c.immediate_return_mode,"storage_first")
        self.assertEqual(self.c.decision.discharge_w,0)

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

    async def test_tariffs_persist_without_device_commands_or_source_changes(self):
        self.entry.options={"display_sources":{"roof_daily":"sensor.custom_roof"},"other":"keep"}
        await self.c.async_configure({"feed_in_eur_kwh":.095,"purchase_eur_kwh":.31})
        saved=self.hass.config_entries.async_update_entry.call_args.kwargs["options"]
        self.assertEqual(saved["settings"]["feed_in_eur_kwh"],.095)
        self.assertEqual(saved["settings"]["purchase_eur_kwh"],.31)
        self.assertEqual(saved["display_sources"],self.entry.options["display_sources"])
        self.assertEqual(saved["other"],"keep")
        self.assertEqual(self.calls,[])

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

    async def test_active_house_plan_uses_existing_discharge_actuator(self):
        from dataclasses import replace
        from unittest.mock import patch
        self.c.settings=replace(self.c.settings,planner_control_enabled=True)
        s=sample(now=NOW.timestamp(),house_soc=50,at_home=False,pv_w=0,grid_export_w=-500,battery_charge_w=0)
        self.c.read=Mock(return_value=s)
        self.c.mode="storage_first"
        self.c.consumption.result={'updated':s.now}
        self.c.grid_forecast.status=Mock(return_value={'available':True})
        self.c.planner.status=Mock(return_value={'available':True,'updated':s.now,'initial_soc':50,
            'points':[{'start':s.now,'end':s.now+900,'soc':49,'battery_kw':.4}]})
        self.states['number.batterien_entlade_ende_ladestand']=state(1,"%")
        with patch.object(sys.modules['pilot_test.controller'],'display_sources',return_value={'battery_min_soc':'number.batterien_entlade_ende_ladestand'}):
            await self.c.async_update()
        self.assertEqual(self.c.energy_control['source'],'highs')
        self.assertIn(('number','set_value',{'entity_id':ENTITY_DEFAULTS['discharge_limit'],'value':400}),self.calls)
        self.assertFalse(any(domain!='number' for domain,_,_ in self.calls))

    async def test_joint_plan_routes_ev_and_protection_through_existing_executor(self):
        from dataclasses import replace
        from unittest.mock import patch
        self.c.settings=replace(self.c.settings,planner_control_enabled=True,planner_ev_enabled=True)
        s=sample(now=NOW.timestamp(),house_soc=50,car_soc=39,car_limit=80,pv_w=0,grid_export_w=-500,battery_charge_w=0,wallbox_w=0,charging=False)
        self.c.read=Mock(return_value=s);self.c.mode="storage_first"
        self.c.consumption.result={'updated':s.now}
        self.c.grid_forecast.status=Mock(return_value={'available':True,'share':90})
        self.c.planner.status=Mock(return_value={'available':True,'joint':True,'updated':s.now,'initial_soc':50,
            'ev':{'active':True,'initial_soc':39,'limit_soc':80,'target_soc':80,'phases':1},
            'points':[{'start':s.now,'end':s.now+900,'soc':50,'ev_soc':40,'ev_amps':10,'battery_kw':0}]})
        self.states['number.batterien_entlade_ende_ladestand']=state(3,"%")
        with patch.object(sys.modules['pilot_test.controller'],'display_sources',return_value={'battery_min_soc':'number.batterien_entlade_ende_ladestand'}):
            await self.c.async_update()
        self.assertEqual(self.c.energy_control['source'],'highs_ev')
        self.assertIn(('number','set_value',{'entity_id':ENTITY_DEFAULTS['discharge_limit'],'value':0}),self.calls)
        self.assertIn(('number','set_value',{'entity_id':ENTITY_DEFAULTS['car_current'],'value':10}),self.calls)
        self.assertIn(('switch','turn_on',{'entity_id':ENTITY_DEFAULTS['car_charge']}),self.calls)

    async def test_status_is_json_safe(self):
        import json
        await self.c.async_start()
        json.dumps(self.c.status(),allow_nan=False)

    async def test_evaluate_publishes_status_sensor_without_removed_conflict_field(self):
        from unittest.mock import patch
        component=types.ModuleType("homeassistant.components")
        sensors=types.ModuleType("homeassistant.components.sensor")
        sensors.SensorEntity=type("SensorEntity",(),{})
        sensors.SensorDeviceClass=SimpleNamespace(ENERGY="energy")
        sensors.SensorStateClass=SimpleNamespace(TOTAL="total")
        registry=types.ModuleType("homeassistant.helpers.device_registry")
        registry.DeviceInfo=lambda **kwargs:kwargs
        with patch.dict(sys.modules,{"homeassistant.components":component,"homeassistant.components.sensor":sensors,"homeassistant.helpers.device_registry":registry}):
            spec=importlib.util.spec_from_file_location("pilot_test.sensor",root/"sensor.py")
            mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        self.entry.runtime_data=self.c
        sensor=mod.PilotSensor(self.entry,"status","Regelstatus",None,"mdi:state-machine")
        self.assertIsNone(sensor.native_value)
        published=[]
        sensor.async_write_ha_state=lambda:published.append(sensor.native_value)
        unsubscribe=self.c.subscribe(sensor._changed)
        try:
            self.assertFalse(hasattr(self.c,"conflict"))
            for mode in ("observe","paused","auto","storage_first","charge_minimum"):
                self.c.mode=mode
                await self.c.async_update()
                self.assertEqual(published[-1],self.c.decision.code)
        finally:unsubscribe()

if __name__=="__main__": unittest.main()

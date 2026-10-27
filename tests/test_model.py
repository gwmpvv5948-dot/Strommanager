"""Pure engine tests: no Home Assistant instance or device access."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from dataclasses import replace

root = Path(__file__).resolve().parents[1] / "custom_components" / "solar_pilot"
pkg = types.ModuleType("pilot_test")
pkg.__path__ = [str(root)]
sys.modules["pilot_test"] = pkg
for name in ("model", "executor"):
    spec = importlib.util.spec_from_file_location(f"pilot_test.{name}", root / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
from pilot_test.model import Settings, Snapshot, decide
from pilot_test.executor import Command, Executor, plan


def sample(**changes):
    return replace(Snapshot(now=10000,daylight=True,hours_left=4,house_soc=80,house_soc_age=10,
        pv_w=5500,grid_export_w=2000,battery_charge_w=2000,wallbox_w=0,meter_age=10,
        forecast_kwh=12,forecast_age=300,car_soc=60,car_limit=80,car_age=100,
        at_home=True,cable=True,wallbox_enabled=True,online=True,charging=False,
        charge_changed_age=1000,car_current=16,current_discharge_w=2500,
        grid_charge_enabled=False), **changes)


class Decisions(unittest.TestCase):
    def setUp(self): self.c=Settings()
    def test_minimum_never_allows_grid_charge(self):
        d=decide(sample(car_soc=45,house_soc=10,pv_w=0,grid_export_w=-500,battery_charge_w=0),self.c)
        self.assertEqual((d.target_amps,d.discharge_w,d.code),(0,0,"reserve"))
    def test_below_minimum_waits_at_night(self):
        self.assertEqual(decide(sample(car_soc=20,daylight=False,hours_left=0),self.c).target_amps,0)
    def test_below_minimum_uses_solar(self):
        self.assertGreater(decide(sample(car_soc=20),self.c).target_amps,0)
    def test_low_forecast_prioritizes_reserve(self):
        d=decide(sample(house_soc=40,forecast_kwh=1),self.c)
        self.assertEqual((d.reserve_charge_w,d.target_amps,d.discharge_w),(2500,0,0))
    def test_strong_forecast_allows_shared_charging(self):
        d=decide(sample(house_soc=60,forecast_kwh=20,grid_export_w=3000,battery_charge_w=2000),self.c)
        self.assertLess(d.reserve_charge_w,2500)
        self.assertGreaterEqual(d.target_amps,6)
    def test_storage_priority_overrides_forecast(self):
        self.assertEqual(decide(sample(house_soc=60,forecast_kwh=20),self.c,"storage_first").reserve_charge_w,2500)
    def test_reserve_is_not_charge_ceiling(self):
        s=sample(house_soc=95)
        d=decide(s,self.c)
        self.assertEqual(d.reserve_charge_w,0)
        self.assertGreater(d.target_amps,0)
        self.assertFalse(any(c.channel in ("charge_limit","house_soc") for c in plan(s,d,self.c)))
    def test_night_house_discharge_below_reserve(self):
        self.assertEqual(decide(sample(daylight=False,hours_left=0,house_soc=30,at_home=False),self.c).discharge_w,2500)
    def test_night_car_above_minimum_pauses(self):
        s=sample(daylight=False,hours_left=0,wallbox_w=3500,charging=True)
        d=decide(s,self.c)
        self.assertEqual((d.target_amps,d.discharge_w),(0,0))
        self.assertIn(Command("car_charge",False,True),plan(s,d,self.c))
    def test_vehicle_limit_wins(self):
        self.assertEqual(decide(sample(car_soc=45,car_limit=40),self.c).target_amps,0)
    def test_away_never_controls_car(self):
        s=sample(at_home=False,car_soc=10,charging=True)
        self.assertFalse(any(c.cloud for c in plan(s,decide(s,self.c),self.c)))
    def test_stale_location_never_controls_car(self):
        self.assertFalse(decide(sample(location_age=2000),self.c).may_control_car)
    def test_disconnected_never_controls_car(self):
        self.assertIsNone(decide(sample(cable=False),self.c).target_amps)
    def test_sleeping_car_sends_no_commands(self):
        s=sample(online=False,car_soc=10)
        self.assertFalse(any(c.cloud for c in plan(s,decide(s,self.c),self.c)))
    def test_stale_car_data_pauses(self):
        d=decide(sample(car_age=2000,car_soc=10,charging=True),self.c)
        self.assertEqual(d.target_amps,0)
        self.assertTrue(d.problems)
    def test_missing_meter_is_not_zero(self):
        d=decide(sample(grid_export_w=None,charging=True),self.c)
        self.assertEqual((d.target_amps,d.discharge_w),(0,0))
    def test_stale_meter_fail_closed_at_night(self):
        self.assertEqual(decide(sample(meter_age=400,daylight=False,hours_left=0,at_home=False),self.c).discharge_w,0)
    def test_nan_infinite_rejected(self):
        for v in (float("nan"),float("inf"),-float("inf")):
            self.assertEqual(decide(sample(pv_w=v),self.c).target_amps,0)
    def test_missing_forecast_reserves_full_power(self):
        self.assertEqual(decide(sample(house_soc=40,forecast_kwh=None),self.c).reserve_charge_w,2500)
    def test_expired_forecast_reserves_full_power(self):
        self.assertEqual(decide(sample(house_soc=40,forecast_age=30000),self.c).reserve_charge_w,2500)
    def test_unknown_sun_protects_storage(self):
        self.assertEqual(decide(sample(daylight=None),self.c).discharge_w,0)
    def test_missing_sunset_blocks_pv_charge(self):
        self.assertEqual(decide(sample(hours_left=None),self.c).target_amps,0)
    def test_battery_discharge_not_solar_surplus(self):
        d=decide(sample(pv_w=0,wallbox_w=2000,grid_export_w=0,battery_charge_w=-2000),self.c)
        self.assertEqual((d.available_car_w,d.target_amps),(0,0))
    def test_one_three_phase_current(self):
        self.assertEqual(decide(sample(),self.c).target_amps,16)
        self.assertEqual(decide(sample(),replace(self.c,phases=3)).target_amps,0)
    def test_start_hysteresis(self):
        s=sample(grid_export_w=1810,battery_charge_w=0)
        self.assertEqual(decide(s,self.c).target_amps,0)
        self.assertEqual(decide(replace(s,wallbox_w=1400,grid_export_w=410),self.c).target_amps,7)
    def test_minimum_only_mode(self):
        self.assertEqual(decide(sample(),self.c,"charge_minimum").target_amps,0)
    def test_unknown_protection_blocks_start(self):
        s=sample(grid_charge_enabled=None)
        self.assertFalse(any(c.cloud for c in plan(s,decide(s,self.c),self.c)))
    def test_idempotent_plan(self):
        s=sample(car_soc=45,car_current=16,charging=True,current_discharge_w=0)
        self.assertEqual(plan(s,decide(s,self.c),self.c),[])
    def test_invalid_settings(self):
        for v in ({"reserve_soc":101},{"phases":2},{"max_amps":3},{"capacity_kwh":0},
                  {"forecast_factor":float("nan")},{"phases":1.0},{"grid_export_positive":"yes"}):
            with self.assertRaises((ValueError,TypeError)): Settings(**v)


class Execution(unittest.IsolatedAsyncioTestCase):
    async def test_cloud_cooldown(self):
        sent=[]
        async def send(c): sent.append(c)
        e=Executor(send)
        await e.run(1000,[Command("car_current",10,True)],300,{"car_current":16})
        await e.run(1100,[Command("car_current",8,True)],300,{"car_current":10})
        self.assertEqual(len(sent),1)
        await e.run(1301,[Command("car_current",8,True)],300,{"car_current":10})
        self.assertEqual(len(sent),2)
    async def test_protection_failure_blocks_start_allows_stop(self):
        sent=[]
        async def send(c):
            sent.append(c)
            if c.channel=="discharge_limit": raise RuntimeError("offline")
        e=Executor(send)
        await e.run(1000,[Command("discharge_limit",0),Command("car_charge",True,True)],300,{"discharge_limit":2500})
        self.assertEqual([c.channel for c in sent],["discharge_limit"])
        self.assertIsNotNone(e.error)
        await e.run(1010,[Command("discharge_limit",0),Command("car_charge",False,True)],300,{"discharge_limit":2500})
        self.assertEqual(sent[-1],Command("car_charge",False,True))
    async def test_failed_current_never_starts(self):
        sent=[]
        async def send(c):
            sent.append(c)
            raise RuntimeError("signing failed")
        e=Executor(send)
        await e.run(1000,[Command("car_current",6,True),Command("car_charge",True,True)],300,{"car_current":16})
        self.assertEqual(len(sent),1)
    async def test_restore_respects_manual_change(self):
        async def send(c): pass
        e=Executor(send)
        await e.run(1000,[Command("discharge_limit",0)],300,{"discharge_limit":2500})
        self.assertEqual(e.restoration({"discharge_limit":0}),[Command("discharge_limit",2500)])
        self.assertEqual(e.restoration({"discharge_limit":1000}),[])
    async def test_backoff(self):
        sent=[]
        async def send(c):
            sent.append(c)
            raise RuntimeError("offline")
        e=Executor(send)
        for t in (1000,1030,1060,1100):
            await e.run(t,[Command("discharge_limit",0)],300,{"discharge_limit":2500})
        self.assertEqual(len(sent),1)
        await e.run(1241,[Command("discharge_limit",0)],300,{"discharge_limit":2500})
        self.assertEqual(len(sent),2)

if __name__=="__main__": unittest.main()

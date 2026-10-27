"""Energy conservation, history gaps and durable ledger update contracts."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('day_budget_test',Path(__file__).parents[1]/'custom_components/solar_pilot/day_budget.py')
budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)

class DayAccounting(unittest.TestCase):
    def test_imported_car_energy_is_not_all_assigned_to_solar(self):
        flow=budget.allocate(4000,-6000,0,6000)
        self.assertAlmostEqual(flow['solar'],3800)
        self.assertLess(flow['tesla'],6000)
        self.assertAlmostEqual(sum(flow[k] for k in ('house','storage','tesla','other')),3800)

    def test_night_charging_does_not_become_pv(self):
        flow=budget.allocate(0,-6500,0,6000)
        self.assertEqual(sum(flow[k] for k in ('house','storage','tesla','other')),0)

    def test_battery_discharge_is_not_new_pv_generation(self):
        flow=budget.allocate(1000,-200,-1500,2000)
        self.assertEqual(flow['storage'],0)
        self.assertEqual(flow['solar'],950)
        self.assertAlmostEqual(sum(flow[k] for k in ('house','storage','tesla','other')),950)

    def test_export_stays_outside_consumption_categories(self):
        flow=budget.allocate(4000,2000,1000,0)
        self.assertAlmostEqual(flow['other'],2000)
        self.assertAlmostEqual(flow['house']+flow['storage'],1800)

    def test_invalid_samples_do_not_fabricate_consumption(self):
        for v in (None,'unavailable',float('nan'),float('inf')):
            self.assertIsNone(budget.allocate(v,0,0,0))
        self.assertIsNone(budget.allocate(-1,0,0,0))

    def test_integral_units_conservation_and_overlap_replacement(self):
        rows={key:[(t,value) for t in range(0,3600,300)] for key,value in [('pv',4000),('grid',0),('battery',1000),('wallbox',2000)]}
        bins=budget.integrate(rows,0,3600)
        totals=budget.totals(bins)
        self.assertEqual(len(bins),60)
        self.assertAlmostEqual(totals['solar'],3.8)
        self.assertAlmostEqual(totals['house'],.8)
        self.assertAlmostEqual(totals['storage'],1)
        self.assertAlmostEqual(totals['tesla'],2)
        self.assertAlmostEqual(totals['pv_hours'],1)
        bins.update(budget.integrate(rows,3000,3600))
        self.assertAlmostEqual(budget.totals(bins)['solar'],3.8)

    def test_unknowns_and_gaps_are_not_stretched_across_the_day(self):
        rows={key:[(0,value)] for key,value in [('pv',4000),('grid',0),('battery',1000),('wallbox',2000)]}
        self.assertEqual(len(budget.integrate(rows,0,3600)),15)
        rows['pv']=[(0,None)]
        self.assertEqual(budget.integrate(rows,0,3600),{})

    def test_sign_configuration_is_applied_once(self):
        rows={key:[(0,value)] for key,value in [('pv',4000),('grid',-2000),('battery',-1000),('wallbox',0)]}
        total=budget.totals(budget.integrate(rows,0,60,False,False))
        self.assertAlmostEqual(total['other'],2000/60000)
        self.assertAlmostEqual(total['storage'],1000/60000)

if __name__=='__main__':unittest.main()

class DurableTracker(unittest.IsolatedAsyncioTestCase):
    async def test_restart_overlap_and_day_change_keep_exactly_one_copy(self):
        import sys
        import types
        from datetime import datetime, timedelta, timezone
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from test_controller import MemoryStore
        from pilot_test.model import Settings
        from homeassistant.util import dt as dt_util
        clock=[datetime(2026,10,27,1,tzinfo=timezone.utc)]
        ids={'pv_power':'pv','grid_power':'grid','battery_power':'bat','wallbox_power':'box'}
        def history_read(hass,start,end,entities,**kwargs):
            values={'pv':4000,'grid':0,'bat':1000,'box':2000}
            return {entity:[SimpleNamespace(state=str(value),attributes={'unit_of_measurement':'W'},last_updated=start+timedelta(seconds=t)) for t in range(0,int((end-start).total_seconds()),300)] for entity,value in values.items()}
        async def run(fn):return fn()
        recorder=types.ModuleType('homeassistant.components.recorder')
        recorder.history=SimpleNamespace(get_significant_states=history_read)
        recorder.get_instance=lambda hass:SimpleNamespace(async_add_executor_job=run)
        entry=SimpleNamespace(entry_id='ledger',async_on_unload=Mock(),async_create_background_task=Mock())
        hass=SimpleNamespace(is_running=True)
        with patch.dict(sys.modules,{'homeassistant.components.recorder':recorder}),patch.object(dt_util,'utcnow',lambda:clock[0]),patch.object(dt_util,'as_local',lambda dt:dt,create=True):
            tracker=budget.DayBudgetTracker(hass,entry,ids,Settings(),lambda:None)
            tracker.store=MemoryStore()
            await tracker.async_start()
            self.assertAlmostEqual(tracker.status()['actual']['solar'],3.8)
            restored=budget.DayBudgetTracker(hass,entry,ids,Settings(),lambda:None)
            restored.store=tracker.store
            await restored.async_start()
            self.assertAlmostEqual(restored.status()['actual']['solar'],3.8)
            clock[0]+=timedelta(minutes=5)
            await restored.async_refresh()
            self.assertAlmostEqual(restored.status()['actual']['solar'],3.8*65/60)
            clock[0]=datetime(2026,10,28,0,5,tzinfo=timezone.utc)
            await restored.async_refresh()
            self.assertEqual(restored.status()['day'],'2026-10-28')
            self.assertAlmostEqual(restored.status()['actual']['solar'],3.8*5/60)
            self.assertEqual(restored.status()['missing_minutes'],0)

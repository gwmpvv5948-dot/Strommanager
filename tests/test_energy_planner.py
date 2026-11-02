"""Solve physical LP scenarios rather than mirroring implementation details."""
import math
import unittest
from dataclasses import replace
from test_model import Settings
from pilot_test.energy_planner import PlannerConfig, optimize

try:
    import highspy
except ImportError:
    highspy = None


def config(**changes):
    return replace(PlannerConfig(5,60,10,20,2.5,2.5,.9,.27,.082,.12,.02,60,55,True),**changes)


def slots(hours=24,pv=0,load=.5,ee=50):
    return [{'start':i*900,'end':(i+1)*900,'load_kw':load,'pv_kw':pv,'ee':ee} for i in range(hours*4)]


@unittest.skipUnless(highspy,'Install manifest highspy requirement to test real LP')
class EnergyPlanner(unittest.TestCase):
    def physical(self,result,c):
        energy=c.capacity*c.initial_soc/100
        for p in result['points']:
            h=(p['end']-p['start'])/3600
            self.assertAlmostEqual(p['pv_direct_kw']+p['battery_kw']+p['grid_kw'],p['load_kw'],places=6)
            self.assertAlmostEqual(p['pv_direct_kw']+p['charge_kw']+p['export_kw'],p['pv_kw'],places=6)
            energy+=p['charge_kw']*h*c.efficiency-p['battery_kw']*h/c.efficiency
            self.assertAlmostEqual(energy,p['soc']/100*c.capacity,places=6)
            self.assertGreaterEqual(p['soc']+1e-5,c.minimum_soc)
            self.assertLessEqual(p['soc'],100+1e-5)
            self.assertFalse(p['charge_kw']>1e-6 and p['battery_kw']>1e-6)
        self.assertAlmostEqual(result['reference']['end_soc'],result['totals']['end_soc'],places=5)
    def test_moves_battery_to_dirty_hours(self):
        c=config(cycle_cost=0,ee_weight=1,initial_soc=80,terminal_soc=10,grid_enabled=False)
        data=slots(hours=8,load=.4)
        for p in data:p['ee']=95 if p['start']<4*3600 else 5
        r=optimize(data,c);self.physical(r,c)
        clean=sum(p['battery_kw'] for p in r['points'][:16]);dirty=sum(p['battery_kw'] for p in r['points'][16:])
        self.assertGreater(dirty,clean)
        self.assertLess(r['delta']['nonrenewable_kwh'],0)
    def test_pv_only_charge_and_capacity(self):
        c=config(initial_soc=95)
        r=optimize(slots(hours=4,pv=5,load=.2),c);self.physical(r,c)
        self.assertGreater(sum(p['export_kw'] for p in r['points']),0)
    def test_no_free_energy_no_grid_charging_and_end_reserve(self):
        c=config(initial_soc=40,terminal_soc=30)
        r=optimize(slots(hours=8,pv=0,ee=100),c);self.physical(r,c)
        self.assertGreaterEqual(r['totals']['end_soc'],30-1e-6)
        self.assertEqual(sum(p['charge_kw'] for p in r['points']),0)
    def test_objective_never_worse_than_feasible_reference(self):
        c=config();data=slots()
        for i,p in enumerate(data):p['pv_kw']=2 if 40<=i<64 else 0;p['ee']=90 if i<32 else 20
        r=optimize(data,c);self.physical(r,c)
        self.assertLessEqual(r['totals']['objective'],r['reference']['objective']+1e-6)
    def test_forecast_gaps_and_bad_soc_are_rejected(self):
        bad=slots();bad[5]['load_kw']=None
        with self.assertRaises(ValueError):optimize(bad,config())
        with self.assertRaises(ValueError):optimize(slots(),config(initial_soc=-1))
        with self.assertRaises(ValueError):optimize(slots(),config(initial_soc=float('nan')))
    def test_initial_soc_below_minimum_waits_for_pv_recovery(self):
        c=config(initial_soc=7,minimum_soc=10)
        data=slots(hours=8,load=.5,pv=0)
        for p in data[16:24]:p['pv_kw']=1
        r=optimize(data,c)
        self.assertTrue(all(p['battery_kw']<1e-6 for p in r['points'][:16]))
        self.assertTrue(all(abs(p['soc']-7)<1e-6 for p in r['points'][:16]))
        self.assertGreaterEqual(r['points'][23]['soc'],10-1e-6)
        self.assertGreaterEqual(r['terminal_soc'],10-1e-6)
    def test_low_soc_without_pv_preserves_existing_energy(self):
        c=config(initial_soc=7,minimum_soc=10)
        r=optimize(slots(hours=8),c)
        self.assertTrue(all(abs(p['soc']-7)<1e-6 for p in r['points']))
        self.assertTrue(all(p['battery_kw']<1e-6 for p in r['points']))
    def test_zero_load_does_not_invent_self_consumption(self):
        c=config();r=optimize(slots(hours=3,load=0,pv=0),c);self.physical(r,c)
        self.assertAlmostEqual(r['totals']['grid_kwh'],0)
        self.assertAlmostEqual(r['totals']['throughput_kwh'],0)

class PlannerSettings(unittest.TestCase):
    def test_bad_objective_weights_are_rejected(self):
        for k in ['planner_ee_weight_eur_kwh','planner_cycle_eur_kwh']:
            with self.assertRaises(ValueError):Settings(**{k:-1})

"""Physical and policy scenarios for the actual HiGHS Tesla MILP."""
import unittest
from dataclasses import replace
from test_energy_planner import config,slots,highspy
from pilot_test.ev_planner import EVConfig,optimize_ev


def vehicle(**changes):
    return replace(EVConfig(50,39,80,80,.9,6,8,16,1,60,60,80),**changes)

@unittest.skipUnless(highspy,'Manifest highspy requirement needed')
class JointPlanning(unittest.TestCase):
    def verify(self,r,c,ev):
        energy=c.capacity*c.initial_soc/100;car=ev.capacity*ev.initial_soc/100
        for p in r['points']:
            h=(p['end']-p['start'])/3600
            self.assertIn(p['ev_amps'],[0,*range(6,17)])
            self.assertAlmostEqual(p['pv_kw']+p['battery_kw']+p['grid_kw'],p['load_kw']+p['ev_kw']+p['charge_kw']+p['export_kw'],places=5)
            self.assertAlmostEqual(p['ev_kw'],p['ev_pv_kw']+p['ev_battery_kw']+p['ev_grid_kw'],places=5)
            self.assertAlmostEqual(p['load_kw'],p['pv_direct_kw']+p['house_battery_kw']+p['house_grid_kw'],places=5)
            energy+=(p['charge_kw']*c.efficiency-p['battery_kw']/c.efficiency)*h
            car+=p['ev_kw']*ev.efficiency*h
            self.assertAlmostEqual(energy,p['soc']/100*c.capacity,places=5)
            self.assertAlmostEqual(car,p['ev_soc']/100*ev.capacity,places=5)
            self.assertLessEqual(p['ev_soc'],max(ev.initial_soc,ev.target_soc)+1e-5)
            self.assertFalse(p['charge_kw']>1e-5 and p['battery_kw']>1e-5)
            self.assertFalse(p['export_kw']>1e-5 and p['battery_kw']>1e-5)
            if p['ev_amps'] and p['battery_kw']>1e-5:self.assertGreaterEqual(p['soc'],ev.reserve_soc-1e-5)
    def test_clean_network_windows_and_pv_fill_vehicle_without_fixed_departure(self):
        data=slots();c=config(initial_soc=40);ev=vehicle()
        for i,p in enumerate(data):p['ee']=90 if i<24 else 20;p['pv_kw']=2 if 32<=i<56 else 0
        r=optimize_ev(data,c,ev);self.verify(r,c,ev)
        self.assertGreater(r['ev']['planned_soc'],79)
        self.assertTrue(all(p['ev_grid_kw']<1e-5 for p in r['points'][24:]))
    def test_unknown_or_dirty_ee_never_allows_flexible_grid_charge(self):
        for ee in (None,20):
            r=optimize_ev(slots(ee=ee),config(initial_soc=5),vehicle());self.verify(r,config(initial_soc=5),vehicle())
            self.assertAlmostEqual(r['ev']['planned_soc'],39,places=5)
            self.assertTrue(all(p['ev_amps']==0 for p in r['points']))
    def test_battery_below_limit_can_recover_and_then_plan_tesla_pv(self):
        c=config(initial_soc=0,minimum_soc=3);ev=vehicle();data=slots(ee=None)
        for i,p in enumerate(data):p['pv_kw']=3 if 24<=i<64 else 0
        r=optimize_ev(data,c,ev);self.verify(r,c,ev)
        self.assertTrue(all(p['ev_amps']==0 for p in r['points'][:24]))
        self.assertGreater(r['ev']['planned_soc'],39)
    def test_no_shared_battery_discharge_during_ev_charge_below_release(self):
        c=config(initial_soc=70);ev=vehicle();r=optimize_ev(slots(ee=95),c,ev);self.verify(r,c,ev)
        self.assertTrue(all(p['battery_kw']<1e-5 for p in r['points'] if p['ev_amps']))
    def test_released_storage_stops_at_tesla_reserve(self):
        c=config(initial_soc=90);ev=vehicle(released=True);r=optimize_ev(slots(ee=10),c,ev);self.verify(r,c,ev)
        self.assertTrue(any(p['ev_amps']>0 for p in r['points']))
        self.assertTrue(all(p['soc']>=60-1e-5 for p in r['points'] if p['ev_amps']))
    def test_mandatory_minimum_charge_overrides_dirty_grid_without_house_battery(self):
        c=config(initial_soc=90);ev=vehicle(initial_soc=20,target_soc=50,urgent=True);r=optimize_ev(slots(ee=10),c,ev);self.verify(r,c,ev)
        self.assertEqual(r['points'][0]['ev_amps'],16)
        self.assertGreater(r['ev']['planned_soc'],49)
        self.assertTrue(all(p['battery_kw']<1e-5 for p in r['points'] if p['ev_amps']))
    def test_stage_diagnostics_report_time_and_search_work(self):
        r=optimize_ev(slots(ee=90),config(),vehicle())
        diagnostics=r['solver_diagnostics']
        self.assertEqual([d['stage'] for d in diagnostics],['Tesla-Ladeziel','Speicherreserve','Kosten und Ladestarts'])
        for d in diagnostics:
            self.assertEqual(d['status'],'Optimal')
            self.assertEqual(d['time_limit_s'],60)
            self.assertGreaterEqual(d['seconds'],0)
            self.assertGreaterEqual(d['nodes'],0)

    def test_limit_reached_does_not_add_energy(self):
        ev=vehicle(initial_soc=80);r=optimize_ev(slots(ee=90),config(),ev)
        self.assertTrue(all(p['ev_amps']==0 for p in r['points']))
    def test_storage_first_prioritises_reachable_evening_reserve(self):
        c=config(initial_soc=20);ev=vehicle(storage_first=True,reserve_stamp=6*3600);data=slots(ee=10)
        for p in data[:24]:p['pv_kw']=1
        r=optimize_ev(data,c,ev);self.verify(r,c,ev)
        self.assertGreaterEqual(r['ev']['reserve_planned_soc'],60-1e-5)
    def test_partial_current_interval(self):
        c=config(initial_soc=70);ev=vehicle();data=slots(ee=90);data[0]['start']=173
        r=optimize_ev(data,c,ev);self.verify(r,c,ev)
        self.assertGreater(r['ev']['planned_soc'],79)
    def test_prices_select_network_windows_without_claiming_ee_and_keep_tariff(self):
        data=slots(hours=8,load=.2);c=config(initial_soc=3,minimum_soc=3,price_weight=1,ev_price_ct=10);ev=vehicle(target_soc=45)
        for i,p in enumerate(data):p.update(ee=0 if i<16 else 100,spot_ct=-5 if i<16 else 30,price_forecast=i>=16)
        r=optimize_ev(data,c,ev);self.verify(r,c,ev)
        self.assertGreater(sum(p['ev_grid_kw'] for p in r['points'][:16]),0)
        self.assertAlmostEqual(sum(p['ev_grid_kw'] for p in r['points'][16:]),0)
        self.assertAlmostEqual(r['totals']['cost'],sum((p['grid_kw']*c.purchase-p['export_kw']*c.feed_in)*(p['end']-p['start'])/3600 for p in r['points']))

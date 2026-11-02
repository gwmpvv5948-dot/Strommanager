"""Real discharge decisions, with no access to physical devices."""
import unittest
from dataclasses import replace
from test_model import sample, Settings, decide
from pilot_test.planner_control import apply_house_plan

class HouseControl(unittest.TestCase):
    def setUp(self):
        self.c=replace(Settings(),planner_control_enabled=True)
        self.s=sample(house_soc=50,at_home=False,pv_w=0,grid_export_w=-500,battery_charge_w=0)
        self.base=replace(decide(self.s,self.c),discharge_w=0)
        self.plan={'available':True,'updated':self.s.now,'initial_soc':50,'points':[
            {'start':self.s.now,'end':self.s.now+900,'soc':49,'battery_kw':.456}]}
    def run_control(self,**kwargs):
        values=dict(s=self.s,c=self.c,decision=self.base,mode='storage_first',plan=self.plan,
                    device_min_soc=1,device_max_w=2500,device_step_w=100)
        values.update(kwargs)
        return apply_house_plan(**values)
    def test_house_plan_overrides_ee_hold_and_rounds_to_hardware_step(self):
        decision,status=self.run_control()
        self.assertEqual(decision.discharge_w,400)
        self.assertEqual(status['source'],'highs')
    def test_disabled_and_observe_pause_preserve_decision(self):
        for kwargs in ({'c':replace(self.c,planner_control_enabled=False)},{'mode':'observe'},{'mode':'paused'}):
            decision,_=self.run_control(**kwargs)
            self.assertEqual(decision,self.base)
    def test_invalid_or_stale_measurements_fail_closed(self):
        for kwargs in ({'device_min_soc':None},{'device_step_w':None},{'s':replace(self.s,house_soc=1)},
                       {'s':replace(self.s,meter_age=9999)},{'s':replace(self.s,house_soc_age=9999)},
                       {'s':replace(self.s,house_soc=101)},{'s':replace(self.s,daylight=None)},
                       {'s':replace(self.s,grid_charge_enabled=True)}):
            decision,status=self.run_control(**kwargs)
            self.assertEqual(decision.discharge_w,0)
            self.assertEqual(status['source'],'protection')
    def test_fallback_preserves_existing_rule(self):
        for kwargs in ({'inputs_valid':False},{'plan':{'available':False,'reason':None}},
                       {'plan':{**self.plan,'updated':self.s.now-601}},{'plan':{**self.plan,'points':[]}}):
            decision,status=self.run_control(decision=replace(self.base,discharge_w=2500),**kwargs)
            self.assertEqual(decision.discharge_w,2500)
            self.assertEqual(status['source'],'fallback')
    def test_tesla_actual_and_requested_charge_have_priority(self):
        for kwargs in ({'s':replace(self.s,wallbox_w=500)}, {'decision':replace(self.base,target_amps=6)}):
            decision,status=self.run_control(**kwargs)
            self.assertEqual(decision.discharge_w,0)
            self.assertEqual(status['source'],'tesla')
    def test_soc_deviation_triggers_replan(self):
        _,status=self.run_control(s=replace(self.s,house_soc=40))
        self.assertEqual(status['source'],'fallback')
        self.assertTrue(status['replan'])
    def test_never_exceeds_remaining_reserve_energy(self):
        s=replace(self.s,house_soc=1.1)
        plan={**self.plan,'initial_soc':1.1,'points':[{**self.plan['points'][0],'soc':1}]}
        decision,_=self.run_control(s=s,plan=plan,device_step_w=1)
        self.assertLessEqual(decision.discharge_w,.001*self.c.capacity_kwh*self.c.efficiency/.25*1000)

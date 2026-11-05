import unittest
from dataclasses import replace
from test_model import sample,Settings,decide
from pilot_test.planner_control import apply_joint_plan

class JointControl(unittest.TestCase):
    def setUp(self):
        self.c=replace(Settings(),planner_ev_enabled=True,planner_control_enabled=True)
        self.s=sample(house_soc=50,car_soc=39,car_limit=80,pv_w=0,grid_export_w=-500,battery_charge_w=0,wallbox_w=0)
        self.base=decide(self.s,self.c)
        self.plan={'available':True,'joint':True,'updated':self.s.now,'initial_soc':50,
            'ev':{'active':True,'initial_soc':39,'limit_soc':80,'target_soc':80,'phases':1},
            'points':[{'start':self.s.now,'end':self.s.now+900,'soc':50,'ev_soc':40,'ev_amps':16,'battery_kw':0}]}
    def run_joint(self,**kwargs):
        args=dict(s=self.s,c=self.c,decision=self.base,mode='auto',plan=self.plan,
            device_min_soc=3,device_max_w=2500,device_step_w=1,inputs_valid=True,grid_share=90)
        args.update(kwargs);return apply_joint_plan(**args)
    def test_clean_grid_starts_planned_current_with_protected_house_battery(self):
        d,m=self.run_joint();self.assertEqual((d.target_amps,d.discharge_w,m['source']),(16,0,'highs_ev'))
    def test_missing_or_changed_ee_caps_to_actual_pv_not_the_forecast(self):
        for share in (None,20):
            d,m=self.run_joint(grid_share=share);self.assertEqual(d.target_amps,0)
        s=replace(self.s,pv_w=4000,grid_export_w=3000)
        d,m=self.run_joint(s=s,grid_share=None);self.assertGreaterEqual(d.target_amps,8)
    def test_shortfall_below_ten_amps_stops_instead_of_sending_low_current(self):
        s=replace(self.s,pv_w=2300,grid_export_w=2000)
        d,m=self.run_joint(s=s,grid_share=None)
        self.assertEqual(d.target_amps,0)

    def test_actual_car_limit_change_invalidates_plan(self):
        _,m=self.run_joint(s=replace(self.s,car_limit=50));self.assertEqual(m['source'],'fallback');self.assertTrue(m['replan'])
    def test_away_unplugged_sleeping_or_stale_vehicle_never_gets_plan_permission(self):
        for s in (replace(self.s,at_home=False),replace(self.s,cable=False),replace(self.s,online=False),replace(self.s,car_age=2000)):
            d,m=self.run_joint(s=s);self.assertEqual(m['source'],'fallback')
    def test_minimum_charge_retains_existing_rule(self):
        d,m=self.run_joint(minimum_active=True);self.assertEqual(d,self.base);self.assertIn('Mindestladung',m['reason'])
    def test_stale_plan_and_pause_cannot_override_existing_decision(self):
        d,_=self.run_joint(plan={**self.plan,'updated':self.s.now-601});self.assertEqual(d,self.base)
        d,_=self.run_joint(mode='paused');self.assertEqual(d,self.base)
    def test_shared_actuator_stays_locked_until_ev_stop_is_confirmed(self):
        plan={**self.plan,'points':[{**self.plan['points'][0],'ev_amps':0,'battery_kw':.5}]}
        d,_=self.run_joint(s=replace(self.s,wallbox_w=2000),plan=plan)
        self.assertEqual(d.discharge_w,0)
    def test_low_house_soc_does_not_prevent_clean_grid_tesla_charge(self):
        s=replace(self.s,house_soc=3);plan={**self.plan,'initial_soc':3,'points':[{**self.plan['points'][0],'soc':3}]}
        d,m=self.run_joint(s=s,plan=plan);self.assertEqual((d.target_amps,d.discharge_w),(16,0))
    def test_soc_drift_requests_replan(self):
        _,m=self.run_joint(s=replace(self.s,car_soc=45));self.assertEqual(m['source'],'fallback');self.assertTrue(m['replan'])
    def test_live_grid_permission_depends_only_on_ee_not_spot_price(self):
        plan={**self.plan,'points':[{**self.plan['points'][0],'spot_ct':5}]}
        d,_=self.run_joint(plan=plan,spot_ct=5,grid_share=0);self.assertEqual(d.target_amps,0)
        for price in (None,11):
            d,_=self.run_joint(plan=plan,spot_ct=price,grid_share=100);self.assertEqual(d.target_amps,16)

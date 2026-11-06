"""Sleeping Tesla may be planned but never charged from cached data alone."""
from dataclasses import replace
from types import SimpleNamespace as N
import unittest
from test_model import sample, Settings, ChargingState
from pilot_test.ev_inputs import vehicle_inputs
from pilot_test.ev_wake import wake_due, vehicle_confirmed

class SleepingVehicle(unittest.TestCase):
    def controller(self, **changes):
        s=sample(online=False, car_soc=None, car_limit=None, car_age=99999,location_age=99999,at_home=False,cable=False)
        c=N(snapshot=replace(s,**changes),settings=replace(Settings(),planner_ev_enabled=True,planner_control_enabled=True),
            last_car_soc=39,last_car_limit=65,last_car_seen=s.now-10800,mode='auto',charging_state=ChargingState(),entities={'car_current':'number.car'},
            hass=N(states=N(get=lambda _:N(state='unavailable',attributes={'unit_of_measurement':'A','max':16,'step':1}))))
        return c
    def test_sleeping_car_plans_from_cache_with_wallbox_on(self):
        c=self.controller();ev,meta=vehicle_inputs(c,c.snapshot.now)
        self.assertEqual((ev.initial_soc,ev.limit_soc),(39,65));self.assertTrue(meta['estimated'])
        self.assertFalse(vehicle_confirmed(c))
    def test_wallbox_off_prevents_planning(self):
        c=self.controller(wallbox_enabled=False);ev,meta=vehicle_inputs(c,c.snapshot.now)
        self.assertIsNone(ev);self.assertIn('Wallbox',meta['reason'])
    def test_missing_future_or_more_than_day_old_cache_is_rejected(self):
        for stamp in (None,10001,-80000,float('nan')):
            c=self.controller();c.last_car_seen=stamp
            self.assertIsNone(vehicle_inputs(c,c.snapshot.now)[0])
    def test_missing_current_capabilities_prevents_plan(self):
        c=self.controller();c.hass.states.get=lambda _:None
        self.assertIsNone(vehicle_inputs(c,c.snapshot.now)[0])
    def test_only_current_positive_charge_interval_requests_wake(self):
        c=self.controller();s=c.snapshot
        p={'available':True,'joint':True,'updated':s.now,'points':[{'start':s.now,'end':s.now+900,'ev_amps':16}]}
        self.assertTrue(wake_due(s,c.settings,'auto',p))
        for mode in ('observe','paused','charge_now'):
            self.assertFalse(wake_due(s,c.settings,mode,p))
        for q in ({**p,'updated':s.now-601},{**p,'points':[{'start':s.now+900,'end':s.now+1800,'ev_amps':16}]},
                  {**p,'points':[{'start':s.now,'end':s.now+900,'ev_amps':0}]}):
            self.assertFalse(wake_due(s,c.settings,'auto',q))
        self.assertFalse(wake_due(replace(s,wallbox_enabled=False),c.settings,'auto',p))
    def test_wake_requires_all_reports_after_the_request(self):
        c=self.controller(online=True,at_home=True,cable=True,car_soc=39,car_limit=65,car_age=1,location_age=1)
        c.age=lambda key,now:20 if key=='car_soc' else 1
        self.assertTrue(vehicle_confirmed(c))
        self.assertFalse(vehicle_confirmed(c,c.snapshot.now-10))
        c.age=lambda key,now:1
        self.assertTrue(vehicle_confirmed(c,c.snapshot.now-10))

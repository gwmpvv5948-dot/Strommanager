"""The shadow budget must cover only remaining daylight and never send commands."""
import unittest
from dataclasses import replace
from test_model import sample, Settings, decide
from pilot_test.model import consumption_comparison

class ComparisonTests(unittest.TestCase):
    def test_partial_hours_and_no_ev_total(self):
        s=sample(now=1800,hours_left=1)
        f={'updated':1800,'remaining_kwh':999,'hours':[{'stamp':0,'kwh':2,'high':3},{'stamp':3600,'kwh':4,'high':5},{'stamp':7200,'kwh':99,'high':100}]}
        before=decide(s,Settings())
        r=consumption_comparison(s,Settings(),f)
        self.assertTrue(r['available']); self.assertEqual(r['learned_kwh'],3)
        self.assertEqual(r['safe_kwh'],4)
        self.assertEqual(before,decide(s,Settings()))
    def test_stale_missing_and_night(self):
        s=sample(now=1800,hours_left=1)
        for f in ({},{'updated':0},{'updated':1800,'hours':[]},{'updated':1800,'hours':[{'stamp':3600,'kwh':1,'high':2}]}):
            self.assertFalse(consumption_comparison(s,Settings(),f)['available'])
        self.assertFalse(consumption_comparison(replace(s,daylight=False),Settings(),{})['available'])
    def test_missing_uncertainty_is_not_zero(self):
        r=consumption_comparison(sample(now=0,hours_left=1),Settings(),{'updated':0,'hours':[{'stamp':0,'kwh':1,'high':None}]})
        self.assertFalse(r['available'])

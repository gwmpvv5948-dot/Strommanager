"""Forecast parsing, gaps, expiry and restart-safe hysteresis."""
import unittest
from test_model import Settings
from pilot_test.grid_forecast import parse_forecast, GridForecast

class Forecast(unittest.TestCase):
    def payload(self, shares=(65,57,54)):
        return {'unix_seconds':[10000,10900,11800], 'ren_share':list(shares)}
    def test_null_is_not_zero(self):
        p=parse_forecast(self.payload((None,0,100)))
        self.assertIsNone(p[0]['share']);self.assertEqual(p[1]['share'],0)
    def test_gaps_are_not_extended(self):
        p=parse_forecast({'unix_seconds':[10000,18000], 'ren_share':[50,60]})
        self.assertEqual(p[0]['end'],13600)
    def test_substitute_and_axis_invalid(self):
        for p in [dict(self.payload(),substitute=True),{'unix_seconds':[1,1], 'ren_share':[50,60]}]:
            with self.assertRaises(ValueError):parse_forecast(p)
    def test_v2(self):
        p=parse_forecast({'series':[{'id':'renewable_share_of_load','unit':'%'}], 'data':[
            {'timestamp':'2026-11-02T12:00:00+01:00','values':{'renewable_share_of_load':60}},
            {'timestamp':'2026-11-02T12:15:00+01:00','values':{'renewable_share_of_load':None}}]})
        self.assertEqual(p[0]['share'],60);self.assertIsNone(p[1]['share'])
    def test_hold_hysteresis_future_and_expiry(self):
        f=GridForecast();f.points=parse_forecast(self.payload());f.fetched=10000
        c=Settings(grid_renewable_enabled=True)
        s=f.status(10000,c);self.assertTrue(s['hold']);self.assertEqual([p['hold'] for p in s['points']],[True,True,False])
        self.assertTrue(f.status(11000,c)['hold']);self.assertFalse(f.status(12000,c)['hold'])
        self.assertFalse(f.status(18000,c)['available']);self.assertFalse(f.hold)
    def test_disabled_and_missing_fallback(self):
        f=GridForecast();f.points=parse_forecast(self.payload());f.fetched=10000
        self.assertFalse(f.status(10000,Settings())['hold'])
        f.points=parse_forecast(self.payload((None,65,70)))
        s=f.status(10000,Settings(grid_renewable_enabled=True));self.assertFalse(s['available']);self.assertFalse(s['hold'])

import unittest
from datetime import datetime,timezone
from dataclasses import replace
from test_model import Settings
from pilot_test.price_forecast import parse_prices,PriceForecast,MAX_AGE
from pilot_test.energy_planner import optimize,signal_cost,ev_grid_allowed
from test_energy_planner import config,slots

NOW=datetime(2026,11,3,12,tzinfo=timezone.utc).timestamp()
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat()
def payload():
    return {'generated_at':iso(NOW),'valid_until':iso(NOW+86400),'market_zone':'DE-LU',
      'data':[{'start':iso(NOW+i*900),'end':iso(NOW+(i+1)*900),'price_ct_kwh':-2+i/10,
               'price_origin':'forecast' if i>48 else 'market'} for i in range(96)]}

class PriceData(unittest.TestCase):
    def test_signed_prices_origin_and_full_horizon(self):
        p=parse_prices(payload(),NOW);self.assertEqual(p[0]['spot_ct'],-2);self.assertFalse(p[0]['forecast']);self.assertTrue(p[-1]['forecast'])
        f=PriceForecast('never-return-this');f.points=p;f.fetched=NOW
        s=f.status(NOW,Settings());self.assertTrue(s['complete']);self.assertTrue(s['configured']);self.assertNotIn('never-return-this',str(s))
        self.assertFalse(f.status(NOW+MAX_AGE+1,Settings())['available'])
        self.assertFalse(f.status(NOW,replace(Settings(),planner_price_enabled=False))['points'])
    def test_invalid_times_prices_and_wrong_market_are_rejected(self):
        for mutate in (lambda d:d.update(market_zone='FR'),lambda d:d.update(generated_at=iso(NOW-MAX_AGE-1)),
                       lambda d:d['data'][0].update(price_ct_kwh=float('nan')),
                       lambda d:d['data'][1].update(start=d['data'][0]['start']),
                       lambda d:d['data'][0].update(start='2026-11-03T12:00:00'),
                       lambda d:d['data'][0].update(price_origin='guessed')):
            d=payload();mutate(d)
            with self.assertRaises(ValueError):parse_prices(d,NOW)
    def test_gaps_remain_explicit_and_do_not_become_zero(self):
        d=payload();del d['data'][2];p=parse_prices(d,NOW);f=PriceForecast('key');f.points=p;f.fetched=NOW
        self.assertFalse(f.status(NOW,Settings())['complete']);self.assertIsNone(f.status(NOW+1800,Settings())['spot_ct'])
    def test_spot_price_is_display_only_and_ee_weight_is_reduced(self):
        c=config(initial_soc=80,terminal_soc=10,cycle_cost=0,price_weight=1,ee_weight=100)
        data=slots(hours=8,load=.4)
        for p in data:p.update(spot_ct=-5 if p['start']<14400 else 30,price_forecast=p['start']>=14400,ee=0 if p['start']<14400 else 100)
        r=optimize(data,c)
        self.assertGreater(sum(p['battery_kw'] for p in r['points'][:16]),sum(p['battery_kw'] for p in r['points'][16:]))
        expected=sum((p['grid_kw']*c.purchase-p['export_kw']*c.feed_in)*(p['end']-p['start'])/3600 for p in r['points'])
        self.assertAlmostEqual(r['totals']['cost'],expected)
        self.assertEqual(signal_cost({'spot_ct':-5,'ee':0},c),25)
        self.assertEqual(signal_cost({'spot_ct':None,'ee':50},c),12.5)
    def test_ev_grid_permission_uses_ee_and_ignores_spot_prices(self):
        c=config(ev_price_ct=10)
        self.assertFalse(ev_grid_allowed({'spot_ct':-5,'ee':0},c,60))
        self.assertTrue(ev_grid_allowed({'spot_ct':11,'ee':100},c,60))
        self.assertTrue(ev_grid_allowed({'spot_ct':None,'ee':80},c,60))
        self.assertFalse(ev_grid_allowed({'spot_ct':None,'ee':None},c,60))

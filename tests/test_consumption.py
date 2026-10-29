"""Meaningful regression tests for forecasting, gaps, DST and real learning."""
from datetime import datetime, timezone, timedelta
import importlib.util
from pathlib import Path
import tempfile
import unittest

root=Path(__file__).resolve().parents[1]/'custom_components'/'solar_pilot'
spec=importlib.util.spec_from_file_location('consumption',root/'consumption.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
ConsumptionDB=mod.ConsumptionDB

class Forecast(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.db=ConsumptionDB(Path(self.tmp.name)/'forecast.sqlite')
        self.now=int(datetime(2026,10,28,10,30,tzinfo=timezone.utc).timestamp())

    def seed(self,days=60):
        start=self.now//86400*86400-days*86400
        return [(t,.4,10.,1.,'influx') for t in range(start,self.now//3600*3600,3600)]

    def test_day_color_forecasts_are_read_only_complete_and_exclude_ev(self):
        self.db.put(self.seed())
        with self.db.connect() as db:
            before = db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0]
        result = self.db.daily_house_forecasts(self.now, 10)
        self.assertEqual(len(result['days']), 7)
        for day in result['days'].values():
            self.assertTrue(day['available'])
            self.assertAlmostEqual(day['kwh'], 9.6)
        with self.db.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0], before)

    def test_chart_payload_keeps_partial_energy_separate_from_closed_hours(self):
        self.db.put(self.seed())
        hour=self.now//3600*3600
        with self.db.connect() as db:
            db.execute("CREATE TABLE accumulation(stamp INTEGER PRIMARY KEY,wh REAL,seconds REAL,temp_sum REAL,temp_seconds REAL)")
            db.execute("INSERT INTO accumulation VALUES (?,?,?,?,?)",(hour,150,900,9000,900))
        result=self.db.forecast(self.now,10)
        self.assertEqual(result['current_observation'],{'stamp':hour,'kwh':.15,'seconds':900})
        self.assertEqual(len(result['observed']),result['observed_hours'])
        self.assertTrue(all(p['stamp']<hour for p in result['observed']))
        self.assertAlmostEqual(sum(p['kwh'] for p in result['observed']),result['observed_kwh'])
        self.assertEqual(result['day_end']-result['day_start'],86400)

    def test_missing_hours_not_zero_filled(self):
        self.db.put([(self.now//3600*3600-3600,.5,10,.5,'influx')])
        result=self.db.forecast(self.now,10)
        self.assertFalse(result['available']);self.assertEqual(result['training_hours'],0)
        self.assertIsNone(result['remaining_kwh'])

    def test_import_is_idempotent_and_live_wins(self):
        t=self.now//3600*3600-3600
        self.db.put([(t,.4,10,1,'live')]);self.db.put([(t,10,10,1,'influx')])
        with self.db.connect() as db:
            self.assertEqual(db.execute('SELECT kwh FROM hours').fetchone()[0],.4)
        self.assertEqual(self.db.forecast(self.now,10)['training_hours'],1)

    def test_prediction_fraction_and_no_hindsight(self):
        self.db.put(self.seed())
        result=self.db.forecast(self.now,10)
        self.assertTrue(result['available'])
        self.assertAlmostEqual(result['remaining_kwh'],.4*12.5)
        self.assertEqual(result['evaluated_hours'],0)
        with self.db.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM predictions WHERE stamp<=issued').fetchone()[0],0)
        self.db.put(self.seed())
        self.assertEqual(self.db.forecast(self.now,10)['evaluated_hours'],0)

    def test_real_future_results_learn_bias_and_mae(self):
        self.db.put(self.seed());self.db.forecast(self.now,10)
        t=self.now//3600*3600+3600
        self.db.put([(t,.8,10,1,'live')])
        result=self.db.forecast(t+3601,10)
        self.assertEqual(result['evaluated_hours'],1)
        self.assertAlmostEqual(result['mae_kwh'],.4)
        self.assertGreater(result['bias_kwh'],0)

    def test_history_days_only_compares_forecasts_saved_before_each_hour(self):
        self.db.put(self.seed())
        self.db.forecast(self.now,10)
        future=self.now//3600*3600+3600
        self.db.put([(future,.8,10,1,'live')])
        # On the following local day it becomes a browsable completed day.
        days=self.db.history_days(future+26*3600)
        self.assertEqual(len(days),1)
        day=days[0]
        self.assertEqual(day['evaluated_hours'],1)
        self.assertAlmostEqual(day['actual_kwh'],.8)
        self.assertAlmostEqual(day['predicted_kwh'],.4)
        self.assertAlmostEqual(day['error_kwh'],.4)
        self.assertEqual(day['hours'][0]['stamp'],future)

    def test_dst_days_keep_utc_hours_distinct(self):
        now=int(datetime(2026,10,24,22,tzinfo=timezone.utc).timestamp())
        result=self.db.forecast(now,10)
        self.assertEqual(len(result['hours']),25)
        self.assertEqual(len({r['stamp'] for r in result['hours']}),25)

    def test_outliers_and_invalid_energy_excluded(self):
        t=self.now//3600*3600-3600
        self.db.put([(t,-1,10,1,'x'),(t+3600,100,10,1,'x'),(t+7200,.4,102.5,1,'x')])
        with self.db.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM hours').fetchone()[0],1)
            self.assertIsNone(db.execute('SELECT temperature FROM hours').fetchone()[0])

    def test_sparse_weather_matches_use_explicit_hourly_prior(self):
        rows=self.seed(6)
        self.db.put([(t,k,-20 if i%2 else 40,c,s) for i,(t,k,temp,c,s) in enumerate(rows)])
        result=self.db.forecast(self.now,9)
        self.assertTrue(result['available'])
        self.assertGreater(result['simplified_hours'],0)
        self.assertTrue(all(p['samples']>=5 for p in result['hours']))

    def test_temperature_changes_estimate(self):
        rows=self.seed(180)
        self.db.put([(t,.2 if i%2 else 1.,20 if i%2 else 0,c,s) for i,(t,k,temp,c,s) in enumerate(rows)])
        # Daily alternating temperatures instead of alternating hours.
        with self.db.connect() as db:
            db.execute('UPDATE hours SET temperature=CASE WHEN (stamp/86400)%2=0 THEN 0 ELSE 20 END,kwh=CASE WHEN (stamp/86400)%2=0 THEN 1 ELSE .2 END')
        cold=self.db.forecast(self.now,0)['remaining_kwh']
        warm=self.db.forecast(self.now,20)['remaining_kwh']
        self.assertGreater(cold,warm*2)

class HistoricalQuality(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import sys, types
        pkg=types.ModuleType('forecast_quality');pkg.__path__=[str(root)]
        sys.modules['forecast_quality']=pkg
        spec=importlib.util.spec_from_file_location('forecast_quality.consumption_tracker',root/'consumption_tracker.py')
        tracker=importlib.util.module_from_spec(spec);spec.loader.exec_module(tracker)
        cls.convert=staticmethod(tracker.historical_hours)
        cls.Tracker=tracker.ConsumptionTracker

    def test_large_gaps_not_held_and_ac_balance_excludes_ev(self):
        series={k:{t:v for t in range(0,3600,300)} for k,v in [('inverter',1000),('garage',100),('shed',100),('grid',-200),('wallbox',400)]}
        rows=self.convert(series,{0:10},0,7200)
        self.assertEqual(len(rows),1)
        self.assertAlmostEqual(rows[0][1],1.)
        self.assertEqual(rows[0][3],1.)
        # A grid gap invalidates the hour even if all other values can be held.
        series['grid']={0:-200}
        self.assertEqual(self.convert(series,{},0,3600),[])

    def test_grid_polarity_and_minimum_coverage(self):
        series={k:{t:v for t in range(0,3300,300)} for k,v in [('inverter',1000),('garage',0),('shed',0),('grid',200),('wallbox',400)]}
        rows=self.convert(series,{},0,3600,False)
        self.assertAlmostEqual(rows[0][1],.8)
        self.assertAlmostEqual(rows[0][3],11/12)
        del series['grid'][3000]
        self.assertEqual(self.convert(series,{},0,3600,False),[])

    def test_live_hour_split_no_restart_gap_fabrication(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            db=ConsumptionDB(Path(folder)/'live.sqlite')
            tracker=self.Tracker(SimpleNamespace(),SimpleNamespace(options={}),{},None)
            tracker.db=db
            for t in range(0,3601,30):
                tracker._record(t,1000,10)
            with db.connect() as sql:
                row=sql.execute('SELECT kwh,coverage FROM hours WHERE stamp=0').fetchone()
            self.assertAlmostEqual(row[0],1.)
            self.assertEqual(row[1],1.)
            tracker._record(7200,1000,10)
            with db.connect() as sql:
                self.assertEqual(sql.execute('SELECT COUNT(*) FROM hours WHERE stamp=3600').fetchone()[0],0)

class LiveWeather(unittest.IsolatedAsyncioTestCase):
    async def test_unavailable_temperature_uses_existing_weather_forecast(self):
        import asyncio,sys
        from types import SimpleNamespace
        tracker_mod=sys.modules.get('forecast_quality.consumption_tracker')
        if tracker_mod is None:
            HistoricalQuality.setUpClass()
            # Import by spec isn't registered by that fixture; use the class.
        Tracker=HistoricalQuality.Tracker
        now=datetime.now(timezone.utc); stamp=int(now.timestamp())
        def state(value,attrs):
            return SimpleNamespace(state=value,attributes=attrs,last_reported=now,last_updated=now)
        values={
            'sensor.inverter_wirkleistung':state('1000',{'unit_of_measurement':'W'}),
            'sensor.garage_pv_sonoff_energy_power':state('0',{'unit_of_measurement':'W'}),
            'sensor.schuppen_pv_sonoff_energy_power':state('0',{'unit_of_measurement':'W'}),
            'sensor.dresden_temperatur':state('unavailable',{'unit_of_measurement':'°C'}),
            'weather.dresden_stadt':state('cloudy',{'temperature':9.1,'temperature_unit':'°C'}),
            'grid':state('-100',{'unit_of_measurement':'W'}),
            'wallbox':state('0',{'unit_of_measurement':'W'}),
            'grid_charge':state('off',{}),
        }
        async def executor(func,*args):return await asyncio.to_thread(func,*args)
        calls=[]
        async def service(*args,**kwargs):
            calls.append((args,kwargs))
            return {'weather.dresden_stadt':{'forecast':[{'datetime':now.isoformat(),'temperature':10.}]}}
        hass=SimpleNamespace(states=SimpleNamespace(get=values.get),async_add_executor_job=executor,
                             services=SimpleNamespace(async_call=service))
        with tempfile.TemporaryDirectory() as folder:
            tracker=Tracker(hass,SimpleNamespace(options={}),{'grid_power':'grid','wallbox_power':'wallbox','grid_charge':'grid_charge'},SimpleNamespace(grid_export_positive=True))
            tracker.db=ConsumptionDB(Path(folder)/'live.sqlite')
            await tracker.sample(stamp)
            self.assertIsNone(tracker.error)
            self.assertTrue(tracker.result['weather_forecast'])
            import json
            self.assertEqual(json.loads(tracker.db.meta('live_point'))[2],9.1)
            self.assertEqual(calls[0][0][:2],('weather','get_forecasts'))
            await tracker.sample(stamp+31)
            self.assertEqual(len(calls),1) # No provider query every 30-second sample.

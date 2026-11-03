"""HA attributes may contain datetime objects; JSON replay hides that distinction."""
import unittest
from datetime import datetime,timezone,timedelta
from types import SimpleNamespace as N
from test_model import Settings
from pilot_test.planner_tracker import collect

class PlannerInputs(unittest.TestCase):
    def fixture(self, timestamps='native'):
        now=datetime(2026,11,2,12,tzinfo=timezone.utc).timestamp()
        rows=[]
        for i in range(48):
            stamp=datetime.fromtimestamp(now+i*1800,timezone.utc)
            rows.append({'period_start':stamp if timestamps=='native' else stamp.isoformat(),'pv_estimate':.5})
        states={'sensor.pv_prognose_heute':N(state='6',attributes={'detailedForecast':rows}),
                'number.batterien_entlade_ende_ladestand':N(state='5',attributes={'unit_of_measurement':'%'})}
        controller=N(snapshot=N(now=now,house_soc=50,house_soc_age=1,forecast_age=1),settings=Settings(),
            consumption=N(result={'updated':now,'window_hours':[{'stamp':now+i*3600,'kwh':.5} for i in range(24)]}),
            grid_forecast=N(status=lambda *args:{'available':True,'hold':False,'fetched':now,'points':[{'start':now,'end':now+86400,'share':50,'available':True}]}),
            entities={'forecast_day':'sensor.pv_prognose_heute'},entry=N(options={}),
            hass=N(states=N(get=states.get),config=N(time_zone='Europe/Berlin')))
        return controller,rows,now
    def test_native_aware_datetimes_and_json_strings_have_same_plan_inputs(self):
        native,_,now=self.fixture();text,_,_=self.fixture('json')
        a=collect(native,now);b=collect(text,now)
        self.assertEqual(a,b);self.assertEqual(len(a[0]),96)
    def test_naive_timestamps_are_not_assumed_to_be_utc(self):
        c,rows,now=self.fixture();rows[0]['period_start']=rows[0]['period_start'].replace(tzinfo=None)
        with self.assertRaisesRegex(ValueError,'Prognoselücke ab 02.11. 13:00: PV'):
            collect(c,now)
    def test_missing_house_and_ee_are_named(self):
        c,_,now=self.fixture();c.consumption.result['window_hours'][0]['kwh']=None
        with self.assertRaisesRegex(ValueError,'Haus'):collect(c,now)
        c,_,now=self.fixture();c.grid_forecast.status=lambda *args:{'available':True,'hold':False,'fetched':now,'points':[]}
        data,_,_=collect(c,now)
        self.assertTrue(all(p['ee'] is None for p in data))
    def test_numeric_attribute_subclasses_are_supported(self):
        class AttributeFloat(float):pass
        c,rows,now=self.fixture()
        for row in rows:row['pv_estimate']=AttributeFloat(.5)
        self.assertEqual(len(collect(c,now)[0]),96)

    def test_at_or_below_inverter_floor_still_collects_all_24_hours(self):
        for soc in (5,3,0):
            c,_,now=self.fixture();c.snapshot.house_soc=soc
            data,config,_=collect(c,now)
            self.assertEqual(len(data),96);self.assertEqual(config.initial_soc,soc)
            self.assertEqual(config.minimum_soc,5)

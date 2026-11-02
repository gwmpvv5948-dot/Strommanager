import test from 'node:test';
import assert from 'node:assert/strict';
import {solarDayData} from '../custom_components/solar_pilot/frontend/solar-timeline-view.js';
const now=Date.parse('2026-11-02T16:00:00+01:00');
const row=(time,p)=>({period_start:time,pv_estimate:p,pv_estimate10:p/2});
const source={forecastIds:['today','tomorrow'],forecastId:'today'};
const state=(date,p)=>({state:'5',attributes:{unit_of_measurement:'kWh',estimate:p,estimate10:p/2,detailedForecast:[row(date,p)]}});
const states={today:state('2026-11-02T10:00:00+01:00',2),tomorrow:state('2026-11-03T10:00:00+01:00',3)};
const options={now,source,states,history:[{last_changed:'2026-11-02T10:00:00+01:00',state:'1500'}],unit:'W'};
test('today uses fixed midnight bounds, retaining forecast and actual together',()=>{
 const d=solarDayData(options);assert.equal(d.key,'2026-11-02');assert.equal(d.end-d.start,86400000);assert.equal(d.forecast.length,1);assert.equal(d.total,2);assert.equal(d.actual[0][0].p,1.5);assert.equal(d.remaining,0);
});
test('tomorrow has independent forecast and no today measurements',()=>{
 const d=solarDayData({...options,offset:1});assert.equal(d.key,'2026-11-03');assert.equal(d.total,3);assert.equal(d.forecast.length,1);assert.equal(d.actual.length,0);
});
test('missing tomorrow stays missing',()=>{
 const d=solarDayData({...options,offset:1,states:{today:states.today}});assert.equal(d.total,null);assert.equal(d.forecast.length,0);
});
test('next local day handles autumn DST',()=>{
 const d=solarDayData({...options,now:Date.parse('2026-10-24T12:00:00+02:00'),offset:1});assert.equal(d.key,'2026-10-25');assert.equal(d.end-d.start,25*3600000);
});

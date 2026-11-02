import test from 'node:test';
import assert from 'node:assert/strict';
import {solarTimelineData} from '../custom_components/solar_pilot/frontend/solar-timeline-view.js';
const now=Date.parse('2026-11-02T23:45:00+01:00');
const row=(t,p)=>({period_start:new Date(t).toISOString(),pv_estimate:p,pv_estimate10:p/2});
const source={forecastIds:['today','tomorrow']};
const states={today:{state:'5',attributes:{detailedForecast:[row(now-900000,.5)]}},tomorrow:{state:'8',attributes:{detailedForecast:[row(now+900000,1),row(now+4500000,2)]}}};
test('rolling window combines days, retains past forecasts and preserves gaps',()=>{
 const data=solarTimelineData({now,hours:24,source,states,history:[],unit:'W'});
 assert.equal(data.start,now-24*3600000);assert.equal(data.end,now+24*3600000);
 assert.equal(data.forecast.length,3);assert.equal(data.forecast[0].start,now-900000);
 assert.ok(data.forecast[1].end<data.forecast[2].start);
});
test('history includes yesterday but never extends beyond now',()=>{
 const history=[{last_changed:new Date(now-18*3600000).toISOString(),state:'1000'},{last_changed:new Date(now+1000).toISOString(),state:'900'}];
 const data=solarTimelineData({now,hours:24,source,states,history,unit:'W'});
 assert.equal(data.actual[0][0].p,1);assert.equal(data.actual.flat().length,1);
 assert.equal(solarTimelineData({now,hours:12,source,states,history,unit:'W'}).actual.length,0);
});
test('unavailable forecasts and absent P10 are not zero-filled',()=>{
 const data=solarTimelineData({now,hours:12,source,states:{today:{state:'unavailable',attributes:states.today.attributes}},history:[],unit:'W'});
 assert.equal(data.forecast.length,0);
});

test('today forecast remains visible alongside measurements before now',()=>{
 const earlier=now-8*3600000;
 const data=solarTimelineData({now,hours:12,source,states:{today:{state:'5',attributes:{detailedForecast:[row(earlier,2)]}}},history:[{last_changed:new Date(earlier).toISOString(),state:'1500'}],unit:'W'});
 assert.equal(data.forecast[0].start,earlier);assert.equal(data.forecast[0].p,2);assert.equal(data.actual[0][0].p,1.5);
});

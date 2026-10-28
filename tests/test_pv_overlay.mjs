import test from 'node:test';
import assert from 'node:assert/strict';
import {pvOverlay} from '../custom_components/solar_pilot/frontend/pv-overlay.js';
import {consumptionAxis} from '../custom_components/solar_pilot/frontend/consumption-chart.js';
const start=Date.parse('2026-10-28T00:00Z')/1000;
const history=(begin,end,watts)=>Array.from({length:Math.floor((end-begin)/300)+1},(_,i)=>({last_updated:new Date((begin+i*300)*1000).toISOString(),state:String(watts)}));
const forecast=(begin,end,kw)=>Array.from({length:(end-begin)/1800},(_,i)=>({t:(begin+i*1800)*1000,p:kw}));
test('power is integrated to hourly PV energy, with an exact actual/forecast cutoff',()=>{
 const now=start+5400,p=pvOverlay(history(start,now,1000),'W',forecast(start,start+86400,2),start,start+86400,now);
 assert.ok(Math.abs(p.actual[0][0].kwh-1)<1e-9);assert.ok(Math.abs(p.actual[0].at(-1).kwh-1)<1e-9);
 assert.equal(p.actual[0].at(-1).t,now);assert.equal(p.forecast[0][0].t,now);
 assert.equal(p.forecast[0][0].kwh,2);assert.ok(p.actual.flat().every(p=>p.t<=now));assert.ok(p.forecast.flat().every(p=>p.t>=now));
});
test('unknown and long missing measurement intervals do not become a connecting line',()=>{
 const now=start+4*3600,rows=[...history(start,start+3600,1000),...history(start+3*3600,now,1000)];
 const p=pvOverlay(rows,'W',[],start,start+86400,now);
 assert.equal(p.actual.length,2);assert.equal(p.actual.flat().length,2);
});
test('forecast missing half hour is a gap, not zero production',()=>{
 const rows=forecast(start,start+3*3600,2);rows.splice(2,1);
 const p=pvOverlay([],null,rows,start,start+86400,start);assert.equal(p.forecast.length,2);assert.equal(p.forecast.flat().length,2);
});
test('units and real zero production are handled explicitly',()=>{
 const now=start+3600;
 assert.equal(pvOverlay(history(start,now,0),'W',[],start,start+86400,now).actual[0][0].kwh,0);
 assert.equal(pvOverlay(history(start,now,1),'kW',[],start,start+86400,now).actual[0][0].kwh,1);
 assert.equal(pvOverlay(history(start,now,1),'kWh',[],start,start+86400,now).actual.length,0);
});
test('shared chart scale includes PV production above house demand',()=>{
 assert.ok(consumptionAxis([{actual:.4}], [4.3]).max>=4.3);
});

test('DST 25-hour day keeps distinct forecast hours and explicit missing measurements',()=>{
 const begin=Date.parse('2026-10-24T22:00Z')/1000,end=begin+25*3600;
 const p=pvOverlay([],null,forecast(begin,end,1),begin,end,begin);
 assert.equal(p.actual.length,0);assert.equal(p.forecast[0].length,25);
 assert.equal(new Set(p.forecast[0].map(p=>p.stamp)).size,25);
});

test('garage and shed are summed with main PV at the same timestamps',()=>{
 const now=start+3600,extras=[{history:history(start,now,200),unit:'W'},{history:history(start,now,.05),unit:'kW'}];
 const p=pvOverlay(history(start,now,1000),'W',forecast(start,start+86400,2),start,start+86400,now,extras);
 assert.ok(Math.abs(p.actual[0][0].kwh-1.25)<1e-9);
 assert.equal(p.forecast[0][0].kwh,2); // No invented auxiliary forecast.
});
test('an unknown auxiliary source is not silently counted as zero',()=>{
 const now=start+3600;
 const p=pvOverlay(history(start,now,1000),'W',[],start,start+86400,now,[{history:[],unit:'W'}]);
 assert.equal(p.actual.length,0);
});
test('individually adequate but non-overlapping coverage is not a complete total',()=>{
 const now=start+3600,main=[...history(start,start+3060,1000),{last_updated:new Date((start+3060)*1000).toISOString(),state:'unavailable'}];
 const garage=history(start+540,now,200);
 const p=pvOverlay(main,'W',[],start,start+86400,now,[{history:garage,unit:'W'}]);
 assert.equal(p.actual.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {batteryForecast} from '../custom_components/solar_pilot/frontend/battery-forecast.js';
const c={capacity_kwh:5,efficiency:.9,normal_discharge_w:2500,max_charge_w:2500,forecast_factor:1,meter_max_age_s:300,forecast_max_age_s:28800};
const s={now:0,house_soc:100,house_soc_age:0,forecast_age:0};
const b={now:0,end:4*3600,bins:Array.from({length:4},(_,i)=>({stamp:i*3600,future:1}))};
const opts={now:0,sunset:0,minSoc:7};
test('house discharge uses actual 7 percent floor, losses and continuous coverage',()=>{
 const r=batteryForecast(b,s,c,opts);assert.ok(r.available);assert.ok(r.completeCoverage);assert.ok(Math.abs(r.points.at(-1).soc-(5-4/.9)/5*100)<1e-8);assert.equal(r.bands[0].end,b.end);
 const longer={...b,end:5*3600,bins:[...b.bins,{stamp:4*3600,future:1}]};const q=batteryForecast(longer,s,c,opts);assert.ok(Math.abs(q.exhaustedAt-4.185*3600)<1e-5);assert.ok(Math.abs(q.points.at(-1).soc-7)<1e-8);
});
test('partial current hour normalized once, no doubled demand',()=>{
 const partial={now:1800,end:3600,bins:[{stamp:0,future:.5}]};const r=batteryForecast(partial,{...s,now:1800},c,{...opts,now:1800,sunset:1800});assert.ok(r.available);assert.ok(Math.abs(r.points.at(-1).soc-(5-.5/.9)/5*100)<1e-8);
});
test('PV before sunset charges battery, but not after sunset',()=>{
 const r=batteryForecast(b,{...s,house_soc:50},c,{...opts,sunset:3600,pv:[{t:0,p:2},{t:1800000,p:2}]});assert.ok(r.available);assert.ok(Math.abs(r.sunsetSoc-66.2)<1e-8);assert.equal(r.bands[0].start,3600);
});
test('unknown minimum, stale SoC, house gaps and PV gaps never become zero',()=>{
 assert.equal(batteryForecast(b,s,c,{...opts,minSoc:null}).available,false);
 assert.equal(batteryForecast(b,{...s,house_soc_age:301},c,opts).available,false);
 assert.equal(batteryForecast({...b,bins:[{stamp:0,future:null}]},s,c,opts).available,false);
 assert.equal(batteryForecast(b,s,c,{...opts,sunset:3600,pv:[]}).available,false);
});
test('power limit can cause grid demand before the battery is empty; no commands',()=>{
 const r=batteryForecast(b,s,{...c,normal_discharge_w:500},opts);assert.ok(r.available);assert.equal(r.exhaustedAt,0);assert.equal(r.bands.length,0);assert.ok(r.points.at(-1).soc>7);assert.equal(s.house_soc,100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {dayBounds,forecastPoints,actualSegments,storagePotential,batteryProtection} from '../custom_components/solar_pilot/frontend/solar-chart.js';
test('HA local day includes DST transition',()=>{const d=dayBounds(Date.parse('2026-10-25T12:00:00Z'),'Europe/Berlin');assert.equal(d.end-d.start,25*3600000);});
test('forecast ignores invalid data, preserves missing P10 and deduplicates',()=>{assert.deepEqual(forecastPoints([{period_start:'2026-10-27T10:00Z',pv_estimate:2},{period_start:'bad',pv_estimate:3}],0,Date.now()+1e12).map(p=>[p.p,p.low]),[[2,null]]);});
test('history converts watts and splits missing values and gaps',()=>{const rows=[['10:00',1000],['10:01','unavailable'],['10:02',2000],['11:00',3000]].map(([t,state])=>({last_changed:`2026-10-27T${t}:00Z`,state}));const seg=actualSegments(rows,0,1e14,'W');assert.deepEqual(seg.map(s=>s.map(p=>p.p)),[[1],[2],[3]]);});
const now=Date.parse('2026-10-27T14:00:00Z');
const config={capacity_kwh:5,max_charge_w:2500,efficiency:.9,meter_max_age_s:300,forecast_max_age_s:28800,forecast_factor:.85,minimum_house_w:300,buffer_kwh:.5};
const snapshot={house_soc:46,house_soc_age:10,meter_age:10,forecast_age:300,hours_left:1,daylight:true,pv_w:1800,grid_export_w:0,battery_charge_w:1500,wallbox_w:0};
const curve=(a,b)=>[{t:now,p:a},{t:now+1800000,p:b}];
test('remaining PV increases projected SOC even when the EV regulation budget is zero',()=>{
  const d=storagePotential({...snapshot,forecast_net_kwh:0},config,curve(2,2),now);
  assert.ok(Math.abs(d-71.2)<.0001); // (2 kW * .85 - .3 kW) * .9 / 5 kWh
});
test('EV energy buffer is not lost from storage charging potential',()=>{
  assert.equal(storagePotential(snapshot,config,curve(2,2),now),storagePotential(snapshot,{...config,buffer_kwh:20},curve(2,2),now));
});
test('projection integrates partial periods and per-period charge power limits',()=>{
  const d=storagePotential({...snapshot,hours_left:.75},{...config,max_charge_w:1000,forecast_factor:1},curve(5,.3),now+900000);
  assert.ok(Math.abs(d-50.5)<.0001); // 15 min at 1 kW; remaining interval has no surplus
});
test('projection caps at 100 and preserves zero when house uses the forecast',()=>{
  assert.equal(storagePotential({...snapshot,house_soc:99},config,curve(10,10),now),100);
  assert.equal(storagePotential(snapshot,config,curve(.1,.1),now),46);
});
test('missing, stale or incomplete forecasts produce no projection',()=>{
  assert.equal(storagePotential(snapshot,config,[],now),null);
  assert.equal(storagePotential({...snapshot,house_soc_age:999},config,curve(2,2),now),null);
  assert.equal(storagePotential({...snapshot,forecast_age:99999},config,curve(2,2),now),null);
  assert.equal(storagePotential(snapshot,config,[{t:now,p:2}],now),null);
});
test('protection badge requires measured charging and actual reduced limit',()=>{const c={normal_discharge_w:2500,meter_max_age_s:300};assert.equal(batteryProtection({wallbox_w:3500,meter_age:10,current_discharge_w:0},c,{},'observe').kind,'active');assert.equal(batteryProtection({wallbox_w:0,meter_age:10,current_discharge_w:0},c,{},'auto'),null);assert.equal(batteryProtection({wallbox_w:3500,meter_age:999,current_discharge_w:0},c,{},'auto'),null);assert.equal(batteryProtection({wallbox_w:3500,meter_age:10,current_discharge_w:2500},c,{discharge_w:0},'auto').kind,'pending');});

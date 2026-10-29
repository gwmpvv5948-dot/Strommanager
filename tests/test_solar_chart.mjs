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

import {dateKey,nextDays,pvDays,weatherDays,duration,weatherLabel} from '../custom_components/solar_pilot/frontend/day-forecast.js';
test('daily forecast calendar survives DST and assigns HA local dates',()=>{
  assert.deepEqual(nextDays(Date.parse('2026-10-24T23:30:00Z')),['2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31']);
  assert.equal(dateKey('2026-10-27T23:30:00Z'),'2026-10-28');
});
test('PV cards use combined P50 estimate and date rather than entity P10 or day index',()=>{
  const id='sensor.solcast_pv_forecast_prognose_heute';
  const entity={state:'3',attributes:{unit_of_measurement:'kWh',estimate:12,estimate10:3,detailedForecast:[{period_start:'2026-10-29T00:00:00+01:00'}]}};
  const values=pvDays({[id]:entity},id);
  assert.equal(values['2026-10-29'].kwh,12);assert.equal(values['2026-10-29'].low,3);
  assert.equal(values['2026-10-27'],undefined);
  assert.deepEqual(pvDays({[id]:{...entity,state:'unavailable'}},id),{});
  assert.deepEqual(pvDays({[id]:{...entity,attributes:{...entity.attributes,dataCorrect:false}}},id),{});
});
test('sunshine and astronomical daylight remain separate, seconds convert correctly',()=>{
  const data={daily:{time:['2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31'],sunshine_duration:[0,null],daylight_duration:[36000,35900],weather_code:[3,61]},daily_units:{sunshine_duration:'s',daylight_duration:'s',weather_code:'wmo code'}};
  const days=weatherDays(data);
  assert.equal(days['2026-10-27'].sun,0);assert.equal(days['2026-10-27'].day,36000);
  assert.equal(days['2026-10-28'].sun,null);assert.equal(duration(36000),'10 h 00 min');
  assert.equal(duration(null),'—');assert.equal(duration(3599),'1 h 00 min');
  assert.equal(weatherLabel(61)[0],'Regen');assert.equal(weatherLabel(null)[0],'Wetter fehlt');
  data.daily_units.sunshine_duration='h';assert.equal(weatherDays(data)['2026-10-27'].sun,null);
});
test('impossible sunshine durations are missing, not silently replaced with daylight',()=>{
  const d={daily:{time:['2026-10-27'],sunshine_duration:[40000],daylight_duration:[36000]},daily_units:{sunshine_duration:'s',daylight_duration:'s'}};
  assert.equal(weatherDays(d)['2026-10-27'].sun,null);
});

import {energyBudget} from '../custom_components/solar_pilot/frontend/energy-budget.js';
const budgetSnapshot={now:1000,daylight:true,hours_left:4,house_soc:46,house_soc_age:1,forecast_kwh:12,forecast_age:100};
const budgetConfig={capacity_kwh:5,reserve_soc:70,minimum_house_w:300,forecast_factor:.85,buffer_kwh:.5,efficiency:.9,meter_max_age_s:300,forecast_max_age_s:28800};
test('budget allocates the whole remaining forecast once, with charging losses and extra house use',()=>{
  const b=energyBudget(budgetSnapshot,budgetConfig,2.5,1000);
  assert.ok(Math.abs(b.storage-1.333333333)<1e-8);assert.equal(b.house,3.7);
  assert.ok(Math.abs(b.tesla-4.666666667)<1e-8);
  assert.ok(Math.abs(b.storage+b.house+b.buffer+b.tesla-12)<1e-9);assert.equal(b.deficit,0);
});
test('low forecasts expose unmet need and never promise negative or nonexistent Tesla energy',()=>{
  const b=energyBudget({...budgetSnapshot,forecast_kwh:2},budgetConfig,2.5,1000);
  assert.equal(b.tesla,0);assert.equal(b.storage,0);assert.ok(b.deficit>0);
  const z=energyBudget({...budgetSnapshot,forecast_kwh:0},budgetConfig,2.5,1000);
  assert.equal(z.buffer+z.house+z.storage+z.tesla,0);
});
test('budget accepts a reached reserve, rejects missing/stale data and does not use tomorrow at night',()=>{
  assert.equal(energyBudget({...budgetSnapshot,house_soc:90},budgetConfig,2.5,1000).storageNeed,0);
  assert.equal(energyBudget({...budgetSnapshot,forecast_kwh:null},budgetConfig,2.5,1000),null);
  assert.equal(energyBudget(budgetSnapshot,budgetConfig,2.5,1400),null);
  assert.equal(energyBudget({...budgetSnapshot,hours_left:null},budgetConfig,2.5,1000),null);
  const n=energyBudget({...budgetSnapshot,daylight:false,hours_left:20},budgetConfig,2.5,1000);
  assert.equal(n.forecast,0);assert.equal(n.houseNeed,0);assert.equal(n.tesla,0);
});

import {dailyEnergy,progressParts} from '../custom_components/solar_pilot/frontend/energy-budget.js';
test('daily actuals require valid units and a state from this local day',()=>{
  const entity={state:'50324',last_updated:'2026-10-27T10:00:00Z',attributes:{unit_of_measurement:'Wh'}},start=Date.parse('2026-10-26T23:00:00Z'),now=Date.parse('2026-10-27T12:00:00Z');
  assert.equal(dailyEnergy(entity,start,now),50.324);
  assert.equal(dailyEnergy({...entity,state:'unavailable'},start,now),null);
  assert.equal(dailyEnergy({...entity,last_updated:'2026-10-26T10:00:00Z'},start,now),null);
  assert.equal(dailyEnergy({...entity,attributes:{unit_of_measurement:'W'}},start,now),null);
});
test('solid actuals and hatched remaining needs stay distinct, unknown actuals stay unknown',()=>{
  assert.deepEqual(progressParts(3.2,0,5),{solid:64,planned:0,known:true});
  assert.deepEqual(progressParts(2,1,5),{solid:40,planned:20,known:true});
  assert.deepEqual(progressParts(null,3),{solid:0,planned:100,known:false});
  assert.deepEqual(progressParts(0,0),{solid:0,planned:0,known:true});
});

import {dayAllocation,remainingPV} from '../custom_components/solar_pilot/frontend/energy-budget.js';
test('one daily allocation includes each historical and future PV kWh exactly once',()=>{
  const ledger={available:true,day:'2026-10-27',updated:1000,actual:{house:2,storage:1,tesla:3,other:2,solar:8,house_load:3.7,pv_hours:4}};
  const b=dayAllocation(ledger,budgetSnapshot,budgetConfig,12,2.5,'2026-10-27',1000);
  assert.equal(b.total,20);assert.equal(b.extraLeft,0);
  assert.ok(Math.abs(Object.values(b.actual).reduce((a,v)=>a+v,0)+Object.values(b.future).reduce((a,v)=>a+v,0)-20)<1e-9);
  assert.equal(dayAllocation({...ledger,day:'2026-10-26'},budgetSnapshot,budgetConfig,12,2.5,'2026-10-27',1000),null);
  assert.equal(dayAllocation(ledger,budgetSnapshot,budgetConfig,12,2.5,'2026-10-27',2000),null);
});
test('remaining P50 energy is integrated from now, never the obsolete day total minus actual',()=>{
  const points=[{t:0,p:2},{t:1800000,p:4}];
  assert.equal(remainingPV(points,900000,3600000),2.5);
  assert.equal(remainingPV([{t:1800000,p:4}],0,3600000),null);
});

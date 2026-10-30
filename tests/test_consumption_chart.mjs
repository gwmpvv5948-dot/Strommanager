import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingConsumptionBars,consumptionBars,consumptionAxis,historicalConsumptionBars,dailyConsumption} from '../custom_components/solar_pilot/frontend/consumption-chart.js';
test('total daily meter includes EV as supplied, converts units and rejects old or unknown readings',()=>{
 const now=Date.parse('2026-10-28T20:00Z'),state={state:'12.4',attributes:{unit_of_measurement:'kWh'},last_updated:'2026-10-28T19:59Z'};
 assert.equal(dailyConsumption(state,now),12.4);
 assert.equal(dailyConsumption({...state,state:'12400',attributes:{unit_of_measurement:'Wh'}},now),12.4);
 assert.equal(dailyConsumption({...state,state:'unavailable'},now),null);
 assert.equal(dailyConsumption({...state,last_updated:'2026-10-27T19:59Z'},now),null);
 assert.equal(dailyConsumption({...state,state:'0'},now),0);
});

const start=Date.parse('2026-10-28T00:00Z')/1000;
function data(){return {day_start:start,day_end:start+86400,updated:start+5400,
 observed:[{stamp:start,kwh:.4}],current_observation:{stamp:start+3600,kwh:.2,seconds:1800},
 hours:Array.from({length:23},(_,i)=>({stamp:start+(i+1)*3600,kwh:.6,low:.4,high:.8}))};}
test('current bar splits actual and remaining forecast without doubling a full hour',()=>{
 const b=consumptionBars(data());assert.ok(b.complete);assert.ok(Math.abs(b.measured-.6)<1e-9);
 assert.ok(Math.abs(b.remaining-(22*.6+.3))<1e-9);assert.equal(b.bins[1].actual,.2);assert.equal(b.bins[1].future,.3);
 assert.ok(Math.abs(b.total-b.measured-b.remaining)<1e-9);
});
test('unknown past hours stay gaps and prevent a full-day total claim',()=>{
 const d=data();d.observed=[];const b=consumptionBars(d);assert.equal(b.missing,1);assert.equal(b.bins[0].actual,null);assert.equal(b.complete,false);
});
test('zero measured consumption is valid and duplicate hours do not count twice',()=>{
 const d=data();d.observed=[{stamp:start,kwh:7},{stamp:start,kwh:0}];const b=consumptionBars(d);assert.equal(b.missing,0);assert.equal(b.measured,.2);
});
test('unknown future energy is not silently zero-filled',()=>{
 const d=data();d.hours[3].kwh=null;const b=consumptionBars(d);assert.equal(b.remaining,null);assert.equal(b.total,null);assert.equal(b.complete,false);
});
test('partial current hour with insufficient coverage is explicitly incomplete',()=>{
 const d=data();d.current_observation.seconds=60;assert.equal(consumptionBars(d).complete,false);
});
test('DST day preserves 25 distinct UTC hours including repeated local clock hour',()=>{
 const t=Date.parse('2026-10-24T22:00Z')/1000,d={day_start:t,day_end:t+25*3600,updated:t,observed:[],hours:[]};
 assert.equal(consumptionBars(d).bins.length,25);assert.equal(new Set(consumptionBars(d).bins.map(b=>b.stamp)).size,25);
});
test('axis includes actuals plus forecast uncertainty and starts at zero',()=>{
 const axis=consumptionAxis([{actual:1,future:.4,high:.6}]);assert.equal(axis.ticks[0],0);assert.ok(axis.max>=1.6);
});
test('historical comparisons do not add actual and forecast together',()=>{
 const day={day_start:start,day_end:start+86400,forecast_hours:2,error_kwh:.2,hours:[
  {stamp:start,predicted:.4,actual:.6,error:.2},{stamp:start+3600,predicted:.3,actual:null,error:null}]};
 const b=historicalConsumptionBars(day);assert.equal(b.evaluated,1);assert.equal(b.actualTotal,.6);assert.equal(b.predictedTotal,.4);assert.equal(b.missing,23);
});

test('rolling window stays centered across midnight and preserves unknown future hours',()=>{
 for(const iso of ['2026-10-30T01:30:00Z','2026-10-30T21:30:00Z']){
  const now=Date.parse(iso)/1000,current=Math.floor(now/3600)*3600;
  const f={updated:now,window_observed:Array.from({length:13},(_,i)=>({stamp:current-(i+1)*3600,kwh:.4})),
   window_hours:Array.from({length:14},(_,i)=>({stamp:current+i*3600,kwh:i===3?null:.5,low:.3,high:.7})),
   current_observation:{stamp:current,kwh:.2,seconds:1800}};
  const b=rollingConsumptionBars(f,now);
  assert.equal(b.start,now-43200);assert.equal(b.end,now+43200);
  assert.equal((now-b.start)/(b.end-b.start),.5);
  assert.equal(b.bins.find(p=>p.stamp===current-3600).actual,.4);
  assert.equal(b.bins.find(p=>p.stamp===current+3*3600).future,null);
  assert.equal(b.bins.find(p=>p.stamp===current+11*3600).future,.5);
 }
});

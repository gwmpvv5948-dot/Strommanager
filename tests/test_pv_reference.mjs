import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyReferences,referenceScale,yieldAssessment} from '../custom_components/solar_pilot/frontend/pv-reference.js';
const now=Date.parse('2026-10-28T19:00:00Z');
const row=(i,change)=>({start:Date.parse(`2026-10-${String(i).padStart(2,'0')}T00:00:00+02:00`),end:Date.parse(`2026-10-${String(i+1).padStart(2,'0')}T00:00:00+02:00`),change});
test('monthly P95 needs 20 distinct completed days; no maximum or cross-month mixing',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i+1,i+1));
 let r=monthlyReferences(rows,now);assert.equal(r[9].source,'p95');assert.ok(Math.abs(r[9].kwh-19.05)<1e-8);assert.equal(r[9].days,20);assert.equal(r[5].source,'provisional');assert.ok(r[5].kwh>r[11].kwh);
 r=monthlyReferences(rows.slice(0,19).concat(rows[0]),now);assert.equal(r[9].source,'provisional');assert.equal(r[9].days,19);
});
test('unknown, partial, future, negative and implausible days are rejected; real zero is retained',()=>{
 const rows=[row(1,0),row(2,null),row(3,-1),row(4,2000),{...row(5,9),end:now+1},{...row(6,3),end:row(6,3).start+3600000}];
 assert.equal(monthlyReferences(rows,now)[9].days,1);
});
test('common kWh scale spans month boundaries and forecasts over 100 percent',()=>{
 const r=monthlyReferences([],now),pv={'2026-10-31':{kwh:44},'2026-11-01':{kwh:5}};
 assert.ok(referenceScale(Object.keys(pv),pv,r)>=44);assert.equal(r[9].kwh,20);assert.equal(r[10].kwh,12);
});
test('colors follow house and reserve rather than seasonal percent; missing data remains neutral',()=>{
 assert.equal(yieldAssessment(5,8,3).kind,'poor');assert.equal(yieldAssessment(8,8,3).kind,'fair');assert.equal(yieldAssessment(11,8,3).kind,'good');assert.equal(yieldAssessment(15,null,3).kind,'unknown');
});

test('actual yield above forecasts extends the common scale, zero and missing stay valid',()=>{
 const keys=['2026-10-29'],pv={'2026-10-29':{kwh:16,low:9}},refs=monthlyReferences([],now);
 assert.ok(referenceScale(keys,pv,refs,43)>=43);assert.equal(referenceScale(keys,pv,refs,0),20);assert.equal(referenceScale(keys,pv,refs,null),20);
});

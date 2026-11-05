import test from 'node:test';
import assert from 'node:assert/strict';
import {plannedDayAllocation} from '../custom_components/solar_pilot/frontend/energy-budget.js';
const now=3600,end=7200,ledger={available:true,day:'today',updated:now,actual:{house:1,storage:2,tesla:3,other:4}};
const point={start:1800,end:10800,pv_direct_kw:1,charge_kw:2,ev_pv_kw:3,export_kw:4,grid_kw:50,battery_kw:50,ev_grid_kw:50};
const plan={available:true,joint:true,updated:now,points:[point]};
test('clips to now and midnight and counts only PV flows, retaining historical values',()=>{
 const r=plannedDayAllocation(ledger,plan,'today',now,end);
 assert.deepEqual(r.actual,{house:1,storage:2,tesla:3,buffer:4});
 assert.deepEqual(r.future,{house:1,storage:2,tesla:3,buffer:4});assert.equal(r.remaining,10);assert.equal(r.total,20);
 assert.equal(plannedDayAllocation(ledger,{...plan,joint:false},'today',now,end).future.tesla,0);
});
test('no plan, stale plan, missing PV, gaps and overlaps stay unknown while preserving history',()=>{
 for(const p of [null,{...plan,available:false},{...plan,updated:now-601},{...plan,points:[{...point,charge_kw:undefined}]},{...plan,points:[{...point,start:4000}]},{...plan,points:[point,point]}]){
  const r=plannedDayAllocation(ledger,p,'today',now,end);assert.equal(r.future,null);assert.equal(r.total,null);assert.equal(r.actual.house,1);
 }
});
test('missing historical ledger does not erase a valid future or invent a total',()=>{
 const r=plannedDayAllocation(null,plan,'today',now,end);assert.equal(r.actual,null);assert.equal(r.remaining,10);assert.equal(r.total,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {energyMix,energyToday,observedPeak} from '../custom_components/solar_pilot/frontend/energy-now-view.js';
test('house/Tesla balance and autarky share storage without double counting PV',()=>{
 const m=energyMix({pv:1000,house:630,ev:0,grid:-252,battery:-220.5});assert.equal(m.autarky,60);assert.equal(m.grid,40);assert.equal(m.storage,35);assert.equal(m.pv,25);
 assert.equal(energyMix({pv:1000,house:100,ev:100,grid:300,battery:500}).autarky,100);
 assert.equal(energyMix({pv:1000,house:100,ev:0,grid:null,battery:0}),null);
 assert.equal(energyMix({pv:1000,house:0,ev:0,grid:0,battery:0}),null);
 assert.equal(energyMix({pv:1000,house:100,ev:0,grid:-1000,battery:0}),null);
 assert.equal(energyMix({pv:0,house:100,ev:0,grid:-600,battery:500}).grid,100);
 assert.equal(energyMix({pv:0,house:340,ev:0,grid:-320,battery:0}).autarky,0);
});
test('daily production sums roof/garage/shed only with current-day energy units',()=>{
 const now=Date.parse('2026-11-05T13:00:00Z'),status={source_entities:{display:{roof_daily:'r',garage_daily:'g',shed_daily:'s',grid_import_daily:'i'}}};
 const states=Object.fromEntries(['r','g','s','i'].map((k,i)=>[k,{state:String(i+1),last_updated:new Date(now).toISOString(),attributes:{unit_of_measurement:'kWh'}}]));
 assert.deepEqual(energyToday(status,states,now,'Europe/Berlin'),{generated:6,imported:4});
 states.g.state='unavailable';assert.equal(energyToday(status,states,now,'Europe/Berlin').generated,null);
 states.i.last_updated='2026-11-04T12:00:00Z';assert.equal(energyToday(status,states,now,'Europe/Berlin').imported,null);
});
test('peak requires overlapping valid readings across all three PV plants',()=>{
 const t=Date.parse('2026-11-05T12:00:00Z');const c=v=>({unit:'W',history:[{state:String(v),last_updated:new Date(t).toISOString()}]});
 assert.equal(observedPeak([c(1000),c(200),c(300)],t,t+1000),1500);
 assert.equal(observedPeak([c(1000),c(200),{unit:'W',history:[]}],t,t+1000),null);
});

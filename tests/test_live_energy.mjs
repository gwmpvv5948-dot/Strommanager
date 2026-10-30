import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEnergy} from '../custom_components/solar_pilot/frontend/live-energy.js';
const now=Date.parse('2026-10-30T12:00:00Z');
function sample(){
 const entities={pv_power:'pv',grid_power:'grid',battery_power:'battery',wallbox_power:'ev',house_soc:'soc'};
 const status={entities,settings:{meter_max_age_s:300},source_entities:{learning:{garage:'garage',shed:'shed',inverter:'ac'}}};
 const states=Object.fromEntries(Object.entries({pv:1000,garage:100,shed:50,ac:1450,grid:200,battery:-500,ev:300,soc:40}).map(([id,v])=>[id,{state:String(v),last_updated:new Date(now).toISOString(),attributes:{unit_of_measurement:id==='soc'?'%':'W'}}]));
 return {status,states};
}
test('PV sums three sources; house uses signed AC balance without double-counting battery',()=>{
 const {status,states}=sample();assert.deepEqual(liveEnergy(status,states,now),{pv:1150,grid:200,battery:-500,house:1100,soc:40,ev:300,carSoc:null,carSocStale:true});
 states.ac.state='-1000';states.grid.state='-1300';states.garage.state='0';states.shed.state='0';states.ev.state='0';
 assert.equal(liveEnergy(status,states,now).house,300);
});
test('unit conversion, polarity, real zeros and stale/missing data',()=>{
 const {status,states}=sample();states.pv.state='1';states.pv.attributes.unit_of_measurement='kW';
 status.settings.grid_export_positive=false;status.settings.battery_charge_positive=false;
 let v=liveEnergy(status,states,now);assert.equal(v.pv,1150);assert.equal(v.grid,-200);assert.equal(v.battery,500);
 states.garage.state='unavailable';assert.equal(liveEnergy(status,states,now).pv,null);
 states.garage.state='0';states.ev.state='0';assert.equal(liveEnergy(status,states,now).ev,0);
 states.pv.last_updated=new Date(now-301000).toISOString();assert.equal(liveEnergy(status,states,now).pv,null);
 states.grid.attributes.restored=true;assert.equal(liveEnergy(status,states,now).house,null);
 states.soc.state='101';assert.equal(liveEnergy(status,states,now).soc,null);
});

test('unchanged SoC and power remain fresh when HA still reports them',()=>{
 const {status,states}=sample();
 Object.values(states).forEach(s=>s.last_updated=new Date(now-3600000).toISOString());
 status.source_reports=Object.fromEntries(Object.keys(states).map(id=>[id,now/1000-5]));
 let v=liveEnergy(status,states,now);assert.equal(v.soc,40);assert.equal(v.house,1100);
 status.source_reports.soc=now/1000-301;assert.equal(liveEnergy(status,states,now).soc,null);
 status.source_reports.ac=now/1000-301;assert.equal(liveEnergy(status,states,now).house,null);
});
test('last known Tesla SoC is displayed explicitly as stale, not invented as zero',()=>{
 const {status,states}=sample();status.entities.car_soc='car';
 states.car={state:'38',last_updated:new Date(now-86400000).toISOString(),attributes:{unit_of_measurement:'%'}};
 let v=liveEnergy(status,states,now);assert.equal(v.carSoc,38);assert.equal(v.carSocStale,true);
 status.source_reports={car:now/1000};v=liveEnergy(status,states,now);assert.equal(v.carSocStale,false);
 states.car.state='unavailable';assert.equal(liveEnergy(status,states,now).carSoc,null);
});

assert.equal(liveEnergy({last_car_soc:38},{}).carSoc,38);
assert.equal(liveEnergy({last_car_soc:38},{}).carSocStale,true);

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
 const {status,states}=sample();assert.deepEqual(liveEnergy(status,states,now),{pv:1150,grid:200,battery:-500,house:1100,soc:40,ev:300});
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

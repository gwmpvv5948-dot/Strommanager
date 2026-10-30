import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as views from '../custom_components/solar_pilot/frontend/consumption-chart-view.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/chart-view-input.json',import.meta.url)));
const clean=s=>s.replace(/\s+/g,' ').replace(/>\s+/g,'>').replace(/\s+</g,'<').replace(/\s+>/g,'>').replace(/\s+\/>/g,'/>').trim();
for(const name of ['consumptionBarChart','consumptionTotalBar','consumptionHistoryChart','consumptionHistoryTotal'])test(`${name} preserves the pre-refactor SVG`,()=>{
 const {now,settings,b,day}=fixture,originalNow=Date.now;Date.now=()=>now*1000;
 try{
  const panel={status:{entities:{},snapshot:{now,house_soc:60,house_soc_age:0,forecast_age:0},settings},_hass:{states:{'sun.sun':{state:'below_horizon'},'number.batterien_entlade_ende_ladestand':{state:'7',attributes:{unit_of_measurement:'%'}}}},solarHistory:[],solarSources:()=>({}),auxiliarySolarSources:()=>[],sunsetTime:()=>now+3600};
  const expected=fs.readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
  assert.equal(clean(views[name](panel,name.includes('History')?day:b,'Europe/Berlin')),clean(expected));
 }finally{Date.now=originalNow;}
});

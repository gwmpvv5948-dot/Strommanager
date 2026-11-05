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

test('historical PV uses selected day coordinates, expands scale and keeps separate segments',()=>{
 const {day}=fixture,start=day.day_start;
 const result=views.consumptionHistoryChart({historicalPVOverlay:()=>({actual:[[{t:start+1800,kwh:4},{t:start+5400,kwh:3}],[{t:start+12600,kwh:2}]]})},day,'Europe/Berlin');
 assert.equal((result.match(/class="history-pv-actual"/g)||[]).length,2);
 assert.match(result,/stroke="#d6b04f"/);assert.match(clean(result),/>4<\/text>/);
 assert.match(result,/<circle/);
});

test('measured SoC remains visible when future battery simulation is unavailable',()=>{
 const {now,b,settings}=fixture,originalNow=Date.now;Date.now=()=>now*1000;
 try {
 const panel={socHistoryId:'sensor.soc',socHistory:[{last_updated:new Date((now-3600)*1000).toISOString(),state:'40'},{last_updated:new Date((now-1800)*1000).toISOString(),state:'42'}],status:{entities:{house_soc:'sensor.soc'},snapshot:{now,house_soc:45,house_soc_age:0},settings},_hass:{states:{'sensor.soc':{state:'45',attributes:{unit_of_measurement:'%'}}}},solarHistory:[],solarSources:()=>({}),auxiliarySolarSources:()=>[],sunsetTime:()=>null};
 const result=views.consumptionBarChart(panel,b,'Europe/Berlin');
 assert.match(result,/class="battery-actual"/);assert.match(result,/class="battery-soc-axis"/);assert.ok(!result.includes('class="battery-forecast"'));assert.match(result,/Gemessener Hausspeicher-SoC/);
 } finally {Date.now=originalNow;}
});

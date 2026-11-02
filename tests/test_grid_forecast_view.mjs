import test from 'node:test';
import assert from 'node:assert/strict';
import {gridForecastCard} from '../custom_components/solar_pilot/frontend/grid-forecast-view.js';
const status={mode:'auto',snapshot:{now:1793631600,house_soc:null,wallbox_w:null,current_discharge_w:0},decision:{discharge_w:0},settings:{grid_hold_share:60,grid_release_share:55,house_min_soc:10},grid_forecast:{enabled:true,available:true,share:25,hold:false,reason:'Akku fürs Haus freigegeben',points:[{start:1793631600,end:1793632500,share:25,available:true,hold:false}]}};
test('mobile chart has its own readable coordinate space',()=>{
 assert.match(gridForecastCard(status,'Europe/Berlin',true),/viewBox="0 0 400 215"/);
 assert.match(gridForecastCard(status,'Europe/Berlin',false),/viewBox="0 0 900 215"/);
});
test('missing SoC does not claim minimum SoC reached',()=>{
 const html=gridForecastCard(status);
 assert.match(html,/Schutz \/ Messwerte/);assert.doesNotMatch(html,/Entladung gesperrt · Haus-Mindeststand/);
});

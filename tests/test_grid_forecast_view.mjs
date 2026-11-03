import test from 'node:test';
import assert from 'node:assert/strict';
import {gridForecastCard,renewableColor,gridDaySections} from '../custom_components/solar_pilot/frontend/grid-forecast-view.js';
const status={mode:'auto',snapshot:{now:1793631600,house_soc:null,wallbox_w:null,current_discharge_w:0},decision:{discharge_w:0},settings:{grid_hold_share:60,grid_release_share:55},grid_forecast:{enabled:true,available:true,share:25,hold:false,reason:'Akku fürs Haus freigegeben',points:[{start:1793631600,end:1793632500,share:25,available:true,hold:false}]}};
test('mobile chart has its own readable coordinate space',()=>{
 assert.match(gridForecastCard(status,'Europe/Berlin',true),/viewBox="0 0 400 245"/);
 assert.match(gridForecastCard(status,'Europe/Berlin',false),/viewBox="0 0 900 245"/);
});
test('missing SoC does not claim minimum SoC reached',()=>{
 const html=gridForecastCard(status);
 assert.match(html,/Schutz \/ Messwerte/);assert.doesNotMatch(html,/Entladung gesperrt · Haus-Mindeststand/);
});

test('traffic colours have fixed thresholds independent of control',()=>{
 for(const [value,color] of [[null,'neutral'],[NaN,'neutral'],[0,'red'],[39.9,'red'],[40,'yellow'],[60,'yellow'],[60.1,'green'],[80,'green'],[80.1,'green'],[110,'green']])assert.equal(renewableColor(value),color);
});
test('local day bands mark today, tomorrow and DST midnight',()=>{
 const now=Date.parse('2026-10-24T20:00:00+02:00')/1000;
 const sections=gridDaySections(now,now+36*3600,'Europe/Berlin');
 assert.deepEqual(sections.map(p=>p.label),['Heute','Morgen','Übermorgen']);
 assert.equal(sections[1].end-sections[1].start,25*3600);
 assert.equal(new Date(sections[1].start*1000).toISOString(),'2026-10-24T22:00:00.000Z');
 const html=gridForecastCard(status);assert.match(html,/grid-now-label[^>]*>JETZT/);assert.match(html,/>Heute<\/text>/);
});

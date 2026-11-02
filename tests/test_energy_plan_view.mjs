import test from 'node:test';
import assert from 'node:assert/strict';
import {energyPlanCard,planGroups} from '../custom_components/solar_pilot/frontend/energy-plan-view.js';
test('unavailable observer plan remains honest and never fabricates metrics',()=>{
 const html=energyPlanCard({status:{energy_plan:{available:false,reason:'Prognoselücke'}},_hass:{config:{}}});
 assert.match(html,/Prognoselücke/);assert.match(html,/Keine Gerätebefehle/);assert.doesNotMatch(html,/Stromkosten/);
});
test('adjacent reasons combine but gaps and different decisions stay separate',()=>{
 const groups=planGroups([{start:0,end:900,reason:'Akku'},{start:900,end:1800,reason:'Akku'},{start:2700,end:3600,reason:'Akku'},{start:3600,end:4500,reason:'Netz'}]);
 assert.equal(groups.length,3);assert.equal(groups[0].end,1800);assert.equal(groups[1].start,2700);
});

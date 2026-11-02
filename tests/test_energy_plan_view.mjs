import test from 'node:test';
import assert from 'node:assert/strict';
import {energyPlanCard,planGroups,currentEECard} from '../custom_components/solar_pilot/frontend/energy-plan-view.js';
test('unavailable observer plan remains honest and never fabricates metrics',()=>{
 const html=energyPlanCard({status:{energy_plan:{available:false,reason:'Prognoselücke'}},_hass:{config:{}}});
 assert.match(html,/Prognoselücke/);assert.match(html,/Keine Gerätebefehle/);assert.doesNotMatch(html,/Stromkosten/);
});
test('adjacent reasons combine but gaps and different decisions stay separate',()=>{
 const groups=planGroups([{start:0,end:900,reason:'Akku'},{start:900,end:1800,reason:'Akku'},{start:2700,end:3600,reason:'Akku'},{start:3600,end:4500,reason:'Netz'}]);
 assert.equal(groups.length,3);assert.equal(groups[0].end,1800);assert.equal(groups[1].start,2700);
});

test('active plan failure shows fallback instead of observation',()=>{
 const html=energyPlanCard({status:{mode:'storage_first',settings:{planner_control_enabled:true},energy_plan:{available:false,reason:'Prognoselücke'},energy_control:{reason:'Fallback: Prognoselücke',discharge_w:2500},snapshot:{current_discharge_w:2500}}});
 assert.match(html,/Fallback: Prognoselücke/);assert.doesNotMatch(html,/Keine Gerätebefehle aus dem Fahrplan/);
});
test('current EE uses available share and never shows stale data as live',()=>{
 assert.match(currentEECard({grid_forecast:{available:true,share:85}}),/85 %/);
 assert.doesNotMatch(currentEECard({grid_forecast:{available:false,share:85}}),/85 %/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {energyPlanCard,planGroups,currentEEValue} from '../custom_components/solar_pilot/frontend/energy-plan-view.js';
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
 assert.match(currentEEValue({grid_forecast:{available:true,share:85}}),/85 %/);
 assert.doesNotMatch(currentEEValue({grid_forecast:{available:false,share:85}}),/85 %/);
});

test('joint plan renders EV without a misleading house-only cost comparison',()=>{
 globalThis.matchMedia=()=>({matches:false});
 const point={spot_ct:5,start:1,end:901,load_kw:.5,pv_kw:0,ee:70,pv_direct_kw:0,charge_kw:0,battery_kw:0,grid_kw:2.34,ev_pv_kw:0,ev_kw:1.84,ev_soc:40,soc:50,reason:'Tesla lädt',explanation:'EE-Fenster'};
 const plan={available:true,joint:true,points:[point],initial_soc:50,minimum_soc:3,terminal_soc:50,start:1,end:86401,updated:1,
  ev:{active:true,initial_soc:39,planned_soc:40,limit_soc:80,grid_share:60,charged_kwh:.46},
  delta:null,solver:'HiGHS MILP',config:{ee_weight:.12,cycle_cost:.02,efficiency:.9},sources:{pv_factor:.85,ee_fetched:1,house_updated:1}};
 const html=energyPlanCard({status:{energy_plan:plan,mode:'auto',settings:{planner_ev_enabled:true,planner_control_enabled:true},snapshot:{}},_hass:{config:{}}});
 const disclosure=html.match(/<details class="plan-details plan-soc-details">([\s\S]*?)<\/details>/);
 assert.ok(disclosure);
 assert.match(disclosure[1],/EE-Anteil &amp; Börsenpreis/);
 assert.match(disclosure[1],/price-chart/);
 assert.equal((html.match(/price-chart/g)||[]).length,1);
 assert.match(html,/Haus \+ Tesla/);assert.match(html,/Tesla-SoC/);assert.match(html,/Reserven|WR-Minimum/);
 assert.doesNotMatch(html,/Gegenüber Schwellenregel · simuliert/);assert.match(html,/id="mode"/);
});

 test('calculation indicator appears only while waiting or solving, never masks a finished failure',()=>{
  const html=energyPlanCard({status:{energy_plan:{available:false,calculating:true,reason:'Alter Fehler'}}});
  assert.match(html,/role="status"/);assert.match(html,/mdi:cog/);assert.match(html,/Wird berechnet/);
  assert.doesNotMatch(html,/Alter Fehler/);
  const failed=energyPlanCard({status:{energy_plan:{available:false,calculating:false,reason:'Prognoselücke'}}});
  assert.match(failed,/Prognoselücke/);assert.doesNotMatch(failed,/plan-calculating/);
  assert.match(energyPlanCard({status:{}}),/Wird berechnet/);
 });

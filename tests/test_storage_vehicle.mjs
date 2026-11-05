import test from 'node:test';
import assert from 'node:assert/strict';
import {planThresholds} from '../custom_components/solar_pilot/frontend/plan-thresholds.js';
test('storage and car visuals use real values and label modeled car energy',()=>{
 const html=planThresholds({status:{snapshot:{now:Date.now()/1000,car_age:0,meter_age:0,location_age:0,house_soc_age:0,house_soc:62,car_soc:48,car_limit:80,car_current:16,battery_charge_w:1200,wallbox_w:2300,at_home:true,cable:true},settings:{capacity_kwh:5,planner_ev_capacity_kwh:50}}});
 assert.match(html,/hs-compact/);assert.match(html,/width:62%/);assert.doesNotMatch(html,/tesla-art/);assert.match(html,/Modellwert/);assert.match(html,/Lädt/);assert.match(html,/tesla-targets/);assert.doesNotMatch(html,/PV-Laden/);
});
test('unknown values never look like measured zero or mockup values',()=>{
 const html=planThresholds({status:{snapshot:{},settings:{}}});
 assert.match(html,/Leistung unbekannt/);assert.match(html,/Anschluss unbekannt/);assert.doesNotMatch(html,/62 %|48 %|Zuhause|NaN|undefined/);
});

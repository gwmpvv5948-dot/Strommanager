import test from 'node:test';
import assert from 'node:assert/strict';
import {planThresholds} from '../custom_components/solar_pilot/frontend/plan-thresholds.js';
test('storage and car visuals use real values and label modeled car energy',()=>{
 const html=planThresholds({status:{snapshot:{now:Date.now()/1000,house_soc:62,car_soc:48,car_limit:80,car_current:16,battery_charge_w:1200,wallbox_w:2300,at_home:true,cable:true},settings:{capacity_kwh:5,planner_ev_capacity_kwh:50}}});
 assert.match(html,/storage-battery/);assert.match(html,/height:62%/);assert.match(html,/tesla-art/);assert.match(html,/Modellwert/);assert.match(html,/Zuhause/);assert.match(html,/Eingestellt: 16 A/);assert.doesNotMatch(html,/PV-Laden/);
});
test('unknown values never look like measured zero or mockup values',()=>{
 const html=planThresholds({status:{snapshot:{},settings:{}}});
 assert.match(html,/Leistung nicht verfügbar/);assert.match(html,/Ladeleistung nicht verfügbar/);assert.doesNotMatch(html,/62 %|48 %|Zuhause|NaN|undefined/);
});

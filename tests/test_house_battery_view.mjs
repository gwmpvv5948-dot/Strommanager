import test from 'node:test';import assert from 'node:assert/strict';
import {houseBattery} from '../custom_components/solar_pilot/frontend/house-battery-view.js';
test('house storage shows direction, SoC and watts without inventing missing readings',()=>{
 assert.match(houseBattery({soc:40,battery:800}),/arrow-down/);assert.match(houseBattery({soc:40,battery:800}),/800 W/);
 assert.match(houseBattery({soc:40,battery:-300}),/arrow-up/);assert.match(houseBattery({soc:0,battery:0}),/0 %/);
 assert.match(houseBattery({soc:null,battery:null}),/Leistung unbekannt/);
});

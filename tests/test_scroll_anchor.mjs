import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollAnchorKey} from '../custom_components/solar_pilot/frontend/scroll-anchor.js';
const summary=card=>({tagName:'SUMMARY',textContent:'Berechnung und Datenquellen',matches:()=>false,closest:()=>({querySelector:()=>({textContent:card})})});
test('identical summaries in different cards cannot restore to the wrong card',()=>{
 const grid=scrollAnchorKey(summary('Netz & Akku · Ausblick'),'overview');
 const benefit=scrollAnchorKey(summary('Dein PV-Vorteil'),'overview');
 assert.notEqual(grid,benefit);
 assert.equal(benefit,scrollAnchorKey(summary('Dein PV-Vorteil'),'overview'));
});

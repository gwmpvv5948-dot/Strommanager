import test from 'node:test';
import assert from 'node:assert/strict';
import {pricePlanChart,priceConnection} from '../custom_components/solar_pilot/frontend/price-plan-view.js';
test('market, forecast, negative price and explicit missing price render without invented EE',()=>{
 const s=1793707200;const plan={start:s,end:s+86400,points:[{start:s,end:s+900,spot_ct:-5,price_forecast:false},{start:s+900,end:s+1800,spot_ct:10,price_forecast:true},{start:s+1800,end:s+2700,spot_ct:null}]};
 const html=pricePlanChart(plan);assert.match(html,/price-predicted/);assert.match(html,/grid-neutral/);assert.match(html,/JETZT/);assert.match(html,/Festpreis/);assert.doesNotMatch(html,/NaN|undefined/);
 assert.equal(pricePlanChart({...plan,points:[]}), '');
 assert.match(priceConnection({price_forecast:{reason:'<bad>'}}),/&lt;bad&gt;/);
});

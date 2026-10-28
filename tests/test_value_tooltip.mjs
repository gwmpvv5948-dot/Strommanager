import test from 'node:test';
import assert from 'node:assert/strict';
import {bindValueTooltip} from '../custom_components/solar_pilot/frontend/value-tooltip.js';
function plot(){
 const attributes=new Map([['data-consumption-info-key','hour:123'],['data-consumption-info','17–18 Uhr\nHaus: 0,7 kWh']]);
 const hit={getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v),getBoundingClientRect:()=>({left:230,top:60,width:30,height:120})};hit.closest=()=>hit;
 const tip={hidden:true,textContent:'',style:{},offsetWidth:210,offsetHeight:90};
 return {hit,tip,clientWidth:500,clientHeight:200,scrollLeft:0,scrollTop:0,
 querySelector:()=>tip,querySelectorAll:()=>[hit],getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:200})};
}
test('hover text is retained across view replacement without detached blur clearing it',()=>{
 const old=plot();let saved=null;
 const dispose=bindValueTooltip(old,null,state=>{saved=state;});
 old.onpointermove({target:old.hit,clientX:245,clientY:100});
 assert.equal(old.tip.hidden,false);assert.equal(saved.key,'hour:123');
 const previous=saved;dispose();assert.equal(old.onfocusout,null);
 const fresh=plot();bindValueTooltip(fresh,previous,state=>{saved=state;});
 assert.equal(fresh.tip.hidden,false);assert.equal(fresh.tip.textContent,'17–18 Uhr\nHaus: 0,7 kWh');
 assert.equal(saved.key,'hour:123');
});
test('keyboard focus shows values and Escape closes them',()=>{
 const node=plot();let saved=null;bindValueTooltip(node,null,state=>{saved=state;});
 node.onfocusin({target:node.hit});assert.equal(node.tip.hidden,false);assert.equal(saved.keyboard,true);
 node.onkeydown({key:'Escape'});assert.equal(node.tip.hidden,true);assert.equal(saved,null);
});

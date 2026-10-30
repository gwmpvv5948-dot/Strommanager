import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('HA properties assigned before custom-element upgrade reach their setters',()=>{
 const source=fs.readFileSync(new URL('../custom_components/solar_pilot/frontend/panel.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace('export class SolarPilotPanel','class SolarPilotPanel')+'\nglobalThis.Panel=SolarPilotPanel;';
 const context=vm.createContext({HTMLElement:class{attachShadow(){}},customElements:{get:()=>true},setInterval:()=>1,localStorage:{getItem:()=>null}});
 vm.runInContext(source,context);
 const panel=new context.Panel(),hass={states:{}},config={config:{entry_id:'test'}};
 let refreshed=0;panel.refresh=()=>{refreshed++;};panel.render=()=>{};
 for(const [key,value] of Object.entries({hass,panel:config,narrow:true}))Object.defineProperty(panel,key,{value,writable:true,configurable:true});
 panel.connectedCallback();
 assert.equal(panel._hass,hass);assert.equal(panel._panel,config);assert.equal(panel._narrow,true);
 assert.equal(Object.hasOwn(panel,'hass'),false);assert.ok(refreshed>0);
});

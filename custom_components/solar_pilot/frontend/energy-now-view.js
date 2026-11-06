import {solarDayData} from './solar-timeline-view.js?v=0.1.124';
import {liveEnergy,dischargeLocked,energyMix} from './live-energy.js';
import {esc,fmt} from './view-format.js';
import {dayBounds,number} from './solar-chart.js';
import {dailyEnergy} from './energy-budget.js';
import {currentEEValue} from './energy-plan-view.js?v=0.1.124';

export {energyMix} from './live-energy.js';
export function energyToday(status,states,now,zone){
  const d=status?.source_entities?.display||{},start=dayBounds(now,zone).start;
  const read=key=>dailyEnergy(states?.[d[key]],start,now);
  const pv=[read('roof_daily'),read('garage_daily'),read('shed_daily')];
  return {generated:pv.every(x=>x!==null)?pv.reduce((a,b)=>a+b,0):null,imported:read('grid_import_daily'),exported:read('grid_export_daily')};
}
export function observedPeak(channels,start,end){
  if(channels.length!==3)return null;
  const series=channels.map(c=>{const factor=c.unit==='W'?1:c.unit==='kW'?1000:null;return factor===null?[]:(c.history||[]).map(r=>({t:Date.parse(r.last_updated||r.last_changed),v:number(r.state)})).filter(r=>Number.isFinite(r.t)&&r.v!==null).map(r=>({...r,v:r.v*factor})).sort((a,b)=>a.t-b.t);});
  if(series.some(s=>!s.length))return null;
  const times=[...new Set(series.flat().map(r=>r.t))].filter(t=>t>=start&&t<=end).sort((a,b)=>a-b),index=[0,0,0];let peak=null;
  for(const t of times){const values=series.map((s,i)=>{while(index[i]+1<s.length&&s[index[i]+1].t<=t)index[i]++;const r=s[index[i]];return r.t<=t&&t-r.t<=300000&&r.v>=0?r.v:null;});if(values.every(v=>v!==null))peak=Math.max(peak??0,values.reduce((a,b)=>a+b,0));}
  return peak;
}
export function storageDuration(status,states,v,fresh=true){
  const capacity=number(status?.settings?.capacity_kwh),soc=number(v.soc),watts=number(v.battery);
  if(!fresh||!(capacity>0)||soc===null||soc<0||soc>100||watts===null||Math.abs(watts)<=10)return '';
  const state=states[status?.source_entities?.display?.battery_min_soc];
  const minimum=state&&!state.attributes?.restored&&!['unknown','unavailable'].includes(state.state)&&state.attributes?.unit_of_measurement==='%'?number(state.state):null;
  if(watts<0&&(minimum===null||minimum<0||minimum>100))return '';
  const energy=(watts>0?100-soc:Math.max(0,soc-minimum))/100*capacity;
  const minutes=Math.ceil(energy/(Math.abs(watts)/1000)*60);
  if(!Number.isFinite(minutes))return '';
  const duration=minutes===0?'0 min':minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} h${minutes%60?' '+minutes%60+' min':''}`;
  return `${watts>0?'Voll':`Bis ${fmt(minimum,'%',0)}`} in ca. ${duration}`;
}
const icons={sun:'<circle cx="0" cy="0" r="4"/><path d="M0-10v2M0 8v2M-10 0h2M8 0h2M-7-7l2 2M5 5l2 2M-7 7l2-2M5-5l2-2"/>',house:'<path d="m-10 0 10-9 10 9M-7-2v12H7V-2M-2 10V3h4v7"/>',grid:'<path d="M-8 10-3-8h6l5 18M-5 1H5M-7-4H7M-3-8 0-11l3 3M-3 6h6M-11 10h6M5 10h6"/>'};
export function energyNowCard(panel,now=Date.now()){
  const status=panel._error?null:panel.status,states=panel._hass?.states||{},v=status?liveEnergy(status,states,now):{},mix=energyMix(v),zone=panel._hass?.config?.time_zone||'Europe/Berlin';
  const today=energyToday(status,states,now,zone),source=panel.solarSources(),peak=observedPeak([{unit:source.power?.attributes?.unit_of_measurement,history:panel.solarHistory},...panel.auxiliarySolarSources()],dayBounds(now,zone).start,now);
  const remaining=solarDayData({now,zone,states,source,history:[],unit:source.power?.attributes?.unit_of_measurement}).remaining;
  const power=x=>x==null?'—':fmt(Math.abs(x)/1000,'kW',2),discharging=v.battery< -10,charging=v.battery>10,locked=dischargeLocked(status,states,now);
  const age=(now-Date.parse(status?.updated||''))/1000,fresh=Number.isFinite(age)&&age>=-60&&age<=120;
  const ring=(x,y,kind,value,label)=>`<g class="en-node en-${kind}" transform="translate(${x} ${y})"><circle r="34"/><g class="en-symbol" transform="translate(0 -15) scale(.8)">${icons[kind]||''}</g><text class="en-power" y="15">${esc(value)}</text>${label?`<text class="en-caption" y="53">${esc(label)}</text>`:''}</g>`;
  const path=(d,kind,active,reverse=false)=>`<path class="en-track" d="${d}"/><path class="en-flow en-${kind} ${active?'is-flowing':''} ${reverse?'reverse':''}" d="${d}"/>`;
  const storageLabel=locked?'Entladung gesperrt':v.battery==null?'Leistung unbekannt':charging?'Hausspeicher lädt':discharging?'Hausspeicher entlädt':'Hausspeicher ruht';
  const duration=storageDuration(status,states,v,fresh);
  const pct=x=>fmt(x,'%',0),parts=[['pv','PV'],['storage','Hausspeicher'],['grid','Netz']];
  return `<section class="card full energy-now-card" aria-label="Energie jetzt"><header class="card-title"><h2>Energie jetzt</h2><span class="en-live ${fresh?'':'is-stale'}"><i></i>${fresh?`Live · vor ${Math.max(0,Math.round(age))} s`:'Daten fehlen / veraltet'}</span></header><div class="energy-now-body"><svg class="energy-now-flow" viewBox="0 0 415 320" role="img" aria-label="PV ${power(v.pv)}, Haus ${power(v.house)}, Netz ${power(v.grid)}, Hausspeicher ${fmt(v.soc,'%',0)}. ${storageLabel}">
    ${path('M190 83 Q210 147 294 155','sun',fresh&&v.pv>10)}${path('M94 170 H294','grid',fresh&&Math.abs(v.grid)>10,v.grid>0)}${path('M190 257 Q210 193 294 183','storage',fresh&&Math.abs(v.battery)>10,charging)}
    ${ring(173,64,'sun',power(v.pv),'')}${ring(57,170,'grid',power(v.grid),v.grid>10?'Einspeisung':v.grid< -10?'Netzbezug':'Netz')}${ring(328,170,'house',power(v.house),'Haus')}
    <g transform="translate(173 278)" class="en-node en-storage"><circle r="34"/>${v.soc==null?'':`<circle class="en-soc-ring" r="34" pathLength="100" stroke-dasharray="${v.soc} 100" transform="rotate(-90)"/>`}<text class="en-power" y="-1">${esc(fmt(v.soc,'%',0))}</text><text class="en-battery-w" y="15">${esc(v.battery==null?'—':fmt(Math.abs(v.battery),'W',0))}</text></g>
    <text class="en-label" x="240" y="59">PV</text><text class="en-note" x="240" y="75">Spitze heute ${esc(power(peak))}</text><text class="en-note" x="240" y="91"><title>Solcast P50 · verbleibender Dach-Ertrag heute, ohne Prognose für Garage und Schuppen</title>Noch erwartet ${esc(fmt(remaining,'kWh',1))}</text><text class="en-label" x="223" y="288">${locked?'🔒 ':''}${esc(storageLabel)}</text><text class="en-note" x="223" y="303"><title>Schätzung bei gleichbleibender aktueller Hausspeicherleistung; kein Fahrplan. Entladung bis zur Wechselrichter-Untergrenze.</title>${esc(duration)}</text>
    <foreignObject x="0" y="225" width="132" height="30"><div xmlns="http://www.w3.org/1999/xhtml" class="en-ee">${currentEEValue(status)}</div></foreignObject>
    </svg><div class="energy-now-summary"><div class="en-autarky"><span>Autarkie jetzt</span><strong>${pct(mix?.autarky)}</strong></div><div class="en-origins" title="Momentane Leistungsbilanz für Haus und Tesla. Quellen werden rechnerisch anteilig verteilt. Hausspeicher zählt zur Autarkie, unabhängig von seiner früheren Ladequelle."><h3>Woher kommt der Strom?</h3><div class="en-mix" role="img" aria-label="PV ${pct(mix?.pv)}, Hausspeicher ${pct(mix?.storage)}, Netz ${pct(mix?.grid)}">${mix?parts.map(([k])=>`<i class="en-fill-${k}" style="width:${mix[k]}%"></i>`).join(''):'<span>—</span>'}</div><div class="en-mix-legend">${parts.map(([k,label])=>`<div><i class="en-fill-${k}"></i><span>${label}</span><strong>${pct(mix?.[k])}</strong></div>`).join('')}</div></div><div class="en-day"><div><span>Erzeugt heute</span><strong>${fmt(today.generated,'kWh',2)}</strong></div><div><span>Bezug heute</span><strong>${fmt(today.imported,'kWh',2)}</strong></div><div><span>Einspeisung heute</span><strong>${fmt(today.exported,'kWh',2)}</strong></div></div></div></div></section>`;
}

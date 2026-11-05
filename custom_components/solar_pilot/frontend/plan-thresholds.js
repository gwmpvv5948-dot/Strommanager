import {teslaCard} from './tesla-card.js?v=0.1.103';
import {esc,fmt} from './view-format.js';
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:null;
export function planThresholds(panel) {
  const t=panel.status||{},s=t.snapshot||{},c=t.settings||{};
  const battery=numeric(s.house_soc),car=numeric(s.car_soc),limit=numeric(s.car_limit);
  const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
  const stored=battery!==null&&positive(c.capacity_kwh)?battery*c.capacity_kwh/100:null;
  const carEnergy=car!==null&&positive(c.planner_ev_capacity_kwh)?car*c.planner_ev_capacity_kwh/100:null;
  const fresh=Number.isFinite(s.now)&&Date.now()/1000-s.now>=-60&&Date.now()/1000-s.now<=120;
  const power=fresh&&Number.isFinite(s.battery_charge_w)?s.battery_charge_w:null;
  const batteryState=power===null?'Leistung nicht verfügbar':power>10?'Lädt':power< -10?'Entlädt':'Hausspeicher ruht';
  const wallbox=fresh&&Number.isFinite(s.wallbox_w)?s.wallbox_w:null;
  const marks=[['WR-Minimum',numeric(s.battery_min_soc),'floor'],['Endreserve',numeric(c.planner_terminal_soc),'terminal'],['Abendreserve',numeric(c.reserve_soc),'reserve'],['Tesla-Freigabe',numeric(c.storage_release_soc),'release']];
  const sideMarks=marks.filter(([,v,key])=>v!==null&&key!=='floor').map(([label,value,key])=>({label,value,key,top:100-value})).sort((a,b)=>a.top-b.top);
  sideMarks.forEach((m,i)=>{m.top=Math.max(5,Math.min(95,m.top),i?sideMarks[i-1].top+12:5);});
  for(let i=sideMarks.length-1;i>=0;i--)sideMarks[i].top=Math.min(sideMarks[i].top,95-(sideMarks.length-1-i)*12);
  const labels=items=>`<div class="vehicle-targets">${items.map(([label,v,key])=>`<span><i class="limit-${key}"></i>${esc(label)} <b>${fmt(v,'%')}</b></span>`).join('')}</div>`;
  return `<section class="plan-thresholds storage-vehicle full" aria-label="Eingestellte Reserven und Ladeziele"><article class="card storage-visual"><h3><ha-icon icon="mdi:battery"></ha-icon>Hausspeicher</h3><strong class="storage-percent">${fmt(battery,'%')}</strong><span class="sub">${fmt(stored,'kWh',1)} / ${fmt(positive(c.capacity_kwh),'kWh',1)}</span><div class="storage-stage"><div class="storage-battery" role="img" aria-label="Hausspeicher: ${fmt(battery,'%')}"><div class="storage-fill ${battery===null?'unknown':''}" style="height:${battery??0}%"></div>${marks.filter(([,v])=>v!==null).map(([label,v,key])=>`<i class="storage-mark limit-${key}" style="bottom:${v}%" title="${esc(label)} ${fmt(v,'%')}"></i>`).join('')}</div>${sideMarks.map(m=>`<div class="storage-side-label" style="top:${m.top}%"><span>${esc(m.label)} <b>${fmt(m.value,'%')}</b></span></div>`).join('')}</div><p class="storage-flow">${esc(batteryState)}${power===null?'':` · ${fmt(Math.abs(power)/1000,'kW',2)}`}</p><span class="sub storage-floor">WR-Minimum ${fmt(numeric(s.battery_min_soc),'%')}</span></article>${teslaCard(panel)}</section>`;
}
export function planControls(panel) {
  const t=panel.status||{},mode=t.mode||'observe',busy=panel.busy?'disabled':'';
  const modes={auto:'Automatik',storage_first:'Speicher bevorzugen',charge_minimum:'Nur Tesla-Mindeststand',charge_now:'Tesla-Sofortladen',observe:'Beobachten',paused:'Pausiert'};
  return `<div class="plan-controls">${mode==='charge_now'?`<button class="secondary" data-action="end_immediate" ${busy}>Sofortladen beenden</button>`:`<button class="primary" data-action="immediate" ${busy}>Tesla-Sofortladen</button>`}<span class="sub">Steuerung</span><select class="select" id="mode" aria-label="Betriebsmodus" ${busy}>${Object.entries(modes).map(([key,label])=>`<option value="${key}" ${key===mode?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" data-action="evaluate" ${busy}>Jetzt neu berechnen</button>${mode==='observe'||mode==='paused'?`<button class="primary" data-action="activate" ${busy}>Steuerung aktivieren</button>`:`<button class="secondary" data-action="pause" ${busy}>Regelung pausieren</button>`}</div>`;
}

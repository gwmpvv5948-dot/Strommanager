import {vehicleSilhouette} from './vehicle-art.js';
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
  const batteryState=power===null?'Leistung nicht verfügbar':power>10?'Lädt':power< -10?'Entlädt':'Akku ruht';
  const wallbox=fresh&&Number.isFinite(s.wallbox_w)?s.wallbox_w:null;
  const marks=[['WR-Minimum',numeric(s.battery_min_soc),'floor'],['Endreserve',numeric(c.planner_terminal_soc),'terminal'],['Abendreserve',numeric(c.reserve_soc),'reserve'],['Tesla-Freigabe',numeric(c.storage_release_soc),'release']];
  const labels=items=>`<div class="plan-limit-labels">${items.map(([label,v,key])=>`<span><i class="limit-${key}"></i>${esc(label)} <b>${fmt(v,'%')}</b></span>`).join('')}</div>`;
  return `<section class="plan-thresholds storage-vehicle" aria-label="Eingestellte Reserven und Ladeziele"><article class="storage-visual"><h3><ha-icon icon="mdi:battery"></ha-icon>Hausspeicher</h3><strong class="storage-percent">${fmt(battery,'%')}</strong><span class="sub">${fmt(stored,'kWh',1)} / ${fmt(positive(c.capacity_kwh),'kWh',1)}</span><div class="storage-battery" role="img" aria-label="Hausspeicher: ${fmt(battery,'%')}"><div class="storage-fill ${battery===null?'unknown':''}" style="height:${battery??0}%"></div>${marks.filter(([,v])=>v!==null).map(([label,v,key])=>`<i class="storage-mark limit-${key}" style="bottom:${v}%" title="${esc(label)} ${fmt(v,'%')}"></i>`).join('')}</div><p class="storage-flow">${esc(batteryState)}${power===null?'':` · ${fmt(Math.abs(power)/1000,'kW',2)}`}</p>${labels(marks)}</article><article class="vehicle-visual"><h3><ha-icon icon="mdi:car-electric"></ha-icon>Tesla</h3>${vehicleSilhouette(s.cable===true)}<strong class="storage-percent">${fmt(car,'%')}</strong><span class="sub">${fmt(carEnergy,'kWh',1)} / ${fmt(positive(c.planner_ev_capacity_kwh),'kWh',1)} · Modellwert</span><div class="plan-limit-bar" role="img" aria-label="Tesla-Ladestand ${fmt(car,'%')}"><span style="width:${car??0}%"></span></div><p class="sub">${fresh?(s.at_home?'Zuhause':'Nicht zuhause'):'Standort nicht aktuell'} · ${fresh?(s.cable?'Angeschlossen':'Nicht angeschlossen'):'Anschluss nicht aktuell'}</p><p class="storage-flow">${wallbox===null?'Ladeleistung nicht verfügbar':wallbox>10?'Lädt · '+fmt(wallbox/1000,'kW',2):'Lädt nicht · '+fmt(wallbox/1000,'kW',2)}</p>${labels([['Mindestladung unter',numeric(c.car_low_soc),'floor'],['Mindestziel',numeric(c.car_min_soc),'reserve'],['Fahrzeuglimit',limit,'release']])}</article></section>`;
}
export function planControls(panel) {
  const t=panel.status||{},mode=t.mode||'observe',busy=panel.busy?'disabled':'';
  const modes={auto:'Automatik',storage_first:'Speicher bevorzugen',charge_minimum:'Nur Tesla-Mindeststand',observe:'Beobachten',paused:'Pausiert'};
  return `<div class="plan-controls"><span class="sub">Steuerung</span><select class="select" id="mode" aria-label="Betriebsmodus" ${busy}>${Object.entries(modes).map(([key,label])=>`<option value="${key}" ${key===mode?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" data-action="evaluate" ${busy}>Jetzt neu berechnen</button>${mode==='observe'||mode==='paused'?`<button class="primary" data-action="activate" ${busy}>Steuerung aktivieren</button>`:`<button class="secondary" data-action="pause" ${busy}>Regelung pausieren</button>`}</div>`;
}

import {esc,fmt} from './view-format.js';
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:null;
export function planThresholds(panel) {
  const t=panel.status||{},s=t.snapshot||{},c=t.settings||{};
  const battery=numeric(s.house_soc),car=numeric(s.car_soc),limit=numeric(s.car_limit);
  const meter=(value,items)=>`<div class="plan-limit-bar" role="img" aria-label="${esc(`Ladestand ${fmt(value,'%')}; ${items.map(([label,v])=>`${label} ${fmt(v,'%')}`).join('; ')}`)}"><span style="width:${value??0}%"></span>${items.map(([label,v,key])=>numeric(v)==null?'':`<i class="limit-${key}" style="left:${v}%" aria-hidden="true"></i>`).join('')}</div><div class="plan-limit-labels">${items.map(([label,v,key])=>`<span><i class="limit-${key}"></i>${label} <b>${fmt(v,'%')}</b></span>`).join('')}</div>`;
  return `<section class="plan-thresholds" aria-label="Eingestellte Reserven und Ladeziele"><div><h3>Hausspeicher · ${fmt(battery,'%')}</h3>${meter(battery,[['WR-Minimum',numeric(s.battery_min_soc),'floor'],['Endreserve',numeric(c.planner_terminal_soc),'terminal'],['Abendreserve',numeric(c.reserve_soc),'reserve'],['Tesla-Freigabe',numeric(c.storage_release_soc),'release']])}</div><div><h3>Tesla · ${fmt(car,'%')}</h3>${meter(car,[['Mindestladung unter',numeric(c.car_low_soc),'floor'],['Mindestziel',numeric(c.car_min_soc),'reserve'],['Fahrzeuglimit',limit,'release']])}<span class="sub">${fmt(c.planner_ev_capacity_kwh,'kWh')} nutzbar · ohne feste Abfahrtszeit</span></div></section>`;
}
export function planControls(panel) {
  const t=panel.status||{},mode=t.mode||'observe',busy=panel.busy?'disabled':'';
  const modes={auto:'Automatik',storage_first:'Speicher bevorzugen',charge_minimum:'Nur Tesla-Mindeststand',observe:'Beobachten',paused:'Pausiert'};
  return `<div class="plan-controls"><span class="sub">Steuerung</span><select class="select" id="mode" aria-label="Betriebsmodus" ${busy}>${Object.entries(modes).map(([key,label])=>`<option value="${key}" ${key===mode?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" data-action="evaluate" ${busy}>Jetzt neu berechnen</button>${mode==='observe'||mode==='paused'?`<button class="primary" data-action="activate" ${busy}>Steuerung aktivieren</button>`:`<button class="secondary" data-action="pause" ${busy}>Regelung pausieren</button>`}</div>`;
}

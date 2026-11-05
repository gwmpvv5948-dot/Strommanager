import {houseStorageCard} from './house-storage-card.js?v=0.1.106';
import {teslaCard} from './tesla-card.js?v=0.1.106';
import {esc,fmt} from './view-format.js';
export function planThresholds(panel) {
  return `<section class="plan-thresholds storage-vehicle full" aria-label="Eingestellte Reserven und Ladeziele">${houseStorageCard(panel)}${teslaCard(panel)}</section>`;
}
export function planControls(panel) {
  const t=panel.status||{},mode=t.mode||'observe',busy=panel.busy?'disabled':'';
  const modes={auto:'Automatik',storage_first:'Speicher bevorzugen',charge_minimum:'Nur Tesla-Mindeststand',charge_now:'Tesla-Sofortladen',observe:'Beobachten',paused:'Pausiert'};
  return `<div class="plan-controls">${mode==='charge_now'?`<button class="secondary" data-action="end_immediate" ${busy}>Sofortladen beenden</button>`:`<button class="primary" data-action="immediate" ${busy}>Tesla-Sofortladen</button>`}<span class="sub">Steuerung</span><select class="select" id="mode" aria-label="Betriebsmodus" ${busy}>${Object.entries(modes).map(([key,label])=>`<option value="${key}" ${key===mode?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" data-action="evaluate" ${busy}>Jetzt neu berechnen</button>${mode==='observe'||mode==='paused'?`<button class="primary" data-action="activate" ${busy}>Steuerung aktivieren</button>`:`<button class="secondary" data-action="pause" ${busy}>Regelung pausieren</button>`}</div>`;
}

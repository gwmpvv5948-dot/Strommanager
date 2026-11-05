import {fmt} from './view-format.js';
export function houseBattery(v={}) {
  const valid=typeof v.battery==='number'&&Number.isFinite(v.battery),charging=valid&&v.battery>10,discharging=valid&&v.battery< -10;
  const direction=charging?'arrow-down':discharging?'arrow-up':'minus';
  const label=!valid?'Leistung unbekannt':charging?'Lädt':discharging?'Entlädt':'Ruht';
  return `<div class="live-house-battery" aria-label="Hausspeicher: ${fmt(v.soc,'%')}, ${label}${valid?', '+fmt(Math.abs(v.battery),'W',0):''}"><ha-icon class="live-storage-arrow" icon="mdi:${direction}" aria-hidden="true"></ha-icon><span class="live-icon battery"><ha-icon icon="mdi:${charging?'battery-charging':discharging?'battery-arrow-up-outline':'battery-outline'}" aria-hidden="true"></ha-icon></span><strong>${fmt(v.soc,'%',0)}</strong><span class="sub">Hausspeicher</span><span class="live-storage-power">${label}${valid?' · '+fmt(Math.abs(v.battery),'W',0):''}</span></div>`;
}

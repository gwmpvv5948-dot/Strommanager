import {vehicleSilhouette} from './vehicle-art.js?v=0.1.47';
import {sourceSettings,bindSourceSettings} from './source-settings-view.js?v=0.1.47';
import {pvOverlay} from './pv-overlay.js?v=20261028-2';
import {panelCSS as CSS} from './panel-styles.js?v=0.1.47';
import {esc,fmt} from './view-format.js?v=0.1.47';
import {consumptionBarChart,consumptionTotalBar,consumptionHistoryChart,consumptionHistoryTotal} from './consumption-chart-view.js?v=0.1.47';
import {liveEnergy} from './live-energy.js?v=0.1.40';
import {monthlyReferences,referenceScale,yieldAssessment} from './pv-reference.js?v=0.1.27';
import {consumptionBars,rollingConsumptionBars,historicalConsumptionBars,dailyConsumption} from "./consumption-chart.js?v=0.1.40";

import {dayAllocation,remainingPV} from "./energy-budget.js?v=20261027-3";
import {number as numeric,dayBounds,forecastPoints,actualSegments,storagePotential,batteryProtection} from "./solar-chart.js?v=20261027-2";
import {dateKey,nextDays,pvDays,pvDayIds,weatherDays,duration,weatherLabel} from "./day-forecast.js?v=0.1.47";
const MODES = {observe:"Beobachten",auto:"Automatik",storage_first:"Speicher bevorzugen",charge_minimum:"Nur Tesla-Mindeststand",paused:"Pausiert"};
const FIELD_INFO = {
  budget_extra_kwh:["Zusätzlicher Hausbedarf pro PV-Tag", "kWh · nur Budgetanzeige", 0, 30, .1],
  reserve_soc:["Abendreserve", "%", 0, 100, 1], capacity_kwh:["Speicherkapazität", "kWh", .1, 200, .1],
  car_low_soc:["Tesla-Untergrenze für Netzladung", "%", 0, 99, 1],
  storage_release_soc:["Speicherfreigabe für Tesla", "%", 0, 100, 1],
  car_min_soc:["Tesla-Mindestziel", "%", 0, 100, 1], phases:["Ladephasen", "1 oder 3", 1, 3, 2],
  max_amps:["Maximaler Ladestrom", "A", 8, 48, 1], normal_discharge_w:["Entladeleistung ohne Schutz", "W", 0, 30000, 100],
  max_charge_w:["Speicher-Ladebudget maximal", "W", 0, 30000, 100],
  forecast_factor:["Anteil der PV-Prognose einplanen", "Faktor", .1, 1, .05], buffer_kwh:["Energiepuffer", "kWh", 0, 30, .1],
  margin_w:["Leistungspuffer", "W", 0, 3000, 50], minimum_house_w:["Hauslast mindestens einplanen", "W", 0, 5000, 50],
  cloud_interval_s:["Mindestabstand Tesla-Befehle", "s", 120, 3600, 30],
};
const FIELD_HELP = {
  "budget_extra_kwh": "Zusätzlicher Tagesbedarf über der Grundlast während der PV-Zeit. Bereits bilanzierter Mehrverbrauch wird abgezogen. Dauerhaft in HA gespeichert; beeinflusst nur die Budgetanzeige.",
  "reserve_soc": "Nachtreserve und untere Grenze für Speicherentnahme zum Tesla. Bei Erreichen wird die Entnahme gesperrt; der Speicher darf darüber hinaus laden.",
  "capacity_kwh": "Nutzbare Energie des Hausspeichers. Damit wird berechnet, wie viel bis zur Abendreserve fehlt.",
  "car_min_soc": "Eine unter der Tesla-Untergrenze gestartete Mindestladung läuft bis hierhin, bei Bedarf mit Netzstrom. Danach nur PV oder freigegebener Speicher; das Fahrzeuglimit gilt immer.",
  "car_low_soc": "Unter diesem Ladestand startet eine Mindestladung bis zum Tesla-Mindestziel, auch nachts und mit Netzstrom. Der Hausspeicher bleibt dabei geschützt. Muss unter dem Mindestziel liegen.",
  "storage_release_soc": "Oberhalb dieses Speicherstands wird zusätzlich zum PV-Laden Speicherenergie für den Tesla freigegeben. Die Freigabe endet an der Abendreserve. Muss mindestens so hoch wie die Abendreserve sein.",
  "phases": "Anzahl der beim Laden genutzten Phasen. 1 oder 3 wählen; der Wert muss zur tatsächlichen Ladung passen.",
  "max_amps": "Obergrenze des Ladestroms pro Phase. Bei 1 Phase entsprechen 16 A ungefähr 3,7 kW.",
  "normal_discharge_w": "Gemeinsame Entladegrenze für Haus und Tesla bei Speicherfreigabe sowie nachts für das Haus. An der Abendreserve wird die Entnahme zum Tesla auf 0 W gesperrt.",
  "max_charge_w": "Maximales PV-Leistungsbudget, das für die Speicherreserve zurückgehalten wird. Ändert nicht die Ladeleistungsgrenze am Wechselrichter.",
  "forecast_factor": "Anteil der PV-Restprognose, mit dem gerechnet wird. 0,85 bedeutet 85 %; kleinere Werte planen vorsichtiger.",
  "buffer_kwh": "Zusätzliche Energiemenge, die von der PV-Restprognose abgezogen wird, bevor Energie für das Auto eingeplant wird.",
  "margin_w": "Leistungsreserve, die nicht für das Auto freigegeben wird. Hilft, kurzfristigen Netzbezug bei schwankender Sonne zu reduzieren.",
  "minimum_house_w": "Mindestens angenommener Hausverbrauch für die verbleibenden Sonnenstunden. Höherer aktueller Verbrauch wird ebenfalls berücksichtigt.",
  "cloud_interval_s": "Kürzester Abstand zwischen Tesla-Befehlsrunden. 300 s sind 5 Minuten; größere Werte reagieren langsamer und senden seltener Befehle."
};


export class SolarPilotPanel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this.tab="overview";this.consumptionView="total";this.consumptionHistoryDate=null;this.status=null;this.busy=false;this.message="";this.draft=null;this._error="";this.solarHistory=[];this.pvExtraHistory={};this.historyLoaded=0;this.historyError="";}
  set hass(value){this._hass=value;if(!this.status && !this._loading)this.refresh();}
  set panel(value){this._panel=value;try{const saved=localStorage.getItem(`solar_pilot.consumption_view.${value.config.entry_id}`);if(["hours","total"].includes(saved))this.consumptionView=saved;}catch{}if(this._hass&&!this.status)this.refresh();}
  set narrow(value){this._narrow=value;}
  connectedCallback(){
    // HA can assign properties before asynchronous module dependencies finish.
    // Replay pre-upgrade values through the component setters.
    for(const key of ['hass','panel','narrow']){
      if(Object.prototype.hasOwnProperty.call(this,key)){
        const value=this[key];delete this[key];this[key]=value;
      }
    }
    this.render();this._timer=setInterval(()=>this.refresh(),10000);}
  disconnectedCallback(){clearInterval(this._timer);}
  async refresh(){
    if(!this._hass||!this._panel||this._loading)return;
    this._loading=true;
    try{this.status=await this._hass.callWS({type:"solar_pilot/status",entry_id:this._panel.config.entry_id});this.sunsetTime(dateKey(Date.now(),this._hass.config?.time_zone||'Europe/Berlin'),this._hass.config?.time_zone||'Europe/Berlin');this._error="";if(this.tab==="overview")await Promise.all([this.loadSolarHistory(),this.loadHistoricalPV(),this.loadDayWeather(),this.loadPVReferences()]);}
    catch(e){this._error=e.message||String(e);}
    finally{this._loading=false;if(!this.shadowRoot.activeElement?.matches("input,select"))this.render();}
  }
  async service(name,data={}){
    if(this.busy)return;this.busy=true;this.message="";this.render();
    try{await this._hass.callService("solar_pilot",name,{entry_id:this._panel.config.entry_id,...data});this.message="Änderung übernommen.";this.draft=null;}
    catch(e){this.message="Nicht übernommen: "+(e.message||String(e));}
    finally{this.busy=false;await this.refresh();this.render();}
  }
  get title(){return this.status?.decision?.reason||"Messwerte werden eingelesen";}
  liveEnergyCard(){
    const v=this._error?{}:liveEnergy(this.status,this._hass?.states),power=x=>x==null?'—':fmt(Math.abs(x)/1000,'kW',2);
    const icon=(name,cls='')=>`<span class="live-icon ${cls}"><ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon></span>`;
    const station=(name,value,label,cls='')=>`<div class="live-station">${icon(name,cls)}<strong class="live-value">${power(value)}</strong><span class="sub">${label}</span></div>`;
    const gridLabel=v.grid==null?'Netz':v.grid>10?'Einspeisung':v.grid< -10?'Netzbezug':'Netz · ausgeglichen';
    const gridArrow=v.grid==null||Math.abs(v.grid)<=10?'minus':v.grid>0?'arrow-right':'arrow-left';
    const carKey='solar_pilot.last_car_soc.'+(this.status?.entry_id||'default')+'.'+(this.status?.entities?.car_soc||'unknown');
    if(v.carSoc!=null){this._lastCarSoc=v.carSoc;try{localStorage.setItem(carKey,String(v.carSoc));}catch(e){/* Display cache is optional. */}}
    if(this._lastCarSoc==null){try{const saved=localStorage.getItem(carKey),value=saved===null?null:numeric(saved);if(value!==null&&value>=0&&value<=100)this._lastCarSoc=value;}catch(e){/* No cached value. */}}
    const carSoc=v.carSoc??this._lastCarSoc,carLast=v.carSoc==null||v.carSocStale;
    const batteryLabel=v.battery==null?'Akkuleistung unbekannt':v.battery>10?'Akku lädt':v.battery< -10?'Akku entlädt':'Akku ruht';
    return `<section class="card full live-energy-card" aria-label="Aktuelle Energieübersicht"><div class="card-title"><h2>Energie jetzt</h2></div><div class="live-energy-body"><div class="live-flow">${station('white-balance-sunny',v.pv,'PV gesamt','solar')}<ha-icon class="live-arrow" icon="mdi:${v.pv>10?'arrow-right':'minus'}" aria-hidden="true"></ha-icon>${station('home-lightning-bolt-outline',v.house,'Haus')}<ha-icon class="live-arrow" icon="mdi:${gridArrow}" aria-hidden="true"></ha-icon>${station('transmission-tower',v.grid,gridLabel,'grid-icon')}</div><div class="live-bottom"><div class="live-battery">${icon('battery-charging-outline','battery')}<div><strong>${fmt(v.soc,'%')}</strong><span class="sub">${batteryLabel}${v.battery==null?'':' · '+fmt(Math.abs(v.battery),'W')}</span>${v.soc==null?'':`<div class="live-soc" role="meter" aria-label="Akkustand" aria-valuenow="${v.soc}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v.soc}%"></span></div>`}</div></div><div class="live-ev">${icon('car-electric-outline')}<div><strong>${fmt(carSoc,'%')}${carSoc!=null&&carLast?'<small class="live-last">zuletzt</small>':''}</strong><span class="sub">${v.ev==null?'Tesla · Leistung unbekannt':(v.ev>10?'Tesla lädt':'Tesla pausiert')+' · '+fmt(v.ev,'W')}</span></div></div></div></div></section>`;
  }
  overview(){
    const t=this.status,s=t.snapshot||{},d=t.decision||{},c=t.settings;
    const soc=Math.min(100,Math.max(0,s.house_soc||0));
    const planned=d.target_amps==null?"—":fmt(d.target_amps,"A");
    const now=Date.now(),bounds=dayBounds(now,this._hass?.config?.time_zone||"Europe/Berlin");
    const curve=forecastPoints(this.solarSources().forecast?.attributes?.detailedForecast,bounds.start,bounds.end);
    const potential=storagePotential(s,c,curve,now),protection=batteryProtection(s,c,d,t.mode);
    const power=numeric(s.battery_charge_w),meterAge=numeric(s.meter_age),sampleTime=numeric(s.now);
    const batteryFresh=!this._error&&power!==null&&meterAge!==null&&sampleTime!==null&&meterAge>=0&&meterAge+Math.max(0,now/1000-sampleTime)<=c.meter_max_age_s;
    const batteryState=!batteryFresh?['unknown','battery-unknown','Status unbekannt']:power>10?['charging','battery-charging','Lädt']:power< -10?['discharging','battery-arrow-down','Entlädt']:['idle','battery','Ruht'];
    const batteryStatus=`<span class="storage-status ${batteryState[0]}" role="status" aria-label="Hausspeicher: ${esc(batteryState[2])}${batteryFresh?', '+fmt(Math.abs(power),'W'):''}"><ha-icon icon="mdi:${batteryState[1]}" aria-hidden="true"></ha-icon><span>${esc(batteryState[2])}${batteryFresh?' · '+fmt(Math.abs(power),'W'):''}</span></span>`;
    return `<div class="grid">
      ${this.liveEnergyCard()}
      ${this.budgetCard(s,c)}
      <div class="status-pair full"><section class="card hero decision-overview"><div class="split"><span class="eyebrow">Die aktuelle Entscheidung</span><span class="hero-label">${esc(MODES[t.mode])}</span></div><h2>${esc(this.title)}</h2><p>${t.mode==="observe"?"Die Empfehlungen unten sind eine Vorschau. Geräte werden nicht verändert.":t.mode==="paused"?"Die Regelung pausiert. Die zuletzt gesetzten Gerätewerte bleiben bestehen.":"Tesla-Untergrenze, PV-Überschuss und Speicherfreigabe bestimmen das Ladebudget."}</p><div class="metrics"><div class="metric"><strong>${planned}</strong><span>Tesla · Empfehlung</span><small>Eingestellt: ${fmt(s.car_current,"A")}</small></div><div class="metric"><strong>${fmt(d.discharge_w,"W")}</strong><span>Entladegrenze · Empfehlung</span><small>Eingestellt: ${fmt(s.current_discharge_w,"W")}</small></div><div class="metric"><strong>${fmt(s.forecast_kwh,"kWh",1)}</strong><span>PV · Restprognose</span></div></div><div class="live-values"><div class="live-heading">Messwerte jetzt</div><div class="energy"><div class="node"><span class="symbol">☀</span><b>${fmt(s.pv_w==null?null:s.pv_w/1000,"kW",2)}</b><span>PV-Leistung</span></div><div class="node"><span class="symbol">↔</span><b>${fmt(s.grid_export_w==null?null:Math.abs(s.grid_export_w)/1000,"kW",2)}</b><span>${s.grid_export_w==null?"Netz":s.grid_export_w>=0?"Einspeisung":"Netzbezug"}</span></div><div class="node"><span class="symbol">▣</span><b>${fmt(s.battery_charge_w==null?null:Math.abs(s.battery_charge_w),"W")}</b><span>${s.battery_charge_w==null?"Speicher":s.battery_charge_w>=0?"Speicher lädt":"Speicher entlädt"}</span></div><div class="node"><span class="symbol">ϟ</span><b>${fmt(s.wallbox_w==null?null:s.wallbox_w/1000,"kW",2)}</b><span>Wallbox</span></div></div><p class="note">Einspeisung und Batterieleistung werden gemeinsam betrachtet, damit Speicherentladung nicht als PV-Überschuss zählt.</p></div></section>
      <section class="card reserve-card"><div class="card-title"><h2>Reserve für den Abend</h2>${batteryStatus}</div><div class="storage">${this.storageDiagram(s,c)}<div><h3>${s.house_soc==null?"Ladestand unbekannt":s.house_soc>=c.reserve_soc?"Zielreserve erreicht":"Reserve wird aufgebaut"}</h3><span class="target">Mindestens ${fmt(c.reserve_soc,"%")} zum Sonnenuntergang</span><div class="bar" style="--soc:${soc};--target:${c.reserve_soc}" aria-label="${esc(`Speicher ${fmt(s.house_soc,"%")}; PV-Potenzial ${fmt(potential,"%")}`)}"><b class="potential" style="left:${soc}%;width:${Math.max(0,(potential??soc)-soc)}%"></b><span></span><i></i></div><span class="sub">Speicherentnahme für Tesla endet bei ${fmt(c.reserve_soc,"%")}.</span><div class="storage-zones-legend"><div><ha-icon icon="mdi:flash"></ha-icon><span><strong>Freigabe über ${fmt(c.storage_release_soc,"%")}</strong><small>Tesla darf auch Speicherenergie nutzen.</small></span></div><div><ha-icon icon="mdi:car-electric"></ha-icon><span><strong>Bis ${fmt(c.reserve_soc,"%")}</strong><small>Nach Freigabe weiterladen, bis die Nachtreserve erreicht ist.</small></span></div><div><ha-icon icon="mdi:home-outline"></ha-icon><span><strong>Nachtreserve schützen</strong><small>Darunter keine Speicherentnahme für Tesla; PV-Laden bleibt möglich.</small></span></div></div></div></div>${potential==null?'<p class="potential-note">PV-Ladepotenzial derzeit nicht berechenbar.</p>':`<p class="potential-note">Speicherprognose bis Abend: <strong>${fmt(potential,"%")}</strong> · bis zu +${fmt(Math.max(0,potential-soc),"Prozentpunkte")}<small>Schraffiert: mögliche Zusatzladung aus der P50-PV-Kurve mit Prognosefaktor, geschätzter Hauslast, Ladeverlusten und Leistungsgrenze; ohne weitere Autoladung. Der Energiepuffer wird nicht abgezogen. Keine Garantie.</small></p>`}<div class="split"><span class="sub">PV-Planungsbudget für Reserve</span><strong>${fmt(d.reserve_charge_w,"W")}</strong></div><p class="note">Rechenwert für die Verteilung vorhandener PV-Leistung, keine aktuelle Ladeleistung und keine Ladegrenze am Wechselrichter.</p>${t.charging_state?.storage_active?`<p class="note">Speicherfreigabe aktiv bis ${fmt(c.reserve_soc,"%")} Abendreserve; aktuelle Steuerfreigabe siehe Entscheidung.</p>`:""}${protection?`<div class="protection ${protection.kind}" role="status">▣ ${esc(protection.text)}</div>`:""}</section></div>

      ${this.vehicle(s,c)}
      ${this.solarChart(s,c)}
      ${this.dayForecast()}
      ${this.consumptionForecast()}
      <section class="card full"><div class="split"><div><h2>Du behältst die Kontrolle</h2><p class="note">Beobachten und Pause senden keine Befehle. Bei Pause bleiben die letzten Geräteeinstellungen bestehen.</p></div></div><div class="actions"><select class="select" id="mode" aria-label="Betriebsmodus" ${this.busy?"disabled":""}>${Object.entries(MODES).map(([k,v])=>`<option value="${k}" ${t.mode===k?"selected":""}>${esc(v)}</option>`).join("")}</select><button class="secondary" data-action="evaluate" ${this.busy?"disabled":""}>Jetzt neu berechnen</button>${t.mode==="observe"||t.mode==="paused"?'<button class="primary" data-action="activate">Steuerung aktivieren</button>':'<button class="secondary" data-action="pause">Regelung pausieren</button>'}</div><details class="mode-help"><summary>Was bedeuten die Betriebsmodi?</summary><dl><dt>Automatik</dt><dd>Unter ${fmt(c.car_low_soc,"%")} Tesla-SoC startet eine Mindestladung bis ${fmt(c.car_min_soc,"%")}, bei Bedarf mit Netzstrom. Der Hausspeicher bleibt dabei geschützt. Sonst lädt Tesla mit genügend PV-Überschuss oder nach Speicherfreigabe über ${fmt(c.storage_release_soc,"%")}. Eine ausgelöste Speicherfreigabe bleibt bis ${fmt(c.reserve_soc,"%")} erhalten. Danach nur PV; reicht sie nicht, pausiert die Ladung. Das Fahrzeuglimit gilt immer.</dd><dt>Speicher bevorzugen</dt><dd>Wie Automatik, aber solange der Hausspeicher unter ${fmt(c.reserve_soc,"%")} liegt, wird das volle eingestellte Speicher-Ladebudget für ihn reserviert. Eine gute PV-Prognose reduziert diese Reservierung hier nicht. Nur darüber hinaus verfügbare PV-Leistung kann zum Tesla gehen. Die Mindestladung unter der Tesla-Untergrenze bleibt erlaubt.</dd><dt>Nur Tesla-Mindeststand</dt><dd>Es gelten dieselben Quellen und Freigaben wie in Automatik; bei ${fmt(c.car_min_soc,"%")} Tesla-SoC endet die Ladung. Zwischen ${fmt(c.car_low_soc,"%")} und ${fmt(c.car_min_soc,"%")} wird ohne bereits ausgelöste Mindestladung nur mit PV oder freigegebenem Speicher geladen.</dd><dt>Beobachten</dt><dd>Berechnet und zeigt Empfehlungen, sendet aber keine Gerätebefehle. Laufende Ladungen und zuletzt gesetzte Gerätewerte werden dadurch nicht verändert.</dd><dt>Pausiert</dt><dd>Strommanager sendet keine Gerätebefehle. Eine bereits laufende Tesla-Ladung wird durch diesen Modus nicht gestoppt; zuletzt gesetzte Lade- und Entladegrenzen bleiben bestehen. Bei Bedarf die Ladung am Fahrzeug oder an der Wallbox stoppen.</dd></dl><p class="note">Aktive Modi brauchen gültige Mess- und Fahrzeugdaten. „Jetzt neu berechnen“ wertet die Daten erneut aus; in aktiven Modi können daraus Gerätebefehle folgen. Aus Beobachten oder Pause wird die Steuerung über „Steuerung aktivieren“ wieder freigegeben.</p></details><p class="note">${fmt(c.reserve_soc,"%")} Abendreserve ist ein Ziel mit verfügbarer Sonne, keine Garantie. Die Tesla-Anbindung arbeitet über die Cloud; kurze Netzbezüge bei Wetterwechseln sind möglich.</p></section>
    </div>`;
  }
  budgetCard(s,c){
    const now=Date.now(),zone=this._hass?.config?.time_zone||'Europe/Berlin',bounds=dayBounds(now,zone),source=this.solarSources(),ledger=this.status?.day_budget;
    const points=forecastPoints(source.forecast?.attributes?.detailedForecast,bounds.start,bounds.end),remaining=s.daylight===false?0:remainingPV(points,now,bounds.end);
    const b=remaining==null?null:dayAllocation(ledger,s,c,remaining,c.budget_extra_kwh??2.5,dateKey(now,zone),now/1000);
    const labels=[['storage','Speicher bis '+fmt(c.reserve_soc,'%')],['house','Hausbedarf'],['tesla','Tesla'],['buffer','Puffer / Einspeisung']];
    const sum=values=>values?Object.values(values).reduce((v,x)=>v+x,0):null;
    const time=ledger?.updated?new Date(ledger.updated*1000).toLocaleTimeString('de-DE',{timeZone:zone,hour:'2-digit',minute:'2-digit'}):'—';
    return `<section class="card full budget-card"><div class="card-title"><h2>PV-Energie heute verteilen</h2><span class="sub">Tagesbilanz · ${esc(time)}</span></div><div class="budget-context"><span>PV heute · Ist + Rest <strong>${fmt(b?.total,'kWh',2)}</strong></span><span>Bereits bilanziert <strong>${fmt(b?sum(b.actual):null,'kWh',2)}</strong></span><span>Noch erwartet · P50 <strong>${fmt(remaining,'kWh',2)}</strong></span></div>${b?`<div class="budget-stack day-budget-stack" role="img" aria-label="${esc(labels.map(([key,label])=>label+': bisher '+fmt(b.actual[key],'kWh',2)+', noch eingeplant '+fmt(b.future[key],'kWh',2)).join('; '))}">${labels.map(([key,label])=>`<span class="budget-category" style="width:${b.total?100*(b.actual[key]+b.future[key])/b.total:0}%">${['actual','future'].map(part=>`<i class="budget-${key} ${part==='future'?'budget-hatched':''}" style="width:${b.actual[key]+b.future[key]?100*b[part][key]/(b.actual[key]+b.future[key]):0}%" title="${esc(label)} · ${part==='actual'?'bisher bilanziert':'noch eingeplant'}: ${fmt(b[part][key],'kWh',2)}"></i>`).join('')}</span>`).join('')}</div><div class="budget-pattern-legend"><span><i class="budget-storage"></i>Bisher bilanziert</span><span><i class="budget-storage budget-hatched"></i>Noch verfügbar / eingeplant</span></div><div class="budget-category-table"><div class="budget-table-head"><span>Kategorie</span><span>Bisher</span><span>Noch</span><span>Gesamt</span></div>${labels.map(([key,label])=>`<div><span><i class="budget-${key}"></i>${esc(label)}</span><span>${fmt(b.actual[key],'',2)}</span><span>${fmt(b.future[key],'',2)}</span><strong>${fmt(b.actual[key]+b.future[key],'kWh',2)}</strong></div>`).join('')}</div><p class="budget-detail">Haus-Restbedarf: ${fmt(b.plan.houseNeed,'kWh',2)} · Speicher bis Ziel: noch ${fmt(b.plan.storageNeed,'kWh',2)} inkl. Ladeverlusten.${b.plan.deficit>.005?` <strong>Noch nicht mit PV gedeckt: ${fmt(b.plan.deficit,'kWh',2)}.</strong>`:''}</p>`:'<p class="note">Tagesbilanz oder vollständige Restprognose noch nicht verfügbar. Es werden keine unbekannten Ist-Werte als Nullverbrauch dargestellt.</p>'}${ledger?.missing_minutes?`<p class="note weather-warning" role="status">Tageshistorie unvollständig: ${fmt(ledger.missing_minutes,'Minuten')} ohne belastbare Zuordnung. Bisher-Werte sind nur die erfassten Anteile.</p>`:''}${ledger?.error?`<p class="note weather-warning">${esc(ledger.error)}</p>`:''}<details class="budget-help"><summary>Berechnung und Datenquellen</summary><p class="note">Ein gemeinsamer Balken, eine gemeinsame kWh-Skala: je Kategorie Vollfläche für die bisher bilanzierte PV-Energie und Schraffur für die noch eingeplante PV-Energie. Netzstrom wird nicht als PV-Verbrauch gezählt. Speicher zeigt die heutige PV-Ladung; die eingestellte Reserve begrenzt den zusätzlich eingeplanten Bedarf, nicht bereits erfolgte Ladungen.<br>Die PV-Anteile werden aus der HA-Leistungshistorie im Minutenraster bilanziert: PV-Eingangsleistung mit 5 % Wechselrichterverlusten, Netzleistung, Speicherleistung und Wallbox. Bei gemischter Versorgung wird PV proportional auf die zeitgleichen Verbraucher verteilt. Das ist eine nachvollziehbare Bilanzschätzung, keine direkte Messung der Stromherkunft.<br>Die Tagesbilanz wird alle fünf Minuten in HA aktualisiert, dauerhaft gespeichert und bei Tageswechsel neu begonnen. Eigene Sensoren stellen die Tagesanteile bereit. Fehlende Intervalle werden nicht erfunden. „Puffer / Einspeisung“ enthält bisher nicht den Verbrauchern zugeordnete PV und künftige Prognosereserven.<br>Als aktuelle Tageserwartung gilt bereits bilanzierte PV plus verbleibende P50-Prognose; eine überholte frühere Tagesprognose wird nicht als weiterhin verfügbarer Strom ausgegeben. Zusatzbedarf pro PV-Tag: ${fmt(c.budget_extra_kwh??2.5,'kWh',1)}; davon anhand der Hausbilanz bereits verbraucht ${fmt(b?.extraUsed,'kWh',2)}. Einmal verbrauchter Zusatzbedarf wird nicht erneut eingeplant. Die Anzeige steuert keine Geräte; Ladestart und Leistung richten sich weiterhin nach der bestehenden Regelung.</p></details></section>`;
  }
  solarSources(){
    const e=this.status?.entities||{},states=this._hass?.states||{},display=this.status?.source_entities?.display||{};
    const forecastId=display.forecast_day_1||e.forecast_day||(e.forecast||"").replace(/prognose_verbleibende_leistung_heute$/,"prognose_heute").replace(/forecast_remaining_today$/,"forecast_today");
    const dailyId=display.pv_daily||e.pv_daily||(e.pv_power||"").replace(/eingangsleistung$/,"tagesertrag");
    return {roofDaily:states[display.roof_daily||'sensor.sum_dach_tagesertrag'],forecastIds:Array.from({length:7},(_,i)=>display['forecast_day_'+(i+1)]||pvDayIds(forecastId)[i]).filter(Boolean),forecastId,dailyId,forecast:states[forecastId],daily:states[dailyId],power:states[e.pv_power],powerId:e.pv_power};
  }
  async loadDayWeather(){
    if(this.demo||this._weatherLoading)return;
    const zone=this._hass?.config?.time_zone||"Europe/Berlin",now=Date.now(),key="solar-pilot-weather-dresden-v2:"+zone;
    if(!this.dayWeather){try{const cached=JSON.parse(localStorage.getItem(key));if(cached?.data?.daily&&cached.fetched<=now&&now-cached.fetched<21600000)this.dayWeather=cached;}catch(e){/* Storage is optional. */}}
    const today=dateKey(now,zone);
    if(this.dayWeather?.data?.daily?.time?.includes(today)&&now-this.dayWeather.fetched<3600000||now-(this.weatherAttempt||0)<900000)return;
    this._weatherLoading=true;this.weatherAttempt=now;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
    try{
      // Public city coordinates, never HA home coordinates or vehicle location.
      const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=13.74&daily=weather_code,sunshine_duration,daylight_duration,precipitation_sum&timezone=${encodeURIComponent(zone)}&forecast_days=7`,{signal:abort.signal,credentials:"omit",referrerPolicy:"no-referrer"});
      if(!response.ok)throw new Error("Wetterdienst nicht erreichbar");
      const data=await response.json();if(!weatherDays(data)[today])throw new Error("Wetterdaten fehlen");
      this.dayWeather={data,fetched:Date.now()};this.weatherError="";
      try{localStorage.setItem(key,JSON.stringify(this.dayWeather));}catch(e){/* Display also works without browser storage. */}
    }catch(e){this.weatherError="Wetter konnte nicht aktualisiert werden. Neuer Versuch frühestens in 15 Minuten.";}
    finally{clearTimeout(timeout);this._weatherLoading=false;}
  }
  async loadPVReferences(){
    const source=this.solarSources().dailyId,zone=this._hass?.config?.time_zone||'Europe/Berlin',key=source+':'+zone,now=Date.now();
    if(this.demo||!source||!this._hass?.callWS||this._referenceLoading||this.referenceKey===key&&now-(this.referenceAttempt||0)<86400000)return;
    this._referenceLoading=true;this.referenceKey=key;this.referenceAttempt=now;this.referenceError='';
    try{
      const result=await this._hass.callWS({type:'recorder/statistics_during_period',start_time:new Date(now-730*86400000).toISOString(),end_time:new Date(now).toISOString(),statistic_ids:[source],period:'day',types:['change'],units:{energy:'kWh'}});
      this.pvReferences=monthlyReferences(result[source],now,zone);
    }catch(e){this.pvReferences=monthlyReferences([],now,zone);this.referenceError='Ertragshistorie nicht verfügbar; vorläufige Monatsreferenzen.';}
    finally{this._referenceLoading=false;}
  }
  dayForecast(){
    const zone=this._hass?.config?.time_zone||"Europe/Berlin",now=Date.now(),days=nextDays(now,zone),pv=pvDays(this._hass?.states||{},this.solarSources().forecastId,zone,this.solarSources().forecastIds);
    const age=now-(this.dayWeather?.fetched||0),weather=age<21600000?weatherDays(this.dayWeather?.data):{};
    const fetched=this.dayWeather?.fetched?new Date(this.dayWeather.fetched).toLocaleTimeString("de-DE",{timeZone:zone,hour:"2-digit",minute:"2-digit"}):"—";
    const refs=this.referenceKey===(this.solarSources().dailyId+':'+zone)?this.pvReferences||monthlyReferences([]):monthlyReferences([]),roofActual=dailyConsumption(this.solarSources().roofDaily,now,zone),scale=referenceScale(days,pv,refs,roofActual);
    const dailyHouse=this.status?.consumption_forecast?.daily_house,settings=this.status?.settings||{},snapshot=this.status?.snapshot||{};
    const houseFresh=dailyHouse?.updated!=null&&now/1000-dailyHouse.updated>=0&&now/1000-dailyHouse.updated<=900;
    const reserveFull=numeric(settings.capacity_kwh)!==null&&numeric(settings.reserve_soc)!==null&&settings.efficiency>0?settings.capacity_kwh*settings.reserve_soc/100/settings.efficiency:null;
    const reserveNow=numeric(snapshot.house_soc)!==null&&snapshot.house_soc_age>=0&&snapshot.house_soc_age+Math.max(0,now/1000-snapshot.now)<=settings.meter_max_age_s?Math.max(0,settings.reserve_soc-snapshot.house_soc)/100*settings.capacity_kwh/settings.efficiency:null;
    const labels=days.map((key,i)=>{const date=new Date(key+"T12:00:00Z");return {label:i===0?"Heute":i===1?"Morgen":date.toLocaleDateString("de-DE",{timeZone:"UTC",weekday:"long"}),date:date.toLocaleDateString("de-DE",{timeZone:"UTC",day:"2-digit",month:"2-digit"})};});
    const row=(label,values,cls='')=>`<tr class="${cls}"><th scope="row">${label}</th>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
    return `<section class="card full days-card"><div class="card-title"><h2>PV-Ausblick · 7 Tage</h2><span class="sub">Dresden</span></div><div class="days-table-scroll"><table class="days-table" aria-label="PV- und Wetterprognose für sieben Tage"><thead><tr><th scope="col">Tagessummen</th>${labels.map(d=>`<th scope="col">${esc(d.label)}<small>${esc(d.date)}</small></th>`).join('')}</tr></thead><tbody>
      <tr class="yield-row"><th scope="row"><div class="yield-axis" aria-label="Gemeinsame Skala in Kilowattstunden"><span class="yield-unit">kWh</span>${[0,.25,.5,.75,1].map(f=>`<span style="bottom:${f*100}%">${fmt(scale*f,'',1)}</span>`).join('')}</div></th>${days.map((key,i)=>{
        const value=pv[key]?.kwh,low=pv[key]?.low,ref=refs[Number(key.slice(5,7))-1],month=new Date(key+'T12:00:00Z').toLocaleDateString('de-DE',{month:'long',timeZone:'UTC'});
        const house=houseFresh&&dailyHouse.days?.[key]?.available?dailyHouse.days[key].kwh:null,storage=i===0?reserveNow:reserveFull,assessment=yieldAssessment(value,house,storage);
        const height=v=>Math.max(0,100*(v||0)/scale),validLow=low!=null&&value!=null&&low<=value,close=validLow&&(value-low)/scale*210<32;
        return `<td><div class="yield-day ${assessment.kind}"><div class="yield-plot" role="img" aria-label="${esc(labels[i].label)}: vorsichtig ${fmt(low,'kWh',1)}, erwartet ${fmt(value,'kWh',1)}; Monatsreferenz ${fmt(ref.kwh,'kWh',1)} gleich 100 Prozent">${[0,.25,.5,.75,1].map(f=>`<div class="yield-grid" style="bottom:${f*100}%"></div>`).join('')}<div class="yield-reference" style="bottom:${height(ref.kwh)}%"><small>100 %</small></div><div class="yield-column">${value!=null?`<div class="yield-solid" style="height:${height(validLow?low:0)}%"></div><div class="yield-range" style="bottom:${height(validLow?low:0)}%;height:${height(value-(validLow?low:0))}%"></div>`:''}</div>${i===0&&roofActual!==null?`<span class="yield-actual" style="bottom:${height(roofActual)}%" aria-label="Aktueller Dach-Ertrag ${fmt(roofActual,'kWh',1)}"><i></i><b>${fmt(roofActual,'',1)}</b></span>`:''}<span class="yield-top" style="bottom:calc(${height(value)}% + 5px)">${close?`${fmt(low,'',1)}–`:''}${fmt(value,'',1)}</span>${validLow&&!close?`<span class="yield-low" style="bottom:max(2px,calc(${height(low)}% - 7px))">${fmt(low,'',1)}</span>`:''}</div><strong class="yield-percentage">${value!=null?fmt(value/ref.kwh*100,'%',0):'—'}</strong><span class="yield-assessment">${{poor:'Knapp',fair:'Reserve offen',good:'Überschuss',unknown:'Bedarf unbekannt'}[assessment.kind]}</span></div></td>`;

      }).join('')}</tr>
      ${row('Wetter',days.map(key=>{const [condition,icon]=weatherLabel(weather[key]?.code);return `<span class="day-condition"><ha-icon icon="mdi:${icon}" aria-hidden="true"></ha-icon><span>${esc(condition)}</span></span>`;}))}
      ${row('Sonnenstunden',days.map(key=>duration(weather[key]?.sun)))}
      ${row('Tageslänge',days.map(key=>duration(weather[key]?.day)))}
      ${row('Niederschlag · mm',days.map(key=>fmt(weather[key]?.rain,'',1)))}
    </tbody></table></div><p class="note yield-legend"><span>■ Vorsichtig</span><span>▨ Erwartet</span><span class="yield-actual-legend">🔴 Ist heute</span></p>${this.referenceError?`<p class="note">${esc(this.referenceError)}</p>`:''}${this.weatherError?`<p class="note weather-warning" role="status">${esc(this.weatherError)} ${age<21600000&&this.dayWeather?'Gespeicherter Wetterstand.':'Wetter derzeit nicht verfügbar.'}</p>`:''}<p class="days-source">PV: Solcast · Wetter: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · ${esc(fetched)}${age>=3600000&&this.dayWeather?' · Wetterstand älter als 1 Stunde':''}</p><details class="days-help"><summary>Angaben zur Prognose</summary><p class="note">${days.map(key=>{const r=refs[Number(key.slice(5,7))-1];return `${key}: 100 % = ${fmt(r.kwh,'kWh',1)} (${r.source==='p95'?'P95':'vorläufig'}, ${r.days} Tage)`;}).join('; ')}. Roter Punkt nur bei Heute: aktueller Dach-Tagesertrag aus der zugeordneten Entität, auf derselben kWh-Skala. Fehlende, unbekannte oder nicht vom heutigen Tag stammende Werte werden nicht eingezeichnet; echte Nullwerte bleiben sichtbar. Säulen: kräftig bis P10 (vorsichtig), schraffiert bis P50 (erwartet). P50 ist keine Obergrenze. Die 100-%-Marke ist das 95. Perzentil der Tageserträge des jeweiligen Monats aus maximal zwei Jahren HA-Langzeitstatistik des WR-Tageszählers, mindestens 20 abgeschlossene Tage mit gültiger Statistik. Darüber hinausgehende Erträge werden nicht abgeschnitten. Bei Monatswechsel gilt pro Säule deren Monatsreferenz, bei gemeinsamer kWh-Skala. Bis ausreichend Historie vorliegt: ausdrücklich vorläufige Monatswerte (Januar bis Dezember: 8, 12, 20, 28, 34, 36, 36, 32, 26, 20, 12, 8 kWh), keine Anlagen-Maxima. Farben: P50 unter gelerntem Haus-Tagesbedarf = knapp; Haus gedeckt, Reserve offen = mittel; Haus plus Reserve gedeckt = gut. Für heute zählt die noch fehlende Speicherladung, für Folgetage vorsichtig der Aufbau der ganzen Zielreserve aus leerem Speicher, jeweils inklusive Ladeverlusten. Zukünftige Tesla-Ladungen sind zusätzlich. Fehlende oder veraltete Bedarfsdaten bleiben neutral. Die Tagesbedarfsprognose ist nur eine Orientierung, keine Aussage über die zeitliche Deckung oder eine Änderung der Steuerung. Alle Werte sind Tagessummen, auch heute. Sonnenstunden = wetterabhängiger Sonnenschein; Tageslänge = astronomische Dauer des Tageslichts. Wetter für Dresden (Stadtgebiet), beim geöffneten Panel höchstens stündlich aktualisiert. Fehlende Werte erscheinen als —.</p></details></section>`;
  }
  auxiliarySolarSources(){
    const mapping=this.status?.source_entities?.learning||{},states=this._hass?.states||{};
    return ['garage','shed'].map(key=>({id:mapping[key],unit:states[mapping[key]]?.attributes?.unit_of_measurement,history:this.pvExtraHistory?.[mapping[key]]||[]}));
  }
  async loadSolarHistory(){
    if(!this._hass?.callApi||this._historyLoading||this.demo)return;
    const tz=this._hass.config?.time_zone||"Europe/Berlin",bounds=dayBounds(Date.now(),tz),id=this.solarSources().powerId;
    const ids=[...new Set([id,...this.auxiliarySolarSources().map(s=>s.id)].filter(Boolean))],sourceKey=ids.join(',');
    if(!id||this.historyDay===bounds.key&&this.historySources===sourceKey&&Date.now()-this.historyLoaded<300000)return;
    this._historyLoading=true;
    try{
      const rows=await this._hass.callApi("GET",`history/period/${encodeURIComponent(new Date(Math.min(bounds.start,Date.now()-12*3600*1000)).toISOString())}?filter_entity_id=${encodeURIComponent(sourceKey)}&end_time=${encodeURIComponent(new Date().toISOString())}&minimal_response&no_attributes&significant_changes_only=0`);
      const grouped=new Map((Array.isArray(rows)?rows:[]).filter(Array.isArray).map(group=>[group.find(row=>row.entity_id)?.entity_id,group]));
      this.solarHistory=grouped.get(id)||[];
      this.pvExtraHistory=Object.fromEntries(ids.filter(key=>key!==id).map(key=>[key,grouped.get(key)||[]]));this.historyError="";
    }catch(e){this.solarHistory=[];this.pvExtraHistory={};this.historyError="PV-Verlauf konnte nicht aus HA geladen werden.";}
    finally{this.historyDay=bounds.key;this.historySources=sourceKey;this.historyLoaded=Date.now();this._historyLoading=false;}
  }
  async loadHistoricalPV(){
    const day=this.status?.consumption_forecast?.history_days?.find(d=>d.date===this.consumptionHistoryDate);
    if(!day||!this._hass?.callApi)return;
    const source=this.solarSources(),channels=[{id:source.powerId,unit:source.power?.attributes?.unit_of_measurement},...this.auxiliarySolarSources()];
    const key=day.date+':'+channels.map(s=>s.id).join(',');
    this._historicalPV??=new Map();this._historicalPVLoading??=new Set();
    if(this._historicalPV.has(key)||this._historicalPVLoading.has(key))return;
    this._historicalPVLoading.add(key);
    try{
      const ids=channels.map(s=>s.id).filter(Boolean).join(',');
      const rows=await this._hass.callApi('GET',`history/period/${encodeURIComponent(new Date(day.day_start*1000).toISOString())}?filter_entity_id=${encodeURIComponent(ids)}&end_time=${encodeURIComponent(new Date(day.day_end*1000).toISOString())}&minimal_response&no_attributes&significant_changes_only=0`);
      const grouped=new Map(rows.map(group=>[group.find(row=>row.entity_id)?.entity_id,group]));
      this._historicalPV.set(key,channels.map(s=>({...s,history:grouped.get(s.id)||[]})));
      if(this._historicalPV.size>7)this._historicalPV.delete(this._historicalPV.keys().next().value);
    }catch(e){/* Keep missing history as a gap; a later refresh retries. */}
    finally{this._historicalPVLoading.delete(key);if(this.consumptionHistoryDate===day.date)this.render();}
  }
  historicalPVOverlay(day){
    const ids=[this.solarSources().powerId,...this.auxiliarySolarSources().map(s=>s.id)],key=day.date+':'+ids.join(',');
    const channels=this._historicalPV?.get(key);
    if(!channels)return {actual:[]};
    return pvOverlay(channels[0].history,channels[0].unit,[],day.day_start,day.day_end,day.day_end-.001,channels.slice(1));
  }
  solarChart(s,c){
    const tz=this._hass?.config?.time_zone||"Europe/Berlin",now=Date.now(),bounds=dayBounds(now,tz),source=this.solarSources();
    const rows=forecastPoints(source.forecast?.attributes?.detailedForecast,bounds.start,bounds.end);
    const points=rows.filter(p=>p.p>0||p.low>0),history=this.historyDay===bounds.key?this.solarHistory:[];
    const actual=actualSegments(history,bounds.start,now,source.power?.attributes?.unit_of_measurement);
    const attrs=source.forecast?.attributes||{},total=numeric(attrs.estimate),p10=numeric(attrs.estimate10);
    const daily=dailyConsumption(source.roofDaily,now,tz);
    const rest=rows.length?rows.reduce((sum,p,i)=>sum+p.p*Math.max(0,Math.min(bounds.end,rows[i+1]?.t??p.t+1800000)-Math.max(now,p.t))/3600000,0):null;
    const metrics=`<div class="forecast-metrics">${[[daily,"Dach-Ertrag heute"],[total,"Prognose P50"],[p10,"Vorsichtig P10"],[rest,"Rest P50"]].map(([v,label])=>`<div><strong>${fmt(v,"kWh",1)}</strong><span>${label}</span></div>`).join("")}</div>`;
    if(!rows.length)return `<section class="card full"><div class="card-title"><h2>PV-Prognose heute</h2><span class="sub">Solcast</span></div>${metrics}<p class="note">Für diese Zuordnung ist keine gültige Solcast-Tageskurve verfügbar. Die Restprognose für die Regelung bleibt davon unabhängig.</p></section>`;
    const start=Math.max(bounds.start,(points[0]?.t??bounds.start)-3600000),end=Math.min(bounds.end,(points.at(-1)?.t??bounds.end-3600000)+5400000);
    const max=Math.max(1,...rows.map(p=>p.p),...actual.flatMap(seg=>seg.map(p=>p.p)))*1.12;
    const x=t=>64+(t-start)/(end-start)*860,y=v=>260-Math.min(max,v)/max*220;
    const visible=rows.filter(p=>p.t>=start&&p.t<=end),path=(series,key='p')=>series.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const area=key=>{const a=visible.filter(p=>p[key]!=null);return a.length?`${path(a,key)} L${x(a.at(-1).t).toFixed(1)},260 L${x(a[0].t).toFixed(1)},260 Z`:'';};
    const time=t=>new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(t);
    const ticks=Array.from({length:6},(_,i)=>max*i/5).map(v=>`<line x1="64" x2="924" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="52" y="${y(v)+4}" text-anchor="end">${fmt(v,'',1)}</text>`).join('');
    const hours=[];for(let t=start;t<=end;t+=2*3600000)hours.push(`<text x="${x(t)}" y="284" text-anchor="middle">${time(t)}</text>`);
    const current=now>=start&&now<=end?`<line x1="${x(now)}" x2="${x(now)}" y1="32" y2="260" class="chart-now"/><text x="${Math.min(890,x(now)+5)}" y="26">Jetzt</text>`:'';
    const measured=actual.map(seg=>seg.filter(p=>p.t>=start&&p.t<=end)).filter(seg=>seg.length);
    return `<section class="card full forecast-card"><div class="card-title"><h2>PV-Prognose heute</h2><span class="sub">Solcast · ${time(now)}</span></div>${metrics}<div class="chart-scroll"><svg class="solar-chart" viewBox="0 0 960 300" role="img" aria-label="PV-Leistung heute: gemessener Verlauf und Solcast-Prognosen P50 und P10, in Kilowatt"><text x="20" y="20">kW</text>${ticks}<path d="${area('p')}" class="forecast-area"/><path d="${area('low')}" class="forecast-low"/>${measured.map(seg=>`<path d="${path(seg)}" class="actual-line"/>${seg.length===1?`<circle cx="${x(seg[0].t)}" cy="${y(seg[0].p)}" r="2.5" class="actual-dot"/>`:''}`).join('')}${current}${hours.join('')}${visible.map(p=>`<circle cx="${x(p.t)}" cy="${y(p.p)}" r="5" fill="transparent"><title>${esc(time(p.t))} · P50 ${fmt(p.p,'kW',2)} · P10 ${fmt(p.low,'kW',2)}</title></circle>`).join('')}</svg></div><div class="chart-legend"><span><i class="legend-actual"></i>PV-Ist (Eingang) · ${fmt(s.pv_w==null?null:s.pv_w/1000,'kW',2)}</span><span><i class="legend-forecast"></i>Prognose P50</span><span><i class="legend-low"></i>Vorsichtig P10</span></div><p class="note">${this.historyError||(!measured.length?'Kein gespeicherter PV-Verlauf für heute verfügbar. ':'')}Ist-Verlauf aus HA, maximal alle 5 Minuten nachgeladen. Datenlücken werden nicht verbunden. Die Speicherregelung nutzt die zugeordnete Restprognose mit zusätzlichen Puffern; das schraffierte Speicherpotenzial berücksichtigt keine weitere Autoladung.</p></section>`;
  }
  sunsetTime(day,zone){
    const id=this.status?.entities?.sun||'sun.sun',sun=this._hass?.states?.[id],key=`solar_pilot.sunsets.${id}.${zone}`;
    if(!this._sunsets||this._sunsetKey!==key){this._sunsetKey=key;try{this._sunsets=JSON.parse(localStorage.getItem(key))||{};}catch{this._sunsets={};}}
    const next=Date.parse(sun?.attributes?.next_setting)/1000;
    if(['above_horizon','below_horizon'].includes(sun?.state)&&!sun.attributes?.restored&&Number.isFinite(next)){
      const date=dateKey(next*1000,zone);
      if(this._sunsets[date]!==next){this._sunsets[date]=next;this._sunsets=Object.fromEntries(Object.entries(this._sunsets).sort().slice(-45));try{localStorage.setItem(key,JSON.stringify(this._sunsets));}catch{}}
    }
    const value=this._sunsets[day];return Number.isFinite(value)&&dateKey(value*1000,zone)===day?value:null;
  }
  consumptionBarChart(b,zone){return consumptionBarChart(this,b,zone);}

  consumptionTotalBar(b){return consumptionTotalBar(this,b);}

  consumptionHistoryChart(day,zone){return consumptionHistoryChart(this,day,zone);}

  consumptionHistoryTotal(day){return consumptionHistoryTotal(this,day);}

  consumptionForecast(){
    const f=this.status?.consumption_forecast||{},zone=this._hass?.config?.time_zone||'Europe/Berlin',current=consumptionBars(f),days=f.history_days||[];
    const totalToday=dailyConsumption(this._hass?.states?.[this.status?.source_entities?.display?.total_consumption||'sensor.real_tagesverbrauch'],Date.now(),zone);
    const selected=days.find(day=>day.date===this.consumptionHistoryDate),historic=selected&&historicalConsumptionBars(selected),view=this.consumptionView==='hours'?'hours':'total';
    const dateLabel=selected?new Intl.DateTimeFormat('de-DE',{timeZone:zone,weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(selected.day_start*1000)):'Heute';
    const selectedIndex=selected?days.indexOf(selected):-1,canOlder=selected?selectedIndex<days.length-1:days.length>0,canNewer=!!selected;
    const metrics=selected?[[historic?.actualTotal,'Ist · vergleichbare Stunden'],[historic?.predictedTotal,'Damals prognostiziert'],[historic?.error,'Abweichung Ist − Prognose']]:[[totalToday,'Bisher verbraucht · Haus + Tesla'],[current?.remaining,'Haus-Restbedarf bis Mitternacht'],[totalToday!==null&&current?.remaining!=null?totalToday+current.remaining:null,'Bisher gesamt + Haus-Restprognose']];
    const totalView=current&&totalToday!==null?{...current,measured:totalToday,total:current.remaining===null?null:totalToday+current.remaining,complete:false,includesTesla:true}:null;
    const content=selected?(view==='hours'?this.consumptionHistoryChart(selected,zone):this.consumptionHistoryTotal(selected)):(view==='total'?(totalView?this.consumptionTotalBar(totalView):'<p class="note">Der zugeordnete heutige Gesamtverbrauch ist nicht verfügbar.</p>'):(current?this.consumptionBarChart(rollingConsumptionBars(f)??current,zone):'<p class="note">Der Stundenverlauf wird geladen.</p>'));
    const legend=selected?'<span><i class="consumption-done"></i>Istverbrauch</span><span><i class="consumption-plan"></i>Damals prognostiziert</span>'+ (view==='hours'?'<span><i class="pv-legend-line"></i>PV-Ist · gesamt</span>':''):`<span><i class="consumption-done"></i>Gemessen / bilanziert</span><span><i class="consumption-plan"></i>Prognose</span>${current?.missing?'<span>? Messlücke</span>':''}${view==='hours'?'<span><i class="pv-legend-line"></i>PV-Ist · gesamt</span><span><i class="pv-legend-line forecast"></i>PV-Prognose · Hauptanlage</span><span><i class="battery-legend-line"></i>Akkustand · Prognose</span><span><i class="consumption-done"></i>Akku-Abdeckung</span><span><i style="background:#df6767"></i>Deckungslücke</span>':''}`;
    const nav=`<div class="consumption-history-nav" role="group" aria-label="Verbrauchsprognose nach Tag"><button type="button" data-consumption-history="older" ${canOlder?'':'disabled'} aria-label="Älteren Vergleichstag anzeigen">←</button><strong>${esc(dateLabel)}</strong><button type="button" data-consumption-history="newer" ${canNewer?'':'disabled'} aria-label="Neueren Vergleichstag anzeigen">→</button>${selected?'<button type="button" class="history-current" data-consumption-history="today">Heute</button>':''}</div>`;
    return `<section class="card full consumption-forecast"><div class="card-title"><h2>Verbrauch · Haus + Tesla</h2><span class="sub">${selected?'Rückschau':f.importing?'Historie wird eingelesen':'Parallelvergleich'}</span></div><div class="consumption-toolbar"><div class="consumption-switch" role="group" aria-label="Darstellung des Hausverbrauchs">${[['hours','Tagesverlauf'],['total','Tagesbilanz']].map(([key,label])=>`<button type="button" data-consumption-view="${key}" aria-pressed="${view===key}">${label}</button>`).join('')}</div>${nav}</div><div class="forecast-metrics consumption-metrics">${metrics.map(([value,label])=>`<div><strong>${fmt(value,'kWh',1)}</strong><span>${label}</span></div>`).join('')}</div><div class="consumption-visual">${content}</div><div class="consumption-legend">${legend}</div></section>`;

  }
  storageDiagram(s,c){
    const reserve=Math.min(100,Math.max(0,c.reserve_soc)),release=Math.min(100,Math.max(reserve,c.storage_release_soc));
    const soc=numeric(s.house_soc),age=numeric(s.house_soc_age),now=numeric(s.now);
    const fresh=!this._error&&soc!==null&&age!==null&&now!==null&&age+Math.max(0,Date.now()/1000-now)<=c.meter_max_age_s;
    const y=v=>20+(100-v)*2.2,marker=y(Math.min(100,Math.max(0,soc??0)));
    const homeY=y(reserve/2),carY=y((reserve+release)/2),flashY=y((release+100)/2);
    const active=this.status.charging_state?.storage_active;
    return `<div class="storage-diagram"><svg viewBox="0 0 230 260" role="img" aria-label="${esc(`Hausspeicher ${fmt(soc,'%')}${fresh?'':' · veraltet oder unbekannt'}. Speicherfreigabe oberhalb ${fmt(release,'%')}, Entnahme zum Tesla bis Nachtreserve ${fmt(reserve,'%')}.`)}"><defs><clipPath id="storage-body"><rect x="55" y="20" width="108" height="220" rx="18"/></clipPath><pattern id="storage-soc-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#fff" stroke-opacity=".48" stroke-width="3"/></pattern></defs><rect x="91" y="12" width="36" height="10" rx="4" fill="#587265"/><g clip-path="url(#storage-body)"><rect x="55" y="20" width="108" height="220" fill="#17623e"/><rect x="55" y="20" width="108" height="${(100-reserve)*2.2}" fill="#269a62"/><rect x="55" y="20" width="108" height="${(100-release)*2.2}" fill="#45ca83"/>${fresh?`<rect x="55" y="${marker}" width="108" height="${240-marker}" fill="url(#storage-soc-hatch)"/><line x1="55" x2="163" y1="${marker}" y2="${marker}" stroke="#f4fff7" stroke-width="2"/>`:""}${reserve>15?`<path d="M-13 0L0-12L13 0M-9-3V13H9V-3M-3 13V4H3V13" transform="translate(109 ${homeY})" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`:''}${release-reserve>14?`<path d="M-13 1L-9-8H9L13 1V10H-13ZM-12 1H12M-8 10V14M8 10V14M-9 5H-6M6 5H9" transform="translate(109 ${carY})" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`:''}${100-release>14?`<path d="M3-13L-7 2H0L-3 14L8-3H1Z" transform="translate(109 ${flashY})" fill="#fff"/>`:''}</g>${[reserve,release].filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<line x1="48" x2="164" y1="${y(v)}" y2="${y(v)}" stroke="var(--ink)" stroke-opacity=".35" stroke-dasharray="3 3"/><text x="44" y="${y(v)+4}" text-anchor="end">${fmt(v,'%')}</text>`).join('')}${soc===null?'':`<line x1="164" x2="176" y1="${marker}" y2="${marker}" stroke="var(--ink)" stroke-width="1.5"/><text x="181" y="${marker+4}" class="storage-marker">${fmt(soc,'%')}${fresh?'':' *'}</text>`}</svg><strong>${fmt(soc===null?null:soc*c.capacity_kwh/100,'kWh',1)} <span>von ${fmt(c.capacity_kwh,'kWh',1)}</span></strong><small>${fresh?'Schraffiert: aktueller Füllstand':'Füllstand unbekannt / veraltet'}</small><small>${!fresh?'Keine aktuelle Füllstandsanzeige':active?'Speicherfreigabe aktiv':'Speicherfreigabe wartet'}</small></div>`;
  }
  vehicle(s,c){
    const carSoc=numeric(s.car_soc)??numeric(this.status?.last_car_soc);
    const soc=carSoc==null?0:Math.min(100,Math.max(0,carSoc));
    const charging=s.at_home&&s.cable&&s.wallbox_w>200;
    const stale=s.car_age==null||s.car_age>c.car_max_age_s;
    const evPower=liveEnergy(this.status,this._hass?.states).ev;
    const power=evPower==null?null:evPower/1000;
    return `<section class="card vehicle-card" aria-label="Tesla Fahrzeugdaten"><div class="vehicle-top"><div><span class="vehicle-label">TESLA</span><h2>Dein Fahrzeug</h2></div><span class="vehicle-home" title="${s.at_home?'Zuhause':'Unterwegs oder Standort unbekannt'}">${s.at_home?'⌂ Zuhause':'◇ Unterwegs / unbekannt'}</span></div>
    ${vehicleSilhouette(s.cable)}
    <div class="vehicle-bottom"><span>${stale?'Letzter bekannter Stand':charging?'Ladevorgang aktiv':'Ladestand'}<small>${s.car_age==null?'Datenalter unbekannt':fmt(s.car_age/60,"Min.",0)+' alt'}</small></span><strong>${fmt(carSoc,"%")}</strong></div><div class="vehicle-progress" role="progressbar" aria-label="Tesla-Akkustand" ${carSoc==null?'aria-valuetext="Unbekannt"':`aria-valuenow="${soc}" aria-valuemin="0" aria-valuemax="100"`}><span style="width:${soc}%"></span></div><div class="vehicle-live-foot"><span>Wallbox · ${fmt(power,"kW",2)}</span><span>${s.car_limit==null?"Mindestziel":"Fahrzeuglimit"} ${fmt(s.car_limit??c.car_min_soc,"%")}</span></div><details class="vehicle-details"><summary>Ladedetails</summary><div class="list"><div class="split"><span>Untergrenze · Netzladung</span><strong>${fmt(c.car_low_soc,"%")}</strong></div><div class="split"><span>Speicherfreigabe / Nachtreserve</span><strong>${fmt(c.storage_release_soc,"%")} / ${fmt(c.reserve_soc,"%")}</strong></div><div class="split"><span>Mindestziel / Fahrzeuglimit</span><strong>${fmt(c.car_min_soc,"%")} / ${fmt(s.car_limit,"%")}</strong></div><div class="split"><span>Ladestrom eingestellt</span><strong>${fmt(s.car_current,"A")}</strong></div><div class="split"><span>Speichergrenze eingestellt</span><strong>${fmt(s.current_discharge_w,"W")}</strong></div></div><p class="note">${s.car_limit!=null&&s.car_limit<=c.car_min_soc?'Für zusätzliches PV-Laden über den Mindeststand das Fahrzeuglimit in der Tesla-App anheben.':'Unter der Tesla-Untergrenze ist Netzladung bis zum Mindestziel erlaubt. Sonst PV-Überschuss oder freigegebener Hausspeicher bis zum Fahrzeuglimit.'}</p></details></section>`;
  }
  settings(){const settings={...this.status.settings,...this.draft};return `<section class="card"><div class="card-title"><h2>Deine Ladeziele und Reserven</h2><span class="sub">Änderungen gelten nach dem Speichern</span></div><form id="settings"><div class="formgrid">${Object.entries(FIELD_INFO).map(([key,[label,unit,min,max,step]])=>`<label>${esc(label)}<input aria-describedby="help-${key}" type="number" name="${key}" value="${settings[key]}" min="${min}" max="${max}" step="${step}" required><small>${esc(unit)}</small><small class="field-help" id="help-${key}">${esc(FIELD_HELP[key])}</small></label>`).join("")}</div><label class="check"><input name="grid_export_positive" type="checkbox" ${settings.grid_export_positive?"checked":""}>Positive Netzleistung bedeutet Einspeisung</label><small class="field-help check-help">Aktiv: positive Messwerte sind Einspeisung, negative Netzbezug. Ausschalten, wenn dein Zähler umgekehrt zählt.</small><label class="check"><input name="battery_charge_positive" type="checkbox" ${settings.battery_charge_positive?"checked":""}>Positive Batterieleistung bedeutet Laden</label><small class="field-help check-help">Aktiv: positive Messwerte laden den Speicher, negative entladen ihn. Ausschalten bei umgekehrtem Vorzeichen.</small><p class="note">Die Anzahl der Ladephasen muss zur Wallbox passen. Für deine vorgefundene Ladung sind 1 Phase und maximal 16 A voreingestellt. Die Ladeobergrenze des Hausspeichers und das Tesla-Ladelimit werden nicht geändert.</p><div class="actions"><button class="primary" type="submit" ${this.busy?"disabled":""}>Einstellungen speichern</button></div></form></section>`;}
  teslaHistory(){
    return `<section class="card"><div class="card-title"><h2>Tesla-Historie</h2><span class="badge demo">Vorgesehen</span></div><p class="intro">Hier ist Platz für die Ladehistorie und Auswertungen deines Tesla vorgesehen.</p><div class="list" style="margin-top:24px"><div class="split"><span>Ladevorgänge zu Hause</span><strong>Beginn, Ende, Dauer und Wallbox-Energie</strong></div><div class="split"><span>Ladestand im Verlauf</span><strong>SoC vor und nach dem Laden</strong></div><div class="split"><span>Energieaufteilung</span><strong>PV, Netz und Hausspeicher</strong></div><div class="split"><span>Auswertungen</span><strong>Tages-, Monats- und Jahresübersicht</strong></div></div><p class="note">Der Tab ist vorbereitet. Eine eigene Aufzeichnung einzelner Ladevorgänge ist noch nicht implementiert; deshalb werden hier noch keine Historienwerte angezeigt. Vorhandene Tagesbilanzen bleiben in der Übersicht verfügbar.</p><details class="days-help tesla-history-help"><summary>Geplante Datenquellen und Grenzen</summary><p class="note">Wallbox-Messwerte sollen die Energie der Heimladungen liefern, Tesla Fleet den Fahrzeug-Ladestand. PV-, Netz- und Speicheranteile werden als Bilanzschätzungen gekennzeichnet. Fehlende oder veraltete Fahrzeugdaten bleiben als Datenlücken sichtbar. Detaillierte Fahrten und Routen sind eine spätere Erweiterung mit geeigneter Telemetrie; dieser Tab erhöht keine Tesla-Abfrageintervalle und sendet keine zusätzlichen Fahrzeugbefehle.</p></details></section>`;
  }
  diagnostics(){const t=this.status,s=t.snapshot||{};return `<div class="grid"><section class="card"><h2>Messwerte & Schutz</h2><p class="note">Bei fehlenden Daten wird keine PV-Ladung freigegeben. </p><div class="list" style="margin-top:20px"><div class="split"><span>Fahrzeugdaten</span><strong>${fmt(s.car_age,"s",0)} alt</strong></div><div class="split"><span>Leistungsmesswerte</span><strong>${fmt(s.meter_age,"s",0)} alt</strong></div><div class="split"><span>PV-Prognose</span><strong>${fmt(s.forecast_age==null?null:s.forecast_age/3600,"h",1)} alt</strong></div></div><p class="note">Gerätebefehle werden nur bei Änderungen gesendet. Nach Fehlern gilt eine zunehmende Wartezeit. Das Fahrzeug wird in dieser ersten Version nicht automatisch geweckt.</p></section><section class="card"><h2>Letzte Gerätebefehle</h2><ul class="history">${t.history?.length?t.history.slice(0,8).map(h=>`<li><time>${esc(new Date(h.time*1000).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}))}</time><span>${esc(h.channel)}<br><span class="muted">${esc(h.value)}</span></span><span>${h.outcome==="error"?"Fehler":"Angenommen"}</span></li>`).join(""):'<li class="empty">Noch keine Befehle gesendet. Im Beobachtungsmodus ist das vorgesehen.</li>'}</ul><p class="note">„Angenommen“ bedeutet: Home Assistant hat den Serviceaufruf bestätigt. Den tatsächlichen Gerätezustand zeigen die Livewerte.</p></section></div>`;}
  render(resetScroll=false){
    if(!this.shadowRoot)return;
    const t=this.status;
    const oldShell=this.shadowRoot.querySelector(".shell");
    const doc=this.ownerDocument;
    let scrollContainer=oldShell;
    while(scrollContainer){
      const overflow=doc.defaultView.getComputedStyle(scrollContainer).overflowY;
      if(scrollContainer.scrollHeight>scrollContainer.clientHeight+1&&/auto|scroll/.test(overflow))break;
      scrollContainer=scrollContainer.parentElement||scrollContainer.getRootNode()?.host;
    }
    scrollContainer=scrollContainer||doc.scrollingElement;
    const scrollTop=resetScroll?0:scrollContainer.scrollTop;
    const anchorKey=el=>el.matches('.split')?`${el.closest('.source-group')?.querySelector('h3')?.textContent}|${el.querySelector('code')?.textContent}`:`${el.tagName}|${el.textContent.trim()}`;
    const candidates=root=>[...root.querySelectorAll('h2,h3,summary,.mapping .split')];
    const viewportTop=scrollContainer===doc.scrollingElement?0:scrollContainer.getBoundingClientRect().top;
    const anchor=!resetScroll&&oldShell&&candidates(oldShell).find(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=viewportTop&&r.top<viewportTop+scrollContainer.clientHeight;});
    const anchorState=anchor?{key:anchorKey(anchor),top:anchor.getBoundingClientRect().top}:null;
    const detailKey=el=>`${el.className}|${el.querySelector('summary')?.textContent.trim()}`;
    const detailsOpen=new Map([...this.shadowRoot.querySelectorAll("details")].map(el=>[detailKey(el),el.open]));
    const horizontal=[...this.shadowRoot.querySelectorAll('.chart-scroll,.days-table-scroll')].map(el=>el.scrollLeft);
    const active=this.shadowRoot.activeElement;
    const focusKey=el=>[el.tagName,el.id,el.getAttribute('name'),el.getAttribute('data-tab'),el.getAttribute('data-consumption-info-key'),el.hasAttribute('data-consumption-info-key')?'':el.tagName==='SUMMARY'?detailKey(el.parentElement):el.textContent.trim()].join('|');
    const focused=active&&focusKey(active);
    const template=this.ownerDocument.createElement('template');
    template.innerHTML=`<style>${CSS}</style><div class="shell"><main class="wrap"><header class="top"><div class="brand"><button class="menu" id="sidebar" aria-label="Seitenleiste öffnen">☰</button><span class="logo">ϟ</span><div><strong>Strommanager</strong><small>Sonne sinnvoll verteilen</small></div></div><span class="badge ${this.demo?"demo":""}">${this.demo?"Demo · Beispieldaten":t?esc(MODES[t.mode]):"Verbinden …"}</span></header>${this.message?`<div class="flash" role="status">${esc(this.message)}</div>`:""}<span class="eyebrow">PV · Hausspeicher · Tesla</span><h1>Deine Sonne. Gut verteilt.</h1><p class="intro">Genug Energie für unterwegs. Eine Reserve für den Abend. Und eine Entscheidung, die du nachvollziehen kannst.</p>${this._error?`<div class="alert error" role="alert">Verbindung unterbrochen: ${esc(this._error)}. Angezeigte Werte können veraltet sein.</div>`:""}${t?`<nav class="tabs" aria-label="Bereiche">${[["overview","Übersicht"],["settings","Einstellungen"],["diagnostics","Diagnose"],["tesla_history","Tesla-Historie"]].map(([k,n])=>`<button data-tab="${k}" class="${this.tab===k?"active":""}" aria-current="${this.tab===k?"page":"false"}">${n}</button>`).join("")}</nav>${t.error?`<div class="alert error" role="alert">Steuerfehler: ${esc(t.error)}</div>`:""}${(t.decision?.problems||[]).map(p=>`<div class="alert">${esc(p)}</div>`).join("")}${this.tab==="settings"?this.settings()+sourceSettings(this):this.tab==="diagnostics"?this.diagnostics():this.tab==="tesla_history"?this.teslaHistory():this.overview()}<footer class="footer"><span>Strommanager · Entwicklungsversion 0.1.47</span><span>Stand ${esc(t.updated?new Date(t.updated).toLocaleTimeString("de-DE"):"—")}${this.demo?" · keine Verbindung zu Geräten":""}</span></footer>`:'<div class="loading" role="status">Messwerte werden geladen …</div>'}</main></div>`;
    // Expand off-DOM first: restoring scroll against collapsed details clamps
    // the saved position and browser anchoring can then jump to the bottom.
    template.content.querySelectorAll('details').forEach(el=>{el.open=detailsOpen.get(detailKey(el))||false;});
    const nextShell=template.content.querySelector('.shell');
    if(oldShell&&nextShell){
      oldShell.replaceChildren(...nextShell.childNodes);
    }else{
      this.shadowRoot.replaceChildren(template.content);
    }
    if(focused){
      [...this.shadowRoot.querySelectorAll('button,summary,input,select,a,[data-consumption-info]')].find(el=>focusKey(el)===focused)?.focus({preventScroll:true});
    }
    scrollContainer.scrollTop=scrollTop;
    if(anchorState){
      const restored=candidates(this.shadowRoot).find(el=>anchorKey(el)===anchorState.key);
      if(restored)scrollContainer.scrollTop+=restored.getBoundingClientRect().top-anchorState.top;
    }
    if(!resetScroll)this.shadowRoot.querySelectorAll('.chart-scroll,.days-table-scroll').forEach((el,i)=>{el.scrollLeft=horizontal[i]||0;});
    this.shadowRoot.querySelectorAll("[data-tab]").forEach(el=>el.onclick=()=>{this.tab=el.dataset.tab;this.render(true);});
    this.shadowRoot.querySelectorAll('[data-consumption-view]').forEach(el=>el.onclick=()=>{
      this.consumptionView=el.dataset.consumptionView;
      try{localStorage.setItem(`solar_pilot.consumption_view.${this._panel?.config?.entry_id||'demo'}`,this.consumptionView);}catch{}
      this.render();
    });
    this.shadowRoot.querySelectorAll('[data-consumption-history]').forEach(el=>el.onclick=()=>{
      const days=this.status?.consumption_forecast?.history_days||[],index=days.findIndex(day=>day.date===this.consumptionHistoryDate);
      if(el.dataset.consumptionHistory==='today')this.consumptionHistoryDate=null;
      else if(el.dataset.consumptionHistory==='older')this.consumptionHistoryDate=days[index<0?0:index+1]?.date||this.consumptionHistoryDate;
      else if(el.dataset.consumptionHistory==='newer')this.consumptionHistoryDate=index<=0?null:days[index-1]?.date||null;
      this.render();this.loadHistoricalPV();
    });
    this.shadowRoot.querySelector("#sidebar")?.addEventListener("click",()=>this.dispatchEvent(new Event("hass-toggle-menu",{bubbles:true,composed:true})));
    this.shadowRoot.querySelectorAll("[data-action]").forEach(el=>el.onclick=()=>this.action(el.dataset.action));
    this.shadowRoot.querySelector("#mode")?.addEventListener("change",e=>{const mode=e.target.value;if(!["observe","paused"].includes(mode)&&["observe","paused"].includes(this.status.mode)){this.action("activate",mode);}else this.service("set_mode",{mode});});
    bindSourceSettings(this);
    const form=this.shadowRoot.querySelector("#settings");
    if(form){const read=()=>{const data={};for(const key of Object.keys(FIELD_INFO))data[key]=Number(form.elements.namedItem(key).value);for(const key of ["grid_export_positive","battery_charge_positive"])data[key]=form.elements.namedItem(key).checked;return data;};form.oninput=()=>{this.draft=read();};form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())this.service("configure",{settings:read()});};}
  }
  action(name,mode="auto"){
    if(name==="activate"&&!confirm("Strommanager-Steuerung aktivieren? Dabei können Gerätebefehle gesendet werden."))return;
    if(name==="pause")return this.service("set_mode",{mode:"paused"});
    this.service(name,name==="activate"?{mode}:{});
  }
}
if(!customElements.get("solar-pilot-panel"))customElements.define("solar-pilot-panel",SolarPilotPanel);

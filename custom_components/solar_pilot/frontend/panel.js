import {bindTeslaCard} from './tesla-card.js?v=0.1.117';
import {energyNowCard} from './energy-now-view.js?v=0.1.117';
import {weatherOutlookCard,bindWeatherOutlook} from "./weather-outlook-view.js?v=0.1.117";
import {energyPlanCard,currentEEValue} from "./energy-plan-view.js?v=0.1.117-collapse";
import {scrollAnchorKey} from "./scroll-anchor.js?v=0.1.117";
import {solarTimeline} from "./solar-timeline-view.js?v=0.1.117";
import {pvBenefitCard,benefitSources,benefitWeek,benefitArchive} from './pv-benefit.js?v=0.1.117';
import {consumerHeatmap} from './power-consumers.js?v=0.1.117';
import {vehicleSilhouette} from './vehicle-art.js?v=0.1.117';
import {sourceSettings,bindSourceSettings} from './source-settings-view.js?v=0.1.117';
import {pvOverlay} from './pv-overlay.js?v=20261028-2';
import {panelCSS as CSS} from './panel-styles.js?v=0.1.117-price2';
import {esc,fmt} from './view-format.js?v=0.1.117';
import {consumptionBarChart,consumptionTotalBar,consumptionHistoryChart,consumptionHistoryTotal} from './consumption-chart-view.js?v=0.1.117';
import {liveEnergy,dischargeLocked} from './live-energy.js?v=0.1.117';
import {monthlyReferences,referenceScale,yieldAssessment} from './pv-reference.js?v=0.1.27';
import {consumptionBars,rollingConsumptionBars,historicalConsumptionBars,dailyConsumption} from "./consumption-chart.js?v=0.1.40";

import {planThresholds} from './plan-thresholds.js?v=0.1.117';
import {plannedDayAllocation} from "./energy-budget.js?v=20261027-3";
import {number as numeric,dayBounds,forecastPoints,actualSegments,storagePotential,batteryProtection} from "./solar-chart.js?v=20261027-2";
import {dateKey,nextDays,pvDays,pvDayIds,weatherDays,duration,weatherLabel} from "./day-forecast.js?v=0.1.117";
const MODES = {observe:"Beobachten",auto:"Automatik",storage_first:"Speicher bevorzugen",charge_minimum:"Nur Tesla-Mindeststand",charge_now:"Tesla-Sofortladen",paused:"Pausiert"};
const FIELD_INFO = {
  planner_ev_capacity_kwh:["Tesla · nutzbare Batteriekapazität", "kWh · vorläufige Annahme 50", 1, 200, 1],
  planner_ev_efficiency:["Tesla · Ladewirkungsgrad", "Faktor · 0,9 = 90 %", .5, 1, .01],
  planner_ev_grid_share:["Tesla · EE-Fallback bei fehlendem Preis", "% EE im Netzstrom", 0, 100, 1],
  planner_terminal_soc:["Fahrplan-Endreserve", "% Hausspeicher-SoC", 0, 100, 1],
  planner_ee_weight_eur_kwh:["EE-Gewichtung im Fahrplan", "€/kWh nicht erneuerbar · Modellgewicht", 0, 5, .01],
  planner_cycle_eur_kwh:["Hausspeicher-Durchsatzgewicht im Fahrplan", "€/kWh · Modellgewicht", 0, 5, .01],
  grid_hold_share:["Fallback: Hausspeicher bewahren ab EE-Anteil im Netz", "% EE im Netzstrom", 1, 100, 1],
  grid_release_share:["Fallback: Hausspeicher freigeben unter EE-Anteil im Netz", "% EE im Netzstrom", 0, 99, 1],
  benefit_initial_savings_eur:["Geschätzte Ersparnis vor HA", "€ · nur zur Gesamtsumme", 0, 10000000, .01],
  feed_in_eur_kwh:["Einspeisevergütung", "€/kWh · PV-Vorteil", 0, 5, .001],
  purchase_eur_kwh:["Strombezugspreis", "€/kWh · PV-Vorteil", 0, 5, .001],
  reserve_soc:["Abendreserve / Tesla-Entnahmegrenze", "% Hausspeicher-SoC", 0, 100, 1], capacity_kwh:["Speicherkapazität", "kWh", .1, 200, .1],
  car_low_soc:["Tesla-Untergrenze für Netzladung", "% Tesla-Batterie-SoC", 0, 99, 1],
  storage_release_soc:["Tesla-Speicherfreigabe ab Hausspeicher-Ladestand", "% Hausspeicher-SoC", 0, 100, 1],
  car_min_soc:["Tesla-Mindestziel", "% Tesla-Batterie-SoC", 0, 100, 1], phases:["Ladephasen", "1 oder 3", 1, 3, 2],
  max_amps:["Maximaler Ladestrom", "A", 8, 48, 1], normal_discharge_w:["Entladeleistung ohne Schutz", "W", 0, 30000, 100],
  max_charge_w:["Speicher-Ladebudget maximal", "W", 0, 30000, 100],
  forecast_factor:["Anteil der PV-Prognose einplanen", "Faktor", .1, 1, .05], buffer_kwh:["Energiepuffer", "kWh", 0, 30, .1],
  margin_w:["Leistungspuffer", "W", 0, 3000, 50], minimum_house_w:["Hauslast mindestens einplanen", "W", 0, 5000, 50],
  cloud_interval_s:["Mindestabstand Tesla-Befehle", "s", 120, 3600, 30],
};
const FIELD_HELP = {
  planner_ev_capacity_kwh:"Nutzbare Kapazität für die Umrechnung von Tesla-SoC in Energie. Bei diesem Fahrzeug vorläufig konservativ mit 50 kWh angesetzt; keine aus dem Fahrzeug gemessene Kapazität.",
  planner_ev_efficiency:"Annahme zum Anteil der Wallbox-Energie, der im Fahrzeugakku ankommt. Keine gemessene Ladeeffizienz.",
  planner_ev_grid_share:"Bei fehlendem Preis erlaubt dieser EE-Anteil flexible Netzladung. Bei vorhandenem Preis gilt ausschließlich die Börsenpreisgrenze. Die ausgelöste Mindestladung bleibt vorrangig; fehlen beide Signale, wird keine flexible Netzladung erlaubt.",
  planner_terminal_soc:"Gewünschte Mindestreserve am Ende der 24-Stunden-Planung. Bei bereits niedrigerem Startstand auf diesen begrenzt. Bei aktiver HiGHS-Steuerung bestimmt dieser Plan die Entladegrenze fürs Haus.",
  planner_ee_weight_eur_kwh:"Zusätzliche Bewertung nicht erneuerbaren Netzbezugs im Optimierungsziel, keine Stromgebühr und kein CO₂-Messwert. Höhere Werte gewichten EE-Zeitfenster stärker. Wirkt nur ohne gültigen Preis.",
  planner_cycle_eur_kwh:"Bewertung je kWh Ladung plus Entladung zur Vermeidung unnötiger Zyklen. Reines Modellgewicht, kein gemessener Verschleißpreis.",
  grid_hold_share:"EE = erneuerbare Energien. Prozentwert des prognostizierten EE-Anteils im Netzstrom, nicht des Hausspeicher-Ladestands. Nur bei ausgeschaltetem oder ungültigem HiGHS-Plan: Ab dieser Schwelle wird die Entladung für Haus und Tesla gesperrt. PV versorgt das Haus weiterhin zuerst.",
  grid_release_share:"Bezieht sich auf den prognostizierten EE-Anteil im Netzstrom, nicht auf den Hausspeicher. Im Fallback wird unterhalb dieser Schwelle die Entladung wieder freigegeben. Muss niedriger als die Einschaltschwelle sein; verhindert ständiges Umschalten.",
  benefit_initial_savings_eur: "Einmaliger Startbetrag für die Zeit zwischen Anlageninstallation und Beginn der HA-Daten. Wird ausschließlich zur Gesamtsumme addiert; Tages- und Wochenwerte bleiben unverändert.",
  feed_in_eur_kwh: "Vergütung je eingespeister kWh. Bewertet auch historische Tage mit diesem aktuellen Preis; ohne Einfluss auf die Ladesteuerung.",
  purchase_eur_kwh: "Vermiedener Arbeitspreis je selbst genutzter kWh. Ohne Grundgebühr; bewertet auch historische Tage mit diesem aktuellen Preis.",
  "reserve_soc": "Planungsziel und untere Grenze für Speicherentnahme zum Tesla. Das Haus darf bis zur Wechselrichter-Untergrenze entnehmen.",
  "capacity_kwh": "Nutzbare Energie des Hausspeichers. Damit wird berechnet, wie viel bis zur Abendreserve fehlt.",
  "car_min_soc": "Eine unter der Tesla-Untergrenze gestartete Mindestladung läuft bis hierhin, bei Bedarf mit Netzstrom. Danach nur PV oder freigegebener Speicher; das Fahrzeuglimit gilt immer.",
  "car_low_soc": "Unter diesem Ladestand startet eine Mindestladung bis zum Tesla-Mindestziel, auch nachts und mit Netzstrom. Der Hausspeicher bleibt dabei geschützt. Muss unter dem Mindestziel liegen.",
  "storage_release_soc": "Oberhalb dieses Speicherstands wird zusätzlich zum PV-Laden Speicherenergie für den Tesla freigegeben. Die Freigabe endet an der Abendreserve. Muss mindestens so hoch wie die Abendreserve sein.",
  "phases": "Anzahl der beim Laden genutzten Phasen. 1 oder 3 wählen; der Wert muss zur tatsächlichen Ladung passen.",
  "max_amps": "Obergrenze des Ladestroms pro Phase. Bei 1 Phase entsprechen 16 A ungefähr 3,7 kW.",
  "normal_discharge_w": "Gemeinsame Entladegrenze für Haus und Tesla. Hausversorgung auch tagsüber unter der Tesla-Reserve erlaubt; Netzstrategie und Tesla-Schutz können die Entladung sperren.",
  "max_charge_w": "Maximales PV-Leistungsbudget, das für die Speicherreserve zurückgehalten wird. Ändert nicht die Ladeleistungsgrenze am Wechselrichter.",
  "forecast_factor": "Anteil der PV-Restprognose, mit dem gerechnet wird. 0,85 bedeutet 85 %; kleinere Werte planen vorsichtiger.",
  "buffer_kwh": "Zusätzliche Energiemenge, die von der PV-Restprognose abgezogen wird, bevor Energie für das Auto eingeplant wird.",
  "margin_w": "Leistungsreserve, die nicht für das Auto freigegeben wird. Hilft, kurzfristigen Netzbezug bei schwankender Sonne zu reduzieren.",
  "minimum_house_w": "Mindestens angenommener Hausverbrauch für die verbleibenden Sonnenstunden. Höherer aktueller Verbrauch wird ebenfalls berücksichtigt.",
  "cloud_interval_s": "Kürzester Abstand zwischen Tesla-Befehlsrunden. 300 s sind 5 Minuten; größere Werte reagieren langsamer und senden seltener Befehle."
};


export class SolarPilotPanel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this.tab="overview";this.consumptionView="total";this.consumptionHistoryDate=null;this.status=null;this.busy=false;this.message="";this.draft=null;this._error="";this.solarHistory=[];this.socHistory=[];this.pvExtraHistory={};this.benefitWeekOffset=0;this.benefitCache=new Map();this._benefitLoading=new Set();this.historyLoaded=0;this.historyError="";}
  set hass(value){this._hass=value;if(!this.status && !this._loading)this.refresh();
    if(!this._consumerFrame&&this.isConnected&&this.shadowRoot?.querySelector('.consumer-content')){
      this._consumerFrame=requestAnimationFrame(()=>{this._consumerFrame=null;this.updateConsumers();});
    }
  }
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
  disconnectedCallback(){this._weatherObserver?.disconnect();clearInterval(this._timer);if(this._consumerFrame)cancelAnimationFrame(this._consumerFrame);this._consumerFrame=null;}
  async refresh(){
    if(!this._hass||!this._panel||this._loading)return;
    this._loading=true;
    try{this.status=await this._hass.callWS({type:"solar_pilot/status",entry_id:this._panel.config.entry_id});this.sunsetTime(dateKey(Date.now(),this._hass.config?.time_zone||'Europe/Berlin'),this._hass.config?.time_zone||'Europe/Berlin');this._error="";if(this.tab==="overview")await Promise.all([this.loadSolarHistory(),this.loadHistoricalPV(),this.loadDayWeather(),this.loadPVReferences(),this.loadBenefitHistory()]);}
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
  liveEnergyCard(){ return energyNowCard(this); }
  consumerCard(){
    return `<section class="card consumer-card" aria-label="Verbraucher jetzt"><div class="consumer-title"><h2>Verbraucher jetzt</h2><span class="sub">Ganz Home Assistant</span></div><div class="consumer-content">${consumerHeatmap(this._hass?.states,this.status,{unavailable:!!this._error})}</div></section>`;
  }
  updateConsumers(){
    const content=this.shadowRoot?.querySelector('.consumer-content');if(!content)return;
    const expanded=content.querySelector('details')?.open;
    const next=consumerHeatmap(this._hass?.states,this.status,{unavailable:!!this._error});
    if(content.innerHTML===next)return;
    const focused=content.querySelector('summary')===this.shadowRoot.activeElement;
    content.innerHTML=next;
    const details=content.querySelector('details');if(details)details.open=!!expanded;
    if(focused)content.querySelector('summary')?.focus({preventScroll:true});
  }
  overview(){
    const t=this.status,s=t.snapshot||{},c=t.settings;
    return `<div class="grid">
      ${this.liveEnergyCard()}
      ${energyPlanCard(this)}
      ${planThresholds(this)}
      ${this.budgetCard(s,c)}
      ${this.consumerCard()}
      <div class="status-pair benefit-weather-pair full">${pvBenefitCard(this)}${weatherOutlookCard(this)}</div>
      ${this.solarChart(s,c)}
      ${this.dayForecast()}
      ${this.consumptionForecast()}

    </div>`;
  }
  budgetCard(s,c){
    const now=Date.now(),zone=this._hass?.config?.time_zone||'Europe/Berlin',bounds=dayBounds(now,zone),ledger=this.status?.day_budget,plan=this.status?.energy_plan;
    const b=plannedDayAllocation(ledger,plan,dateKey(now,zone),now/1000,bounds.end/1000);
    const labels=[['storage','PV in den Speicher'],['house','PV fürs Haus'],['tesla','PV für Tesla'],['buffer','Einspeisung / Rest']];
    const sum=values=>values?Object.values(values).reduce((v,x)=>v+x,0):null;
    const time=value=>Number.isFinite(value)?new Date(value*1000).toLocaleTimeString('de-DE',{timeZone:zone,hour:'2-digit',minute:'2-digit'}):'—';
    return `<section class="card full budget-card"><div class="card-title"><h2>PV-Energie heute verteilen</h2><span class="sub">Bilanz ${esc(time(ledger?.updated))} · Fahrplan ${esc(time(plan?.updated))}</span></div><div class="budget-context"><span>PV heute · Ist + Plan <strong>${fmt(b.total,'kWh',2)}</strong></span><span>Bereits bilanziert <strong>${fmt(sum(b.actual),'kWh',2)}</strong></span><span>Noch geplant · bis Mitternacht <strong>${fmt(b.remaining,'kWh',2)}</strong></span></div>${b.actual&&b.future?`<div class="budget-stack day-budget-stack" role="img" aria-label="PV-Nutzung heute: bisherige Bilanz und verbleibender Energie-Fahrplan">${labels.map(([key])=>`<span class="budget-category" style="width:${b.total?100*(b.actual[key]+b.future[key])/b.total:0}%">${['actual','future'].map(part=>`<i class="budget-${key} ${part==='future'?'budget-hatched':''}" style="width:${b.actual[key]+b.future[key]?100*b[part][key]/(b.actual[key]+b.future[key]):0}%"></i>`).join('')}</span>`).join('')}</div><div class="budget-pattern-legend"><span><i class="budget-storage"></i>Bisher bilanziert</span><span><i class="budget-storage budget-hatched"></i>Energie-Fahrplan · noch geplant</span></div>`:''}<div class="budget-category-table"><div class="budget-table-head"><span>Kategorie</span><span>Bisher</span><span>Noch</span><span>Gesamt</span></div>${labels.map(([key,label])=>`<div><span><i class="budget-${key}"></i>${esc(label)}</span><span>${fmt(b.actual?.[key],'',2)}</span><span>${fmt(b.future?.[key],'',2)}</span><strong>${fmt(b.actual&&b.future?b.actual[key]+b.future[key]:null,'kWh',2)}</strong></div>`).join('')}</div>${b.reason?`<p class="note weather-warning" role="status">${esc(b.reason)} Fehlende Werte bleiben offen.</p>`:''}${ledger?.missing_minutes?`<p class="note weather-warning">Tageshistorie unvollständig: ${fmt(ledger.missing_minutes,'Minuten')} ohne belastbare Zuordnung.</p>`:''}${ledger?.error?`<p class="note weather-warning">${esc(ledger.error)}</p>`:''}<details class="budget-help"><summary>Berechnung und Datenquellen</summary><p class="note">„Bisher“ stammt aus der historischen PV-Bilanz in HA. „Noch“ integriert ausschließlich den gültigen Energie-Fahrplan ab jetzt bis zur heutigen Mitternacht: direkte PV fürs Haus, PV-Ladung des Speichers, direkte PV für Tesla und Einspeisung. Netzstrom und Hausspeicherentladung zählen nicht als zusätzliche PV. Tesla-PV wird nur bei gemeinsamer Tesla-Planung ausgewiesen; ohne diese ist keine Tesla-Ladung eingeplant.<br>Bilanz und Fahrplan haben getrennte Datenstände. Messlücken und Verzögerungen bleiben sichtbar; die Summe ist eine Schätzung. Die frühere separate Budgetplanung und ihr Zusatzbedarf werden hier nicht mehr verwendet. Diese Kachel steuert keine Geräte. Ohne gültigen Plan bleiben zukünftige Werte unbekannt.</p></details></section>`;
  }
  solarSources(){
    const e=this.status?.entities||{},states=this._hass?.states||{},display=this.status?.source_entities?.display||{};
    const forecastId=display.forecast_day_1||e.forecast_day||(e.forecast||"").replace(/prognose_verbleibende_leistung_heute$/,"prognose_heute").replace(/forecast_remaining_today$/,"forecast_today");
    const dailyId=display.pv_daily||e.pv_daily||(e.pv_power||"").replace(/eingangsleistung$/,"tagesertrag");
    return {roofDaily:states[display.roof_daily||'sensor.sum_dach_tagesertrag'],forecastIds:Array.from({length:7},(_,i)=>display['forecast_day_'+(i+1)]||pvDayIds(forecastId)[i]).filter(Boolean),forecastId,dailyId,forecast:states[forecastId],daily:states[dailyId],power:states[e.pv_power],powerId:e.pv_power};
  }
  async loadBenefitHistory(){
    if(this.demo||!this._hass?.callWS)return;
    this.benefitCache??=new Map();this._benefitLoading??=new Set();
    const now=Date.now(),zone=this._hass.config?.time_zone||'Europe/Berlin',ids=benefitSources(this.status),week=benefitWeek(now,zone,this.benefitWeekOffset??0),today=dayBounds(now,zone),sources=ids.join('|')+'|'+zone;
    if(ids.some(id=>!id))return;
    const requests=[['all:'+week.today+'|'+sources,Date.UTC(2000,0,1),today.start,86400000],['today:'+week.today+'|'+sources,today.start,today.end,300000],['week:'+week.days[0]+'|'+sources,week.start,week.end,(this.benefitWeekOffset??0)<0?86400000:300000]];
    await Promise.allSettled(requests.map(async([key,start,end,ttl])=>{
      const cached=this.benefitCache.get(key);
      if(this._benefitLoading.has(key)||cached&&now-cached.fetched<(cached.error?60000:ttl))return;
      this._benefitLoading.add(key);
      try{
        const statistics=await this._hass.callWS({type:'recorder/statistics_during_period',start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),statistic_ids:ids,period:'day',types:['change'],units:{energy:'kWh'}});
        this.benefitCache.set(key,{statistics,archive:key.startsWith('all:')?benefitArchive(statistics,ids,zone,week.today):undefined,fetched:Date.now()});
      }catch(e){this.benefitCache.set(key,{statistics:cached?.statistics,fetched:Date.now(),error:'Energiestatistik konnte nicht aktualisiert werden.'});}
      finally{
        this._benefitLoading.delete(key);
        while(this.benefitCache.size>18){const first=this.benefitCache.keys().next().value;if(first==='all:'+week.today+'|'+sources||first==='today:'+week.today+'|'+sources){const value=this.benefitCache.get(first);this.benefitCache.delete(first);this.benefitCache.set(first,value);}else this.benefitCache.delete(first);}
      }
    }));
  }
  async loadDayWeather(){
    if(this.demo||this._weatherLoading)return;
    const zone=this._hass?.config?.time_zone||"Europe/Berlin",now=Date.now(),key="solar-pilot-weather-dresden-v3:"+zone;
    if(!this.dayWeather){try{const cached=JSON.parse(localStorage.getItem(key));if(cached?.data?.daily&&cached.fetched<=now&&now-cached.fetched<21600000)this.dayWeather=cached;}catch(e){/* Storage is optional. */}}
    const today=dateKey(now,zone);
    if(this.dayWeather?.data?.daily?.time?.includes(today)&&now-this.dayWeather.fetched<3600000||now-(this.weatherAttempt||0)<900000)return;
    this._weatherLoading=true;this.weatherAttempt=now;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
    try{
      // Public city coordinates, never HA home coordinates or vehicle location.
      const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=13.74&daily=weather_code,sunshine_duration,daylight_duration,precipitation_sum,temperature_2m_min,temperature_2m_max&timezone=${encodeURIComponent(zone)}&forecast_days=7`,{signal:abort.signal,credentials:"omit",referrerPolicy:"no-referrer"});
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
    const socId=this.status?.entities?.house_soc;
    const ids=[...new Set([id,socId,...this.auxiliarySolarSources().map(s=>s.id)].filter(Boolean))],sourceKey=ids.join(',');
    if(!id||this.historyDay===bounds.key&&this.historySources===sourceKey&&Date.now()-this.historyLoaded<300000)return;
    this._historyLoading=true;
    try{
      const rows=await this._hass.callApi("GET",`history/period/${encodeURIComponent(new Date(Math.min(bounds.start,Date.now()-24*3600*1000)).toISOString())}?filter_entity_id=${encodeURIComponent(sourceKey)}&end_time=${encodeURIComponent(new Date().toISOString())}&minimal_response&no_attributes&significant_changes_only=0`);
      const grouped=new Map((Array.isArray(rows)?rows:[]).filter(Array.isArray).map(group=>[group.find(row=>row.entity_id)?.entity_id,group]));
      this.solarHistory=grouped.get(id)||[];this.socHistory=grouped.get(socId)||[];this.socHistoryId=socId;
      this.pvExtraHistory=Object.fromEntries(ids.filter(key=>key!==id).map(key=>[key,grouped.get(key)||[]]));this.historyError="";
    }catch(e){this.solarHistory=[];this.socHistory=[];this.pvExtraHistory={};this.historyError="PV-Verlauf konnte nicht aus HA geladen werden.";}
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
  solarChart(s,c){return solarTimeline(this,s);}
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
    const legend=selected?'<span><i class="consumption-done"></i>Istverbrauch</span><span><i class="consumption-plan"></i>Damals prognostiziert</span>'+ (view==='hours'?'<span><i class="pv-legend-line"></i>PV-Ist · gesamt</span>':''):`<span><i class="consumption-done"></i>Gemessen / bilanziert</span><span><i class="consumption-plan"></i>Prognose</span>${current?.missing?'<span>? Messlücke</span>':''}${view==='hours'?'<span><i class="pv-legend-line"></i>PV-Ist · gesamt</span><span><i class="pv-legend-line forecast"></i>PV-Prognose · Hauptanlage</span><span><i class="battery-legend-line actual"></i>Hausspeicher-SoC · Ist</span><span><i class="battery-legend-line"></i>Hausspeicher-SoC · Prognose</span><span><i class="consumption-done"></i>Hausspeicher-Abdeckung</span><span><i style="background:#df6767"></i>Deckungslücke</span>':''}`;
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
    <div class="vehicle-bottom"><span>${stale?'Letzter bekannter Stand':charging?'Ladevorgang aktiv':'Ladestand'}<small>${s.car_age==null?'Datenalter unbekannt':fmt(s.car_age/60,"Min.",0)+' alt'}</small></span><strong>${fmt(carSoc,"%")}</strong></div><div class="vehicle-progress" role="progressbar" aria-label="Tesla-Ladestand" ${carSoc==null?'aria-valuetext="Unbekannt"':`aria-valuenow="${soc}" aria-valuemin="0" aria-valuemax="100"`}><span style="width:${soc}%"></span></div><div class="vehicle-live-foot"><span>Wallbox · ${fmt(power,"kW",2)}</span><span>${s.car_limit==null?"Mindestziel":"Fahrzeuglimit"} ${fmt(s.car_limit??c.car_min_soc,"%")}</span></div><details class="vehicle-details"><summary>Ladedetails</summary><div class="list"><div class="split"><span>Untergrenze · Netzladung</span><strong>${fmt(c.car_low_soc,"%")}</strong></div><div class="split"><span>Speicherfreigabe / Nachtreserve</span><strong>${fmt(c.storage_release_soc,"%")} / ${fmt(c.reserve_soc,"%")}</strong></div><div class="split"><span>Mindestziel / Fahrzeuglimit</span><strong>${fmt(c.car_min_soc,"%")} / ${fmt(s.car_limit,"%")}</strong></div><div class="split"><span>Ladestrom eingestellt</span><strong>${fmt(s.car_current,"A")}</strong></div><div class="split"><span>Speichergrenze eingestellt</span><strong>${fmt(s.current_discharge_w,"W")}</strong></div></div><p class="note">${s.car_limit!=null&&s.car_limit<=c.car_min_soc?'Für zusätzliches PV-Laden über den Mindeststand das Fahrzeuglimit in der Tesla-App anheben.':'Unter der Tesla-Untergrenze ist Netzladung bis zum Mindestziel erlaubt. Sonst PV-Überschuss oder freigegebener Hausspeicher bis zum Fahrzeuglimit.'}</p></details></section>`;
  }
  settings(){const settings={...this.status.settings,...this.draft};const priceKeys=["feed_in_eur_kwh","purchase_eur_kwh","benefit_initial_savings_eur"];const fields=entries=>entries.map(([key,[label,unit,min,max,step]])=>`<label>${esc(label)}<input aria-describedby="help-${key}" type="number" name="${key}" value="${settings[key]}" min="${min}" max="${max}" step="${step}" required><small>${esc(unit)}</small><small class="field-help" id="help-${key}">${esc(FIELD_HELP[key])}</small></label>`).join("");return `<section class="card"><div class="card-title"><h2>Deine Einstellungen</h2><span class="sub">Änderungen gelten nach dem Speichern</span></div><form id="settings"><h3>Netz, Hausspeicher & Tesla</h3><label class="check"><input name="planner_ev_enabled" type="checkbox" ${settings.planner_ev_enabled?"checked":""}>Tesla in HiGHS planen und steuern</label><small class="field-help check-help">Rollierende 24 Stunden ohne Abfahrtszeit. Fahrzeug-Ladelimit als Obergrenze. PV, Preisfenster, EE-Fallback und Speicherreserven bestimmen die Ladezeit. Bei fehlenden Fahrzeugdaten bleibt die bisherige Tesla-Regelung zuständig.</small><p class="note">Wechselrichter-Untergrenze: <strong>${fmt(this.status.snapshot?.battery_min_soc,"%")}</strong> Hausspeicher-SoC · wird vom Wechselrichter übernommen, hier nicht änderbar.</p><label class="check"><input name="planner_control_enabled" type="checkbox" ${settings.planner_control_enabled?"checked":""}>HiGHS steuert Hausakku und freigegebene Tesla-Planung</label><small class="field-help check-help">Gültiger 24-Stunden-Fahrplan bestimmt die Entladegrenze und bei aktivierter Tesla-Planung den Ladestrom. Schutzregeln und ausgelöste Tesla-Mindestladung haben Vorrang. Bei fehlendem, veraltetem oder abweichendem Plan greift die bisherige Regelung. Kein Netzladen.</small><label class="check"><input name="grid_renewable_enabled" type="checkbox" ${settings.grid_renewable_enabled?"checked":""}>EE-Schwellenregel als Fallback</label><small class="field-help check-help">Direktabruf von Energy-Charts. Bei fehlender Prognose normale Eigenverbrauchsregelung. Kein Netzladen.</small><h3>Strompreise</h3><label class="check"><input name="planner_price_enabled" type="checkbox" ${settings.planner_price_enabled?"checked":""}>Börsenpreis-Prognose anzeigen (nur Information)</label><small class="field-help">Energyforecast, DE-LU. Reine Information ohne Einfluss auf Planung oder Ladefreigaben. Gerechnet wird mit dem eingestellten Festtarif; der EE-Einfluss ist auf 25 % des eingestellten Modellgewichts reduziert.</small><div class="formgrid">${fields(Object.entries(FIELD_INFO).filter(([key])=>priceKeys.includes(key)))}</div><h3>Ladeziele und Reserven</h3><div class="formgrid">${fields(Object.entries(FIELD_INFO).filter(([key])=>!priceKeys.includes(key)))}</div><label class="check"><input name="grid_export_positive" type="checkbox" ${settings.grid_export_positive?"checked":""}>Positive Netzleistung bedeutet Einspeisung</label><small class="field-help check-help">Aktiv: positive Messwerte sind Einspeisung, negative Netzbezug. Ausschalten, wenn dein Zähler umgekehrt zählt.</small><label class="check"><input name="battery_charge_positive" type="checkbox" ${settings.battery_charge_positive?"checked":""}>Positive Batterieleistung bedeutet Laden</label><small class="field-help check-help">Aktiv: positive Messwerte laden den Speicher, negative entladen ihn. Ausschalten bei umgekehrtem Vorzeichen.</small><p class="note">Die Anzahl der Ladephasen muss zur Wallbox passen. Für deine vorgefundene Ladung sind 1 Phase und maximal 16 A voreingestellt. Die Ladeobergrenze des Hausspeichers und das Tesla-Ladelimit werden nicht geändert.</p><div class="actions"><button class="primary" type="submit" ${this.busy?"disabled":""}>Einstellungen speichern</button></div></form><form id="price-key"><h3>Energyforecast-Zugang</h3><p class="note">${this.status.price_forecast?.configured?"API-Key hinterlegt":"Noch kein API-Key hinterlegt"} · ${esc(this.status.price_forecast?.reason||"Preisabruf wird vorbereitet")}</p><label>API-Key<input type="password" name="token" autocomplete="off" placeholder="Neuen Key eintragen" required></label><small>Der gespeicherte Key wird nicht an das Panel zurückgegeben. Er wird lokal in der HA-Konfiguration gespeichert und nur an Energyforecast übermittelt.</small><div class="actions"><button type="submit" ${this.busy?"disabled":""}>API-Key speichern</button></div></form></section>`;}
  teslaHistory(){
    return `<section class="card"><div class="card-title"><h2>Tesla-Historie</h2><span class="badge demo">Vorgesehen</span></div><p class="intro">Hier ist Platz für die Ladehistorie und Auswertungen deines Tesla vorgesehen.</p><div class="list" style="margin-top:24px"><div class="split"><span>Ladevorgänge zu Hause</span><strong>Beginn, Ende, Dauer und Wallbox-Energie</strong></div><div class="split"><span>Ladestand im Verlauf</span><strong>SoC vor und nach dem Laden</strong></div><div class="split"><span>Energieaufteilung</span><strong>PV, Netz und Hausspeicher</strong></div><div class="split"><span>Auswertungen</span><strong>Tages-, Monats- und Jahresübersicht</strong></div></div><p class="note">Der Tab ist vorbereitet. Eine eigene Aufzeichnung einzelner Ladevorgänge ist noch nicht implementiert; deshalb werden hier noch keine Historienwerte angezeigt. Vorhandene Tagesbilanzen bleiben in der Übersicht verfügbar.</p><details class="days-help tesla-history-help"><summary>Geplante Datenquellen und Grenzen</summary><p class="note">Wallbox-Messwerte sollen die Energie der Heimladungen liefern, Tesla Fleet den Fahrzeug-Ladestand. PV-, Netz- und Speicheranteile werden als Bilanzschätzungen gekennzeichnet. Fehlende oder veraltete Fahrzeugdaten bleiben als Datenlücken sichtbar. Detaillierte Fahrten und Routen sind eine spätere Erweiterung mit geeigneter Telemetrie; dieser Tab erhöht keine Tesla-Abfrageintervalle und sendet keine zusätzlichen Fahrzeugbefehle.</p></details></section>`;
  }
  diagnostics(){const t=this.status,s=t.snapshot||{};return `<div class="grid"><section class="card"><h2>Messwerte & Schutz</h2><p class="note">Bei fehlenden Daten wird keine PV-Ladung freigegeben. </p><div class="list" style="margin-top:20px"><div class="split"><span>Fahrzeugdaten</span><strong>${fmt(s.car_age,"s",0)} alt</strong></div><div class="split"><span>Leistungsmesswerte</span><strong>${fmt(s.meter_age,"s",0)} alt</strong></div><div class="split"><span>PV-Prognose</span><strong>${fmt(s.forecast_age==null?null:s.forecast_age/3600,"h",1)} alt</strong></div></div><p class="note">Gerätebefehle werden nur bei Änderungen gesendet. Nach Fehlern gilt eine zunehmende Wartezeit. Bei aktiver Tesla-Fahrplansteuerung wird das Fahrzeug erst im geplanten Ladefenster geweckt. Vor Ladestart werden aktuelle Fahrzeugdaten, Anschluss und Standort geprüft.</p></section><section class="card"><h2>Letzte Gerätebefehle</h2><ul class="history">${t.history?.length?t.history.slice(0,8).map(h=>`<li><time>${esc(new Date(h.time*1000).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}))}</time><span>${esc(h.channel)}<br><span class="muted">${esc(h.value)}</span></span><span>${h.outcome==="error"?"Fehler":"Angenommen"}</span></li>`).join(""):'<li class="empty">Noch keine Befehle gesendet. Im Beobachtungsmodus ist das vorgesehen.</li>'}</ul><p class="note">„Angenommen“ bedeutet: Home Assistant hat den Serviceaufruf bestätigt. Den tatsächlichen Gerätezustand zeigen die Livewerte.</p></section></div>`;}
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
    const anchorKey=el=>scrollAnchorKey(el,this.tab);
    const candidates=root=>[...root.querySelectorAll('h2,h3,summary,.mapping .split')];
    const viewportTop=scrollContainer===doc.scrollingElement?0:scrollContainer.getBoundingClientRect().top;
    const anchor=!resetScroll&&oldShell&&candidates(oldShell).find(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=viewportTop&&r.top<viewportTop+scrollContainer.clientHeight;});
    const anchorState=anchor?{key:anchorKey(anchor),top:anchor.getBoundingClientRect().top}:null;
    const detailKey=el=>el.classList.contains('consumer-more')?'consumer-more':`${el.className}|${el.querySelector('summary')?.textContent.trim()}`;
    const detailsOpen=new Map([...this.shadowRoot.querySelectorAll("details")].map(el=>[detailKey(el),el.open]));
    const horizontal=[...this.shadowRoot.querySelectorAll('.chart-scroll,.days-table-scroll')].map(el=>el.scrollLeft);
    const active=this.shadowRoot.activeElement;
    const focusKey=el=>[el.tagName,el.id,el.getAttribute('name'),el.getAttribute('data-tab'),el.getAttribute('data-consumption-info-key'),el.hasAttribute('data-consumption-info-key')?'':el.tagName==='SUMMARY'?detailKey(el.parentElement):el.textContent.trim()].join('|');
    const focused=active&&focusKey(active);
    const template=this.ownerDocument.createElement('template');
    template.innerHTML=`<style>${CSS}</style><div class="shell"><main class="wrap"><header class="top"><div class="brand"><button class="menu" id="sidebar" aria-label="Seitenleiste öffnen">☰</button><img class="logo" src="/solar_pilot_frontend/strommanager-icon.png?v=0.1.117" alt="" width="38" height="38"><div><strong>Strommanager</strong><small>Sonne sinnvoll verteilen</small></div></div><span class="badge ${this.demo?"demo":""}">${this.demo?"Demo · Beispieldaten":t?esc(MODES[t.mode]):"Verbinden …"}</span></header>${this.message?`<div class="flash" role="status">${esc(this.message)}</div>`:""}${this._error?`<div class="alert error" role="alert">Verbindung unterbrochen: ${esc(this._error)}. Angezeigte Werte können veraltet sein.</div>`:""}${t?`<nav class="tabs" aria-label="Bereiche">${[["overview","Übersicht"],["settings","Einstellungen"],["diagnostics","Diagnose"],["tesla_history","Tesla-Historie"]].map(([k,n])=>`<button data-tab="${k}" class="${this.tab===k?"active":""}" aria-current="${this.tab===k?"page":"false"}">${n}</button>`).join("")}</nav>${t.error?`<div class="alert error" role="alert">Steuerfehler: ${esc(t.error)}</div>`:""}${(t.decision?.problems||[]).map(p=>`<div class="alert">${esc(p)}</div>`).join("")}${this.tab==="settings"?this.settings()+sourceSettings(this):this.tab==="diagnostics"?this.diagnostics():this.tab==="tesla_history"?this.teslaHistory():this.overview()}<footer class="footer"><span>Strommanager · Entwicklungsversion 0.1.117</span><span>Stand ${esc(t.updated?new Date(t.updated).toLocaleTimeString("de-DE"):"—")}${this.demo?" · keine Verbindung zu Geräten":""}</span></footer>`:'<div class="loading" role="status">Messwerte werden geladen …</div>'}</main></div>`;
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
    this.shadowRoot.querySelectorAll('[data-plan-step]').forEach(el=>el.onclick=()=>{this.planGroupIndex=Math.max(0,(this.planGroupIndex??0)+Number(el.dataset.planStep));this.render();});
    this.shadowRoot.querySelectorAll('[data-pv-day]').forEach(el=>el.onclick=()=>{this.pvDayOffset=Number(el.dataset.pvDay);this.render();});
    this.shadowRoot.querySelectorAll('[data-benefit-week]').forEach(el=>el.onclick=()=>{
      this.benefitWeekOffset=Math.min(0,(this.benefitWeekOffset??0)+(el.dataset.benefitWeek==='older'?-1:1));
      this.render();this.loadBenefitHistory().then(()=>{if(this.isConnected)this.render();});
    });
    bindSourceSettings(this);
    bindTeslaCard(this);
    bindWeatherOutlook(this);
    const form=this.shadowRoot.querySelector("#settings");
    const priceKey=this.shadowRoot.querySelector("#price-key");if(priceKey)priceKey.onsubmit=e=>{e.preventDefault();const token=priceKey.elements.namedItem("token").value.trim();if(priceKey.reportValidity()&&token)this.service("configure_price",{token});};
    if(form){const read=()=>{const data={};for(const key of Object.keys(FIELD_INFO))data[key]=Number(form.elements.namedItem(key).value);for(const key of ["grid_export_positive","battery_charge_positive","grid_renewable_enabled","planner_control_enabled","planner_ev_enabled","planner_price_enabled"])data[key]=form.elements.namedItem(key).checked;return data;};form.oninput=()=>{this.draft=read();};form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())this.service("configure",{settings:read()});};}
  }
  action(name,mode="auto"){
    if(name==="immediate")return this.service("activate",{mode:"charge_now"});
    if(name==="end_immediate")return this.service("set_mode",{mode:this.status.immediate_return_mode||"observe"});
    if(name==="activate"&&!confirm("Strommanager-Steuerung aktivieren? Dabei können Gerätebefehle gesendet werden."))return;
    if(name==="pause")return this.service("set_mode",{mode:"paused"});
    this.service(name,name==="activate"?{mode}:{});
  }
}
if(!customElements.get("solar-pilot-panel"))customElements.define("solar-pilot-panel",SolarPilotPanel);

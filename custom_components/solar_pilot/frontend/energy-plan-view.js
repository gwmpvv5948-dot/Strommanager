import {pricePlanChart,priceConnection} from "./price-plan-view.js";
import {planControls} from "./plan-thresholds.js";
// House plan and verified controller status. All numbers come from the backend LP, never mock data.
import { esc, fmt } from "./view-format.js";
export function comparisonHTML(plan) {
  if(!plan?.delta)return '';
  const d=plan.delta;
  const rounded=(value,digits)=>Number.isFinite(value)?Math.round((Math.abs(value)+Number.EPSILON)*10**digits)/10**digits*Math.sign(value):null;
  const signed=(value,unit,digits)=>{const n=rounded(value,digits);return n===null?'Nicht berechenbar':`${n>0?'+':''}${fmt(n===0?0:n,unit,digits)}`;};
  const ee=plan.ee_incomplete?null:rounded(d.nonrenewable_kwh,1);
  const eeText=ee===null?'Nicht berechenbar':ee===0?'0 kWh Unterschied':`${fmt(Math.abs(ee),'kWh',1)} ${ee<0?'weniger':'mehr'}`;
  const same=[rounded(d.cost,2),rounded(d.grid_kwh,1),rounded(d.throughput_kwh,1),ee].every(n=>n===0);
  return `<h3 class="plan-compare-title">Gegenüber Schwellenregel · simuliert</h3><p class="note">Nächste 24 Stunden · gleicher Endladestand des Hausspeichers</p>${same?'<p class="note">Kein relevanter Unterschied zur Schwellenregel.</p>':''}<div class="plan-comparison"><div><strong>${signed(d.cost,'€',2)}</strong><span>Stromkosten</span></div><div><strong>${signed(d.grid_kwh,'kWh',1)}</strong><span>Netzbezug</span></div><div><strong>${signed(d.throughput_kwh,'kWh',1)}</strong><span>Hausspeicher-Durchsatz</span></div><div><strong>${eeText}</strong><span>Nicht erneuerbarer Netzstrom</span></div></div><p class="note">EE-Vergleich aus dem prognostizierten Strommix · keine gemessene CO₂-Einsparung.${ee===null?' EE-Prognose unvollständig oder Vergleichswert fehlt.':''} Anzeige gerundet auf 0,01 € bzw. 0,1 kWh.</p>`;
}
export function planGroups(points) {
  const groups = [];
  for (const p of points || []) {
    const previous = groups.at(-1);
    if (previous && previous.reason === p.reason && previous.end === p.start) {
      previous.end = p.end;
      previous.last = p;
    } else
      groups.push({
        start: p.start,
        end: p.end,
        reason: p.reason,
        first: p,
        last: p,
      });
  }
  return groups;
}
export function currentEEValue(status) {
  const grid=status?.grid_forecast,share=grid?.available?grid.share:null;
  const valid=typeof share === "number" && Number.isFinite(share) && share>=0;
  const state=valid?(share>60?"high":share<40?"low":"medium"):"unknown";
  return `<span class="live-ee ${state}" aria-label="${valid?`Anteil erneuerbarer Energien im Netzstrom: ${fmt(share,"%")}`:"EE-Anteil im Netzstrom unbekannt"}"><span class="live-ee-dot" aria-hidden="true"></span>${valid?`${fmt(share,"%",0)} erneuerbar`:"EE unbekannt"}</span>`;
}
export function energyPlanCard(panel) {
  const plan = panel.status?.energy_plan,
    zone = panel._hass?.config?.time_zone || "Europe/Berlin";
  const control=panel.status?.energy_control;
  const active=panel.status?.settings?.planner_control_enabled && !["observe","paused"].includes(panel.status?.mode);
  const head = `<div class="card-title"><h2>Energie-Fahrplan</h2><span class="plan-observe">${active ? "HiGHS" : "Beobachtung"} · ${plan?.joint?"Haus, Speicher & Tesla":"Haus & Speicher"}</span></div>`;
  const state=panel.status?.mode==='charge_now' ? `<p class="note plan-control-state"><strong>Tesla-Sofortladen · Hausspeicherentladung gesperrt</strong><br>PV und Netz erlaubt · Energie-Fahrplan wird für die Steuerung übergangen.</p>` : active ? `<p class="note plan-control-state"><strong>${esc(control?.reason || "Steuerung wird vorbereitet")}</strong><br>Entladegrenze: ${fmt(control?.discharge_w,"W")} · eingestellt: ${fmt(panel.status?.snapshot?.current_discharge_w,"W")}</p>` : "";
  const hasDiagram = plan?.available && Array.isArray(plan.points) && plan.points.length > 0;
  const calculating = panel.manualPlanCalculating === true || plan?.manual_calculating === true || (!hasDiagram && (plan?.calculating === true || !plan));
  const progress = calculating ? `<div class="plan-calculating" role="status" aria-live="polite"><ha-icon icon="mdi:cog" class="plan-calculating-icon" aria-hidden="true"></ha-icon><div><strong>Wird berechnet …</strong><span>Der Energie-Fahrplan für die nächsten 24 Stunden wird erstellt.</span></div></div>` : "";
  if (!plan?.available)
    return `<section class="card full energy-plan-card">${head}${state}${progress}${calculating ? "" : `<p class="note">${esc(plan?.reason || "Fahrplan wird vorbereitet")}</p>`}<p class="note">${active ? "Die bisherige Regelung übernimmt als Fallback; Schutzgrenzen bleiben verbindlich." : "Keine Gerätebefehle aus dem Fahrplan. Die bestehende Regelung bleibt aktiv."}</p>${priceConnection(panel.status)}${planControls(panel)}</section>`;
  const points = plan.points,
    groups = planGroups(points),
    index = Math.max(0, Math.min(groups.length - 1, panel.planGroupIndex ?? 0)),
    selected = groups[index],
    first = points[0];
  panel.planGroupIndex = index;
  const time = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t * 1000));
  const date = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(t * 1000));
  const narrow = matchMedia("(max-width:700px)").matches,
    W = narrow ? 420 : 960,
    left = narrow ? 48 : 60,
    right = W - 48;
  const x = (t) =>
    left + ((t - plan.start) / (plan.end - plan.start)) * (right - left);
  const axis = (h) =>
    [0, 6, 12, 18, 24]
      .map((n) => {
        const t = plan.start + n * 3600;
        return `<text x="${x(t)}" y="${h - 7}" text-anchor="${n === 0 ? "start" : n === 24 ? "end" : "middle"}">${n === 0 ? "JETZT" : time(t)}</text>`;
      })
      .join("");
  const shade = (top, bottom) =>
    `<rect x="${x(selected.start)}" y="${top}" width="${x(selected.end) - x(selected.start)}" height="${bottom - top}" class="plan-selected"/>`;
  const chart = (type) => {
    const combined=type === "combined";
    const H = 195, top = 28, bottom = H - 27;
    const max = combined ? 100 : Math.max(0.5, ...points.map(p=>p.load_kw+(p.ev_kw||0)))*1.12;
    const y = v => bottom - (v/max)*(bottom-top);
    let body=shade(top,bottom);
    const ticks=combined ? [0,25,50,75,100] : [0,max/2,max];
    for (const v of ticks)
      body+=`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end">${fmt(v,"",combined?0:1)}${combined?"%":""}</text>`;
    for (const p of points) {
      const width=Math.max(.25,x(p.end)-x(p.start)-(narrow?.3:1));
      if (combined) {
        body+=p.ee==null
          ? `<rect x="${x(p.start)}" y="${top}" width="${width}" height="${bottom-top}" class="grid-neutral" opacity="0.22"/>`
          : `<rect x="${x(p.start)}" y="${y(Math.min(100,p.ee))}" width="${width}" height="${bottom-y(Math.min(100,p.ee))}" class="grid-${p.ee>60?"green":p.ee<40?"red":"yellow"}" opacity="0.65"/>`;
      } else {
        let base=bottom;
        for (const [key,cls] of [["pv_direct_kw","pv"],["battery_kw","battery"],["grid_kw","grid"]]) {
          const value=key==="pv_direct_kw"?p[key]+(p.ev_pv_kw||0):p[key];
          const height=value/max*(bottom-top);
          body+=`<rect x="${x(p.start)}" y="${base-height}" width="${width}" height="${height}" class="plan-fill-${cls}"/>`;
          base-=height;
        }
      }
    }
    if (!combined) {
      const percentY=v=>bottom-v/100*(bottom-top);
      for(const v of [0,50,100])body+=`<text x="${right+6}" y="${percentY(v)+4}" text-anchor="start">${v}%</text>`;
      const path=[{start:plan.start,soc:plan.initial_soc},...points.map(p=>({start:p.end,soc:p.soc}))]
        .map((p,i)=>`${i?"L":"M"}${x(p.start)},${percentY(p.soc)}`).join(" ");
      body+=`<line x1="${left}" x2="${right}" y1="${percentY(plan.minimum_soc)}" y2="${percentY(plan.minimum_soc)}" class="plan-min-line"/><path d="${path}" class="plan-soc-halo"/><path d="${path}" class="plan-soc-line"/><circle cx="${left}" cy="${percentY(plan.initial_soc)}" r="3.5" class="plan-soc-dot"/>`;
    }
    if(!combined && plan.joint){
      const percentY=v=>bottom-v/100*(bottom-top);
      const path=[{start:plan.start,ev_soc:plan.ev.initial_soc},...points.map(p=>({start:p.end,ev_soc:p.ev_soc}))].map((p,i)=>`${i?'L':'M'}${x(p.start)},${percentY(p.ev_soc)}`).join(' ');
      body+=`<path d="${path}" class="plan-soc-halo"/><path d="${path}" class="plan-car-soc-line"/>`;
    }
    const label=combined ? "EE-Anteil im Netzstrom · %" : plan.joint ? "Haus + Tesla · kW" : "Hausversorgung · kW";
    return `<svg class="plan-chart ${combined?"plan-combined":""}" data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: optimierter 24-Stunden-Fahrplan. ${combined?"Ampelbalken: EE-Anteil im Netzstrom. Grau: EE-Prognose fehlt.":"Blaue Linie: Hausspeicher-Ladestandsprognose, rechte Achse in Prozent. Balken: Hausversorgung, linke Achse in Kilowatt."}"><text x="0" y="15" class="plan-chart-title">${label}</text>${body}<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="grid-now"/>${axis(H)}</svg>`;
  };
  const p = selected.first,
    span = selected.end - selected.start;
  const selectedEE = points.some(p => p.start >= selected.start && p.start < selected.end && p.ee == null) ? null :
    points
      .filter((p) => p.start >= selected.start && p.start < selected.end)
      .reduce((a, p) => a + p.ee * (p.end - p.start), 0) / span;
  return `<section class="card full energy-plan-card">${head}${state}${progress}${plan.sources?.pv_warning?`<p class="note">${esc(plan.sources.pv_warning)}</p>`:""}${plan.joint&&plan.ev?.estimated?`<p class="note">Tesla: Planung mit letztem bekannten SoC vom ${date(plan.ev.soc_updated)} ${time(plan.ev.soc_updated)} · Wallbox an. Vor Ladestart werden Standort, Anschluss und Fahrzeugdaten bestätigt.</p>`:""}${panel.status?.car_wake?.pending&&panel.status?.snapshot?.wallbox_enabled?`<p class="note">Tesla · wird geweckt</p>`:""}${panel.status?.settings?.planner_ev_enabled&&!plan.joint?`<p class="sub">Tesla · ${esc(plan.ev?.reason?.startsWith("Wallbox aus")?(panel.status?.snapshot?.wallbox_enabled===false?"Wallbox aus":"Wallboxstatus unbekannt"):(plan.ev?.reason||"Fahrzeugdaten werden geprüft"))}</p>`:""}${plan.ee_incomplete && !plan.points.some(p=>p.spot_ct!=null) ? '<p class="note">EE-Prognose nicht vollständig: graue Zeitfenster werden ohne EE-Gewichtung nach Stromkosten, PV und Hausspeicher-Grenzen geplant.</p>' : ""}<div class="plan-current"><ha-icon icon="mdi:${first.battery_kw > 0.02 ? "battery-arrow-down" : first.charge_kw > 0.02 ? "battery-charging" : "transmission-tower"}"></ha-icon><div><strong>${esc(first.reason)}</strong><span class="sub">Bis ${time(groups[0].end)} · ${date(plan.start)} ${time(plan.start)} → ${date(plan.end)} ${time(plan.end)}</span></div></div><div class="chart-legend plan-legend"><span><i class="plan-fill-pv"></i>PV direkt</span><span><i class="plan-fill-battery"></i>Hausspeicher</span><span><i class="plan-fill-grid"></i>Netz</span></div>${chart("supply")}<div class="chart-legend plan-legend"><span><i class="plan-soc-key"></i>Hausspeicher-SoC · Prognose (rechte Achse)</span>${plan.joint?'<span><i class="plan-car-key"></i>Tesla-SoC · Prognose</span>':''}<span><i class="plan-min-key"></i>WR-Untergrenze ${fmt(plan.minimum_soc,"%")}</span></div><details class="plan-details plan-soc-details"><summary>EE-Anteil &amp; Börsenpreis</summary>${chart("combined")}<div class="chart-legend plan-legend plan-combined-legend"><span><i class="plan-ee-key"></i>EE-Anteil im Netz</span><span><i class="grid-neutral"></i>EE unbekannt</span></div>${pricePlanChart(plan,zone)}${priceConnection(panel.status)}</details><nav class="plan-periods" aria-label="Zeitraum erklären"><button type="button" data-plan-step="-1" aria-label="Vorherigen Planungszeitraum erklären" ${index === 0 ? "disabled" : ""}>‹</button><strong>${date(selected.start)} · ${time(selected.start)}–${time(selected.end)}</strong><button type="button" data-plan-step="1" aria-label="Nächsten Planungszeitraum erklären" ${index === groups.length - 1 ? "disabled" : ""}>›</button></nav><div class="plan-explanation" aria-live="polite"><strong>${esc(selected.reason)}</strong><p>${esc(p.explanation)}</p><span class="sub">EE-Anteil Ø ${fmt(selectedEE, "%")} · Hausspeicher ${fmt(index === 0 ? plan.initial_soc : groups[index - 1].last.soc, "%")} → ${fmt(selected.last.soc, "%")}</span>${plan.joint?`<div class="plan-ev-summary"><strong>Tesla · ${fmt(plan.ev.initial_soc,"%")} → ${fmt(plan.ev.planned_soc,"%",1)}</strong><span>Geplant in 24 h · Fahrzeuglimit ${fmt(plan.ev.limit_soc,"%")} · ${fmt(plan.ev.charged_kwh,"kWh",1)} Ladestrom</span><span>Flexible Netzladung: EE-Freigabe ab ${fmt(plan.ev.grid_share,"%")} · keine feste Abfahrtszeit</span></div>`:""}</div>${comparisonHTML(plan)}<details class="plan-details"><summary>Berechnung und Datenquellen</summary>${panel.status?.car_wake?.reason?`<p class="note">Tesla-Diagnose: ${esc(panel.status.car_wake.reason)}</p>`:""}<p class="note">${esc(plan.solver)} · 24 Stunden, Viertelstundenraster. Optimiert werden Tarifkosten minus Einspeisevergütung und Hausspeicher-Durchsatz, ergänzt um eine auf 25 % reduzierte EE-Gewichtung. Börsenpreise sind reine Information und beeinflussen weder Planung noch Ladefreigaben. Tatsächliche Euro-Werte bleiben zum Festpreis; Preis ist kein EE- oder CO₂-Wert. Wirksames EE-Gewicht ${fmt(plan.config.ee_weight*.25, "€/kWh", 3)}, Durchsatzgewicht ${fmt(plan.config.cycle_cost, "€/kWh", 3)}: keine tatsächlichen Gebühren. Positive Vergleichswerte bedeuten Mehrverbrauch oder Mehrkosten. Endladestand bei beiden Fahrplänen identisch: ${fmt(plan.terminal_soc, "%")} Hausspeicher-SoC. Ein vorhandener Vergleich gilt nur bei identischem Endladestand. EE-Anteil ist kein CO₂-Wert.<br>PV-P50 der Hauptanlage × ${fmt(plan.sources.pv_factor, "", 2)} × 0,95; keine PV-Prognose für Garage/Schuppen. Hausbedarf aus gelernter Stundenprognose, auf Viertelstunden verteilt. ${plan.joint ? "Tesla wird mit 10–16 A in ganzzahligen Schritten gemeinsam optimiert. Zuerst wird die Hausversorgung optimiert, danach die Speicherreserve und erst dann die zusätzliche Tesla-Ladung bis zum Ladelimit. Nur eine unter der Startschwelle ausgelöste Mindestladung hat bis zum Mindestziel Vorrang. Kürzere Ladezeit wird mit 0,01 € je Ladestunde als zusätzlichem Modellgewicht bewertet; dadurch werden bei ansonsten gleichen Bedingungen höhere Ströme bis 16 A bevorzugt. Zusätzlich werden 0,05 € je Ladestart als Modellgewicht angesetzt, um zusammenhängende Ladeblöcke zu bevorzugen. Diese Gewichte sind keine tatsächlichen Gebühren. Keine feste Abfahrtszeit: Unter der Tesla-Untergrenze bleibt die Mindestladung vorrangig; flexible Netzladung nach dem konfigurierten EE-Schwellenwert. Fehlt der EE-Anteil, ist keine zusätzliche flexible Netzladung erlaubt. Wallbox an erlaubt eine vorläufige Planung mit dem letzten bekannten SoC (höchstens 24 Stunden alt; bei unterschrittener Startschwelle darf auch ein älterer letzter SoC die dringende Mindestladung vormerken). Vor Ladestart müssen aktuelle Daten, Standort zuhause und Ladekabel bestätigt sein. Der Tesla wird erst im geplanten Ladefenster über seine registrierte Aufwecken-Taste geweckt (höchstens drei Versuche pro 24 Stunden, mindestens 15 Minuten Abstand). Ohne eindeutige Taste keine automatische Weckaktion. Keine Rückkehrzeit wird erfunden. Tesla-Speicherschutz gilt für die gesamte gemeinsame Entladegrenze. Zieltoleranzen: ein Startladeblock (15 Minuten bei Startstrom) beim Tesla, 0,001 kWh bei der Reserve und 0,001 € im Modellziel. Kein Kostenvergleich mit einem reinen Hausfahrplan." : "Hausfahrplan ohne Tesla. Bei tatsächlicher oder angeforderter Tesla-Ladung hat die bisherige Tesla-Regelung Vorrang."} Mindeststand ${fmt(plan.minimum_soc, "%")} Hausspeicher-SoC, Wirkungsgrad je Richtung ${fmt(plan.config.efficiency * 100, "%")}, Leistungsgrenzen und Speicherkapazität berücksichtigt. Kein Netzladen, kein Hausspeicher-Export. Die gewünschte Endreserve wird bei bereits niedrigerem Startstand auf diesen begrenzt. Liegt der Startstand unter der Wechselrichter-Untergrenze, bleibt die Entladung gesperrt; verfügbare PV-Überschüsse füllen zuerst bis zur Untergrenze auf. Energieherkunft im vorhandenen Hausspeicher wird nicht als garantiert reine PV ausgewiesen. Es werden keine CO₂-Einsparungen oder statistisch kalibrierten Unsicherheitsbänder behauptet.<br>Planung: ${time(plan.updated)} · EE-Abruf: ${plan.sources.ee_fetched ? time(plan.sources.ee_fetched) : "—"} · Hausprognose: ${time(plan.sources.house_updated)}. Alle fünf Minuten neu berechnet; nach zehn Minuten ohne neuen Plan als veraltet markiert. Fehlende Hausprognosen verhindern die Planung. Solcast-Zeitprognosen bleiben bis mindestens 24 Stunden nach dem Abruf nutzbar; fehlende oder ältere PV-Zeitfenster werden im Ersatzplan vorsichtig mit 0 kW angesetzt und gekennzeichnet. Fehlende EE-Werte erhalten kein zusätzliches Planungssignal. Börsenpreise dienen ausschließlich der Anzeige. Preise werden stündlich abgerufen. Börsenpreise: Bundesnetzagentur / SMARD.de, CC BY 4.0; Preisprognose: Energyforecast. ${active ? "Der gültige Fahrplan steuert die gemeinsame Entladegrenze fürs Haus. Fallback bei ungültigen oder veralteten Quellen, fehlendem Zeitfenster oder mehr als 5 Prozentpunkten SoC-Abweichung. Der aktuelle Hausspeicher-Mindeststand und die Gerätegrenzen haben Vorrang. Kein Netzladen." : "HiGHS-Steuerung ist nicht aktiv. Die bestehende Regelung steuert weiterhin."}</p></details>${planControls(panel)}</section>`;
}

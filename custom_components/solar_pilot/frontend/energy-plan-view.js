// House plan and verified controller status. All numbers come from the backend LP, never mock data.
import { esc, fmt } from "./view-format.js";
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
export function currentEECard(status) {
  const g=status?.grid_forecast, share=g?.available ? g.share : null;
  const valid=typeof share === "number" && Number.isFinite(share);
  const color=valid ? (share>80 ? "#65dba5" : share<40 ? "#f07878" : "#e4c65c") : "var(--muted)";
  return `<section class="card full current-ee-card"><div class="split"><span>Erneuerbare im Netzstrom · jetzt</span><strong style="color:${color}">● ${fmt(valid?share:null,"%")}</strong></div></section>`;
}
export function energyPlanCard(panel) {
  const plan = panel.status?.energy_plan,
    zone = panel._hass?.config?.time_zone || "Europe/Berlin";
  const control=panel.status?.energy_control;
  const active=panel.status?.settings?.planner_control_enabled && !["observe","paused"].includes(panel.status?.mode);
  const head = `<div class="card-title"><h2>Energie-Fahrplan</h2><span class="plan-observe">${active ? "HiGHS · Haus & Speicher" : "Beobachtung · Haus & Speicher"}</span></div>`;
  const state=active ? `<p class="note plan-control-state"><strong>${esc(control?.reason || "Steuerung wird vorbereitet")}</strong><br>Entladegrenze: ${fmt(control?.discharge_w,"W")} · eingestellt: ${fmt(panel.status?.snapshot?.current_discharge_w,"W")}</p>` : "";
  if (!plan?.available)
    return `<section class="card full energy-plan-card">${head}${state}<p class="note">${esc(plan?.reason || "Fahrplan wird vorbereitet")}${plan?.calculating ? " · Berechnung läuft" : ""}</p><p class="note">${active ? "Die bisherige Regelung übernimmt als Fallback; Schutzgrenzen bleiben verbindlich." : "Keine Gerätebefehle aus dem Fahrplan. Die bestehende Regelung bleibt aktiv."}</p></section>`;
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
    right = W - 18;
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
    const H = type === "supply" ? 195 : type === "soc" ? 160 : 125,
      top = 28,
      bottom = H - 27;
    const max =
      type === "supply"
        ? Math.max(0.5, ...points.map((p) => p.load_kw)) * 1.12
        : 100;
    const y = (v) => bottom - (v / max) * (bottom - top);
    let body = shade(top, bottom);
    const ticks =
      type === "supply"
        ? [0, max / 2, max]
        : type === "soc"
          ? [plan.minimum_soc, 50, 100]
          : [40, 80];
    for (const v of ticks)
      body += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${left - 7}" y="${y(v) + 4}" text-anchor="end">${fmt(v, "", type === "supply" ? 1 : 0)}${type === "supply" ? "" : "%"}</text>`;
    if (type === "soc") {
      const path = [
        { start: plan.start, soc: plan.initial_soc },
        ...points.map((p) => ({ start: p.end, soc: p.soc })),
      ]
        .map((p, i) => `${i ? "L" : "M"}${x(p.start)},${y(p.soc)}`)
        .join(" ");
      body += `<path d="${path}" class="plan-soc-line"/><circle cx="${left}" cy="${y(plan.initial_soc)}" r="3.5" class="plan-soc-dot"/>`;
    } else
      for (const p of points) {
        const width = Math.max(
          0.25,
          x(p.end) - x(p.start) - (narrow ? 0.3 : 1),
        );
        if (type === "ee")
          body += `<rect x="${x(p.start)}" y="${y(Math.min(100, p.ee))}" width="${width}" height="${bottom - y(Math.min(100, p.ee))}" class="grid-${p.ee > 80 ? "green" : p.ee < 40 ? "red" : "yellow"}"/>`;
        else {
          let base = bottom;
          for (const [key, cls] of [
            ["pv_direct_kw", "pv"],
            ["battery_kw", "battery"],
            ["grid_kw", "grid"],
          ]) {
            const height = (p[key] / max) * (bottom - top);
            body += `<rect x="${x(p.start)}" y="${base - height}" width="${width}" height="${height}" class="plan-fill-${cls}"/>`;
            base -= height;
          }
        }
      }
    const label =
      type === "supply"
        ? "Hausversorgung · kW"
        : type === "soc"
          ? "Akku-Ladestand · SoC"
          : "EE-Anteil im Netzstrom";
    return `<svg class="plan-chart" data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: optimierter 24-Stunden-Fahrplan "><text x="0" y="15" class="plan-chart-title">${label}</text>${body}<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="grid-now"/>${axis(H)}</svg>`;
  };
  const delta = (value, unit, digits = 2) =>
    `${value > 0 ? "+" : ""}${fmt(Math.abs(value) < 0.00001 ? 0 : value, unit, digits)}`;
  const p = selected.first,
    span = selected.end - selected.start;
  const selectedEE =
    points
      .filter((p) => p.start >= selected.start && p.start < selected.end)
      .reduce((a, p) => a + p.ee * (p.end - p.start), 0) / span;
  return `<section class="card full energy-plan-card">${head}${state}<div class="plan-current"><ha-icon icon="mdi:${first.battery_kw > 0.02 ? "battery-arrow-down" : first.charge_kw > 0.02 ? "battery-charging" : "transmission-tower"}"></ha-icon><div><strong>${esc(first.reason)}</strong><span class="sub">Bis ${time(groups[0].end)} · ${date(plan.start)} ${time(plan.start)} → ${date(plan.end)} ${time(plan.end)}</span></div></div><div class="chart-legend plan-legend"><span><i class="plan-fill-pv"></i>PV direkt</span><span><i class="plan-fill-battery"></i>Akku</span><span><i class="plan-fill-grid"></i>Netz</span></div>${chart("supply")}${chart("soc")}${chart("ee")}<nav class="plan-periods" aria-label="Zeitraum erklären"><button type="button" data-plan-step="-1" aria-label="Vorherigen Planungszeitraum erklären" ${index === 0 ? "disabled" : ""}>‹</button><strong>${date(selected.start)} · ${time(selected.start)}–${time(selected.end)}</strong><button type="button" data-plan-step="1" aria-label="Nächsten Planungszeitraum erklären" ${index === groups.length - 1 ? "disabled" : ""}>›</button></nav><div class="plan-explanation" aria-live="polite"><strong>${esc(selected.reason)}</strong><p>${esc(p.explanation)}</p><span class="sub">EE-Anteil Ø ${fmt(selectedEE, "%")} · Akku ${fmt(index === 0 ? plan.initial_soc : groups[index - 1].last.soc, "%")} → ${fmt(selected.last.soc, "%")}</span></div><h3 class="plan-compare-title">Gegenüber Schwellenregel · simuliert</h3><div class="plan-comparison"><div><strong>${delta(plan.delta.cost, "€")}</strong><span>Stromkosten</span></div><div><strong>${delta(plan.delta.grid_kwh, "kWh", 1)}</strong><span>Netzbezug</span></div><div><strong>${delta(plan.delta.throughput_kwh, "kWh", 1)}</strong><span>Akku-Durchsatz</span></div></div><details class="plan-details"><summary>Berechnung und Datenquellen</summary><p class="note">${esc(plan.solver)} · 24 Stunden, Viertelstundenraster. Optimiert werden Stromkosten minus Einspeisevergütung, zuzüglich Modellgewichten für nicht erneuerbaren Netzbezug und Akku-Durchsatz. EE-Gewicht ${fmt(plan.config.ee_weight, "€/kWh", 3)}, Durchsatzgewicht ${fmt(plan.config.cycle_cost, "€/kWh", 3)}: keine tatsächlichen Gebühren. Positive Vergleichswerte bedeuten Mehrverbrauch oder Mehrkosten. Endladestand bei beiden Fahrplänen identisch: ${fmt(plan.terminal_soc, "%")} Akku-SoC. Die Vergleichsregel enthält dieselbe gewünschte Endreserve. EE-Anteil ist kein CO₂-Wert.<br>PV-P50 der Hauptanlage × ${fmt(plan.sources.pv_factor, "", 2)} × 0,95; keine PV-Prognose für Garage/Schuppen. Hausbedarf aus gelernter Stundenprognose, auf Viertelstunden verteilt. Tesla wird nicht optimiert. Bei tatsächlicher oder angeforderter Tesla-Ladung hat die bisherige Tesla-Regelung Vorrang; der Hausfahrplan setzt die gemeinsame Entladegrenze dann nicht. Mindeststand ${fmt(plan.minimum_soc, "%")} Akku-SoC, Wirkungsgrad je Richtung ${fmt(plan.config.efficiency * 100, "%")}, Leistungsgrenzen und Speicherkapazität berücksichtigt. Kein Netzladen, kein Akku-Export. Die gewünschte Endreserve wird bei bereits niedrigerem Startstand auf diesen begrenzt. Liegt der Startstand unter der Haus-Untergrenze, bleibt die Entladung gesperrt; verfügbare PV-Überschüsse füllen zuerst bis zur Untergrenze auf. Energieherkunft im vorhandenen Akku wird nicht als garantiert reine PV ausgewiesen. Es werden keine CO₂-Einsparungen oder statistisch kalibrierten Unsicherheitsbänder behauptet.<br>Planung: ${time(plan.updated)} · EE-Abruf: ${time(plan.sources.ee_fetched)} · Hausprognose: ${time(plan.sources.house_updated)}. Alle fünf Minuten neu berechnet; nach zehn Minuten ohne neuen Plan als veraltet markiert. Bei Prognoselücken kein erfundener Fahrplan. ${active ? "Der gültige Fahrplan steuert die gemeinsame Entladegrenze fürs Haus. Fallback bei ungültigen oder veralteten Quellen, fehlendem Zeitfenster oder mehr als 5 Prozentpunkten SoC-Abweichung. Der aktuelle Akku-Mindeststand und die Gerätegrenzen haben Vorrang. Kein Netzladen." : "HiGHS-Steuerung ist nicht aktiv. Die bestehende Regelung steuert weiterhin."}</p></details></section>`;
}

// Rolling PV timeline. Display only; no commands or changes to daily accounting.
import { actualSegments, forecastPoints, number } from "./solar-chart.js";
import { pvDayIds, dateKey } from "./day-forecast.js";
import { gridDaySections } from "./grid-forecast-view.js?v=0.1.61";
import { esc, fmt } from "./view-format.js";

export function solarTimelineData({
  now,
  hours,
  states,
  source,
  history,
  unit,
}) {
  const start = now - hours * 3600000,
    end = now + hours * 3600000;
  const rows = new Map();
  for (const id of source.forecastIds || pvDayIds(source.forecastId)) {
    const state = states[id];
    if (
      !state ||
      ["unknown", "unavailable"].includes(state.state) ||
      state.attributes?.dataCorrect === false
    )
      continue;
    for (const p of forecastPoints(
      state.attributes?.detailedForecast,
      start - 1800000,
      end,
    ))
      rows.set(p.t, p);
  }
  const forecast = [...rows.values()]
    .sort((a, b) => a.t - b.t)
    .map((p) => ({
      ...p,
      start: Math.max(now, p.t),
      end: Math.min(end, p.t + 1800000),
    }))
    .filter((p) => p.end > p.start);
  return {
    start,
    end,
    forecast,
    actual: actualSegments(history, start, now, unit),
  };
}

export function solarTimeline(panel, s, metrics, now = Date.now()) {
  const zone = panel._hass?.config?.time_zone || "Europe/Berlin",
    source = panel.solarSources();
  const narrow = matchMedia("(max-width:700px)").matches,
    hours = matchMedia("(min-width:1000px)").matches ? 24 : 12;
  const data = solarTimelineData({
    now,
    hours,
    states: panel._hass?.states || {},
    source,
    history: panel.historySources?.split(",").includes(source.powerId)
      ? panel.solarHistory
      : [],
    unit: source.power?.attributes?.unit_of_measurement,
  });
  const { start, end, forecast, actual } = data;
  const W = narrow ? 420 : 960,
    H = 325,
    left = narrow ? 42 : 64,
    right = W - 22,
    top = 52,
    bottom = 250;
  const max =
    Math.max(
      1,
      ...forecast.map((p) => p.p),
      ...actual.flatMap((seg) => seg.map((p) => p.p)),
    ) * 1.12;
  const x = (t) => left + ((t - start) / (end - start)) * (right - left),
    y = (p) => bottom - (p / max) * (bottom - top);
  const time = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t));
  const path = (series) =>
    series
      .map(
        (p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.p).toFixed(2)}`,
      )
      .join(" ");
  const today = dateKey(now, zone);
  const dayLabels = gridDaySections(start / 1000, end / 1000, zone)
    .map((part) => {
      const offset = Math.round(
        (Date.parse(dateKey(part.start * 1000, zone)) - Date.parse(today)) /
          86400000,
      );
      const label =
        {
          [-2]: "Vorgestern",
          [-1]: "Gestern",
          0: "Heute",
          1: "Morgen",
          2: "Übermorgen",
        }[offset] || dateKey(part.start * 1000, zone);
      const a = x(part.start * 1000),
        b = x(part.end * 1000);
      return `<rect x="${a}" y="9" width="${b - a}" height="22" class="pv-day-band"/><text class="pv-day-label" x="${(a + b) / 2}" y="25" text-anchor="middle">${label}</text>${part.start * 1000 > start ? `<line x1="${a}" x2="${a}" y1="34" y2="${bottom}" class="grid-day-divider"/>` : ""}`;
    })
    .join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="${left}" x2="${right}" y1="${y(v * max)}" y2="${y(v * max)}" class="chart-grid"/><text x="${left - 8}" y="${y(v * max) + 4}" text-anchor="end">${fmt(v * max, "", 1)}</text>`,
    )
    .join("");
  const step = hours === 24 ? 6 : 3;
  const axis = [];
  for (let offset = -hours; offset <= hours; offset += step) {
    const t = now + offset * 3600000;
    axis.push(
      `<text x="${x(t)}" y="276" text-anchor="${offset === -hours ? "start" : offset === hours ? "end" : "middle"}">${time(t)}</text>`,
    );
  }
  const areas = (key) =>
    forecast
      .filter((p) => number(p[key]) !== null)
      .map(
        (p) =>
          `<path d="M${x(p.start)},${bottom} L${x(p.start)},${y(p[key])} L${x(p.end)},${y(p[key])} L${x(p.end)},${bottom} Z" class="${key === "p" ? "forecast-area" : "forecast-low"}"/>`,
      )
      .join("");
  const actualPaths = actual
    .map(
      (seg) =>
        `<path d="${path(seg)}" class="actual-line"/>${seg.length === 1 ? `<circle cx="${x(seg[0].t)}" cy="${y(seg[0].p)}" r="2.5" class="actual-dot"/>` : ""}`,
    )
    .join("");
  const marker = `<line x1="${x(now)}" x2="${x(now)}" y1="38" y2="${bottom}" class="chart-now"/><text class="pv-now-label" x="${x(now)}" y="305" text-anchor="middle">JETZT</text>`;
  return `<section class="card full forecast-card"><div class="card-title"><h2>PV-Verlauf & Prognose</h2><span class="sub">Solcast · ±${hours} h</span></div>${metrics}<svg class="solar-chart pv-rolling" data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" role="img" aria-label="PV-Leistung ${hours} Stunden vor und nach JETZT. Links gemessener PV-Verlauf, rechts Solcast-Prognose P50 und P10, in Kilowatt. Fehlende Daten bleiben Lücken."><text x="${left - 25}" y="43">kW</text>${dayLabels}${ticks}${areas("p")}${areas("low")}${actualPaths}${marker}${axis.join("")}</svg><div class="chart-legend"><span><i class="legend-actual"></i>PV-Ist (Eingang) · ${fmt(s.pv_w == null ? null : s.pv_w / 1000, "kW", 2)}</span><span><i class="legend-forecast"></i>Prognose P50</span><span><i class="legend-low"></i>Vorsichtig P10</span></div>${panel.historyError || !actual.length || !forecast.length ? `<p class="note">${esc(panel.historyError || (!actual.length ? "Kein gemessener PV-Verlauf im Zeitfenster. " : ""))}${!forecast.length ? " Keine gültige Solcast-Prognose im Zeitfenster." : ""}</p>` : ""}</section>`;
}

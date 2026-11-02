// Fixed local-day PV view. Display only; never changes controller decisions.
import {
  actualSegments,
  forecastPoints,
  number,
  dayBounds,
} from "./solar-chart.js";
import { pvDayIds, pvDays, dateKey } from "./day-forecast.js";
import { dailyConsumption } from "./consumption-chart.js";
import { esc, fmt } from "./view-format.js";

export function solarDayData({
  now,
  offset = 0,
  zone = "Europe/Berlin",
  states,
  source,
  history,
  unit,
}) {
  const today = dayBounds(now, zone),
    bounds = offset === 1 ? dayBounds(today.end + 1, zone) : today;
  const { start, end } = bounds,
    ids = source.forecastIds || pvDayIds(source.forecastId),
    rows = new Map();
  for (const id of ids) {
    const state = states[id];
    if (
      !state ||
      ["unknown", "unavailable"].includes(state.state) ||
      state.attributes?.dataCorrect === false
    )
      continue;
    for (const p of forecastPoints(
      state.attributes?.detailedForecast,
      start,
      end,
    ))
      rows.set(p.t, p);
  }
  const forecast = [...rows.values()]
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ ...p, start: p.t, end: Math.min(end, p.t + 1800000) }));
  const key = dateKey(start, zone);
  const totals = pvDays(states, source.forecastId, zone, ids)[key];
  const remaining = forecast.length
    ? forecast.reduce(
        (sum, p) =>
          sum + (p.p * Math.max(0, p.end - Math.max(now, p.start))) / 3600000,
        0,
      )
    : null;
  return {
    start,
    end,
    key,
    forecast,
    remaining,
    total: totals?.kwh ?? null,
    low: totals?.low ?? null,
    actual:
      offset === 1
        ? []
        : actualSegments(history, start, Math.min(end, now), unit),
  };
}

export function solarTimeline(panel, s, now = Date.now()) {
  const zone = panel._hass?.config?.time_zone || "Europe/Berlin",
    source = panel.solarSources();
  const narrow = matchMedia("(max-width:700px)").matches,
    offset = panel.pvDayOffset === 1 ? 1 : 0;
  const day = solarDayData({
    now,
    offset,
    zone,
    states: panel._hass?.states || {},
    source,
    history: panel.historySources?.split(",").includes(source.powerId)
      ? panel.solarHistory
      : [],
    unit: source.power?.attributes?.unit_of_measurement,
  });
  const { start, end, forecast, actual } = day;
  const date = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(start));
  const metrics = (
    offset === 0
      ? [
          [dailyConsumption(source.roofDaily, now, zone), "Dach-Ertrag heute"],
          [day.total, "Prognose P50"],
          [day.low, "Vorsichtig P10"],
          [day.remaining, "Rest P50"],
        ]
      : [
          [day.total, "Prognose P50"],
          [day.low, "Vorsichtig P10"],
        ]
  )
    .map(
      ([v, label]) =>
        `<div><strong>${fmt(v, "kWh", 1)}</strong><span>${label}</span></div>`,
    )
    .join("");
  const W = narrow ? 420 : 960,
    H = 300,
    left = narrow ? 42 : 64,
    right = W - 22,
    top = 28,
    bottom = 240;
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
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="${left}" x2="${right}" y1="${y(v * max)}" y2="${y(v * max)}" class="chart-grid"/><text x="${left - 8}" y="${y(v * max) + 4}" text-anchor="end">${fmt(v * max, "", 1)}</text>`,
    )
    .join("");
  const axis = [];
  for (let t = start; t < end; t += (narrow ? 6 : 3) * 3600000)
    axis.push(
      `<text x="${x(t)}" y="266" text-anchor="middle">${time(t)}</text>`,
    );
  axis.push(`<text x="${right}" y="266" text-anchor="middle">24:00</text>`);
  const areas = (key) =>
    forecast
      .filter((p) => number(p[key]) !== null)
      .map(
        (p) =>
          `<path d="M${x(p.start)},${bottom} L${x(p.start)},${y(p[key])} L${x(p.end)},${y(p[key])} L${x(p.end)},${bottom} Z" class="${key === "p" ? "forecast-area" : "forecast-low"}"/>`,
      )
      .join("");
  const measured = actual
    .map(
      (seg) =>
        `<path d="${path(seg)}" class="actual-line"/>${seg.length === 1 ? `<circle cx="${x(seg[0].t)}" cy="${y(seg[0].p)}" r="2.5" class="actual-dot"/>` : ""}`,
    )
    .join("");
  const marker =
    offset === 0 && now >= start && now < end
      ? `<line x1="${x(now)}" x2="${x(now)}" y1="16" y2="${bottom}" class="chart-now"/><text class="pv-now-label" x="${Math.min(right - 20, Math.max(left + 20, x(now)))}" y="291" text-anchor="middle">JETZT</text>`
      : "";
  return `<section class="card full forecast-card"><div class="card-title"><h2>PV-Prognose</h2><span class="sub">Solcast</span></div><nav class="pv-day-nav" aria-label="PV-Prognose nach Tag"><button type="button" data-pv-day="0" aria-label="PV-Prognose heute anzeigen" ${offset === 0 ? "disabled" : ""}>‹</button><strong>${offset === 0 ? "Heute" : "Morgen"} · ${esc(date)}</strong><button type="button" data-pv-day="1" aria-label="PV-Prognose morgen anzeigen" ${offset === 1 ? "disabled" : ""}>›</button></nav><div class="forecast-metrics">${metrics}</div><svg class="solar-chart pv-rolling" data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" role="img" aria-label="PV-Leistung ${offset === 0 ? "heute" : "morgen"} von 0 bis 24 Uhr. ${offset === 0 ? "Gemessener PV-Verlauf und " : ""}Solcast-Prognose P50 und P10 in Kilowatt."><text x="${left - 25}" y="17">kW</text>${ticks}${areas("p")}${areas("low")}${measured}${marker}${axis.join("")}</svg><div class="chart-legend">${offset === 0 ? `<span><i class="legend-actual"></i>PV-Ist (Eingang) · ${fmt(s.pv_w == null ? null : s.pv_w / 1000, "kW", 2)}</span>` : ""}<span><i class="legend-forecast"></i>Prognose P50</span><span><i class="legend-low"></i>Vorsichtig P10</span></div>${!forecast.length ? '<p class="note">Keine gültige Solcast-Prognose für diesen Tag verfügbar.</p>' : ""}${offset === 0 && panel.historyError ? `<p class="note">${esc(panel.historyError)}</p>` : ""}</section>`;
}

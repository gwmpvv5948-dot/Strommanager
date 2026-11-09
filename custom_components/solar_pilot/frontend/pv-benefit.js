// Financial display only. Energy is read from HA long-term statistics in kWh.
import { esc, fmt } from "./view-format.js?v=0.1.55";
import { dateKey } from "./day-forecast.js?v=0.1.55";
import { dayBounds, number } from "./solar-chart.js";
const DAY = 86400000;
const stamp = (v) =>
  typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : Date.parse(v);
const dateFormatters = new Map();
function statisticDay(value, zone) {
  const t = stamp(value);
  if (!Number.isFinite(t)) return null;
  if (!dateFormatters.has(zone))
    dateFormatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  const parts = Object.fromEntries(
    dateFormatters
      .get(zone)
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const money = (v) =>
  number(v) === null
    ? "—"
    : Number(v).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export function benefitSources(status) {
  const d = status?.source_entities?.display || {};
  return [
    d.pv_daily,
    d.benefit_garage_energy,
    d.benefit_shed_energy,
    d.benefit_export_energy,
  ];
}
export function benefitCostSource(status) {
  return status?.source_entities?.display?.grid_import_daily;
}

export function benefitWeek(now, zone = "Europe/Berlin", offset = 0) {
  const today = dateKey(now, zone),
    noon = Date.parse(today + "T12:00:00Z");
  const monday =
    noon - ((new Date(noon).getUTCDay() + 6) % 7) * DAY + offset * 7 * DAY;
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * DAY).toISOString().slice(0, 10),
  );
  const thursday = new Date(monday + 3 * DAY);
  thursday.setUTCHours(0, 0, 0, 0);
  const year = thursday.getUTCFullYear(),
    week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  const start = dayBounds(monday, zone).start,
    end = dayBounds(monday + 7 * DAY, zone).start;
  return { days, start, end, week, year, today };
}
export function benefitAmounts(
  statistics,
  ids,
  days,
  settings = {},
  zone = "Europe/Berlin",
) {
  const byId = ids.map((id) => {
    const values = new Map();
    for (const row of statistics?.[id] || []) {
      const day = statisticDay(row.start, zone),
        v = number(row.change);
      if (day)
        values.set(day, v !== null && v >= -1e-7 ? Math.max(0, v) : null);
    }
    return values;
  });
  const feed = number(settings.feed_in_eur_kwh) ?? 0.082,
    purchase = number(settings.purchase_eur_kwh) ?? 0.27;
  return days.map((day) => {
    const kwh = byId.map((m) => m.get(day) ?? null),
      exportKwh = kwh[3];
    const generated = kwh.slice(0, 3).every((v) => v !== null)
      ? kwh[0] + kwh[1] + kwh[2]
      : null;
    // AC inverter yield includes delivered battery energy. Do not count charging
    // as savings or add discharge a second time. A contradictory balance is unknown.
    const selfKwh =
      generated !== null && exportKwh !== null && generated - exportKwh >= -0.02
        ? Math.max(0, generated - exportKwh)
        : null;
    const income = exportKwh === null ? null : exportKwh * feed,
      saving = selfKwh === null ? null : selfKwh * purchase;
    return {
      day,
      exportKwh,
      selfKwh,
      income,
      saving,
      total: income !== null && saving !== null ? income + saving : null,
    };
  });
}
// Exclude the first common day: one source may have started at midday.
export function benefitArchive(
  statistics,
  ids,
  zone = "Europe/Berlin",
  beforeDay = null,
) {
  const dates = ids.map((id) =>
    (statistics?.[id] || [])
      .map((r) => statisticDay(r.start, zone))
      .filter(Boolean)
      .sort(),
  );
  if (dates.some((rows) => !rows.length)) return [];
  const first = dates
    .map((rows) => rows[0])
    .sort()
    .at(-1);
  const days = [...new Set(dates.flat())]
    .sort()
    .filter((day) => day > first && (!beforeDay || day < beforeDay));
  return benefitAmounts(statistics, ids, days, {}, zone).map(
    ({ day, selfKwh, exportKwh }) => ({ day, selfKwh, exportKwh }),
  );
}
export function benefitTotal(archive, today, settings = {}) {
  const feed = settings.feed_in_eur_kwh ?? 0.082,
    purchase = settings.purchase_eur_kwh ?? 0.27;
  const initialSaving = number(settings.benefit_initial_savings_eur) ?? 0;
  const rows = [
    ...new Map(
      [...(archive || []), ...(today ? [today] : [])].map((row) => [
        row.day,
        row,
      ]),
    ).values(),
  ];
  const valid = rows
    .filter((r) => number(r.selfKwh) !== null && number(r.exportKwh) !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!valid.length)
    return {
      total: null,
      recordedTotal: null,
      initialSaving,
      income: null,
      saving: null,
      days: 0,
      first: null,
      last: null,
      missing: rows.length,
    };
  const income = valid.reduce((sum, r) => sum + r.exportKwh * feed, 0),
    saving = valid.reduce((sum, r) => sum + r.selfKwh * purchase, 0);
  return {
    total: income + saving + initialSaving,
    recordedTotal: income + saving,
    initialSaving,
    income,
    saving,
    days: valid.length,
    first: valid[0].day,
    last: valid.at(-1).day,
    missing: rows.length - valid.length,
  };
}
function longDay(day) {
  return day
    ? day.slice(8) + "." + day.slice(5, 7) + "." + day.slice(0, 4)
    : "—";
}
function dayLabel(day) {
  return day.slice(8) + "." + day.slice(5, 7) + ".";
}
export function pvBenefitCard(panel) {
  const zone = panel._hass?.config?.time_zone || "Europe/Berlin",
    now = Date.now(),
    week = benefitWeek(now, zone, panel.benefitWeekOffset ?? 0),
    ids = benefitSources(panel.status),
    sources = ids.join("|") + "|" + zone;
  const todayKey = "today:" + week.today + "|" + sources,
    weekKey = "week:" + week.days[0] + "|" + sources;
  const allData = panel.benefitCache?.get("all:" + week.today + "|" + sources);
  const todayData = panel.benefitCache?.get(todayKey),
    weekData = panel.benefitCache?.get(weekKey),
    settings = panel.status?.settings || {};
  const live =
    !!todayData?.statistics &&
    !todayData.error &&
    !panel._error &&
    now - todayData.fetched < 900000;
  const today = benefitAmounts(
    live ? todayData.statistics : {},
    ids,
    [week.today],
    settings,
    zone,
  )[0];
  const rows = benefitAmounts(
    weekData?.statistics,
    ids,
    week.days,
    settings,
    zone,
  ).map((r) =>
    r.day > week.today
      ? { ...r, income: null, saving: null, total: null, future: true }
      : r,
  );
  const showCosts = panel.benefitView === "costs";
  const importId = benefitCostSource(panel.status);
  const costSource = importId + "|" + zone;
  const costWeek = panel.benefitCache?.get("cost:" + week.days[0] + "|" + costSource);
  const costToday = panel.benefitCache?.get("cost-today:" + week.today + "|" + costSource);
  const costAll = panel.benefitCache?.get("cost-all:" + week.today + "|" + costSource);
  const purchase = settings.purchase_eur_kwh ?? 0.27;
  const feed = settings.feed_in_eur_kwh ?? 0.082;
  const base = settings.benefit_daily_base_eur ?? 0;
  const costRows = (data) => new Map((data?.statistics?.[importId] || []).flatMap(row => {
    const day = statisticDay(row.start, zone), kwh = number(row.change);
    return day && kwh !== null && kwh >= 0
      ? [[day, {day, kwh, imported: kwh * purchase, base, total: kwh * purchase + base}]] : [];
  }));
  const weekCosts = costRows(costWeek);
  const todayCost = costRows(costToday).get(week.today);
  const chartRows = showCosts ? rows.map(({day, future}) => future
    ? {day, future, total: null}
    : (day === week.today ? todayCost : weekCosts.get(day)) ?? {day, total: null}) : rows;
  const known = chartRows.filter(row => row.total !== null);
  const weeklyTotal = known.length ? known.reduce((sum, row) => sum + row.total, 0) : null;
  const weekComplete = known.length === chartRows.filter(row => !row.future).length;
  const historicalCosts = [...costRows(costAll).values()]
    .filter(row => row.day < week.today).sort((a,b) => a.day.localeCompare(b.day)).slice(1);
  if (todayCost) historicalCosts.push(todayCost);
  const all = showCosts ? {
    first: historicalCosts[0]?.day,
    last: historicalCosts.at(-1)?.day,
    total: historicalCosts.length ? historicalCosts.reduce((sum,row) => sum + row.total, 0) : null,
  } : allData?.archive ? benefitTotal(allData.archive, today.total === null ? null : today, settings) : {total:null};
  const max = Math.max(1, Math.ceil(Math.max(0, ...known.map(row => row.total))));
  const current = showCosts ? todayCost : today;
  const title = showCosts ? "Deine Stromkosten" : "Dein PV-Vorteil";
  const categories = showCosts
    ? [["Netzbezug", "imported", current?.imported, fmt(current?.kwh, "kWh", 2)], ["Grundpreis", "base", current?.base]]
    : [["Einspeisung", "export", today.income, fmt(today.exportKwh, "kWh", 2)], ["Ersparnis", "saving", today.saving, fmt(today.selfKwh, "kWh", 2)]];
  const segment = (color, value, total, property) =>
    `<span class="${color}" style="${property}:${total > 0 ? (value ?? 0) / total * 100 : 0}%"></span>`;
  const error = showCosts ? costToday?.error || costWeek?.error || costAll?.error : todayData?.error || weekData?.error || allData?.error;
  return `<section class="card benefit-card" aria-label="${title}">
    <div class="benefit-heading"><h2>${title}</h2>
      <div class="benefit-switch ${showCosts ? "costs" : ""}" role="group" aria-label="Kartenansicht">
        <button type="button" data-benefit-view="benefit" aria-pressed="${!showCosts}"><ha-icon icon="mdi:arrow-top-right"></ha-icon>Vorteil</button>
        <button type="button" data-benefit-view="costs" aria-pressed="${showCosts}"><ha-icon icon="mdi:receipt-text-outline"></ha-icon>Kosten</button>
      </div>
    </div>
    <span class="sub">Heute · bisher</span><strong class="benefit-headline">${money(current?.total)}</strong>
    <div class="benefit-share" aria-hidden="true">${categories.map(([,color,value]) => segment(color,value,current?.total,"width")).join("")}</div>
    <div class="benefit-chart-legend">${categories.map(([label,color,value,detail]) => `<span><i class="benefit-dot ${color}"></i>${label} <strong>${money(value)}</strong>${detail ? ` · ${detail}` : ""}</span>`).join("")}</div>
    <div class="benefit-history">
      <div class="benefit-compact-week" role="group" aria-label="Kalenderwoche">
        <button type="button" data-benefit-week="older" aria-label="Ältere Kalenderwoche">‹</button>
        <strong>KW ${week.week} · ${week.year}</strong>
        <button type="button" data-benefit-week="newer" aria-label="Neuere Kalenderwoche" ${(panel.benefitWeekOffset ?? 0) >= 0 ? "disabled" : ""}>›</button>
        <span class="sub">€ / Tag</span>
      </div>
      <div class="benefit-chart" role="group" aria-label="${title} je Tag in Kalenderwoche ${week.week}">
        <div class="benefit-gridlines">${[0, .5, 1].map(v => `<div style="bottom:${v * 100}%"><span>${fmt(v * max, "", 1)}</span></div>`).join("")}</div>
        ${chartRows.map((row,i) => {
          const parts = showCosts ? [row.imported,row.base] : [row.income,row.saving];
          return `<div class="benefit-day" role="img" aria-label="${esc(row.day)} · ${row.future ? "zukünftig" : row.total === null ? "Daten unvollständig" : money(row.total)}">
            <div class="benefit-day-column">
              <span class="benefit-day-value" style="bottom:${(row.total ?? 0) / max * 100}%">${row.total === null ? "—" : fmt(row.total, "", 2)}</span>
              ${row.total === null ? "" : `<div class="benefit-day-stack" style="height:${row.total / max * 100}%">${categories.map(([,color],index) => segment(color,parts[index],row.total,"height")).join("")}</div>`}
            </div>
            <span class="benefit-day-label">${["Mo","Di","Mi","Do","Fr","Sa","So"][i]}<small>${dayLabel(row.day)}</small></span>
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="benefit-sums">
      <div><span>${weekComplete ? "Wochensumme" : "Woche · erfasste Tage"}</span><strong>${money(weeklyTotal)}</strong></div>
      <div><span>Gesamtsumme<small>${all.first ? longDay(all.first) + " – " + longDay(all.last) : "Kein auswertbarer Zeitraum"}</small></span><strong>${money(all.total)}</strong></div>
    </div>
    ${error ? `<p class="note weather-warning">${esc(error)}</p>` : current?.total == null ? '<p class="note">Tageswerte noch nicht verfügbar.</p>' : ""}
    <details class="benefit-help"><summary>Berechnung und Datenquellen</summary>
      <p class="note">${showCosts
        ? `Netzbezug × ${fmt(purchase,"€/kWh",3)} plus ${money(base)} Grundpreis je erfasstem Tag. Heute ist der volle Tagesgrundpreis enthalten. Die Gesamtsumme beginnt nach dem ersten möglichen Teilmesstag.`
        : `Einspeisung × ${fmt(feed,"€/kWh",3)} und selbst genutzte Energie × ${fmt(purchase,"€/kWh",3)}. Selbst genutzt = AC-Wechselrichterertrag + Garage + Schuppen − Einspeisung. Netzgeladene Speicherenergie lässt sich anhand dieser Zähler nicht trennen. In der Gesamtsumme stecken einmalig ${money(all.initialSaving ?? 0)} geschätzte Ersparnis vor Beginn der HA-Daten.`
      } Historische Werte verwenden die aktuell eingestellten Preise. Fehlende Tageswerte bleiben offen.</p>
    </details>
  </section>`;
}

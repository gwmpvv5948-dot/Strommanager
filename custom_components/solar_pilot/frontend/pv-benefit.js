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
  const costData = panel.benefitCache?.get("cost:" + week.days[0] + "|" + importId + "|" + zone);
  const imports = new Map((costData?.statistics?.[importId] || []).map(
    (row) => [statisticDay(row.start, zone), number(row.change)],
  ));
  const chartRows = showCosts ? rows.map(({day, future}) => {
    const kwh = imports.get(day);
    const total = !future && kwh != null && kwh >= 0
      ? kwh * (settings.purchase_eur_kwh ?? 0.27) : null;
    return {day, future, total};
  }) : rows;
  const weeklyKnown = rows.filter((r) => !r.future && r.total !== null);
  const weeklyTotal = weeklyKnown.length
    ? weeklyKnown.reduce((sum, r) => sum + r.total, 0)
    : null;
  const weekComplete =
    weeklyKnown.length === rows.filter((r) => !r.future).length;
  const all = allData?.archive
    ? benefitTotal(
        allData.archive,
        today.total !== null ? today : null,
        settings,
      )
    : { total: null, days: 0 };
  const max = Math.max(
    1,
    Math.ceil(Math.max(0, ...chartRows.map((r) => r.total ?? 0))),
  );
  const total = today.total || 0,
    feed = settings.feed_in_eur_kwh ?? 0.082,
    purchase = settings.purchase_eur_kwh ?? 0.27;
  const error = todayData?.error || weekData?.error || allData?.error;
  const rate = (value) => fmt(value, "€/kWh", 3);
  return `<section class="card benefit-card" aria-label="Dein PV-Vorteil"><div class="benefit-heading"><h2>Dein PV-Vorteil</h2><span class="sub">Heute · bisher</span></div><div class="benefit-pair"><div class="benefit-stat"><span><i class="benefit-dot export"></i>Einnahmen</span><strong>${money(today.income)}</strong><small>${fmt(today.exportKwh, "kWh", 2)} · ${rate(feed)}</small></div><div class="benefit-stat"><span><i class="benefit-dot saving"></i>Ersparnis</span><strong>${money(today.saving)}</strong><small>${fmt(today.selfKwh, "kWh", 2)} · ${rate(purchase)}</small></div></div><div class="benefit-share" aria-hidden="true"><span class="export" style="width:${total ? (today.income / total) * 100 : 0}%"></span><span class="saving" style="width:${total ? (today.saving / total) * 100 : 0}%"></span></div><div class="benefit-total"><span>Dein Vorteil heute</span><strong>${money(today.total)}</strong></div><div class="benefit-history"><div role="group" aria-label="Diagrammansicht"><button type="button" class="secondary" data-benefit-view="benefit" aria-pressed="${!showCosts}">Einnahmen/Ersparnis</button> <button type="button" class="secondary" data-benefit-view="costs" aria-pressed="${showCosts}">Kosten</button></div><div class="benefit-week-nav" role="group" aria-label="PV-Vorteil nach Kalenderwoche"><button data-benefit-week="older" aria-label="Ältere Kalenderwoche">←</button><div><strong>KW ${week.week} · ${week.year}</strong><span>${dayLabel(week.days[0])} – ${dayLabel(week.days[6])}</span></div><button data-benefit-week="newer" aria-label="Neuere Kalenderwoche" ${(panel.benefitWeekOffset ?? 0) >= 0 ? "disabled" : ""}>→</button></div><div class="benefit-chart-legend">${showCosts ? `<span><i class="benefit-dot export"></i>Netzbezug · ${rate(purchase)}</span>` : `<span><i class="benefit-dot export"></i>Einspeisevergütung</span><span><i class="benefit-dot saving"></i>Ersparnis</span>`}<span>€ / Tag</span></div><div class="benefit-chart" role="img" aria-label="Tagesbalken für Kalenderwoche ${week.week}. ${showCosts ? "Stromkosten aus Netzbezug." : "Gestapelt: Einspeisevergütung und Ersparnis."} Gedankenstrich bedeutet fehlende Daten, nicht null Euro."><div class="benefit-gridlines">${[0, 0.5, 1].map((v) => `<div style="bottom:${v * 100}%"><span>${fmt(v * max, "", 1)}</span></div>`).join("")}</div>${chartRows.map((r, i) => `<div class="benefit-day" role="img" aria-label="${esc(r.day)}: ${r.future ? "zukünftig" : r.total === null ? "Daten unvollständig" : showCosts ? money(r.total) : money(r.income) + " Einspeisevergütung, " + money(r.saving) + " Ersparnis"}"><div class="benefit-day-column"><span class="benefit-day-value" style="bottom:${((r.total ?? 0) / max) * 100}%">${r.total === null ? "—" : fmt(r.total, "", 2)}</span>${r.total !== null ? `<div class="benefit-day-stack" style="height:${(r.total / max) * 100}%">${showCosts ? `<span class="export" style="height:100%"></span>` : `<span class="export" style="height:${r.total ? (r.income / r.total) * 100 : 0}%"></span><span class="saving" style="height:${r.total ? (r.saving / r.total) * 100 : 0}%"></span>`}</div>` : ""}</div><span class="benefit-day-label">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}<small>${dayLabel(r.day)}</small></span></div>`).join("")}</div></div>${showCosts ? `<p class="note">${costData?.error ? esc(costData.error) : !importId ? "Netzbezugsentität fehlt." : "Netzbezug × eingestellter Arbeitspreis · ohne Grundpreis."}</p>` : ""}<div class="benefit-sums"><div><span>${weekComplete ? "PV-Vorteil · Wochensumme" : "PV-Vorteil · erfasste Tage"}</span><strong>${money(weeklyTotal)}</strong></div><div><span>Gesamtsumme<small>${all.first ? longDay(all.first) + " – " + longDay(all.last) : allData?.archive ? "Kein gemeinsamer Zeitraum" : "Zeitraum wird geladen …"}</small></span><strong>${money(all.total)}</strong></div></div>${error ? `<p class="note weather-warning">${esc(error)}</p>` : !todayData && !weekData ? '<p class="note">Energiestatistik wird geladen …</p>' : today.total === null ? '<p class="note">Tageswerte unvollständig · fehlende Messwerte werden nicht als null gerechnet.</p>' : ""}<details class="benefit-help"><summary>Berechnung und Datenquellen</summary><p class="note">Einspeisung × ${rate(feed)}; selbst genutzte Energie × ${rate(purchase)}. Selbst genutzt = AC-Wechselrichterertrag + Garage + Schuppen − Einspeisung. Hausspeicherladung wird nicht zusätzlich gutgeschrieben; entnommene Energie steckt bereits im AC-Ertrag. Netzgeladene Speicherenergie ist anhand dieser Zähler nicht von PV-Strom unterscheidbar.<br>HA-Langzeitstatistik, bis zu fünf Minuten verzögert. Historische Tage werden mit den aktuell eingestellten Preisen bewertet. Gesamtsumme: ${all.days} Tage mit allen benötigten Zählern; ${all.missing ?? 0} nicht auswertbare Tage ausgelassen. Der erste gemeinsame Tag wird als möglicher Teilmesstag nicht mitgerechnet. Erfasste Einnahmen ${money(all.income)}, erfasste Ersparnis ${money(all.saving)}. Zusätzlich ${money(all.initialSaving ?? 0)} geschätzte Ersparnis vor Beginn der HA-Daten, einmalig nur in der Gesamtsumme. Fehlende Tageswerte bleiben offen. Preisänderungen unter Einstellungen; Energiequellen unter Verwendete Entitäten.</p></details></section>`;
}

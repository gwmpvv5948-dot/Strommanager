import { esc, fmt, html } from "./view-format.js?v=0.1.41";
import { batteryForecast } from "./battery-forecast.js?v=0.1.40";
import { pvOverlay } from "./pv-overlay.js?v=20261028-2";
import {
  consumptionAxis,
  historicalConsumptionBars,
} from "./consumption-chart.js?v=0.1.40";
import {
  number as numeric,
  forecastPoints,
} from "./solar-chart.js?v=20261027-2";
import { dateKey, pvDayIds } from "./day-forecast.js?v=20261029-7";
import { renderBatteryOverlay } from "./battery-chart-view.js?v=0.1.41";

// Display only. Panel supplies live data and cached history; no device calls.

export function consumptionBarChart(panel, b, zone) {
  const source = panel.solarSources(),
    forecast = [
      ...new Map(
        pvDayIds(source.forecastId)
          .flatMap((id) => {
            const state = panel._hass?.states?.[id];
            return state &&
              !["unknown", "unavailable"].includes(state.state) &&
              state.attributes?.dataCorrect !== false
              ? forecastPoints(
                  state.attributes?.detailedForecast,
                  Math.floor(b.start / 3600) * 3600000,
                  b.end * 1000,
                )
              : [];
          })
          .map((p) => [p.t, p]),
      ).values(),
    ].sort((a, z) => a.t - z.t);
  const overlay = pvOverlay(
    panel.solarHistory,
    source.power?.attributes?.unit_of_measurement,
    forecast,
    Math.floor(b.start / 3600) * 3600,
    Math.ceil(b.end / 3600) * 3600,
    b.now,
    panel.auxiliarySolarSources(),
  );
  const liveNow = Date.now() / 1000,
    sun = panel._hass?.states?.[panel.status?.entities?.sun || "sun.sun"],
    floorState =
      panel._hass?.states?.["number.batterien_entlade_ende_ladestand"];
  const sunset =
    sun?.state === "below_horizon"
      ? liveNow
      : sun?.state === "above_horizon"
        ? Date.parse(sun.attributes?.next_setting) / 1000
        : null;
  const minSoc =
    floorState?.attributes?.unit_of_measurement === "%" &&
    !floorState.attributes.restored
      ? numeric(floorState.state)
      : null;
  const battery = batteryForecast(
    b,
    panel.status?.snapshot,
    panel.status?.settings,
    { now: liveNow, sunset, minSoc, pv: forecast },
  );
  const { max, step, ticks } = consumptionAxis(
      b.bins,
      [...overlay.actual, ...overlay.forecast].flatMap((seg) =>
        seg.map((p) => p.kwh),
      ),
    ),
    n = b.bins.length;
  const x = (i) =>
      64 + ((b.bins[0].stamp + i * 3600 - b.start) / (b.end - b.start)) * 816,
    y = (v) => 190 - (v / max) * 158,
    w = ((816 * 3600) / (b.end - b.start)) * 0.7;
  const time = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(t * 1000);
  const stamp = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).format(t * 1000);
  const grid = ticks
    .map(
      (v) => html`
        <line x1="64" x2="880" y1="${y(v)}" y2="${y(v)}" class="chart-grid" />
        <text x="52" y="${y(v) + 4}" text-anchor="end">
          ${fmt(v, "", step < 0.1 ? 2 : 1)}
        </text>
      `,
    )
    .join("");
  const bars = b.bins
    .map((p, i) => {
      const cx = x(i + 0.5),
        actual = p.actual || 0,
        future = p.future || 0;
      const pvActual = overlay.actual.flat().find((v) => v.stamp === p.stamp),
        pvForecast = overlay.forecast.flat().find((v) => v.stamp === p.stamp);
      const label = [
        `${stamp(p.stamp)}–${time(p.stamp + 3600)}`,
        p.actual !== null
          ? `Haus · bilanziert: ${fmt(p.actual, "kWh", 2)}`
          : p.future === null
            ? "Haus · Messwert fehlt"
            : null,
        p.future !== null
          ? `Haus · ${p.current ? "Rest dieser Stunde" : "Prognose"}: ${fmt(p.future, "kWh", 2)}`
          : null,
        p.low !== null && p.high !== null
          ? `Prognose-Streuung: ${fmt(p.low, "", 2)}–${fmt(p.high, "kWh", 2)}`
          : null,
        `PV-Ist gesamt: ${pvActual ? fmt(pvActual.kwh, "kWh je Stunde", 2) : "nicht verfügbar"}`,
        `PV-Prognose Hauptanlage: ${pvForecast ? fmt(pvForecast.kwh, "kWh je Stunde", 2) : "nicht verfügbar"}`,
        p.missing ? "Messlücke · keine vollständige Stundenbilanz" : null,
      ]
        .filter(Boolean)
        .join("\n");
      return html`
        <g>
          ${p.actual !== null
            ? html`
                <rect
                  x="${cx - w / 2}"
                  y="${y(actual)}"
                  width="${w}"
                  height="${190 - y(actual)}"
                  rx="2"
                  fill="var(--green)"
                />
              `
            : ""}${p.future !== null
            ? html`
                <rect
                  x="${cx - w / 2}"
                  y="${y(actual + future)}"
                  width="${w}"
                  height="${y(actual) - y(actual + future)}"
                  rx="2"
                  fill="url(#consumption-plan-hatch)"
                />
              `
            : ""}${p.high !== null && p.low !== null
            ? html`
                <path
                  d="M${cx},${y(actual + p.low)}V${y(actual + p.high)}M${cx -
                  3},${y(actual + p.high)}H${cx + 3}"
                  fill="none"
                  stroke="#c2953c"
                />
              `
            : ""}${p.missing
            ? html`
                <text
                  x="${cx}"
                  y="185"
                  text-anchor="middle"
                  aria-label="Messlücke"
                >
                  ?
                </text>
              `
            : ""}
          <rect
            x="${x(i)}"
            y="32"
            width="${816 / n}"
            height="158"
            fill="transparent"
            data-consumption-info-key="hour:${p.stamp}"
            data-consumption-info="${esc(label)}"
            role="img"
            aria-label="${esc(label)}"
          />
        </g>
      `;
    })
    .join("");
  const indices = Array.from(
    { length: Math.floor(n / 3) + 1 },
    (_, i) => i * 3,
  ).filter((i) => i < n);
  indices.push(n);
  const nowX = 64 + ((liveNow - b.start) / (b.end - b.start)) * 816;
  const pvLine = (segments, kind) =>
    segments
      .map(
        (seg) => html`
          <g class="consumption-pv-${kind}">
            <path
              d="${seg
                .map(
                  (p, i) =>
                    `${i ? "L" : "M"}${64 + ((p.t - b.start) / (b.end - b.start)) * 816},${y(p.kwh)}`,
                )
                .join(" ")}"
              fill="none"
              stroke="#d6b04f"
              stroke-width="2.6"
              ${kind === "forecast" ? 'stroke-dasharray="7 5"' : ""}
            />
            ${seg
              .map(
                (p) => html`
                  <circle
                    cx="${64 + ((p.t - b.start) / (b.end - b.start)) * 816}"
                    cy="${y(p.kwh)}"
                    r="${seg.length === 1 ? 3 : 2}"
                    fill="#d6b04f"
                  >
                    <desc>
                      ${esc(
                        `PV ${kind === "actual" ? "Ist gesamt" : "Prognose P50 Hauptanlage"} · ${stamp(p.t)} · ${fmt(p.kwh, "kWh je Stunde", 2)} · Stundenmittel`,
                      )}
                    </desc>
                  </circle>
                `,
              )
              .join("")}
          </g>
        `,
      )
      .join("");
  const sunsetMark = panel.sunsetTime(dateKey(b.start * 1000, zone), zone);
  const bx = (t) => 64 + ((t - b.start) / (b.end - b.start)) * 816,
    by = (soc) => 190 - (soc / 100) * 158;
  const sunsetAxis =
    sunsetMark !== null && sunsetMark >= b.start && sunsetMark <= b.end
      ? html`
          <g
            class="sunset-axis"
            role="img"
            aria-label="Sonnenuntergang ${esc(time(sunsetMark))}"
          >
            <path
              transform="translate(${bx(sunsetMark)},196)"
              d="M4,-5 A6,6 0 1,0 4,5 A5,5 0 0,1 4,-5Z"
              fill="#d6b04f"
            />
            <text
              x="${Math.max(90, Math.min(854, bx(sunsetMark)))}"
              y="237"
              text-anchor="middle"
              style="fill:#d6b04f;font-size:13px"
            >
              ${esc(time(sunsetMark))}
            </text>
          </g>
        `
      : "";
  const batteryOverlay = renderBatteryOverlay(battery, {
    bx,
    by,
    time,
    end: b.end,
  });
  return html`
    <div class="chart-scroll consumption-plot" data-consumption-plot>
      <svg
        class="solar-chart consumption-bars"
        viewBox="0 0 960 ${battery.available ? 265 : 245}"
        role="img"
        aria-label="Stündlicher Hausverbrauch zwölf Stunden vor und nach jetzt ohne Tesla: volle Balken für bilanzierte Messwerte, Schraffur für verbleibende Prognose, Fragezeichen für Messlücken. Gelbe durchgezogene PV-Ist-Gesamtkurve aus Hauptanlage, Garage und Schuppen bis zum Datenstand, gestrichelte Solcast-Prognose nur der Hauptanlage danach. Linke Y-Achse Kilowattstunden je Stunde; blaue gestrichelte Akkuprognose auf rechter Prozentachse; grünes Abdeckungsband, rot ab erster Deckungslücke; X-Achse Uhrzeit."
      >
        <defs>
          <clipPath id="rolling-plot-clip">
            <rect x="64" y="32" width="816" height="158" />
          </clipPath>
          <pattern
            id="consumption-plan-hatch"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill="var(--soft)" />
            <line
              x1="0"
              x2="0"
              y1="0"
              y2="7"
              stroke="#c2953c"
              stroke-width="3"
            />
          </pattern>
        </defs>
        <text x="64" y="17">kWh je Stunde</text>
        ${grid}
        <line x1="64" x2="64" y1="32" y2="190" stroke="var(--muted)" />
        <g clip-path="url(#rolling-plot-clip)">
          ${bars}${pvLine(overlay.actual, "actual")}${pvLine(
            overlay.forecast,
            "forecast",
          )}
        </g>
        ${batteryOverlay}${sunsetAxis}
        <line
          x1="${nowX}"
          x2="${nowX}"
          y1="32"
          y2="190"
          stroke="var(--muted)"
        />
        <text x="${Math.min(840, nowX + 5)}" y="27">
          JETZT ${esc(time(liveNow))}
        </text>
        ${[-12, -9, -6, -3, 0, 3, 6, 9, 12]
          .map(
            (h) => html`
              <text
                x="${64 + ((h + 12) / 24) * 816}"
                y="217"
                text-anchor="${h === -12
                  ? "start"
                  : h === 12
                    ? "end"
                    : "middle"}"
              >
                ${esc(time((b.start + b.end) / 2 + h * 3600))}
              </text>
            `,
          )
          .join("")}
      </svg>
    </div>
  `;
}

export function consumptionTotalBar(panel, b) {
  const denominator = Math.max(0.001, b.total ?? b.measured),
    actual = (b.measured / denominator) * 100,
    future = b.remaining === null ? 0 : (b.remaining / denominator) * 100;
  return html`
    <div class="consumption-total" data-consumption-plot>
      <div class="consumption-total-labels">
        <span>Bisher verbraucht</span>
        <span>Haus-Restbedarf</span>
      </div>
      <div
        class="consumption-total-track"
        role="img"
        aria-label="${esc(
          `Bisher verbraucht ${fmt(b.measured, "kWh", 1)}; noch erwartet ${fmt(b.remaining, "kWh", 1)}. ${b.complete ? "Vollständige Tageserwartung" : "Unvollständige Tagesbilanz"}.`,
        )}"
      >
        <span
          class="consumption-done"
          style="width:${actual}%"
          role="img"
          data-consumption-info-key="total:actual"
          data-consumption-info="${esc(
            `${b.includesTesla ? "Haus + Tesla" : "Haus ohne Tesla"}\nBisher verbraucht: ${fmt(b.measured, "kWh", 2)}${b.includesTesla ? "\nQuelle: sensor.real_tagesverbrauch" : b.complete ? "" : "\nMesslücken vorhanden · keine vollständige Tagesbilanz"}`,
          )}"
        >
          ${actual >= 18 ? fmt(b.measured, "kWh", 1) : ""}
        </span>
        <span
          class="consumption-plan"
          style="width:${future}%"
          role="img"
          data-consumption-info-key="total:forecast"
          data-consumption-info="${esc(
            `Haus ohne Tesla\nNoch erwartet bis Mitternacht: ${fmt(b.remaining, "kWh", 2)}\nModellprognose, kein bereits gemessener Verbrauch`,
          )}"
        >
          ${future >= 18 ? fmt(b.remaining, "kWh", 1) : ""}
        </span>
      </div>
      <div class="consumption-total-labels">
        <span>0 kWh</span>
        <span>
          ${fmt(b.total, "kWh", 1)} ·
          ${b.complete ? "Tag erwartet" : "bisher gesamt + Haus-Restprognose"}
        </span>
      </div>
    </div>
  `;
}

export function consumptionHistoryChart(panel, day, zone) {
  const b = historicalConsumptionBars(day);
  if (!b)
    return '<p class="note">Für diesen Tag fehlen gespeicherte Prognosewerte.</p>';
  const { max, step, ticks } = consumptionAxis(
      b.bins.map((row) => ({ actual: row.actual, future: row.predicted })),
    ),
    n = b.bins.length;
  const x = (i) => 64 + (i * 848) / n,
    y = (v) => 190 - (v / max) * 158,
    w = (848 / n) * 0.3;
  const time = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(t * 1000);
  const stamp = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).format(t * 1000);
  const grid = ticks
    .map(
      (v) => html`
        <line x1="64" x2="912" y1="${y(v)}" y2="${y(v)}" class="chart-grid" />
        <text x="52" y="${y(v) + 4}" text-anchor="end">
          ${fmt(v, "", step < 0.1 ? 2 : 1)}
        </text>
      `,
    )
    .join("");
  const bars = b.bins
    .map((p, i) => {
      const cx = x(i + 0.5),
        actual = p.actual ?? 0,
        predicted = p.predicted ?? 0,
        label = [
          `${stamp(p.stamp)}–${time(p.stamp + 3600)}`,
          p.actual !== null
            ? `Haus · Ist: ${fmt(p.actual, "kWh", 2)}`
            : "Haus · Istwert fehlt",
          p.predicted !== null
            ? `Damals prognostiziert: ${fmt(p.predicted, "kWh", 2)}`
            : "Keine gespeicherte Prognose",
          p.actual !== null && p.predicted !== null
            ? `Abweichung: ${fmt(p.actual - p.predicted, "kWh", 2)}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      return html`
        <g>
          ${p.predicted !== null
            ? html`
                <rect
                  class="history-forecast"
                  x="${cx - w - 1}"
                  y="${y(predicted)}"
                  width="${w}"
                  height="${190 - y(predicted)}"
                  rx="2"
                />
              `
            : ""}${p.actual !== null
            ? html`
                <rect
                  class="history-actual"
                  x="${cx + 1}"
                  y="${y(actual)}"
                  width="${w}"
                  height="${190 - y(actual)}"
                  rx="2"
                />
              `
            : ""}${p.missing
            ? html`
                <text
                  x="${cx}"
                  y="185"
                  text-anchor="middle"
                  aria-label="Messlücke"
                >
                  ?
                </text>
              `
            : ""}
          <rect
            x="${x(i)}"
            y="32"
            width="${848 / n}"
            height="158"
            fill="transparent"
            data-consumption-info-key="history:${p.stamp}"
            data-consumption-info="${esc(label)}"
            role="img"
            aria-label="${esc(label)}"
          />
        </g>
      `;
    })
    .join("");
  const indices = Array.from(
    { length: Math.floor(n / 3) + 1 },
    (_, i) => i * 3,
  ).filter((i) => i < n);
  indices.push(n);
  return html`
    <div class="chart-scroll consumption-plot" data-consumption-plot>
      <svg
        class="solar-chart consumption-bars history-bars"
        viewBox="0 0 960 245"
        role="img"
        aria-label="Vergleich der damals gespeicherten Hausverbrauchsprognose und des späteren Istverbrauchs. Gold schraffiert: Prognose. Grün: Istverbrauch."
      >
        <defs>
          <pattern
            id="history-plan-hatch"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill="var(--soft)" />
            <line
              x1="0"
              x2="0"
              y1="0"
              y2="7"
              stroke="#c2953c"
              stroke-width="3"
            />
          </pattern>
        </defs>
        <text x="64" y="17">kWh je Stunde</text>
        ${grid}
        <line x1="64" x2="64" y1="32" y2="190" stroke="var(--muted)" />
        ${bars}${indices
          .map(
            (i) => html`
              <text
                x="${x(i)}"
                y="217"
                text-anchor="${i === 0 ? "start" : i === n ? "end" : "middle"}"
              >
                ${i === n ? "24:00" : esc(time(b.bins[i].stamp))}
              </text>
            `,
          )
          .join("")}
      </svg>
    </div>
  `;
}

export function consumptionHistoryTotal(panel, day) {
  const b = historicalConsumptionBars(day);
  if (!b)
    return '<p class="note">Für diesen Tag fehlen gespeicherte Prognosewerte.</p>';
  const maximum = Math.max(0.001, b.actualTotal || 0, b.predictedTotal || 0),
    actual = (100 * (b.actualTotal || 0)) / maximum,
    predicted = (100 * (b.predictedTotal || 0)) / maximum;
  return html`
    <div class="consumption-total" data-consumption-plot>
      <div class="consumption-total-labels">
        <span>Istverbrauch</span>
        <span>${fmt(b.actualTotal, "kWh", 2)}</span>
      </div>
      <div class="consumption-total-track">
        <span
          class="consumption-done"
          style="width:${actual}%"
          role="img"
          data-consumption-info-key="history-total:actual"
          data-consumption-info="${esc(
            `Haus ohne Tesla\nIstverbrauch in ${b.evaluated} vergleichbaren Stunden: ${fmt(b.actualTotal, "kWh", 2)}\n${b.missing ? "Messlücken oder nicht prognostizierte Stunden sind nicht eingerechnet." : ""}`,
          )}"
        ></span>
      </div>
      <div class="consumption-total-labels">
        <span>Damals prognostiziert</span>
        <span>${fmt(b.predictedTotal, "kWh", 2)}</span>
      </div>
      <div class="consumption-total-track">
        <span
          class="consumption-plan"
          style="width:${predicted}%"
          role="img"
          data-consumption-info-key="history-total:forecast"
          data-consumption-info="${esc(
            `Haus ohne Tesla\nDamals prognostiziert für dieselben ${b.evaluated} Stunden: ${fmt(b.predictedTotal, "kWh", 2)}\nAbweichung: ${fmt(b.error, "kWh", 2)}`,
          )}"
        ></span>
      </div>
      <div class="consumption-total-labels">
        <span>${b.evaluated} vergleichbare Stunden</span>
        <span>Abweichung ${fmt(b.error, "kWh", 2)}</span>
      </div>
    </div>
  `;
}

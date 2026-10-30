import { esc, fmt, html } from "./view-format.js?v=0.1.41";
// SVG overlay for state of charge and coverage, independent of panel markup.
export function renderBatteryOverlay(battery, { bx, by, time, end }) {
  if (!battery.available) return "";
  return html`
    <g
      class="battery-forecast"
      role="img"
      aria-label="${esc(
        `Akku-Prognose: ${fmt(battery.sunsetSoc, "%", 0)} bei Sonnenuntergang; Mindeststand ${fmt(battery.minSoc, "%")}; ${battery.completeCoverage ? "Hausbedarf bis Mitternacht gedeckt" : "erste Deckungslücke um " + time(battery.exhaustedAt)}`,
      )}"
    >
      <text x="946" y="17" text-anchor="end" style="fill:#91bfee">Akku %</text>
      ${[0, 25, 50, 75, 100]
        .map(
          (v) => html`
            <text x="891" y="${by(v) + 4}" style="fill:#91bfee">${v}</text>
          `,
        )
        .join("")}
      <path
        d="${battery.points
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${bx(p.t).toFixed(2)},${by(p.soc).toFixed(2)}`,
          )
          .join(" ")}"
        fill="none"
        stroke="#91bfee"
        stroke-width="2.7"
        stroke-dasharray="6 4"
        pointer-events="none"
      />
      <circle
        cx="${bx(battery.points[0].t)}"
        cy="${by(battery.points[0].soc)}"
        r="4"
        fill="#91bfee"
      />
      ${battery.bands
        .map(
          (band) => html`
            <rect
              x="${bx(band.start)}"
              y="194"
              width="${Math.max(0, bx(band.end) - bx(band.start))}"
              height="7"
              rx="2"
              fill="var(--green)"
            />
          `,
        )
        .join("")}${battery.exhaustedAt == null
        ? ""
        : html`
            <rect
              class="battery-shortfall"
              x="${bx(battery.exhaustedAt)}"
              y="194"
              width="${Math.max(0, bx(end) - bx(battery.exhaustedAt))}"
              height="7"
              rx="2"
              fill="#df6767"
            />
          `}
      <text x="880" y="252" text-anchor="end" style="font-size:11px">
        ${battery.completeCoverage
          ? "Bis " + time(end) + " gedeckt"
          : "Deckungslücke " + time(battery.exhaustedAt)}
      </text>
    </g>
  `;
}

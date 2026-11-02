import { esc, fmt } from "./view-format.js";
export function gridForecastCard(
  status,
  zone = "Europe/Berlin",
  narrow = false,
) {
  const g = status?.grid_forecast,
    c = status?.settings,
    s = status?.snapshot,
    d = status?.decision;
  if (!g || !c) return "";
  const time = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t * 1000));
  const now = s?.now ?? Date.now() / 1000,
    end = now + 36 * 3600;
  const points = (g.points ?? []).filter((p) => p.start < end && p.end > now);
  const available = g.enabled && g.available,
    color =
      g.share == null
        ? "neutral"
        : g.share >= c.grid_hold_share
          ? "green"
          : g.share < c.grid_release_share
            ? "red"
            : "yellow";
  const effective =
    status.mode === "observe"
      ? "Beobachten · keine Steuerbefehle"
      : status.mode === "paused"
        ? "Pausiert · letzte Geräteeinstellung bleibt"
        : d?.discharge_w === 0
          ? available && g.hold
            ? "Akku bewahren · Netz ergänzt PV"
            : "Entladung gesperrt · " +
              (typeof s?.house_soc === "number" && s.house_soc <= c.house_min_soc
                ? "Haus-Mindeststand"
                : s?.wallbox_w > 10
                  ? "Tesla-Schutz"
                  : "Schutz / Messwerte")
          : "Akku fürs Haus freigegeben";
  const day = (t) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: zone,
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(t * 1000));
  const W = narrow ? 400 : 900,
    H = 215,
    left = 36,
    right = W - 12,
    top = 12,
    bottom = 150,
    extent = points.length ? Math.min(end, points.at(-1).end) : end;
  const x = (t) => left + ((t - now) / (extent - now)) * (right - left),
    y = (v) => bottom - (Math.min(100, Math.max(0, v)) / 100) * (bottom - top);
  const ticks = [0, 25, 50, 75, 100]
    .map(
      (v) =>
        `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="grid-guide"/><text x="28" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
    )
    .join("");
  const bars = points
    .map((p) => {
      const a = x(Math.max(now, p.start)),
        width = Math.max(0.5, x(Math.min(p.end, extent)) - a - 1);
      const cls = !p.available
        ? "neutral"
        : p.share >= c.grid_hold_share
          ? "green"
          : p.share < c.grid_release_share
            ? "red"
            : "yellow";
      return `<rect x="${a}" y="${p.available ? y(p.share) : top}" width="${width}" height="${p.available ? bottom - y(p.share) : bottom - top}" class="grid-${cls}"/><rect x="${a}" y="159" width="${width}" height="9" class="grid-${!g.enabled || !p.available ? "neutral" : p.hold ? "net" : "battery"}"/>`;
    })
    .join("");
  const interval = narrow ? 21600 : 10800;
  const labels = Array.from(
    { length: Math.ceil((extent - now) / interval) },
    (_, i) => now + i * interval,
  )
    .filter((t) => t < extent)
    .map(
      (t) =>
        `<text x="${x(t)}" y="190" text-anchor="${t === now ? "start" : "middle"}">${t === now ? "JETZT" : time(t)}<tspan x="${x(t)}" dy="15">${day(t)}</tspan></text>`,
    )
    .join("");
  const next = points.find(
    (p) => p.available && p.hold !== g.hold && p.start > now,
  );
  return `<section class="card full grid-card"><div class="card-title"><h2>Netz & Akku · Ausblick</h2><span class="sub">Deutschland · Energy-Charts</span></div><div class="grid-summary"><div class="grid-current grid-${color}"><ha-icon icon="mdi:${color === "green" ? "leaf" : "transmission-tower"}"></ha-icon><strong>${fmt(g.share, "%", 0)}</strong><span>Erneuerbare an der Last</span></div><div><strong>${esc(effective)}</strong><p class="sub">${esc(!g.enabled ? "Prognose sichtbar · Regelung ausgeschaltet" : !g.available ? g.reason : next ? `Ab ${day(next.start)} ${time(next.start)}: ${next.hold ? "Netz bevorzugt" : "Akku freigegeben"}` : "Bis Prognoseende unverändert")}</p><span class="sub">Entladegrenze: ${fmt(d?.discharge_w, "W", 0)} empfohlen · ${fmt(s?.current_discharge_w, "W", 0)} eingestellt</span></div></div>${points.length ? `<svg data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" class="grid-chart" role="img" aria-label="Erneuerbaren-Prognose und geplanter Wechsel zwischen Netz bevorzugt und Akku freigegeben. Zeitplan ohne PV- und Tesla-Schutzüberlagerung.">${ticks}<line x1="${left}" x2="${right}" y1="${y(c.grid_hold_share)}" y2="${y(c.grid_hold_share)}" class="grid-threshold"/>${bars}${labels}</svg>` : '<p class="note">Prognose wird geladen. Ohne gültige Daten gilt normale Eigenverbrauchsregelung.</p>'}<div class="chart-legend"><span><i class="grid-net"></i>Netz bevorzugt · Akku bewahren</span><span><i class="grid-battery"></i>Akku fürs Haus freigegeben</span><span><i class="grid-neutral"></i>Ohne Freigabeplan / Daten fehlen</span></div><details><summary>Berechnung und Datenquellen</summary><p class="note">${esc(g.reason)}. Akku bewahren ab ${fmt(c.grid_hold_share, "%")}, wieder freigeben unter ${fmt(c.grid_release_share, "%")}. Haus-Mindeststand ${fmt(c.house_min_soc, "%")}; Geräte-Mindeststand gilt zusätzlich. PV versorgt das Haus weiterhin zuerst. Das Band zeigt die Netzstrategie, keinen garantierten Stromfluss: Akku-Füllstand, Entladeleistung und Tesla-Schutz können sie überlagern. Tesla und Haus teilen dieselbe Entladegrenze; ohne Tesla-Freigabe wird während dessen Ladung die gesamte Entladung gesperrt. Kein aktives Netzladen. Erneuerbaren-Anteil ist kein CO₂-Wert. Werte können bei Überschüssen über 100 % liegen; Diagramm endet bei 100 %. Abrufstand: ${g.fetched ? time(g.fetched) : "—"}. ${esc(g.error ?? "")}${g.source?.includes("/v2/") ? "" : " Kompatibilitäts-Endpunkt (v1)."} Quelle: <a href="https://energy-charts.info/" target="_blank" rel="noopener noreferrer">Energy-Charts / Fraunhofer ISE</a>, CC BY 4.0. Abruf alle 15 Minuten; nach 2 Stunden ohne erfolgreichen Abruf oder bei Prognoselücken Eigenverbrauch als Fallback.</p></details></section>`;
}

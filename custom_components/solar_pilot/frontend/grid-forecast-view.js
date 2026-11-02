import { esc, fmt } from "./view-format.js";
// Visual traffic light is independent of the battery controller thresholds.
export function renewableColor(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "neutral";
  return value > 80 ? "green" : value < 40 ? "red" : "yellow";
}

export function gridDaySections(now, end, zone) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (stamp) => key.format(new Date(stamp * 1000));
  const boundaries = [now];
  let previous = now;
  // Locate local midnight by date change, including DST days of 23/25 hours.
  for (
    let stamp = Math.min(now + 3600, end);
    stamp <= end;
    stamp = Math.min(stamp + 3600, end)
  ) {
    if (day(previous) !== day(stamp)) {
      let low = previous,
        high = stamp;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (day(mid) === day(low)) low = mid;
        else high = mid;
      }
      if (high < end) boundaries.push(high);
    }
    previous = stamp;
    if (stamp === end) break;
  }
  boundaries.push(end);
  return boundaries
    .slice(0, -1)
    .map((start, i) => ({
      start,
      end: boundaries[i + 1],
      label: i === 0 ? "Heute" : i === 1 ? "Morgen" : "Übermorgen",
    }));
}

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
    color = renewableColor(g.share);
  const effective =
    status.mode === "observe"
      ? "Beobachten · keine Steuerbefehle"
      : status.mode === "paused"
        ? "Pausiert · letzte Geräteeinstellung bleibt"
        : d?.discharge_w === 0
          ? available && g.hold
            ? "Akku bewahren · Netz ergänzt PV"
            : "Entladung gesperrt · " +
              (typeof s?.house_soc === "number" &&
              s.house_soc <= c.house_min_soc
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
    H = 245,
    left = 36,
    right = W - 12,
    top = 38,
    bottom = 150,
    extent = points.length ? Math.min(end, points.at(-1).end) : end;
  const x = (t) => left + ((t - now) / (extent - now)) * (right - left),
    y = (v) => bottom - (Math.min(100, Math.max(0, v)) / 100) * (bottom - top);
  const ticks = [0, 40, 80, 100]
    .map(
      (v) =>
        `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="grid-guide"/><text x="28" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
    )
    .join("");
  const bars = points
    .map((p) => {
      const a = x(Math.max(now, p.start)),
        width = Math.max(0.5, x(Math.min(p.end, extent)) - a - 1);
      const cls = p.available ? renewableColor(p.share) : "neutral";
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
        `<text x="${x(t)}" y="190" text-anchor="${t === now ? "start" : "middle"}">${time(t)}<tspan x="${x(t)}" dy="15">${day(t)}</tspan></text>`,
    )
    .join("");
  const sections = gridDaySections(now, extent, zone);
  const dayBands = sections
    .map(
      (part, i) =>
        `<rect x="${x(part.start)}" y="5" width="${x(part.end) - x(part.start)}" height="22" class="grid-day-band grid-day-${i % 2}"/><text class="grid-day-label" x="${(x(part.start) + x(part.end)) / 2}" y="21" text-anchor="middle">${part.label}</text>${i ? `<line x1="${x(part.start)}" x2="${x(part.start)}" y1="28" y2="170" class="grid-day-divider"/>` : ""}`,
    )
    .join("");
  const nowMarker = `<line x1="${left}" x2="${left}" y1="30" y2="171" class="grid-now"/><circle cx="${left}" cy="${y(g.share ?? 0)}" r="3" class="grid-now-dot"/><text class="grid-now-label" x="${left}" y="234" text-anchor="start">JETZT</text>`;
  const next = points.find(
    (p) => p.available && p.hold !== g.hold && p.start > now,
  );
  return `<section class="card full grid-card"><div class="card-title"><h2>Netz & Akku · Ausblick</h2><span class="sub">Deutschland · Energy-Charts</span></div><div class="grid-summary"><div class="grid-current grid-${color}"><ha-icon icon="mdi:${color === "green" ? "leaf" : "transmission-tower"}"></ha-icon><strong>${fmt(g.share, "%", 0)}</strong><span>Erneuerbare an der Last</span></div><div><strong>${esc(effective)}</strong><p class="sub">${esc(!g.enabled ? "Prognose sichtbar · Regelung ausgeschaltet" : !g.available ? g.reason : next ? `Ab ${day(next.start)} ${time(next.start)}: ${next.hold ? "Netz bevorzugt" : "Akku freigegeben"}` : "Bis Prognoseende unverändert")}</p><span class="sub">Entladegrenze: ${fmt(d?.discharge_w, "W", 0)} empfohlen · ${fmt(s?.current_discharge_w, "W", 0)} eingestellt</span></div></div>${points.length ? `<svg data-narrow="${narrow}" viewBox="0 0 ${W} ${H}" class="grid-chart" role="img" aria-label="Erneuerbaren-Prognose und geplanter Wechsel zwischen Netz bevorzugt und Akku freigegeben. Zeitplan ohne PV- und Tesla-Schutzüberlagerung.">${dayBands}${ticks}${bars}${labels}${nowMarker}</svg>` : '<p class="note">Prognose wird geladen. Ohne gültige Daten gilt normale Eigenverbrauchsregelung.</p>'}<div class="chart-legend"><span><i class="grid-net"></i>Netz bevorzugt · Akku bewahren</span><span><i class="grid-battery"></i>Akku fürs Haus freigegeben</span><span><i class="grid-neutral"></i>Ohne Freigabeplan / Daten fehlen</span></div><details><summary>Berechnung und Datenquellen</summary><p class="note">${esc(g.reason)}. Akku bewahren ab ${fmt(c.grid_hold_share, "%")}, wieder freigeben unter ${fmt(c.grid_release_share, "%")}. Haus-Mindeststand ${fmt(c.house_min_soc, "%")}; Geräte-Mindeststand gilt zusätzlich. PV versorgt das Haus weiterhin zuerst. Das Band zeigt die Netzstrategie, keinen garantierten Stromfluss: Akku-Füllstand, Entladeleistung und Tesla-Schutz können sie überlagern. Tesla und Haus teilen dieselbe Entladegrenze; ohne Tesla-Freigabe wird während dessen Ladung die gesamte Entladung gesperrt. Kein aktives Netzladen. Ampelfarben: Grün über 80 %, Gelb von 40 bis 80 % einschließlich, Rot unter 40 %. Die Farbschwellen ändern nicht die Akkuregelung. Erneuerbaren-Anteil ist kein CO₂-Wert. Werte können bei Überschüssen über 100 % liegen; Diagramm endet bei 100 %. Abrufstand: ${g.fetched ? time(g.fetched) : "—"}. ${esc(g.error ?? "")}${g.source?.includes("/v2/") ? "" : " Kompatibilitäts-Endpunkt (v1)."} Quelle: <a href="https://energy-charts.info/" target="_blank" rel="noopener noreferrer">Energy-Charts / Fraunhofer ISE</a>, CC BY 4.0. Abruf alle 15 Minuten; nach 2 Stunden ohne erfolgreichen Abruf oder bei Prognoselücken Eigenverbrauch als Fallback.</p></details></section>`;
}

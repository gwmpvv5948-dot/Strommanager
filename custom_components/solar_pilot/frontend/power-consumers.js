// Display-only discovery across all HA states, independent of control mappings.
import { esc, fmt } from "./view-format.js?v=0.1.49";

// W alone is not sufficient: forecasts, power limits and generation are not loads.
const nonLoad =
  /(?:^|[\s_.-])(?:pv|solar|solcast|inverter|wechselrichter|battery|batteries|batterie\w*|batterien|akku\w*|grid|netz|netzbezug|netzleistung|netzladung|einspeis\w*|export|import|power_meter|stromz[aä]hler|erzeug\w*|produktion|forecast|prognose|strommanager|ladebudget|entladegrenze|zyklusleistung|nennleistung|rated|maximum|maximale\w*|limit|peak|spitze)(?:$|[\s_.-])/i;
const aggregate =
  /(?:^|[\s_.-])(?:all_standby|sum|summe|gesamtleistung|verbrauch[\s_.-]+momentan|house_load|hausverbrauch|house_consumption)(?:$|[\s_.-])/i;

export function powerConsumers(states, status = {}) {
  const ids = status?.entities || {},
    learn = status?.source_entities?.learning || {};
  const excluded = new Set([
    ids.pv_power,
    ids.battery_power,
    ids.grid_power,
    ids.forecast,
    learn.inverter,
    learn.garage,
    learn.shed,
    ...Object.values(status?.source_entities?.outputs || {}),
  ]);
  const consumers = [];
  for (const [id, state] of Object.entries(states || {})) {
    const a = state?.attributes || {},
      unit = a.unit_of_measurement;
    if (
      !id.startsWith("sensor.") ||
      !["W", "kW"].includes(unit) ||
      a.restored ||
      excluded.has(id)
    )
      continue;
    if (a.device_class && a.device_class !== "power") continue;
    if (state.state == null || String(state.state).trim() === "") continue;
    const watts = Number(state.state) * (unit === "kW" ? 1000 : 1);
    if (!Number.isFinite(watts) || watts < 0) continue;
    const name = a.friendly_name || id,
      text = id + " " + name;
    // The configured wallbox is a known load even if its name contains "solar".
    if (
      id !== ids.wallbox_power &&
      (nonLoad.test(text) ||
        aggregate.test(text) ||
        /electricity[\s\S]*leistung[\s_.-]+l[123](?:$|[\s_.-])/i.test(text))
    )
      continue;
    consumers.push({ id, name, watts });
  }
  return consumers.sort(
    (a, b) =>
      b.watts - a.watts ||
      a.name.localeCompare(b.name, "de") ||
      a.id.localeCompare(b.id),
  );
}

export function consumerHeatmap(states, status, { unavailable = false } = {}) {
  if (unavailable)
    return '<p class="consumer-empty">Keine aktuellen Messwerte · Verbindung unterbrochen</p>';
  const values = powerConsumers(states, status),
    max = Math.max(1, ...values.map((v) => v.watts));
  if (!values.length)
    return '<p class="consumer-empty">Keine verfügbaren Verbraucher mit Leistungsmessung</p>';
  const row = ({ id, name, watts }) =>
    `<div class="consumer-row" style="--load-width:${Math.max(1, (100 * watts) / max).toFixed(2)}%;--load-color:${watts >= 2000 ? "var(--load-high)" : watts >= 800 ? "var(--load-medium)" : watts >= 200 ? "var(--load-warm)" : "var(--load-low)"}"><span class="consumer-name">${esc(name)}</span><strong>${fmt(watts, "W", watts < 10 ? 1 : 0)}</strong></div>`;
  return `<div class="consumer-rows">${values.slice(0, 8).map(row).join("")}</div><div class="consumer-legend"><span class="consumer-gradient" aria-hidden="true"></span><span>wenig</span><span>viel · ab 2.000 W</span></div>${values.length > 8 ? `<details class="consumer-more"><summary>Weitere ${values.length - 8} Verbraucher</summary><div class="consumer-rows">${values.slice(8).map(row).join("")}</div></details>` : ""}`;
}

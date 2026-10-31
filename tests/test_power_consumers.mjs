import test from "node:test";
import assert from "node:assert/strict";
import {
  powerConsumers,
  consumerHeatmap,
} from "../custom_components/solar_pilot/frontend/power-consumers.js";
const sensor = (value, name = "Gerät", unit = "W", extra = {}) => ({
  state: value,
  attributes: {
    unit_of_measurement: unit,
    friendly_name: name,
    device_class: "power",
    ...extra,
  },
});
test("discovers all HA power sensors, converts kW, retains zero and sorts descending", () => {
  const values = powerConsumers({
    "sensor.a": sensor("30", "Küche"),
    "sensor.b": sensor("1.2", "Waschmaschine", "kW"),
    "sensor.c": sensor("0", "Lampe"),
    "sensor.d": sensor("unknown"),
    "sensor.e": sensor("-50"),
    "sensor.f": sensor(""),
    "sensor.g": sensor("5", "Alt", "W", { restored: true }),
    "sensor.h": sensor("3", "Energie", "kWh"),
    "number.limit": sensor("5000"),
  });
  assert.deepEqual(
    values.map((v) => [v.id, v.watts]),
    [
      ["sensor.b", 1200],
      ["sensor.a", 30],
      ["sensor.c", 0],
    ],
  );
});
test("excludes mapped sources, generation, limits and aggregates but keeps configured wallbox", () => {
  const states = {
    "sensor.custom": sensor("1000", "Unauffälliger Name"),
    "sensor.inverter_power": sensor("900"),
    "sensor.pv_power": sensor("300"),
    "sensor.batterien_leistung": sensor("20"),
    "sensor.power_meter_phase_a": sensor("40"),
    "sensor.maximale_leistung": sensor("2500"),
    "sensor.all_standby_power": sensor("5"),
    "sensor.tv": sensor("20", "TV Gesamt"),
    "sensor.wallbox": sensor("2000", "Solar Wallbox"),
  };
  assert.deepEqual(
    powerConsumers(states, {
      entities: { pv_power: "sensor.custom", wallbox_power: "sensor.wallbox" },
    }).map((v) => v.id),
    ["sensor.wallbox", "sensor.tv"],
  );
});
test("compact view escapes labels, shows all remaining readings on demand and no stale list on disconnect", () => {
  const states = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      "sensor.device_" + i,
      sensor(i, "<img src=x onerror=alert(1)>"),
    ]),
  );
  const html = consumerHeatmap(states, {});
  assert.equal((html.match(/class="consumer-row"/g) || []).length, 10);
  assert.match(html, /Weitere 2 Verbraucher/);
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
  assert.match(
    consumerHeatmap(states, {}, { unavailable: true }),
    /Verbindung unterbrochen/,
  );
  assert.match(consumerHeatmap({}, {}), /Keine verfügbaren/);
});

test("network equipment is a consumer, not grid power", () => {
  assert.equal(
    powerConsumers({ "sensor.network": sensor("25", "Netzwerk") }).length,
    1,
  );
});

test("rejects control recommendations, whole-house meters and cycle averages found in live HA", () => {
  const states = {
    "sensor.output": sensor("2500", "Reservebudget"),
    "sensor.strommanager_budget": sensor("2500", "Ladebudget Abendreserve"),
    "sensor.recommendation": sensor("400", "Empfohlene Entladegrenze"),
    "sensor.sum_aux": sensor("80", "Sum Aux"),
    "sensor.house": sensor("400", "Verbrauch momentan"),
    "sensor.main": sensor("157", "Electricity Beispiel Gesamtleistung"),
    "sensor.main_l1": sensor("40", "Electricity Beispiel Leistung L1"),
    "sensor.thermostat": sensor("100", "VTherm Mittlere Zyklusleistung"),
    "sensor.stove": sensor("40", "Herd Phase A Leistung"),
  };
  assert.deepEqual(
    powerConsumers(states, {
      source_entities: { outputs: { budget: "sensor.output" } },
    }).map((v) => v.id),
    ["sensor.stove"],
  );
});

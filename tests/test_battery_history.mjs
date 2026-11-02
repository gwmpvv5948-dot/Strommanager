import test from "node:test";
import assert from "node:assert/strict";
import { batteryHistory } from "../custom_components/solar_pilot/frontend/battery-history.js";
const row = (t, state) => ({
  last_updated: new Date(t * 1000).toISOString(),
  state,
});
const options = {
  start: 1000,
  now: 2000,
  unit: "%",
  snapshot: { now: 2000, house_soc_age: 0, house_soc: 62 },
  settings: { meter_max_age_s: 300 },
};
test("holds recorded percent states, clips to window and joins fresh live SoC at NOW", () => {
  const result = batteryHistory([row(900, "50"), row(1500, "60")], options);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0][0], { t: 1000, soc: 50 });
  assert.deepEqual(result[0].at(-1), { t: 2000, soc: 62 });
  assert.ok(result[0].every((p) => p.t <= 2000 && p.soc >= 0 && p.soc <= 100));
});
test("unknown periods split the line, invalid values never become zero and future data are ignored", () => {
  const result = batteryHistory(
    [
      row(1000, "40"),
      row(1300, "unavailable"),
      row(1500, "45"),
      row(1700, "105"),
      row(2100, "80"),
    ],
    options,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].at(-1).t, 1300);
  assert.equal(result[1][0].t, 1500);
  assert.equal(result[1].at(-1).t, 1700);
  assert.equal(result[2][0].t, 2000);
});
test("keeps measured history without a forecast, but never extends a stale final value to now", () => {
  const result = batteryHistory([row(1000, "7")], {
    ...options,
    snapshot: { now: 1000, house_soc_age: 0, house_soc: 7 },
  });
  assert.equal(result[0].at(-1).t, 1300);
  assert.deepEqual(batteryHistory([], { ...options, unit: "kWh" }), []);
});

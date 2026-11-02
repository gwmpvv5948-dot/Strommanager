import test from "node:test";
import assert from "node:assert/strict";
import {
  benefitWeek,
  benefitAmounts,
  pvBenefitCard,
} from "../custom_components/solar_pilot/frontend/pv-benefit.js";
const ids = ["sensor.roof", "sensor.garage", "sensor.shed", "sensor.export"];
const date = "2026-11-02";
const stats = (values) =>
  Object.fromEntries(
    ids.map((id, i) => [
      id,
      [{ start: "2026-11-01T23:00:00Z", change: values[i] }],
    ]),
  );
test("adds AC energy once, subtracts export and applies the two independent configurable tariffs", () => {
  const r = benefitAmounts(stats([10, 1, 0.6, 3.2]), ids, [date])[0];
  assert.ok(Math.abs(r.selfKwh - 8.4) < 1e-9);
  assert.ok(Math.abs(r.income - 0.2624) < 1e-9);
  assert.ok(Math.abs(r.saving - 2.268) < 1e-9);
  assert.ok(Math.abs(r.total - 2.5304) < 1e-9);
  const changed = benefitAmounts(stats([10, 1, 0.6, 3.2]), ids, [date], {
    feed_in_eur_kwh: 0.1,
    purchase_eur_kwh: 0.4,
  })[0];
  assert.ok(Math.abs(changed.total - 3.68) < 1e-9);
});
test("missing or invalid energy stays unknown; known zero, negative rounding noise and contradictions are distinct", () => {
  const missing = stats([10, 1, null, 0]);
  assert.equal(benefitAmounts(missing, ids, [date])[0].saving, null);
  assert.equal(benefitAmounts(missing, ids, [date])[0].income, 0);
  assert.equal(benefitAmounts(stats([0, 0, 0, 0]), ids, [date])[0].total, 0);
  assert.equal(
    benefitAmounts(stats([1, 0, 0, 2]), ids, [date])[0].selfKwh,
    null,
  );
  assert.equal(
    benefitAmounts(stats([1, 0, 0, 1.001]), ids, [date])[0].selfKwh,
    0,
  );
});
test("calendar navigation respects ISO years and local DST week lengths", () => {
  const previous = benefitWeek(Date.parse("2026-11-02T12:00:00Z"));
  assert.equal(previous.week, 44);
  assert.deepEqual(
    [previous.days[0], previous.days[6]],
    ["2026-10-26", "2026-11-01"],
  );
  assert.equal(
    benefitWeek(Date.parse("2026-11-02T12:00:00Z"), "Europe/Berlin", 0).week,
    45,
  );
  const dst = benefitWeek(
    Date.parse("2026-10-25T12:00:00Z"),
    "Europe/Berlin",
    0,
  );
  assert.equal((dst.end - dst.start) / 3600000, 169);
  const year = benefitWeek(
    Date.parse("2016-01-07T12:00:00Z"),
    "Europe/Berlin",
    0,
  );
  assert.equal(year.week, 1);
  const boundary = benefitWeek(
    Date.parse("2021-01-01T12:00:00Z"),
    "Europe/Berlin",
    0,
  );
  assert.equal(boundary.week, 53);
  assert.equal(boundary.year, 2020);
});
test("accepts numeric second and millisecond statistic timestamps and keeps HA local dates", () => {
  const s = stats([1, 0, 0, 0]);
  s[ids[0]][0].start = Date.parse("2026-11-01T23:00Z");
  s[ids[1]][0].start = Date.parse("2026-11-01T23:00Z") / 1000;
  assert.equal(benefitAmounts(s, ids, [date])[0].selfKwh, 1);
});
test("renders calendar controls, daily stacks and an explicit gap for unavailable statistics", () => {
  const now = Date.now,
    at = Date.parse("2026-11-02T12:00Z");
  Date.now = () => at;
  try {
    const panel = {
      _hass: { config: { time_zone: "Europe/Berlin" } },
      status: {
        settings: {},
        source_entities: {
          display: {
            pv_daily: ids[0],
            benefit_garage_energy: ids[1],
            benefit_shed_energy: ids[2],
            benefit_export_energy: ids[3],
          },
        },
      },
      benefitCache: new Map(),
      benefitWeekOffset: -1,
    };
    const key = "today:" + date + "|" + ids.join("|") + "|Europe/Berlin";
    panel.benefitCache.set(key, {
      statistics: stats([10, 1, 0.6, 3.2]),
      fetched: at,
    });
    const html = pvBenefitCard(panel);
    assert.match(html, /2,53/);
    assert.match(html, /KW 44/);
    assert.equal((html.match(/class="benefit-day"/g) || []).length, 7);
    assert.match(html, /Daten unvollständig/);
    panel.benefitCache.get(key).error = "Keine Verbindung";
    assert.ok(!pvBenefitCard(panel).includes("2,53"));
  } finally {
    Date.now = now;
  }
});

test("all-time archive excludes the partial first common day and keeps missing days unknown", async () => {
  const { benefitArchive, benefitTotal } = await import(
    "../custom_components/solar_pilot/frontend/pv-benefit.js"
  );
  const data = Object.fromEntries(
    ids.map((id, i) => [
      id,
      [
        { start: "2024-08-07T00:00:00+02:00", change: i === 3 ? 1 : 4 },
        { start: "2024-08-08T00:00:00+02:00", change: i === 3 ? 2 : 4 },
        { start: "2024-08-09T00:00:00+02:00", change: i === 1 ? null : 4 },
      ],
    ]),
  );
  const archive = benefitArchive(data, ids);
  assert.equal(archive[0].day, "2024-08-08");
  assert.equal(
    benefitArchive(data, ids, "Europe/Berlin", "2024-08-09").length,
    1,
  );
  const total = benefitTotal(archive, {
    day: "2026-11-02",
    selfKwh: 8.4,
    exportKwh: 3.2,
  });
  assert.equal(total.days, 2);
  assert.equal(total.first, "2024-08-08");
  assert.equal(total.last, "2026-11-02");
  assert.equal(total.missing, 1);
  assert.ok(Math.abs(total.total - 5.3944) < 1e-8);
  assert.equal(benefitTotal([]).total, null);
  const dedup = benefitTotal([{ day: date, selfKwh: 1, exportKwh: 0 }], {
    day: date,
    selfKwh: 2,
    exportKwh: 0,
  });
  assert.equal(dedup.days, 1);
  assert.equal(dedup.total, 0.54);
});

test("card includes both a calendar-week sum and dated all-time sum", () => {
  const html = pvBenefitCard({
    _hass: { config: { time_zone: "Europe/Berlin" } },
    status: { source_entities: { display: {} }, settings: {} },
    benefitCache: new Map(),
  });
  assert.match(html, /class="benefit-sums"/);
  assert.match(html, /Gesamtsumme/);
});

test("initial savings offset is added exactly once to all-time total only, independent of tariffs", async () => {
  const { benefitTotal } = await import(
    "../custom_components/solar_pilot/frontend/pv-benefit.js"
  );
  const archive = [{ day: "2024-08-08", selfKwh: 10, exportKwh: 2 }],
    settings = { benefit_initial_savings_eur: 1800 };
  const total = benefitTotal(archive, null, settings);
  assert.equal(total.initialSaving, 1800);
  assert.equal(total.total, total.recordedTotal + 1800);
  assert.equal(total.saving, 2.7);
  assert.equal(
    benefitTotal(archive, null, { ...settings, purchase_eur_kwh: 0.5 })
      .initialSaving,
    1800,
  );
  assert.equal(
    benefitAmounts(stats([10, 1, 0.6, 3.2]), ids, [date], settings)[0].total,
    benefitAmounts(stats([10, 1, 0.6, 3.2]), ids, [date])[0].total,
  );
  assert.equal(benefitTotal([], null, settings).total, null);
});

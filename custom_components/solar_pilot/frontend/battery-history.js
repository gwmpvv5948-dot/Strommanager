// Recorder states are held until the next change. Explicit unknowns split the
// measured curve; only a fresh live snapshot may extend it all the way to NOW.
export function batteryHistory(
  history,
  { start, now, unit, snapshot, settings } = {},
) {
  if (
    unit !== "%" ||
    !Number.isFinite(start) ||
    !Number.isFinite(now) ||
    now < start
  )
    return [];
  const value = (v) =>
    v == null || String(v).trim() === ""
      ? null
      : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100
        ? Number(v)
        : null;
  const samples = new Map();
  for (const row of history || []) {
    const t = Date.parse(row.last_updated ?? row.last_changed) / 1000;
    if (Number.isFinite(t) && t <= now) samples.set(t, value(row.state));
  }
  const age = snapshot?.house_soc_age,
    sampleTime = snapshot?.now,
    live = value(snapshot?.house_soc);
  const fresh =
    live !== null &&
    Number.isFinite(age) &&
    age >= 0 &&
    Number.isFinite(sampleTime) &&
    sampleTime <= now + 60 &&
    age + Math.max(0, now - sampleTime) <= (settings?.meter_max_age_s ?? 300);
  if (fresh) samples.set(now, live);
  const rows = [...samples].sort((a, b) => a[0] - b[0]),
    segments = [];
  let segment = [];
  const flush = () => {
    if (segment.length) segments.push(segment);
    segment = [];
  };
  for (let i = 0; i < rows.length; i++) {
    const [t, soc] = rows[i];
    if (soc === null) {
      flush();
      continue;
    }
    const next = rows[i + 1]?.[0],
      end = Math.min(now, next ?? t + 300);
    if (end < start) continue;
    const begin = Math.max(start, t);
    if (begin > now) continue;
    segment.push({ t: begin, soc });
    if (end > begin) segment.push({ t: end, soc });
    if (next === undefined || rows[i + 1][1] === null) flush();
  }
  flush();
  return segments;
}

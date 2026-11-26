// Local Haus3d profile: each 30-minute UTC slot contains clear-sky and blocked direct watts.
export function shadeForecast(profile, forecast) {
  const halfHour = 1800000;
  if (profile?.version !== 1 || profile.array !== "roof" || profile.step !== halfHour ||
      !Number.isSafeInteger(profile.start) || profile.start % halfHour || !Array.isArray(profile.slots) ||
      !forecast.length) return null;
  const points = [];
  let loss = 0;
  for (const row of forecast) {
    const slot = profile.slots[(row.start - profile.start) / halfHour];
    if (!Array.isArray(slot) || slot.length !== 2) return null;
    const [clear, blocked] = slot;
    if (!Number.isFinite(clear) || !Number.isFinite(blocked) || clear < 0 || blocked < 0 || blocked > clear) return null;
    // Power relative to clear sky is a proxy for the direct-light fraction.
    // Dampen the clear-sky loss when Solcast expects less power.
    const fraction = clear > 0 ? blocked / clear * Math.min(1, row.p * 1000 / clear) : 0;
    points.push({...row, corrected:row.p * (1 - fraction), fraction});
    loss += row.p * fraction * (row.end - row.start) / 3600000;
  }
  return {points, loss};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherOutlookDays,weatherChart} from '../custom_components/solar_pilot/frontend/weather-outlook-view.js';
const now=Date.parse('2026-11-03T08:00:00+01:00');
const cache={fetched:now,data:{daily_units:{temperature_2m_min:'°C',temperature_2m_max:'°C',weather_code:'wmo code',sunshine_duration:'s',daylight_duration:'s',precipitation_sum:'mm'},daily:{time:['2026-11-03','2026-11-04','2026-11-05'],temperature_2m_min:[0,null,4],temperature_2m_max:[7,9,12],weather_code:[3,0,2],sunshine_duration:[0,18000,18000],daylight_duration:[36000,36000,36000],precipitation_sum:[0,0,3]}}};
test('zero temperature and zero sun remain valid; unknown temperatures stay absent',()=>{
 const days=weatherOutlookDays(cache,now);assert.equal(days.length,7);assert.equal(days[0].min,0);assert.equal(days[0].mix,0);assert.equal(days[1].min,null);assert.equal(days[1].max,null);assert.equal(days[2].mix,25);
});
test('stale and future-dated cache never masquerade as current weather',()=>{
 for(const fetched of [now-21600000,now+1])assert.ok(weatherOutlookDays({...cache,fetched},now).every(d=>d.min===null&&d.mix===null));
});
test('wrong units and inverted ranges are rejected',()=>{
 const bad=structuredClone(cache);bad.data.daily.temperature_2m_min[0]=20;assert.equal(weatherOutlookDays(bad,now)[0].min,null);
 bad.data.daily_units.temperature_2m_min='°F';assert.ok(weatherOutlookDays(bad,now).every(d=>d.min===null));
});
test('temperature area does not bridge missing days; chart keeps requested height at phone width',()=>{
 const days=weatherOutlookDays(cache,now),html=weatherChart(days,340);
 assert.match(html,/viewBox="0 0 340 230"/);assert.doesNotMatch(html,/NaN|Infinity/);
 // Both isolated valid days are independent ranges, no joined temperature area.
 assert.equal((html.match(/class="weather-isolated"/g)||[]).length,2);
 assert.doesNotMatch(html,/fill="url\(#weather-temp-fill\)"/);
});

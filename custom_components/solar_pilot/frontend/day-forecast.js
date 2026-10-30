import {number} from './solar-chart.js';

export function dateKey(value, timezone='Europe/Berlin') {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function nextDays(now,timezone='Europe/Berlin',count=7) {
  const key=dateKey(now,timezone);
  return Array.from({length:count},(_,i)=>new Date(Date.parse(`${key}T12:00:00Z`)+i*86400000).toISOString().slice(0,10));
}
export function pvDayIds(todayId) {
  const german=todayId?.endsWith('prognose_heute'),english=todayId?.endsWith('forecast_today');
  return german?['prognose_heute','prognose_morgen','prognose_tag_3','prognose_tag_4','prognose_tag_5','prognose_tag_6','prognose_tag_7'].map(x=>todayId.replace(/prognose_heute$/,x)):english?['forecast_today','forecast_tomorrow','forecast_day_3','forecast_day_4','forecast_day_5','forecast_day_6','forecast_day_7'].map(x=>todayId.replace(/forecast_today$/,x)):[todayId];
}

// Only the combined daily Solcast estimate is used; entity state may be P10.
export function pvDays(states,todayId,timezone='Europe/Berlin',configuredIds=null) {
  const ids=configuredIds||pvDayIds(todayId);
  const result={};
  for(const id of ids){
    const entity=states[id],a=entity?.attributes;
    if(!a||a.dataCorrect===false||!['kWh','Wh'].includes(a.unit_of_measurement)||['unknown','unavailable'].includes(entity.state))continue;
    const rows=a.detailedForecast;
    const first=Array.isArray(rows)?rows.find(r=>dateKey(r.period_start,timezone)):null;
    const key=first&&dateKey(first.period_start,timezone),value=number(a.estimate),low=number(a.estimate10);
    if(key&&value!=null&&value>=0)result[key]={kwh:value/(a.unit_of_measurement==='Wh'?1000:1),low:low==null||low<0?null:low/(a.unit_of_measurement==='Wh'?1000:1)};
  }
  return result;
}
export function weatherDays(data) {
  const d=data?.daily,u=data?.daily_units;
  if(!Array.isArray(d?.time))return {};
  const out={};
  d.time.forEach((key,i)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return;
    const read=(name,unit)=>u?.[name]===unit?number(d[name]?.[i]):null;
    const sun=read('sunshine_duration','s'),day=read('daylight_duration','s');
    out[key]={sun: sun!=null&&sun>=0&&sun<=86400?sun:null,day:day!=null&&day>=0&&day<=86400?day:null,code:read('weather_code','wmo code'),max:read('temperature_2m_max','°C'),min:read('temperature_2m_min','°C'),rain:read('precipitation_sum','mm')};
    if(out[key].sun!=null&&out[key].day!=null&&out[key].sun>out[key].day)out[key].sun=null;
  });
  return out;
}
export function duration(seconds) {
  if(seconds==null||!Number.isFinite(seconds)||seconds<0)return '—';
  const minutes=Math.round(seconds/60);
  return `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min`;
}
export function weatherLabel(code) {
  if(code==null)return ['Wetter fehlt','weather-cloudy'];
  if(code===0)return ['Sonnig','weather-sunny'];
  if(code===1)return ['Überwiegend sonnig','weather-partly-cloudy'];
  if(code===2)return ['Teilweise bewölkt','weather-partly-cloudy'];
  if(code===3)return ['Bedeckt','weather-cloudy'];
  if([45,48].includes(code))return ['Nebel','weather-fog'];
  if([51,53,55,56,57].includes(code))return ['Nieselregen','weather-rainy'];
  if([61,63,65,66,67,80,81,82].includes(code))return ['Regen','weather-rainy'];
  if([71,73,75,77,85,86].includes(code))return ['Schnee','weather-snowy'];
  if([95,96,99].includes(code))return ['Gewitter','weather-lightning-rainy'];
  return ['Wetter unbekannt','weather-cloudy'];
}

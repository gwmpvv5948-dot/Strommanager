// Display-only daily weather; shares the existing public Dresden forecast request.
import {nextDays, weatherDays, weatherLabel, duration} from './day-forecast.js';
import {esc, fmt} from './view-format.js';

export function weatherOutlookDays(cache, now, zone='Europe/Berlin') {
  const age=now-(cache?.fetched??0);
  const weather=age>=0 && age<21600000 ? weatherDays(cache?.data) : {};
  return nextDays(now,zone).map((key,index)=>{
    const row=weather[key]??{};
    const valid=Number.isFinite(row.min) && Number.isFinite(row.max) && row.min>=-90 && row.max<=65 && row.min<=row.max;
    // Sun fraction of astronomical daylight, reduced for a wet day. Not a cloud-cover measurement.
    const mix=row.sun!=null && row.day>0 && row.rain!=null && row.rain>=0
      ? Math.min(100,Math.max(0,row.sun/row.day*100))/(1+row.rain/3) : null;
    const date=new Date(key+'T12:00:00Z');
    return {...row,key,min:valid?row.min:null,max:valid?row.max:null,mix,
      label:index===0?'Heute':new Intl.DateTimeFormat('de-DE',{weekday:'short',timeZone:'UTC'}).format(date).replace('.',''),
      date:new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(date)};
  });
}

export function weatherChart(days, width) {
  const W=Math.max(280,Math.round(width)),H=230,left=W<480?36:48,right=W<480?8:18,top=54,bottom=198;
  const valid=days.filter(d=>d.min!=null && d.max!=null);
  const lo=valid.length?Math.floor((Math.min(...valid.map(d=>d.min))-2)/5)*5:0;
  const hi=valid.length?Math.ceil((Math.max(...valid.map(d=>d.max))+3)/5)*5:15;
  const x=i=>left+(i+.5)*(W-left-right)/days.length,y=t=>bottom-(t-lo)/(hi-lo)*(bottom-top);
  const line=values=>values.map((v,i)=>`${i?'L':'M'}${x(v.i)},${y(v.v)}`).join(' ');
  let body=days.map((d,i)=>`<text x="${x(i)}" y="14" text-anchor="middle">${esc(d.label)}</text><text class="weather-axis" x="${x(i)}" y="30" text-anchor="middle">${esc(d.date)}</text>`).join('');
  const step=Math.max(5,Math.ceil((hi-lo)/20)*5);
  for(let t=lo;t<=hi;t+=step)body+=`<line x1="${left}" x2="${W-right}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/><text class="weather-axis" x="${left-7}" y="${y(t)+4}" text-anchor="end">${fmt(t,'',0)}°</text>`;
  const groups=[];let current=[];
  days.forEach((d,i)=>{if(d.min==null || d.max==null){if(current.length)groups.push(current);current=[];}else current.push({...d,i});});
  if(current.length)groups.push(current);
  for(const group of groups){
    const upper=group.map(d=>({i:d.i,v:d.max})),lower=group.map(d=>({i:d.i,v:d.min}));
    if(group.length>1){
      const band=line(upper)+' '+lower.slice().reverse().map(p=>`L${x(p.i)},${y(p.v)}`).join(' ')+' Z';
      body+=`<path d="${band}" fill="url(#weather-temp-fill)"/><path d="${line(upper)}" class="weather-max-line"/><path d="${line(lower)}" class="weather-min-line"/>`;
    }else body+=`<line x1="${x(group[0].i)}" x2="${x(group[0].i)}" y1="${y(group[0].min)}" y2="${y(group[0].max)}" class="weather-isolated"/>`;
    for(const d of group)body+=`<text x="${x(d.i)}" y="${y(d.max)-9}" text-anchor="middle">${fmt(Math.round(d.max)||0,'',0)}°</text><text x="${x(d.i)}" y="${y(d.min)+17}" text-anchor="middle">${fmt(Math.round(d.min)||0,'',0)}°</text>`;
  }
  for(const [i,d] of days.entries())if(d.min==null)body+=`<text class="weather-axis" x="${x(i)}" y="125" text-anchor="middle">—</text>`;
  if(!valid.length)body+=`<text class="weather-axis" x="${W/2}" y="170" text-anchor="middle">Keine gültige Temperaturprognose</text>`;
  return `<svg class="weather-outlook-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperaturprognose für Dresden: Tagesminimum bis Tagesmaximum in Grad Celsius. Fehlende Werte bleiben Lücken."><defs><linearGradient id="weather-temp-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--weather-warm)" stop-opacity=".27"/><stop offset="1" stop-color="var(--weather-cold)" stop-opacity=".24"/></linearGradient></defs>${body}</svg>`;
}

function detail(day) {
  const [label]=weatherLabel(day.code);
  return `<strong>${esc(day.label)} · ${esc(day.date)}</strong><span>${fmt(day.min,'',1)}–${fmt(day.max,'°C',1)}</span><span>${esc(label)}</span><span>Sonne ${duration(day.sun)}</span><span>Niederschlag ${fmt(day.rain,'mm',1)}</span>`;
}

export function weatherOutlookCard(panel,now=Date.now()) {
  const zone=panel._hass?.config?.time_zone||'Europe/Berlin',days=weatherOutlookDays(panel.dayWeather,now,zone);
  const selected=days.find(d=>d.key===panel.weatherSelectedDate)||days[0];
  const age=now-(panel.dayWeather?.fetched??0),stamp=panel.dayWeather?.fetched?new Intl.DateTimeFormat('de-DE',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(new Date(panel.dayWeather.fetched)):'—';
  const tiles=days.map(d=>{
    const [label,icon]=weatherLabel(d.code),known=d.mix!=null;
    return `<button type="button" class="weather-day ${known?'':'weather-unknown'}" data-weather-day="${d.key}" style="--weather-sun:${known?d.mix:0}%" aria-pressed="${selected.key===d.key}" aria-label="${esc(`${d.label} ${d.date}: ${fmt(d.min,'',1)} bis ${fmt(d.max,'°C',1)}, ${label}, Sonne ${duration(d.sun)}, Niederschlag ${fmt(d.rain,'mm',1)}`)}"><ha-icon icon="mdi:${icon}" aria-hidden="true"></ha-icon></button>`;
  }).join('');
  return `<section class="card weather-outlook-card"><div class="card-title"><h2>Wetterausblick</h2><span class="sub">Dresden · 7 Tage</span></div><div class="weather-plot">${weatherChart(days,720)}</div><div class="weather-tiles">${tiles}</div><div class="weather-outlook-legend"><span><i class="weather-band-key"></i>Temperatur · Min–Max</span><span>Wolken / Niederschlag <i class="weather-color-key"></i> Sonne</span></div><div class="weather-selected" aria-live="polite">${detail(selected)}</div><p class="days-source">Wetter: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · ${esc(stamp)}${age>=3600000&&panel.dayWeather?' · älter als 1 Stunde':''}</p>${panel.weatherError?`<p class="note">${esc(panel.weatherError)}</p>`:''}<details><summary>Angaben zur Wetterdarstellung</summary><p class="note">Fläche: erwarteter Bereich zwischen Tagesminimum und Tagesmaximum, kein Unsicherheitsband. Quadrate: Anteil der Sonnenstunden am Tageslicht; Niederschlag reduziert den Gelbanteil. Wetterzeichen: WMO-Tageswetter. Keine gemessene Bewölkung und kein Einfluss auf die Steuerung. Dresden-Stadtgebiet; Aktualisierung bei geöffnetem Panel höchstens stündlich. Fehlende Werte bleiben unbekannt, nach sechs Stunden werden gespeicherte Daten ausgeblendet.</p></details></section>`;
}

export function bindWeatherOutlook(panel) {
  panel._weatherObserver?.disconnect();
  const card=panel.shadowRoot.querySelector('.weather-outlook-card');
  if(!card)return;
  const days=weatherOutlookDays(panel.dayWeather,Date.now(),panel._hass?.config?.time_zone||'Europe/Berlin');
  card.querySelectorAll('[data-weather-day]').forEach(button=>button.addEventListener('click',()=>{
    const day=days.find(d=>d.key===button.dataset.weatherDay);if(!day)return;
    panel.weatherSelectedDate=day.key;
    card.querySelectorAll('[data-weather-day]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.weatherDay===day.key));
    card.querySelector('.weather-selected').innerHTML=detail(day);
  }));
  const plot=card.querySelector('.weather-plot');let previous=-1;
  const draw=()=>{if(!plot.isConnected)return;const width=Math.round(plot.getBoundingClientRect().width);if(width<1||width===previous)return;previous=width;card.style.setProperty("--weather-left",width<480?"36px":"48px");card.style.setProperty("--weather-right",width<480?"8px":"18px");plot.innerHTML=weatherChart(days,width);};
  draw();panel._weatherObserver=new ResizeObserver(draw);panel._weatherObserver.observe(plot);
}

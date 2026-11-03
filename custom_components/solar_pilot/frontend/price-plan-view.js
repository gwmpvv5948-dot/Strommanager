// Raw exchange prices, deliberately independent from actual tariff and EE percentages.
import {esc,fmt} from './view-format.js';
export function pricePlanChart(plan,zone='Europe/Berlin') {
  const rows=plan.points||[],known=rows.filter(p=>Number.isFinite(p.spot_ct));
  if(!known.length)return '';
  const values=known.map(p=>p.spot_ct).sort((a,b)=>a-b),low=values[Math.floor((values.length-1)/3)],high=values[Math.floor(2*(values.length-1)/3)];
  const narrow=typeof matchMedia==='function'&&matchMedia('(max-width:700px)').matches,W=narrow?420:960,H=180,L=narrow?48:60,R=W-18,T=26,B=150,min=Math.min(0,...values),max=Math.max(min+1,...values),pad=(max-min)*.08;
  const x=t=>L+(t-plan.start)/(plan.end-plan.start)*(R-L),y=v=>B-(v-min+pad)/(max-min+2*pad)*(B-T);
  const time=t=>new Intl.DateTimeFormat('de-DE',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(new Date(t*1000));
  const date=t=>new Intl.DateTimeFormat('de-DE',{timeZone:zone,day:'2-digit',month:'2-digit'}).format(new Date(t*1000));
  let svg='';
  for(const v of [min,(min+max)/2,max])svg+=`<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end">${fmt(v,'',1)}</text>`;
  for(const p of rows){
    const a=x(p.start),b=x(p.end),v=p.spot_ct;
    if(!Number.isFinite(v)){svg+=`<rect x="${a}" y="${T}" width="${b-a}" height="${B-T}" class="grid-neutral" opacity=".22"/>`;continue;}
    const color=v<=low?'green':v>=high?'red':'yellow';
    svg+=`<rect x="${a}" y="${Math.min(y(0),y(v))}" width="${Math.max(.2,b-a-.5)}" height="${Math.max(.5,Math.abs(y(v)-y(0)))}" class="grid-${color}" opacity=".55"/><path d="M${a},${y(v)}H${b}" class="price-segment ${p.price_forecast?'price-predicted':''}"/>`;
  }
  for(const n of [0,6,12,18,24]){const t=plan.start+n*3600;svg+=`<text x="${x(t)}" y="174" text-anchor="${n===0?'start':n===24?'end':'middle'}">${n===0?'JETZT':time(t)}</text>`;}
  // Date labels on the current and following day are unambiguous across DST.
  svg+=`<text x="${L}" y="14">Börsenpreis · ct/kWh · ${date(plan.start)} → ${date(plan.end)}</text>`;
  return `<div class="price-plan"><svg class="plan-chart price-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Börsenpreise in Cent pro Kilowattstunde. Gestrichelt: geschätzt. Grau: unbekannt.">${svg}</svg><div class="chart-legend"><span><i class="grid-green"></i>Günstig</span><span><i class="grid-yellow"></i>Mittel</span><span><i class="grid-red"></i>Teuer</span><span>━ Veröffentlicht</span><span>┄ Prognose</span></div><p class="note">Farben relativ zu den verfügbaren 24-h-Preisen · kein EE- oder CO₂-Wert. Festpreis bleibt für die Kostenberechnung maßgeblich.</p></div>`;
}
export function priceConnection(status){
 const p=status?.price_forecast;
 return `<p class="note">Preisprognose: ${esc(p?.reason||'Anbindung wird vorbereitet')}${p?.available?` · jetzt ${fmt(p.spot_ct,'ct/kWh',2)}`:''}</p>`;
}

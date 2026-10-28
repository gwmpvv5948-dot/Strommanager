import {dateKey} from './day-forecast.js';
import {number} from './solar-chart.js';

// Provisional display references, never claimed as measured system limits.
export const PROVISIONAL_MONTHS=[8,12,20,28,34,36,36,32,26,20,12,8];
export function monthlyReferences(rows, now=Date.now(), zone='Europe/Berlin'){
  const today=dateKey(now,zone),groups=Array.from({length:12},()=>new Map());
  for(const row of Array.isArray(rows)?rows:[]){
    const start=number(row?.start),end=number(row?.end),value=number(row?.change);
    if(start===null||end===null||value===null||value<0||value>1000||end>now||end<=start||end-start<23*3600000||end-start>25*3600000)continue;
    const key=dateKey(start,zone);if(!key||key>=today)continue;
    groups[Number(key.slice(5,7))-1].set(key,value);
  }
  return groups.map((group,i)=>{
    const values=[...group.values()].sort((a,b)=>a-b),n=values.length,pos=(n-1)*.95;
    const p95=n?values[Math.floor(pos)]+(values[Math.ceil(pos)]-values[Math.floor(pos)])*(pos-Math.floor(pos)):null;
    const measured=n>=20&&p95>0;
    return {kwh:measured?p95:PROVISIONAL_MONTHS[i],source:measured?'p95':'provisional',days:n};
  });
}
export function referenceScale(keys,pv,references){
  // All four columns retain one kWh scale, even at a month boundary.
  const maximum=Math.max(1,...keys.map(k=>references[Number(k.slice(5,7))-1]?.kwh||0),...keys.flatMap(k=>[pv[k]?.kwh||0,pv[k]?.low||0]));
  const step=maximum<=20?5:maximum<=50?10:20;
  return Math.ceil(maximum/step)*step;
}
export function yieldAssessment(value,house,storage){
  if([value,house,storage].some(v=>number(v)===null||v<0))return {kind:'unknown',label:'Bedarf unbekannt'};
  if(value<house)return {kind:'poor',label:'Hausbedarf nicht gedeckt'};
  if(value<house+storage)return {kind:'fair',label:'Haus gedeckt · Reserve offen'};
  return {kind:'good',label:'Haus + Reserve gedeckt'};
}

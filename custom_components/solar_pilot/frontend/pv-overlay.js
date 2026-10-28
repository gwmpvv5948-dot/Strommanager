// Display-only hourly PV means. Partial hours are normalized to a full hour,
// never added to daily energy accounting. Unknown periods remain gaps.
const num=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function bins(start,end){return Array.from({length:Math.round((end-start)/3600)},(_,i)=>({stamp:start+i*3600,energy:0,seconds:0}));}
function add(rows,begin,end,kw){
  if(!(end>begin)||kw===null||kw<0)return;
  for(const p of rows){const seconds=Math.max(0,Math.min(end,p.stamp+3600)-Math.max(begin,p.stamp));if(seconds){p.energy+=kw*seconds/3600;p.seconds+=seconds;}}
}
function segments(rows,start,end,threshold,now,kind){
  const result=[];let segment=[];
  const flush=()=>{if(segment.length)result.push(segment);segment=[];};
  for(const p of rows){const begin=Math.max(start,p.stamp),stop=Math.min(end,p.stamp+3600),expected=stop-begin;
    if(expected<=0||p.seconds<expected*threshold){flush();continue;}
    const point={t:kind==='actual'&&stop===now?now:kind==='forecast'&&begin===now?now:(begin+stop)/2,
      kwh:p.energy*3600/p.seconds,seconds:p.seconds,stamp:p.stamp};
    segment.push(point);
  }
  flush();return result;
}
function intervals(history,unit,start,now){
  const factor=unit==='W'?.001:unit==='kW'?1:null;if(factor===null)return [];
  const points=new Map();
  for(const row of history||[]){const t=Date.parse(row.last_updated??row.last_changed)/1000,value=num(row.state);if(Number.isFinite(t))points.set(t,value===null||value<0?null:value*factor);}
  const ordered=[...points].sort((a,b)=>a[0]-b[0]),result=[];
  for(let i=0;i<ordered.length;i++){
    const [t,value]=ordered[i];if(t>=now)break;
    const begin=Math.max(start,t),end=Math.min(now,ordered[i+1]?.[0]??now,t+(i+1<ordered.length?900:300));
    if(value!==null&&end>begin)result.push({begin,end,value});
  }
  return result;
}
export function pvOverlay(history,unit,forecast,dayStart,dayEnd,now,extraSources=[]){
  if(![dayStart,dayEnd,now].every(Number.isFinite)||dayEnd<=dayStart||dayEnd-dayStart>26*3600||now<dayStart||now>=dayEnd)return {actual:[],forecast:[]};
  const actual=bins(dayStart,dayEnd),future=bins(dayStart,dayEnd);
  const channels=[{history,unit},...extraSources].map(s=>intervals(s.history,s.unit,dayStart,now));
  // Sum simultaneous measurements, not independently averaged hours. Every
  // required source must cover an interval; missing sources are never zero.
  const boundaries=[...new Set(channels.flatMap(c=>c.flatMap(p=>[p.begin,p.end])))].sort((a,b)=>a-b),indices=channels.map(()=>0);
  for(let i=0;i<boundaries.length-1;i++){
    const begin=boundaries[i],end=boundaries[i+1];let total=0,valid=true;
    for(let j=0;j<channels.length;j++){
      const c=channels[j];while(indices[j]<c.length&&c[indices[j]].end<=begin)indices[j]++;
      const p=c[indices[j]];
      if(!p||p.begin>begin||p.end<end){valid=false;break;}
      total+=p.value;
    }
    if(valid)add(actual,begin,end,total);
  }
  const points=[...(forecast||[])].filter(p=>Number.isFinite(p.t)&&num(p.p)!==null&&p.p>=0).sort((a,b)=>a.t-b.t);
  for(let i=0;i<points.length;i++){
    const t=points[i].t/1000,stop=Math.min(dayEnd,t+1800,(points[i+1]?.t??Infinity)/1000);
    add(future,Math.max(now,dayStart,t),stop,points[i].p);
  }
  return {actual:segments(actual,dayStart,now,.85,now,'actual'),forecast:segments(future,now,dayEnd,.999,now,'forecast')};
}

// One accounting model for both views. Unknown intervals are never zero-filled.
const numeric=value=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const energy=value=>{const n=numeric(value);return n!==null&&n>=0?n:null;};
export function consumptionBars(f){
  const start=numeric(f?.day_start),end=numeric(f?.day_end),now=numeric(f?.updated);
  if(start===null||end===null||now===null||end<=start||end-start>26*3600||now<start||now>=end)return null;
  const current=Math.floor(now/3600)*3600,observed=new Map(),forecast=new Map();
  for(const p of f.observed||[]){const v=energy(p.kwh);if(v!==null&&p.stamp>=start&&p.stamp<current&&p.stamp%3600===0)observed.set(p.stamp,v);}
  for(const p of f.hours||[]){if(p.stamp>=current&&p.stamp<end&&p.stamp%3600===0)forecast.set(p.stamp,p);}
  const part=f.current_observation,elapsed=now-current,seconds=numeric(part?.seconds);
  const partial=part?.stamp===current&&seconds!==null&&seconds>0&&seconds<=3600?energy(part.kwh):null;
  const currentCoverage=elapsed===0?1:partial===null?0:Math.min(1,seconds/elapsed);
  let measured=0,remaining=0,missing=0,completeForecast=true;
  const bins=[];
  for(let stamp=start;stamp<end;stamp+=3600){
    if(stamp<current){const actual=observed.get(stamp)??null;if(actual===null)missing++;else measured+=actual;bins.push({stamp,actual,future:null,low:null,high:null,missing:actual===null,current:false});continue;}
    const p=forecast.get(stamp),value=energy(p?.kwh),fraction=stamp===current?(stamp+3600-now)/3600:1;
    const actual=stamp===current?partial:null;
    if(actual!==null)measured+=actual;
    const future=value===null?null:value*fraction;
    if(future===null)completeForecast=false;else remaining+=future;
    bins.push({stamp,actual,future,low:energy(p?.low)===null?null:p.low*fraction,high:energy(p?.high)===null?null:p.high*fraction,missing:stamp===current&&currentCoverage<.85&&elapsed>0,current:stamp===current});
  }
  const total=completeForecast?measured+remaining:null;
  return {start,end,now,bins,measured,remaining:completeForecast?remaining:null,total,missing,currentCoverage,
    complete:missing===0&&currentCoverage>=.85&&completeForecast};
}

// Historical comparisons deliberately keep forecast and actual separate. They
// describe the same hour, so treating them as cumulative energy would be wrong.
export function historicalConsumptionBars(day){
  const start=numeric(day?.day_start),end=numeric(day?.day_end);
  if(start===null||end===null||end<=start||end-start>26*3600)return null;
  const records=new Map((day?.hours||[]).filter(row=>numeric(row?.stamp)!==null).map(row=>[Number(row.stamp),row]));
  let actualTotal=0,predictedTotal=0,evaluated=0,missing=0;
  const bins=[];
  for(let stamp=start;stamp<end;stamp+=3600){
    const row=records.get(stamp),actual=energy(row?.actual),predicted=energy(row?.predicted);
    if(actual===null)missing++;else {actualTotal+=actual;evaluated++;}
    if(actual!==null&&predicted!==null)predictedTotal+=predicted;
    bins.push({stamp,actual,predicted,missing:actual===null||predicted===null,error:row?.error??null});
  }
  return {start,end,bins,actualTotal:evaluated?actualTotal:null,predictedTotal:evaluated?predictedTotal:null,
    evaluated,missing,forecastHours:Number(day?.forecast_hours)||0,error:day?.error_kwh??null};
}
export function consumptionAxis(bins,extra=[]){
  const peak=Math.max(.1,...bins.map(p=>(p.actual||0)+Math.max(p.future||0,p.high||0)),...extra.filter(v=>Number.isFinite(v)&&v>=0));
  const base=10**Math.floor(Math.log10(peak/4)),ratio=peak/4/base;
  const step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*base;
  const max=Math.ceil(peak/step)*step;
  return {max,step,ticks:Array.from({length:Math.round(max/step)+1},(_,i)=>i*step)};
}

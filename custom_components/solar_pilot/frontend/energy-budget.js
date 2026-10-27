import {number} from './solar-chart.js';

// Display-only allocation of the configured remaining forecast; no device actions.
export function energyBudget(s,c,extra=2.5,now=Date.now()/1000){
  const fresh=(age,max)=>number(age)!==null&&age>=0&&age+Math.max(0,now-s.now)<=max;
  const required=[s.now,s.house_soc,s.forecast_kwh,c.capacity_kwh,c.reserve_soc,c.minimum_house_w,c.forecast_factor,c.buffer_kwh,c.efficiency,extra];
  if(required.some(v=>number(v)===null)||s.house_soc<0||s.house_soc>100||s.forecast_kwh<0||extra<0||extra>30
    ||c.capacity_kwh<=0||c.efficiency<=0||c.efficiency>1||c.reserve_soc<0||c.reserve_soc>100
    ||c.minimum_house_w<0||c.forecast_factor<0||c.forecast_factor>1||c.buffer_kwh<0
    ||!fresh(s.house_soc_age,c.meter_max_age_s)||!fresh(s.forecast_age,c.forecast_max_age_s)
    ||typeof s.daylight!=='boolean'||(s.daylight&&(number(s.hours_left)===null||s.hours_left<0||s.hours_left>24)))return null;
  const hours=s.daylight?s.hours_left:0,forecast=s.daylight?s.forecast_kwh:0;
  const houseNeed=c.minimum_house_w/1000*hours+(s.daylight?extra:0);
  const storageNeed=Math.max(0,c.reserve_soc-s.house_soc)/100*c.capacity_kwh/c.efficiency;
  const buffer=Math.min(forecast,forecast*(1-c.forecast_factor)+c.buffer_kwh);
  let available=forecast-buffer;
  const house=Math.min(available,houseNeed);available-=house;
  const storage=Math.min(available,storageNeed);available-=storage;
  return {forecast,hours,base:c.minimum_house_w/1000*hours,extra:s.daylight?extra:0,houseNeed,storageNeed,buffer,house,storage,tesla:Math.max(0,available),deficit:Math.max(0,houseNeed+storageNeed-house-storage),night:!s.daylight};
}

// A daily counter must have a real energy unit and a state from this HA day.
export function dailyEnergy(entity,start,now=Date.now()){
  const value=number(entity?.state),updated=Date.parse(entity?.last_updated),unit=entity?.attributes?.unit_of_measurement;
  if(value===null||value<0||!Number.isFinite(updated)||updated<start||updated>now+60000)return null;
  return unit==='kWh'?value:unit==='Wh'?value/1000:null;
}
export function progressParts(actual,remaining,capacity=null){
  const a=number(actual),r=number(remaining),known=a!==null&&a>=0,need=r!==null&&r>=0?r:null;
  const total=number(capacity)>0?capacity:Math.max(known?a:0,0)+(need??0);
  return {solid:known&&total>0?Math.min(100,a/total*100):0,planned:need!==null&&total>0?Math.min(100-Math.min(100,(known?a:0)/total*100),need/total*100):0,known};
}

export function dayAllocation(ledger,s,c,remaining,extra,day,now=Date.now()/1000){
  const a=ledger?.actual;
  if(!ledger?.available||ledger.day!==day||!a||now-ledger.updated>900||now<ledger.updated-60
    ||['house','storage','tesla','other','solar','house_load','pv_hours'].some(k=>number(a[k])===null||a[k]<0))return null;
  // Daily extra consumption already covered must not be reserved a second time.
  const extraUsed=Math.max(0,a.house_load-c.minimum_house_w/1000*a.pv_hours);
  const extraLeft=Math.max(0,extra-extraUsed);
  const plan=energyBudget({...s,forecast_kwh:remaining},c,extraLeft,now);
  if(!plan)return null;
  const actual={house:a.house,storage:a.storage,tesla:a.tesla,buffer:a.other};
  const future={house:plan.house,storage:plan.storage,tesla:plan.tesla,buffer:plan.buffer};
  const total=Object.values(actual).reduce((sum,v)=>sum+v,0)+plan.forecast;
  return {actual,future,total,plan,extraUsed,extraLeft};
}
export function remainingPV(points,now,end){
  if(!Array.isArray(points)||!points.length||!Number.isFinite(now)||!Number.isFinite(end))return null;
  if(now>=end)return 0;
  let energy=0,covered=now;
  for(let i=0;i<points.length;i++){
    const p=points[i],start=Math.max(now,p.t),stop=Math.min(end,p.t+1800000,points[i+1]?.t??Infinity);
    if(stop<=start)continue;
    if(start>covered+1000||number(p.p)===null||p.p<0)return null;
    energy+=p.p*(stop-start)/3600000;covered=stop;
  }
  return covered<end-1000?null:energy;
}

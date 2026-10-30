// Display-only simulation. No services, no changes to controller decisions.
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export function batteryForecast(b,s,c,{now,sunset,minSoc,pv=[]}={}){
 const fail=reason=>({available:false,reason,points:[]});
 const required=[now,sunset,minSoc,s?.now,s?.house_soc,s?.house_soc_age,c?.capacity_kwh,c?.efficiency,c?.normal_discharge_w,c?.max_charge_w,c?.forecast_factor,c?.meter_max_age_s,b?.now,b?.end];
 if(required.some(v=>num(v)===null)||!Array.isArray(b?.bins))return fail('Akku-Prognose: Daten fehlen');
 if(now<b.now||now-b.now>900||s.now>now+60||s.house_soc_age<0||s.house_soc_age+Math.max(0,now-s.now)>c.meter_max_age_s)return fail('Akku-Prognose: Daten veraltet');
 if(c.capacity_kwh<=0||c.efficiency<=0||c.efficiency>1||c.normal_discharge_w<0||c.max_charge_w<0||c.forecast_factor<0||c.forecast_factor>1||s.house_soc<0||s.house_soc>100||minSoc<0||minSoc>=100||now>=b.end||sunset<now||sunset>b.end)return fail('Akku-Prognose: ungültige Grenzen');
 if(sunset>now&&(num(s.forecast_age)===null||num(c.forecast_max_age_s)===null||s.forecast_age<0||s.forecast_age+Math.max(0,now-s.now)>c.forecast_max_age_s))return fail('Akku-Prognose: PV-Prognose veraltet');
 const house=t=>{const bin=b.bins.find(p=>t>=p.stamp&&t<p.stamp+3600);const hours=bin?Math.max(0,bin.stamp+3600-Math.max(b.now,bin.stamp))/3600:0;return bin&&num(bin.future)!==null&&bin.future>=0&&hours>0?bin.future/hours:null;};
 const solar=t=>{const point=pv.find(p=>t>=p.t/1000&&t<p.t/1000+1800);return point&&num(point.p)!==null&&point.p>=0?point.p*c.forecast_factor*.95:null;};
 let energy=c.capacity_kwh*s.house_soc/100,minimum=c.capacity_kwh*minSoc/100,points=[{t:now,soc:s.house_soc}],bands=[],exhaustedAt=null,shortfall=false;
 // Split at every house/PV boundary and sunset, then integrate 1-minute steps.
 const boundaries=[...new Set([now,sunset,b.end,...b.bins.flatMap(p=>[p.stamp,p.stamp+3600]),...pv.flatMap(p=>[p.t/1000,p.t/1000+1800])])].filter(t=>t>=now&&t<=b.end).sort((a,z)=>a-z);
 for(let t=now;t<b.end;){const boundary=boundaries.find(v=>v>t+1e-6)??b.end,stop=Math.min(t+60,boundary,b.end),mid=(t+stop)/2,h=(stop-t)/3600,load=house(mid),before=mid<sunset,power=before?solar(mid):0;
  if(load===null)return fail('Akku-Prognose: Hausprognose unvollständig');
  if(power===null)return fail('Akku-Prognose: PV-Restprognose unvollständig');
  const deficit=Math.max(0,load-power),available=Math.max(0,energy-minimum)*c.efficiency;
  const supplied=Math.min(deficit,c.normal_discharge_w/1000,available/h),covered=deficit-supplied<1e-8;
  if(power>load)energy=Math.min(c.capacity_kwh,energy+Math.min(power-load,c.max_charge_w/1000)*h*c.efficiency);
  else energy=Math.max(Math.min(energy,minimum),energy-supplied*h/c.efficiency);
  if(deficit>1e-8){
   let coveredStop=covered?stop:t;
   if(!covered&&deficit>0&&c.normal_discharge_w/1000>=deficit&&available>0)coveredStop=Math.min(stop,t+available/deficit*3600);
   if(coveredStop>t){const previous=bands.at(-1);if(previous&&Math.abs(previous.end-t)<.001)previous.end=coveredStop;else bands.push({start:t,end:coveredStop});}
   if(!covered&&!shortfall){exhaustedAt=coveredStop;shortfall=true;}
  }
  points.push({t:stop,soc:energy/c.capacity_kwh*100});t=stop;
 }
 const atSunset=points.find(p=>Math.abs(p.t-sunset)<.001)??points[0];
 return {available:true,points,bands,sunset,minSoc,sunsetSoc:atSunset.soc,exhaustedAt,completeCoverage:!shortfall,capacity:c.capacity_kwh};
}

// Pure display calculations. No device commands or network requests.
export const number = value => value === null || value === undefined || String(value).trim()==='' || !Number.isFinite(Number(value)) ? null : Number(value);
export function dayBounds(now, timeZone='Europe/Berlin') {
  const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const p=parts(now), target=Date.UTC(p.year,p.month-1,p.day);
  const midnight = utc => {let guess=utc;for(let i=0;i<3;i++){const z=parts(guess);guess+=utc-Date.UTC(z.year,z.month-1,z.day,z.hour,z.minute,z.second);}return guess;};
  return {start:midnight(target),end:midnight(target+86400000),key:`${p.year}-${p.month}-${p.day}`};
}
export function forecastPoints(rows,start,end) {
  const points=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const t=Date.parse(row.period_start),p=number(row.pv_estimate),low=number(row.pv_estimate10);
    if(Number.isFinite(t)&&t>=start&&t<end&&p!==null&&p>=0)points.set(t,{t,p,low:low!==null&&low>=0?low:null});
  }
  return [...points.values()].sort((a,b)=>a.t-b.t);
}
export function actualSegments(rows,start,end,unit) {
  const factor=unit==='W'?.001:unit==='kW'?1:null;if(factor===null)return [];
  const segments=[];let segment=[],last=null,bucket=null;
  const flush=()=>{if(segment.length)segments.push(segment);segment=[];last=null;bucket=null;};
  for(const row of Array.isArray(rows)?rows:[]){
    const t=Date.parse(row.last_changed??row.last_updated),v=number(row.state);
    if(!Number.isFinite(t)||t<start||t>end)continue;
    if(v===null||v<0){flush();continue;}
    if(last!==null&&t-last>15*60000)flush();
    const b=Math.floor(t/60000),point={t,p:v*factor};
    if(b===bucket)segment[segment.length-1]=point;else segment.push(point);
    bucket=b;last=t;
  }
  flush();return segments;
}
export function storagePotential(s,c,points,now){
  const soc=number(s.house_soc),hours=number(s.hours_left);
  const fresh=(age,max)=>number(age)!==null&&age>=0&&age<=max;
  if(soc===null||soc<0||soc>100||hours===null||hours<=0||!s.daylight||!(c.capacity_kwh>0)
      ||!fresh(s.house_soc_age,c.meter_max_age_s)||!fresh(s.meter_age,c.meter_max_age_s)
      ||!fresh(s.forecast_age,c.forecast_max_age_s)||!Number.isFinite(now)||!Array.isArray(points)||!points.length)return null;
  if([s.pv_w,s.grid_export_w,s.battery_charge_w,s.wallbox_w].some(v=>number(v)===null))return null;
  // The EV regulation budget subtracts an energy buffer from a conservative total.
  // A storage charging forecast must instead integrate the remaining PV curve:
  // that reserved buffer can still charge the battery, and EV charging is excluded.
  const batt=Math.min(s.battery_charge_w,s.battery_charge_w*.95);
  const surplus=Math.max(0,s.wallbox_w+s.grid_export_w+batt);
  const house=Math.max(c.minimum_house_w,s.pv_w*.95-surplus);
  const end=now+hours*3600000;
  let charge=0,covered=now;
  for(let i=0;i<points.length;i++){
    const p=points[i],start=Math.max(now,p.t),stop=Math.min(end,p.t+1800000,points[i+1]?.t??Infinity);
    if(stop<=start)continue;
    if(start>covered+1000||number(p.p)===null||p.p<0)return null;
    const watts=Math.min(c.max_charge_w,Math.max(0,p.p*1000*c.forecast_factor-house));
    charge+=watts*(stop-start)/3600000000*c.efficiency;
    covered=stop;
  }
  if(covered<end-1000)return null;
  return Math.min(100,soc+charge/c.capacity_kwh*100);
}
export function batteryProtection(s,c,d,mode){
  const current=number(s.current_discharge_w),fresh=number(s.meter_age)!==null&&s.meter_age<=c.meter_max_age_s;
  const charging=fresh&&number(s.wallbox_w)!==null&&s.wallbox_w>10;
  if(charging&&current!==null&&current<c.normal_discharge_w)return {kind:'active',text:`Entnahme wegen Autoladung begrenzt · ${Math.round(current)} W`};
  if(charging&&['auto','storage_first','charge_minimum'].includes(mode)&&d.discharge_w===0)return {kind:'pending',text:'Speicherschutz wegen Autoladung angefordert · Rückmeldung ausstehend'};
  return null;
}

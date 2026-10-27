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

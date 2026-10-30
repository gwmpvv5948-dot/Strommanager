// Display-only energy overview. Missing or stale readings are never zero-filled.
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
export function liveEnergy(status,states,now=Date.now()){
  const c=status?.settings||{},ids=status?.entities||{},learn=status?.source_entities?.learning||{};
  const ageLimit=num(c.meter_max_age_s)??300;
  const read=(id,power=true)=>{
    const s=states?.[id],v=num(s?.state),t=Date.parse(s?.last_reported||s?.last_updated||'');
    if(v===null||s?.attributes?.restored||!Number.isFinite(t)||now-t< -60000||now-t>ageLimit*1000)return null;
    if(!power)return v;
    return s.attributes?.unit_of_measurement==='W'?v:s.attributes?.unit_of_measurement==='kW'?v*1000:null;
  };
  const roof=read(ids.pv_power),garage=read(learn.garage),shed=read(learn.shed),ac=read(learn.inverter);
  const nonnegative=v=>v!==null&&v>=0;
  const pv=[roof,garage,shed].every(nonnegative)?roof+garage+shed:null;
  const rawGrid=read(ids.grid_power),rawBattery=read(ids.battery_power),ev=read(ids.wallbox_power);
  const grid=rawGrid===null?null:rawGrid*(c.grid_export_positive===false?-1:1);
  const battery=rawBattery===null?null:rawBattery*(c.battery_charge_positive===false?-1:1);
  // Signed inverter AC output already includes battery flows. Do not add them again.
  const balance=ac!==null&&[garage,shed,ev].every(nonnegative)&&grid!==null?ac+garage+shed-grid-ev:null;
  const house=balance!==null&&balance>=-100&&balance<=30000?Math.max(0,balance):null;
  const rawSoc=read(ids.house_soc,false),soc=rawSoc!==null&&rawSoc>=0&&rawSoc<=100?rawSoc:null;
  return {pv,grid,battery,house,soc,ev:nonnegative(ev)?ev:null};
}

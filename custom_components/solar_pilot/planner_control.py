"""Translate a valid house LP interval to the existing local discharge actuator."""
from dataclasses import replace
import math


def valid(value):
    return type(value) in (int,float) and math.isfinite(value)


def apply_house_plan(s,c,decision,mode,plan,*,device_min_soc,device_max_w,device_step_w,inputs_valid=True):
    enabled = c.planner_control_enabled
    meta = {'enabled':enabled,'source':'fallback','reason':'HiGHS-Steuerung ausgeschaltet','discharge_w':decision.discharge_w,'replan':False}
    def result(source,reason,watts=None,replan=False):
        actual = decision.discharge_w if watts is None else watts
        return replace(decision,discharge_w=actual),{**meta,'source':source,'reason':reason,'discharge_w':actual,'replan':replan}
    if mode in ('observe','paused'):
        return result(mode,'Beobachten · keine Gerätebefehle' if mode=='observe' else 'Pausiert · letzte Geräteeinstellung bleibt')
    if not enabled:
        return decision,meta
    if not all(valid(v) for v in (device_min_soc,device_max_w,device_step_w)) or not 0<=device_min_soc<=100 or device_max_w<0 or device_step_w<=0:
        return result('protection','Entladung gesperrt · Geräte-Grenzen fehlen',0)
    minimum = device_min_soc
    if (not valid(s.house_soc) or not 0<=s.house_soc<=100 or not 0<=s.house_soc_age<=c.meter_max_age_s
            or not 0<=s.meter_age<=c.meter_max_age_s or s.daylight is None
            or not all(valid(v) for v in (s.pv_w,s.grid_export_w,s.battery_charge_w,s.wallbox_w))):
        return result('protection','Entladung gesperrt · Messwerte fehlen oder sind veraltet',0)
    if s.house_soc<=minimum:
        return result('protection','Akku am oder unter dem Wechselrichter-Mindeststand · Entladung gesperrt',0)
    if s.grid_charge_enabled is True:
        return result('protection','Entladung gesperrt · Netzladung muss zuerst ausgeschaltet sein',0)
    ceiling = min(c.normal_discharge_w,device_max_w)
    rounded = lambda w:max(0,math.floor(min(ceiling,max(0,w))/device_step_w+1e-9)*device_step_w)
    # Tesla is outside the house LP. Preserve its shared-inverter protection and
    # explicit storage-release rules, never use house optimisation to override it.
    if s.wallbox_w>10 or (decision.target_amps or 0)>=c.min_amps:
        return result('tesla','Tesla-Regelung hat Vorrang · Hausfahrplan ausgesetzt',rounded(decision.discharge_w))
    if not inputs_valid:
        return result('fallback','Fallback: Prognosequellen fehlen oder sind veraltet',rounded(decision.discharge_w))
    if not plan.get('available') or not valid(plan.get('updated')) or not 0<=s.now-plan['updated']<=600:
        return result('fallback','Fallback: '+(plan.get('reason') or 'kein gültiger HiGHS-Fahrplan'),rounded(decision.discharge_w))
    points=plan.get('points',[])
    index=next((i for i,p in enumerate(points) if valid(p.get('start')) and valid(p.get('end')) and p['start']<=s.now<p['end']),None)
    if index is None:
        return result('fallback','Fallback: kein HiGHS-Zeitfenster für jetzt',rounded(decision.discharge_w),True)
    point=points[index]
    if not valid(point.get('battery_kw')) or point['battery_kw']<0 or not valid(point.get('soc')):
        return result('fallback','Fallback: ungültiger HiGHS-Sollwert',rounded(decision.discharge_w),True)
    previous=plan.get('initial_soc') if index==0 else points[index-1].get('soc')
    if not valid(previous):
        return result('fallback','Fallback: Akku-Prognose unvollständig',rounded(decision.discharge_w),True)
    expected=previous+(point['soc']-previous)*(s.now-point['start'])/(point['end']-point['start'])
    if abs(s.house_soc-expected)>5:
        return result('fallback','Fallback: Akku weicht vom Plan ab · Neuberechnung',rounded(decision.discharge_w),True)
    # Prevent consumption of the remaining minimum reserve before this interval ends.
    available=(s.house_soc-minimum)*c.capacity_kwh/100*c.efficiency
    remaining=max(30,point['end']-s.now)/3600
    watts=rounded(min(point['battery_kw']*1000,available/remaining*1000))
    if watts<10:watts=0
    return result('highs','HiGHS aktiv · '+('Akku fürs Haus' if watts else 'Akku bewahren / PV nutzen'),watts)


def apply_joint_plan(s,c,decision,mode,plan,*,device_min_soc,device_max_w,device_step_w,
                     inputs_valid=True,grid_share=None,minimum_active=False,storage_active=False):
    """Use an eligible joint plan through the existing serialized device executor."""
    meta={'enabled':c.planner_control_enabled,'source':'fallback','reason':'Tesla-Fahrplan nicht freigegeben',
          'discharge_w':decision.discharge_w,'target_amps':decision.target_amps,'replan':False}
    def result(reason,source='fallback',watts=None,amps=None,replan=False):
        d=decision if watts is None and amps is None else replace(decision,
            discharge_w=decision.discharge_w if watts is None else watts,
            target_amps=decision.target_amps if amps is None else amps,
            may_control_car=True if amps is not None else decision.may_control_car,
            code='highs_ev',reason=reason)
        return d,{**meta,'source':source,'reason':reason,'discharge_w':d.discharge_w,'target_amps':d.target_amps,'replan':replan}
    if mode in ('observe','paused') or not c.planner_control_enabled or not c.planner_ev_enabled:
        return apply_house_plan(s,c,decision,mode,plan,device_min_soc=device_min_soc,
            device_max_w=device_max_w,device_step_w=device_step_w,inputs_valid=inputs_valid)
    # Unknown vehicle state never becomes a new charging permission.
    if (not s.at_home or not s.cable or not s.wallbox_enabled or not s.online
            or not 0<=s.car_age<=c.car_max_age_s or not 0<=s.location_age<=c.car_max_age_s
            or not all(valid(v) for v in (s.car_soc,s.car_limit,s.car_current))):
        return result('Tesla-Fallback: Fahrzeug nicht verfügbar, schläft oder Daten veraltet',replan=True)
    if minimum_active or s.car_soc<c.car_low_soc:
        return result('Tesla-Mindestladung hat Vorrang · Hausspeicher geschützt')
    if not inputs_valid or not plan.get('available') or not valid(plan.get('updated')) or not 0<=s.now-plan['updated']<=600:
        return result('Fallback: kein aktueller, vollständiger Tesla-Fahrplan')
    if (not all(valid(v) for v in (device_min_soc,device_max_w,device_step_w,s.house_soc,s.wallbox_w,s.pv_w,s.grid_export_w,s.battery_charge_w))
            or not 0<=device_min_soc<=100 or device_step_w<=0 or device_max_w<0 or not 0<=s.house_soc<=100
            or not 0<=s.house_soc_age<=c.meter_max_age_s or not 0<=s.meter_age<=c.meter_max_age_s
            or s.daylight is None or s.grid_charge_enabled is not False):
        return result('Tesla-Freigabe wartet auf gültige Messwerte und Netzladung aus')
    rows=plan.get('points',[])
    i=next((i for i,p in enumerate(rows) if p['start']<=s.now<p['end']),None)
    if i is None:return result('Fallback: kein Tesla-Zeitfenster für jetzt',replan=True)
    point=rows[i];ev=plan.get('ev',{})
    if not ev.get('active') or s.car_limit!=ev.get('limit_soc') or c.phases!=ev.get('phases'):
        return result('Fallback: Fahrzeuglimit oder Ladeparameter geändert',replan=True)
    fraction=(s.now-point['start'])/(point['end']-point['start'])
    before=plan['initial_soc'] if i==0 else rows[i-1]['soc']
    car_before=ev['initial_soc'] if i==0 else rows[i-1]['ev_soc']
    if abs(s.house_soc-(before+(point['soc']-before)*fraction))>5 or abs(s.car_soc-(car_before+(point['ev_soc']-car_before)*fraction))>3:
        return result('Fallback: Akku-/Tesla-SoC weicht ab · Neuberechnung',replan=True)
    amps=point.get('ev_amps');battery_kw=point.get('battery_kw')
    if type(amps) is not int or amps not in (0,*range(c.min_amps,c.max_amps+1)) or not valid(battery_kw) or battery_kw<0:
        return result('Fallback: ungültiger Tesla-Sollwert',replan=True)
    if s.car_soc>=min(s.car_limit,ev['target_soc']):amps=0
    ceiling=min(c.normal_discharge_w,device_max_w)
    def watts_for(active):
        minimum=max(device_min_soc,c.reserve_soc) if active else device_min_soc
        release=storage_active or s.house_soc>c.storage_release_soc
        if s.house_soc<=minimum or active and not release:return 0
        available=(s.house_soc-minimum)*c.capacity_kwh/100*c.efficiency
        remaining=max(30,point['end']-s.now)/3600
        value=min(ceiling,battery_kw*1000,available/remaining*1000)
        return max(0,math.floor(value/device_step_w+1e-9)*device_step_w)
    active=amps>=c.min_amps or s.wallbox_w>10
    watts=watts_for(active)
    clean=valid(grid_share) and grid_share>=c.planner_ev_grid_share
    if amps and not clean:
        # No extra EV grid import when weather/EE differs from the plan. Remove
        # current battery output first; add only the newly authorised shared ceiling.
        balance=s.wallbox_w+s.grid_export_w+min(s.battery_charge_w,s.battery_charge_w*.95)
        safe=math.floor(max(0,balance+watts-c.margin_w)/(230*c.phases))
        amps=min(amps,safe)
        threshold=c.min_amps if s.wallbox_w>10 else c.start_amps
        if amps<threshold:amps=0
    # Actual EV power still keeps protection active until a stop is confirmed.
    watts=watts_for(amps>=c.min_amps or s.wallbox_w>10)
    reason=('HiGHS · Tesla lädt mit PV / freigegebenem Speicher' if amps and not clean else
            'HiGHS · Tesla-Ladung bei hohem EE-Anteil' if amps else
            'HiGHS · Tesla wartet auf PV / EE-Fenster')
    return result(reason,'highs_ev',watts,amps)

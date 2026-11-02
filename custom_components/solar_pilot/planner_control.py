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

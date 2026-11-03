"""Vehicle eligibility and explicit flexible charging goals; never assume return times."""
from .ev_planner import EVConfig


def vehicle_inputs(controller, now):
    s,c=controller.snapshot,controller.settings
    def unavailable(reason):return None,{'active':False,'reason':reason}
    if not c.planner_ev_enabled:return unavailable('Tesla-Optimierung ausgeschaltet')
    if not s.at_home or not s.cable or not s.wallbox_enabled:
        return unavailable('Tesla nicht am freigegebenen heimischen Ladepunkt · keine Rückkehrzeit angenommen')
    if not 0<=s.location_age+max(0,now-s.now)<=c.car_max_age_s:
        return unavailable('Tesla-Standort veraltet')
    if not 0<=s.car_age+max(0,now-s.now)<=c.car_max_age_s or s.car_soc is None or s.car_limit is None or not 0<=s.car_soc<=100 or not 0<=s.car_limit<=100:
        return unavailable('Tesla-SoC oder Fahrzeuglimit fehlt oder ist veraltet')
    actuator=controller.state('car_current')
    if not actuator or actuator.attributes.get('restored') or actuator.attributes.get('unit_of_measurement')!='A':
        return unavailable('Tesla-Ladestromsteller fehlt')
    try:
        maximum=min(c.max_amps,int(actuator.attributes['max']))
        if float(actuator.attributes['step'])!=1 or maximum<c.start_amps:raise ValueError()
    except (KeyError,TypeError,ValueError):return unavailable('Tesla-Ladestromgrenzen ungültig')
    target=min(s.car_limit,c.car_min_soc) if controller.mode=='charge_minimum' else s.car_limit
    state=controller.charging_state
    urgent=s.car_soc<c.car_low_soc or state.minimum_active
    sunset=now+s.hours_left*3600 if s.daylight and s.hours_left is not None else now
    ev=EVConfig(capacity=c.planner_ev_capacity_kwh,initial_soc=s.car_soc,target_soc=target,limit_soc=s.car_limit,
        efficiency=c.planner_ev_efficiency,min_amps=c.min_amps,start_amps=c.start_amps,max_amps=maximum,phases=c.phases,
        grid_share=c.planner_ev_grid_share,reserve_soc=c.reserve_soc,release_soc=c.storage_release_soc,
        released=state.storage_active,charging=s.charging is True,urgent=urgent,minimum_soc=c.car_min_soc,
        reserve_stamp=sunset,storage_first=controller.mode=='storage_first')
    return ev,{'active':True,'reason':'Flexibles Laden ohne feste Abfahrtszeit'}

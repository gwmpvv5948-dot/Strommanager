"""Vehicle eligibility and explicit flexible charging goals; never assume return times."""
from .ev_planner import EVConfig
import math


def planning_vehicle(controller, now):
    """Wallbox is planning readiness only, never proof of a safe charging start."""
    s = controller.snapshot
    if not s.wallbox_enabled:
        return None, None, {"active": False, "reason": "Wallbox aus oder unbekannt · keine Tesla-Planung"}
    soc, limit = controller.last_car_soc, controller.last_car_limit
    seen = controller.last_car_seen
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (soc, limit, seen)) or not 0 <= soc <= 100 or not 0 <= limit <= 100 or now-seen < 0:
        return None, None, {"active": False, "reason": "Kein verlässlicher Tesla-SoC innerhalb der letzten 24 Stunden"}
    urgent = soc < controller.settings.car_low_soc or controller.charging_state.minimum_active
    if now-seen > 86400 and not urgent:
        return None, None, {"active": False, "reason": "Kein verlässlicher Tesla-SoC innerhalb der letzten 24 Stunden"}
    estimated = (now-seen > controller.settings.car_max_age_s or not s.online or not s.at_home or not s.cable
        or not 0 <= s.car_age <= controller.settings.car_max_age_s
        or not 0 <= s.location_age <= controller.settings.car_max_age_s)
    return soc, limit, {"active": True, "estimated": estimated, "soc_updated": seen,
        "reason": "Wallbox an · Planung mit letztem bekannten Tesla-SoC; Anschluss, Standort und aktuelle Daten vor Ladestart prüfen" if estimated else "Wallbox an · flexibles Laden ohne feste Abfahrtszeit"}



def vehicle_inputs(controller, now):
    s,c=controller.snapshot,controller.settings
    def unavailable(reason):return None,{'active':False,'reason':reason}
    if not c.planner_ev_enabled:return unavailable('Tesla-Optimierung ausgeschaltet')
    soc,limit,meta = planning_vehicle(controller,now)
    if soc is None:return None,meta
    actuator=controller.hass.states.get(controller.entities['car_current'])
    if not actuator or actuator.attributes.get('restored') or actuator.attributes.get('unit_of_measurement')!='A':
        return unavailable('Tesla-Ladestromsteller fehlt')
    try:
        maximum=min(16,c.max_amps,int(actuator.attributes['max']))
        if float(actuator.attributes['step'])!=1 or maximum<max(10,c.start_amps,c.min_amps):raise ValueError()
    except (KeyError,TypeError,ValueError):return unavailable('Tesla-Ladestromgrenzen ungültig')
    target=min(limit,c.car_min_soc) if controller.mode=='charge_minimum' else limit
    state=controller.charging_state
    urgent=soc<c.car_low_soc or state.minimum_active
    sunset=now+s.hours_left*3600 if s.daylight and s.hours_left is not None else now
    ev=EVConfig(capacity=c.planner_ev_capacity_kwh,initial_soc=soc,target_soc=target,limit_soc=limit,
        efficiency=c.planner_ev_efficiency,min_amps=max(10,c.min_amps),start_amps=max(10,c.start_amps),max_amps=maximum,phases=c.phases,
        grid_share=c.planner_ev_grid_share,reserve_soc=c.reserve_soc,release_soc=c.storage_release_soc,
        released=state.storage_active,charging=s.charging is True,urgent=urgent,minimum_soc=c.car_min_soc,
        reserve_stamp=sunset,storage_first=controller.mode=='storage_first')
    return ev,meta

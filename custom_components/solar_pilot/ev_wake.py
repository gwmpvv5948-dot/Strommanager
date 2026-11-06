"""Pure scheduled wake policy; wake permission is never charging permission."""
import math


def wake_due(s, c, mode, plan):
    if mode in ('observe', 'paused', 'charge_now') or not c.planner_control_enabled or not c.planner_ev_enabled:
        return False
    if not s.wallbox_enabled or s.charging is True or not plan.get('available') or not plan.get('joint'):
        return False
    stamp = plan.get('updated')
    if type(stamp) not in (int, float) or not math.isfinite(stamp) or not 0 <= s.now-stamp <= 600:
        return False
    return any(p['start'] <= s.now < p['end'] and p.get('ev_amps', 0) > 0 for p in plan.get('points', []))


def vehicle_confirmed(controller, after=None):
    s,c = controller.snapshot,controller.settings
    if not (s.online and s.at_home and s.cable and s.wallbox_enabled and 0 <= s.car_age <= c.car_max_age_s and 0 <= s.location_age <= c.car_max_age_s):
        return False
    if after is None:
        return True
    # A cached retained value after waking is not a fresh vehicle confirmation.
    return all(0 <= controller.age(k,s.now) <= s.now-after for k in ('car_soc','car_limit','car_cable','car_home','car_online'))

"""Collect existing HA forecasts; solve the observer plan off the event loop."""
from datetime import datetime
import math
from zoneinfo import ZoneInfo

from .energy_planner import PlannerConfig, optimize
from .ev_planner import optimize_ev
from .ev_inputs import vehicle_inputs
from .source_config import display_sources


def finite(value):
    if value is None or isinstance(value,bool):
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError,ValueError,OverflowError):
        return False


def collect(controller, now):
    s,c = controller.snapshot,controller.settings
    if not s or s.house_soc is None or s.house_soc_age+max(0,now-s.now)>c.meter_max_age_s:
        raise ValueError('Aktueller Hausspeicher-Ladestand fehlt oder ist veraltet')
    house = controller.consumption.result
    if not finite(house.get('updated')) or not 0 <= now-house['updated'] <= 900:
        raise ValueError('Hausverbrauchsprognose fehlt oder ist veraltet')
    grid = controller.grid_forecast.status(now,c)
    if not 0 <= s.forecast_age+max(0,now-s.now) <= c.forecast_max_age_s:
        raise ValueError('Solcast-Prognose ist veraltet')
    sources = display_sources(controller.entities,controller.entry.options.get('display_sources'))
    minimum = controller.hass.states.get(sources['battery_min_soc'])
    if not minimum or minimum.state in ('unknown','unavailable') or minimum.attributes.get('restored') or minimum.attributes.get('unit_of_measurement') != '%':
        raise ValueError('Geräte-Mindeststand des Hausspeichers fehlt')
    floor = float(minimum.state)
    if not math.isfinite(floor) or not 0 <= floor <= 100:
        raise ValueError('Geräte-Mindeststand ungültig')
    prices = controller.price_forecast.status(now,c) if hasattr(controller,'price_forecast') else {'points':[], 'fetched':None}
    pv = {}
    for i in range(1,8):
        state = controller.hass.states.get(sources[f'forecast_day_{i}'])
        if not state or state.state in ('unknown','unavailable') or state.attributes.get('restored') or state.attributes.get('dataCorrect') is False:
            continue
        for row in state.attributes.get('detailedForecast',[]):
            try:
                raw = row['period_start']
                stamp = raw if isinstance(raw,datetime) else datetime.fromisoformat(raw.replace('Z','+00:00'))
                power = row['pv_estimate']
                if stamp.tzinfo and finite(power) and float(power) >= 0:
                    pv[stamp.timestamp()] = float(power)
            except (ValueError,TypeError,KeyError):
                continue
    pv = sorted(pv.items())
    hours = {p['stamp']:p['kwh'] for p in house.get('window_hours',[])}
    slots,t,end = [],now,now+24*3600
    while t < end:
        stop = min(end,(int(t)//900+1)*900)
        power = next((p for stamp,p in pv if stamp<=t<stamp+1800),None)
        load = hours.get(int(t)//3600*3600)
        share = next((p['share'] for p in grid.get('points',[]) if p['available'] and p['start']<=t<p['end']),None)
        if not all(finite(v) for v in (power,load)):
            missing = ', '.join(name for name,value in [('PV',power),('Haus',load)] if not finite(value))
            zone = ZoneInfo(controller.hass.config.time_zone)
            when = datetime.fromtimestamp(t,zone).strftime('%d.%m. %H:%M')
            raise ValueError(f'Prognoselücke ab {when}: {missing}. 24 Stunden nicht vollständig verfügbar.')
        price = next((p for p in prices['points'] if p['start']<=t and p['end']>=stop),None)
        slots.append({'spot_ct':price['spot_ct'] if price else None,'price_forecast':bool(price and price['forecast']),'start':t,'end':stop,'pv_kw':power*c.forecast_factor*.95,'load_kw':float(load),'ee':float(share) if finite(share) else None})
        t = stop
    config = PlannerConfig(capacity=c.capacity_kwh,initial_soc=s.house_soc,minimum_soc=floor,
        terminal_soc=c.planner_terminal_soc,charge_kw=c.max_charge_w/1000,discharge_kw=c.normal_discharge_w/1000,
        efficiency=c.efficiency,purchase=c.purchase_eur_kwh,feed_in=c.feed_in_eur_kwh,
        ee_weight=c.planner_ee_weight_eur_kwh,cycle_cost=c.planner_cycle_eur_kwh,
        hold_share=c.grid_hold_share,release_share=c.grid_release_share,grid_enabled=c.grid_renewable_enabled,initial_hold=grid['hold'],price_weight=c.planner_price_weight,ev_price_ct=c.planner_ev_price_ct)
    return slots,config,{'price_fetched':prices['fetched'],'house_updated':house['updated'],'ee_fetched':grid['fetched'],'pv_age_s':s.forecast_age,
        'pv_factor':c.forecast_factor,'pv_source':'Solcast Hauptanlage · ohne Garage/Schuppen-Prognose'}


class PlannerTracker:
    def __init__(self):
        self.result = {'available':False,'reason':'Fahrplan wird vorbereitet','mode':'observe'}
        self.busy = False
        self.attempted = None
        self.stopped = False

    async def refresh(self, controller):
        now = controller.snapshot.now
        delay = 300 if self.result.get('available') else 60
        if self.stopped or self.busy or self.attempted is not None and now-self.attempted<delay:
            return
        self.busy,self.attempted = True,now
        try:
            slots,config,sources = collect(controller,now)
            ev,ev_status = vehicle_inputs(controller,now)
            if ev:
                result = await controller.hass.async_add_executor_job(optimize_ev,slots,config,ev)
            else:
                result = await controller.hass.async_add_executor_job(optimize,slots,config)
                result['ev'] = ev_status
            if not self.stopped:
                self.result = {**result,'updated':now,'sources':sources}
        except Exception as exc:
            self.result = {'available':False,'mode':'observe','reason':str(exc)[:250],'updated':now}
        finally:
            self.busy = False
            if not self.stopped:
                controller.publish()

    def status(self, now):
        if self.result.get('available') and now-self.result['updated']>600:
            return {'available':False,'mode':'observe','reason':'Fahrplan veraltet · Neuberechnung ausstehend','calculating':self.busy}
        return {**self.result,'calculating':self.busy}

"""Read-only LP house/battery plan. No HA imports, IO or device commands."""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class PlannerConfig:
    capacity: float
    initial_soc: float
    minimum_soc: float
    terminal_soc: float
    charge_kw: float
    discharge_kw: float
    efficiency: float
    purchase: float
    feed_in: float
    ee_weight: float
    cycle_cost: float
    hold_share: float
    release_share: float
    grid_enabled: bool
    initial_hold: bool = False
    price_weight: float = 0
    ev_price_ct: float = 10


def validate(slots, c):
    values = list(vars(c).values())
    if any(type(v) not in (int, float, bool) or not math.isfinite(v) for v in values):
        raise ValueError('Ungültige Planungsparameter')
    if not (c.capacity > 0 and 0 <= c.minimum_soc <= 100 and 0 <= c.initial_soc <= 100 and 0 <= c.terminal_soc <= 100
            and .5 <= c.efficiency <= 1 and c.charge_kw >= 0 and c.discharge_kw >= 0
            and min(c.purchase, c.feed_in, c.ee_weight, c.cycle_cost) >= 0):
        raise ValueError('Ungültige Akku- oder Preisgrenzen')
    if not slots:
        raise ValueError('Prognosedaten fehlen')
    end = slots[0]['start']
    for s in slots:
        if any(type(s.get(k)) not in (int, float) or not math.isfinite(s[k]) for k in ('start','end','load_kw','pv_kw')):
            raise ValueError('Prognoselücke')
        if abs(s['start']-end) > .01 or not 0 < s['end']-s['start'] <= 900.01 or min(s['load_kw'],s['pv_kw']) < 0 or (s.get('ee') is not None and (type(s['ee']) not in (int,float) or not math.isfinite(s['ee']) or not 0 <= s['ee'] <= 150)):
            raise ValueError('Ungültiges Prognoseraster')
        if s.get('spot_ct') is not None and (type(s['spot_ct']) not in (int,float) or not math.isfinite(s['spot_ct']) or not -100<=s['spot_ct']<=500):
            raise ValueError('Ungültiger Spotpreis')
        end = s['end']


def signal_cost(s, c):
    """Planning preference only. Never change the actual tariff in cost totals."""
    if s.get("spot_ct") is not None:
        return c.price_weight*s["spot_ct"]/100
    return c.ee_weight*(1-min(100,s["ee"])/100) if s.get("ee") is not None else 0


def ev_grid_allowed(s, c, share):
    if s.get("spot_ct") is not None:
        return s["spot_ct"] <= c.ev_price_ct
    return s.get("ee") is not None and s["ee"] >= share


def components(s):
    direct = min(s['pv_kw'], s['load_kw'])
    return direct, max(0, s['pv_kw']-direct), max(0, s['load_kw']-direct), (s['end']-s['start'])/3600


def recovery_bounds(slots, c):
    """Restore a pre-existing low SoC only from available PV, never invent energy."""
    minimum = c.capacity*c.minimum_soc/100
    initial = c.capacity*c.initial_soc/100
    guaranteed = min(initial,minimum)
    floors,forced = [],[]
    for s in slots:
        _,surplus,_,hours = components(s)
        charge = min(surplus,c.charge_kw,max(0,minimum-guaranteed)/c.efficiency/hours)
        guaranteed = min(minimum,guaranteed+charge*hours*c.efficiency)
        floors.append(guaranteed)
        forced.append(charge)
    target = max(floors[-1],min(initial,c.capacity*c.terminal_soc/100))
    return floors,forced,target


def reference_plan(slots, c):
    """Existing EE-threshold policy, with an explicit end reserve for comparison."""
    floors,_,target = recovery_bounds(slots,c)
    floor = c.capacity*c.minimum_soc/100
    required = [0.]*(len(slots)+1)
    required[-1] = target
    for i in range(len(slots)-1, -1, -1):
        _, surplus, _, h = components(slots[i])
        required[i] = max(min(c.capacity*c.initial_soc/100,floor) if i==0 else floors[i-1], required[i+1]-min(surplus,c.charge_kw)*h*c.efficiency)
    energy = c.capacity*c.initial_soc/100
    hold = c.initial_hold
    result = []
    for i,s in enumerate(slots):
        _, surplus, need, h = components(s)
        hold = c.grid_enabled and s.get('ee') is not None and s['ee'] >= (c.release_share if hold else c.hold_share)
        charge = min(surplus,c.charge_kw,max(0,c.capacity-energy)/h/c.efficiency)
        discharge = 0 if hold else min(need,c.discharge_kw,max(0,energy-required[i+1])*c.efficiency/h)
        energy += charge*h*c.efficiency-discharge*h/c.efficiency
        result.append(flow(s,charge,discharge,energy,c))
    return result


def flow(s, charge, discharge, energy, c):
    direct, surplus, need, h = components(s)
    grid = max(0, need-discharge)
    export = max(0, surplus-charge)
    cost = (grid*c.purchase-export*c.feed_in)*h
    nonrenewable = grid*(1-min(100,s['ee'])/100)*h if s.get('ee') is not None else None
    throughput = (charge+discharge)*h
    return {**s, 'pv_direct_kw':direct, 'charge_kw':max(0,charge), 'battery_kw':max(0,discharge),
            'grid_kw':grid, 'export_kw':export, 'soc':energy/c.capacity*100,
            'cost':cost, 'nonrenewable_kwh':nonrenewable, 'throughput_kwh':throughput,
            'objective':cost+grid*signal_cost(s,c)*h+c.cycle_cost*throughput}


def totals(points):
    return {k:(None if any(p[k] is None for p in points) else sum(p[k] for p in points)) for k in ('cost','nonrenewable_kwh','throughput_kwh','objective')} | {
        'grid_kwh':sum(p['grid_kw']*(p['end']-p['start'])/3600 for p in points),
        'end_soc':points[-1]['soc']}


def explain(point, c):
    if point['charge_kw'] > .02:
        return 'PV lädt den Akku', 'PV deckt das Haus; der Überschuss wird gespeichert.'
    if point['battery_kw'] > .02 and point['grid_kw'] <= .02:
        return 'Akku versorgt das Haus', 'Akkuenergie wird in diesem Zeitfenster eingesetzt; Endreserve und spätere Netzfenster sind berücksichtigt.'
    if point['battery_kw'] > .02:
        return 'Akku und Netz versorgen das Haus', 'Der Akku deckt einen Teil des Bedarfs; das Netz ergänzt die Leistung.'
    if point['grid_kw'] > .02:
        if point['soc'] <= c.minimum_soc+.1:
            return 'Netz versorgt das Haus', 'Der Akku liegt am oder unter dem Wechselrichter-Mindeststand. Entladung bleibt gesperrt, bis PV-Überschuss ihn wieder aufgefüllt hat.'
        return 'Netz bevorzugt · Akku bewahren', 'Die Gesamtplanung bewahrt Akkuenergie für andere Zeitfenster oder die Endreserve.'
    return 'PV versorgt das Haus', 'Die prognostizierte PV-Leistung deckt den Hausbedarf.'


def optimize(slots, c):
    """PV-first/no-grid-charge structure prevents simultaneous charge/discharge.

    Independent optimality applies only to the selected 24-hour house model.
    Equal final energy makes comparison to the threshold reference meaningful.
    """
    validate(slots,c)
    import highspy
    reference = reference_plan(slots,c)
    h = highspy.Highs()
    for name,value in [('output_flag',False),('time_limit',5.),('threads',1)]:
        h.setOptionValue(name,value)
    initial = c.capacity*c.initial_soc/100
    floor = c.capacity*c.minimum_soc/100
    previous = initial
    floors,forced,_ = recovery_bounds(slots,c)
    variables = []
    for i,s in enumerate(slots):
        _, surplus, need, hours = components(s)
        import_price = c.purchase+signal_cost(s,c)
        charge = h.addVariable(lb=forced[i],ub=min(surplus,c.charge_kw),obj=(c.feed_in+c.cycle_cost)*hours)
        discharge = h.addVariable(lb=0,ub=min(need,c.discharge_kw),obj=(-import_price+c.cycle_cost)*hours)
        energy = h.addVariable(lb=floors[i],ub=c.capacity)
        h.addConstr(energy == previous+charge*hours*c.efficiency-discharge*hours/c.efficiency)
        previous = energy
        variables.append((charge,discharge,energy))
    h.addConstr(previous == reference[-1]['soc']/100*c.capacity)
    h.run()
    if h.getModelStatus() != highspy.HighsModelStatus.kOptimal:
        raise ValueError('Kein optimaler Fahrplan innerhalb des Zeitlimits')
    points = [flow(s,h.val(ch),h.val(dis),h.val(energy),c) for s,(ch,dis,energy) in zip(slots,variables)]
    # Independently verify physical feasibility; never expose solver noise as power.
    previous = initial
    for i,p in enumerate(points):
        _,surplus,need,hours = components(p)
        energy = p['soc']/100*c.capacity
        if (not all((v is None and key in ('ee','nonrenewable_kwh','spot_ct')) or (isinstance(v,(int,float)) and math.isfinite(v)) for key,v in p.items()) or p['charge_kw'] > min(surplus,c.charge_kw)+1e-5
                or p['battery_kw'] > min(need,c.discharge_kw)+1e-5
                or not floors[i]-1e-5 <= energy <= c.capacity+1e-5
                or abs(energy-previous-p['charge_kw']*hours*c.efficiency+p['battery_kw']*hours/c.efficiency)>1e-5):
            raise ValueError('Fahrplan verletzt die Energiebilanz')
        previous = energy
        p['reason'],p['explanation'] = explain(p,c)
        if p.get('spot_ct') is not None:
            p['explanation'] += f' Spotpreis {p["spot_ct"]:.2f} ct/kWh als Planungssignal; Kosten weiterhin zum eingestellten Tarif.'
        elif p.get('ee') is None:
            p['explanation'] += ' EE-Prognose fehlt in diesem Zeitfenster; Planung nur nach Stromkosten, PV und Akku-Grenzen, ohne EE-Gewichtung.'
    plan_totals,base_totals = totals(points),totals(reference)
    if abs(plan_totals['end_soc']-base_totals['end_soc'])>1e-4:
        raise ValueError('Endreserve nicht vergleichbar')
    return {'available':True,'ee_incomplete':any(p.get('ee') is None for p in points),'solver':'HiGHS · LP','mode':'observe','points':points,'reference':base_totals,
            'totals':plan_totals,'initial_soc':c.initial_soc,'minimum_soc':c.minimum_soc,
            'terminal_soc':points[-1]['soc'], 'config':vars(c),
            'delta':{k:(None if plan_totals[k] is None or base_totals[k] is None else plan_totals[k]-base_totals[k]) for k in ('cost','grid_kwh','throughput_kwh','nonrenewable_kwh')},
            'start':slots[0]['start'],'end':slots[-1]['end']}

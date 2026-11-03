"""Joint house/storage/Tesla MILP. No device access; all flows independently checked."""
from dataclasses import dataclass, asdict
import math
from .energy_planner import validate, components, recovery_bounds, totals, signal_cost, ev_grid_allowed


@dataclass(frozen=True)
class EVConfig:
    capacity: float
    initial_soc: float
    target_soc: float
    limit_soc: float
    efficiency: float
    min_amps: int
    start_amps: int
    max_amps: int
    phases: int
    grid_share: float
    reserve_soc: float
    release_soc: float
    released: bool = False
    charging: bool = False
    urgent: bool = False
    minimum_soc: float = 50
    reserve_stamp: float = 0
    storage_first: bool = False


def optimize_ev(slots, c, ev):
    validate(slots,c)
    if (not all(type(v) in (int,float,bool) and math.isfinite(v) for v in asdict(ev).values())
            or not 1<=ev.capacity<=200 or not 0<=ev.initial_soc<=100
            or not 0<=ev.target_soc<=ev.limit_soc<=100 or not .5<=ev.efficiency<=1
            or ev.phases not in (1,3) or not 6<=ev.min_amps<=ev.start_amps<=ev.max_amps<=48
            or not 0<=ev.grid_share<=100 or not 0<=ev.reserve_soc<=ev.release_soc<=100):
        raise ValueError('Ungültige Tesla-Planungsparameter')
    import highspy
    h=highspy.Highs()
    for name,value in [('output_flag',False),('time_limit',5.),('threads',1),('mip_rel_gap',0.)]:h.setOptionValue(name,value)
    integer=highspy.HighsVarType.kInteger
    binary=lambda:h.addVariable(lb=0,ub=1,type=integer)
    initial=c.capacity*c.initial_soc/100
    initial_ev=ev.capacity*ev.initial_soc/100
    target_ev=max(initial_ev,ev.capacity*ev.target_soc/100)
    urgent_goal=max(initial_ev,min(target_ev,ev.capacity*ev.minimum_soc/100))
    floor=c.capacity*c.minimum_soc/100
    reserve=c.capacity*max(ev.reserve_soc,c.minimum_soc)/100
    release=c.capacity*max(ev.release_soc,c.minimum_soc)/100
    floors,forced,_=recovery_bounds(slots,c)
    kw_per_amp=230*ev.phases/1000
    max_ev=kw_per_amp*ev.max_amps
    previous,previous_ev,previous_on,previous_release=initial,initial_ev,int(ev.charging),int(ev.released)
    rows=[];cost=0
    reserve_index=next((i for i,s in enumerate(slots) if s['end']>=ev.reserve_stamp),len(slots)-1)
    for i,s in enumerate(slots):
        direct,surplus,need,hours=components(s)
        amps=h.addVariable(lb=0,ub=ev.max_amps,type=integer)
        on,started,discharging,released,at_release,at_reserve=binary(),binary(),binary(),binary(),binary(),binary()
        h.addConstr(amps>=ev.min_amps*on)
        h.addConstr(amps<=ev.max_amps*on)
        h.addConstr(started>=on-previous_on)
        h.addConstr(amps>=ev.min_amps*on+(ev.start_amps-ev.min_amps)*started)
        ev_kw=kw_per_amp*amps
        pv_ev=h.addVariable(lb=0,ub=min(surplus,max_ev))
        charge=h.addVariable(lb=forced[i],ub=min(surplus,c.charge_kw))
        export=h.addVariable(lb=0,ub=surplus)
        b_house=h.addVariable(lb=0,ub=min(need,c.discharge_kw))
        b_ev=h.addVariable(lb=0,ub=min(max_ev,c.discharge_kw))
        g_ev=h.addVariable(lb=0,ub=max_ev)
        dis=b_house+b_ev
        h.addConstr(pv_ev+charge+export==surplus)
        h.addConstr(pv_ev+b_ev+g_ev==ev_kw)
        h.addConstr(dis<=c.discharge_kw*discharging)
        h.addConstr(charge<=c.charge_kw*(1-discharging))
        h.addConstr(export<=surplus*(1-discharging))
        energy=h.addVariable(lb=floors[i],ub=c.capacity)
        energy_ev=h.addVariable(lb=initial_ev,ub=target_ev)
        h.addConstr(energy==previous+charge*hours*c.efficiency-dis*hours/c.efficiency)
        h.addConstr(energy_ev==previous_ev+ev_kw*hours*ev.efficiency)
        # Shared inverter: during EV charging all battery output requires Tesla
        # release, and must stop at the higher Tesla reserve (also for house load).
        h.addConstr(previous>=reserve-c.capacity*(2-on-discharging))
        h.addConstr(energy>=reserve-c.capacity*(2-on-discharging))
        h.addConstr(released>=on+discharging-1)
        h.addConstr(previous>=release-c.capacity*(1-at_release))
        h.addConstr(released<=previous_release+at_release)
        h.addConstr(released>=at_release)
        h.addConstr(previous<=release+c.capacity*at_release)
        h.addConstr(previous<=reserve+c.capacity*(1-at_reserve))
        h.addConstr(released>=previous_release-at_reserve)
        h.addConstr(previous>=reserve-c.capacity*(1-released))
        clean=ev_grid_allowed(s,c,ev.grid_share)
        if not clean:
            if ev.urgent:
                below_min=binary()
                h.addConstr(previous_ev<=urgent_goal+ev.capacity*(1-below_min))
                h.addConstr(g_ev<=max_ev*below_min)
            else:h.addConstr(g_ev==0)
        if ev.urgent:
            elapsed=(s['end']-slots[0]['start'])/3600
            h.addConstr(energy_ev>=max(initial_ev,min(urgent_goal-ev.start_amps*kw_per_amp*.25*ev.efficiency-1e-6,initial_ev+max_ev*elapsed*ev.efficiency)))
            # Mandatory minimum charging cannot borrow from the house battery.
            before_min=binary()
            h.addConstr(previous_ev>=urgent_goal-ev.capacity*(1-before_min))
            h.addConstr(dis<=c.discharge_kw*(1-on+before_min))
        price=c.purchase+signal_cost(s,c)
        grid=need-b_house+g_ev
        cost+=grid*price*hours-export*c.feed_in*hours+c.cycle_cost*(charge+dis)*hours+.002*started
        rows.append(dict(amps=amps,on=on,started=started,energy=energy,energy_ev=energy_ev,pv_ev=pv_ev,
            charge=charge,export=export,b_house=b_house,b_ev=b_ev,g_ev=g_ev,released=released))
        previous,previous_ev,previous_on,previous_release=energy,energy_ev,on,released
    # EV battery energy can only come from the initial energy above its reserve,
    # plus later PV charging. This valid global bound also removes a weak MILP
    # relaxation in nights with little releasable energy.
    h.addConstr(sum(row['b_ev']*(s['end']-s['start'])/3600 for s,row in zip(slots,rows))
        <=max(0,initial-reserve)*c.efficiency
        +sum(row['charge']*(s['end']-s['start'])/3600 for s,row in zip(slots,rows))*c.efficiency*c.efficiency)
    # An aggregate integer charge count strengthens the goal bound for an aligned
    # quarter-hour horizon, avoiding a long proof over interchangeable schedules.
    if all(abs(s['end']-s['start']-900)<1e-6 for s in slots):
        step=kw_per_amp*.25*ev.efficiency
        units=h.addVariable(lb=0,ub=math.floor((target_ev-initial_ev)/step+1e-7),type=integer)
        h.addConstr(previous_ev==initial_ev+units*step)
    terminal=min(initial,c.capacity*c.terminal_soc/100)
    h.addConstr(previous>=max(terminal,floors[-1]))
    reserve_missing=h.addVariable(lb=0,ub=reserve)
    h.addConstr(rows[reserve_index]['energy']+reserve_missing>=reserve)
    # Seed just the integer EV currents with a feasible PV/clean-grid schedule.
    # HiGHS completes and verifies the remaining flows; this is not a second
    # controller or a replacement for the MILP solution.
    seed_indices=[];seed_values=[];seed_ev=initial_ev;seed_house=initial;was_on=ev.charging
    for i,(s,row) in enumerate(zip(slots,rows)):
        _,surplus,need,hours=components(s)
        recovery=forced[i]
        reserve_charge=min(surplus,c.charge_kw,max(0,reserve-seed_house)/hours/c.efficiency) if ev.storage_first and i<=reserve_index else recovery
        clean=ev_grid_allowed(s,c,ev.grid_share)
        mandatory=ev.urgent and seed_ev<urgent_goal-1e-5
        available=max(0,surplus-max(recovery,reserve_charge))
        amps=ev.max_amps if clean or mandatory else min(ev.max_amps,math.floor(available/kw_per_amp+1e-8))
        amps=min(amps,math.floor(max(0,target_ev-seed_ev)/hours/ev.efficiency/kw_per_amp+1e-8))
        if amps<(ev.min_amps if was_on else ev.start_amps):amps=0
        seed_indices.append(row['amps'].index);seed_values.append(amps)
        seed_ev+=amps*kw_per_amp*hours*ev.efficiency
        pv_ev=min(surplus,amps*kw_per_amp)
        charge=min(c.charge_kw,max(0,surplus-pv_ev),max(0,c.capacity-seed_house)/hours/c.efficiency)
        seed_house+=charge*hours*c.efficiency
        was_on=amps>0
    h.setSolution(len(seed_indices),seed_indices,seed_values)
    def solve(expression, gap=.001):
        h.setOptionValue("mip_abs_gap",gap)
        h.minimize(expression)
        if h.getModelStatus()!=highspy.HighsModelStatus.kOptimal:
            raise ValueError('Tesla-Fahrplan nicht gelöst: '+h.modelStatusToString(h.getModelStatus()))
    # Lexicographic objectives avoid a fictitious euro value for mobility/reserve.
    objectives=['reserve','ev'] if ev.storage_first else ['ev','reserve']
    for objective in objectives:
        if objective=='reserve':
            solve(reserve_missing);value=max(0,h.val(reserve_missing));h.addConstr(reserve_missing<=value+1e-6)
        else:
            solve(-previous_ev,ev.start_amps*kw_per_amp*.25*ev.efficiency);value=h.val(previous_ev);h.addConstr(previous_ev>=value-1e-6)
    solve(cost)
    points=[];previous,previous_ev=initial,initial_ev;permission=ev.released
    for i,(s,row) in enumerate(zip(slots,rows)):
        values={key:h.val(value) for key,value in row.items()}
        if not all(math.isfinite(v) for v in values.values()):raise ValueError('Tesla-Fahrplan enthält ungültige Werte')
        amps=int(round(values['amps']));ev_kw=amps*kw_per_amp
        direct,surplus,need,hours=components(s)
        charge=max(0,values['charge']);dis=max(0,values['b_house']+values['b_ev']);grid=max(0,need-values['b_house']+values['g_ev'])
        energy,energy_ev=values['energy'],values['energy_ev']
        tolerance=1e-5
        permission=(previous>=release-tolerance) or (permission and previous>=reserve-tolerance)
        if (any(values[key]<-tolerance for key in ('charge','export','b_house','b_ev','g_ev','pv_ev'))
                or charge>c.charge_kw+tolerance or dis>c.discharge_kw+tolerance
                or abs(values['pv_ev']+charge+values['export']-surplus)>tolerance
                or abs(values['pv_ev']+values['b_ev']+values['g_ev']-ev_kw)>tolerance
                or values['b_house']>need+tolerance
                or amps>0 and dis>tolerance and not permission
                or abs(values['amps']-amps)>tolerance or amps not in (0,*range(ev.min_amps,ev.max_amps+1))
                or abs(s['pv_kw']+dis+grid-s['load_kw']-ev_kw-charge-values['export'])>tolerance
                or abs(energy-previous-charge*hours*c.efficiency+dis*hours/c.efficiency)>tolerance
                or abs(energy_ev-previous_ev-ev_kw*hours*ev.efficiency)>tolerance
                or not floors[i]-tolerance<=energy<=c.capacity+tolerance
                or not initial_ev-tolerance<=energy_ev<=target_ev+tolerance
                or charge>tolerance and dis>tolerance
                or values['export']>tolerance and dis>tolerance
                or amps>0 and dis>tolerance and min(previous,energy)<reserve-tolerance):
            raise ValueError('Tesla-Fahrplan verletzt Energie- oder Schutzgrenzen')
        clean=ev_grid_allowed(s,c,ev.grid_share)
        if values['g_ev']>tolerance and not clean and (not ev.urgent or previous_ev>urgent_goal+tolerance):
            raise ValueError('Tesla-Netzladung ohne EE- oder Mindestfreigabe')
        nonrenewable=grid*(1-min(100,s['ee'])/100)*hours if s.get('ee') is not None else None
        reason=('Tesla lädt · Mindestladung' if amps and ev.urgent and previous_ev<urgent_goal-1e-5 else
                'Tesla lädt · PV / Speicher' if amps and values['g_ev']<.02 else
                ('Tesla lädt · günstiger Spotpreis' if s.get('spot_ct') is not None else 'Tesla lädt · hoher EE-Anteil') if amps else
                'PV lädt den Akku' if charge>.02 else 'Akku versorgt das Haus' if dis>.02 else
                'PV versorgt das Haus' if grid<.02 else 'Netz versorgt das Haus')
        explanation=(f'Tesla: {amps} A, {ev_kw:.2f} kW; Ziel ist das Fahrzeug-Ladelimit ohne feste Abfahrtszeit. '
            +'Netzladung nur im freigegebenen Preisfenster, bei fehlendem Preis über den EE-Fallback oder für die ausgelöste Mindestladung. '
            +'Haus- und Tesla-Reservegrenzen bleiben verbindlich.')
        if s.get('ee') is None and s.get('spot_ct') is None:explanation+=' EE-Prognose fehlt: keine zusätzliche flexible Tesla-Netzladung in diesem Zeitfenster.'
        points.append({**s,'pv_direct_kw':direct,'charge_kw':charge,'battery_kw':dis,'grid_kw':grid,
            'house_grid_kw':max(0,need-values['b_house']),'house_battery_kw':max(0,values['b_house']),
            'ev_pv_kw':max(0,values['pv_ev']),'ev_battery_kw':max(0,values['b_ev']),'ev_grid_kw':max(0,values['g_ev']),
            'ev_kw':ev_kw,'ev_amps':amps,'ev_soc':energy_ev/ev.capacity*100,
            'export_kw':max(0,values['export']),'soc':energy/c.capacity*100,
            'cost':(grid*c.purchase-values['export']*c.feed_in)*hours,'nonrenewable_kwh':nonrenewable,
            'throughput_kwh':(charge+dis)*hours,'objective':grid*c.purchase*hours-values['export']*c.feed_in*hours+grid*signal_cost(s,c)*hours+c.cycle_cost*(charge+dis)*hours+.002*values['started'],
            'reason':reason,'explanation':explanation})
        previous,previous_ev=energy,energy_ev
    if abs(sum(p['objective'] for p in points)-h.getObjectiveValue())>1e-4:raise ValueError('Tesla-Fahrplan verletzt die Zielbilanz')
    if previous<max(terminal,floors[-1])-1e-5:raise ValueError('Hausspeicher-Endreserve verletzt')
    return {'available':True,'solver':'HiGHS · MILP','mode':'observe','joint':True,'points':points,
        'ee_incomplete':any(p['ee'] is None for p in points),'reference':None,'delta':None,'totals':totals(points),
        'initial_soc':c.initial_soc,'minimum_soc':c.minimum_soc,'terminal_soc':points[-1]['soc'],
        'config':asdict(c),'mip_tolerances':{'ev_goal_kwh':ev.start_amps*kw_per_amp*.25*ev.efficiency,'reserve_kwh':.001,'objective_eur':.001},'start':slots[0]['start'],'end':slots[-1]['end'],
        'ev':{**asdict(ev),'active':True,'planned_soc':points[-1]['ev_soc'],
            'charged_kwh':sum(p['ev_kw']*(p['end']-p['start'])/3600 for p in points),
            'reserve_planned_soc':points[reserve_index]['soc'],
            'reserve_shortfall_kwh':max(0,reserve-points[reserve_index]['soc']/100*c.capacity)}}

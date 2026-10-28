"""Local, gap-aware household forecasting. No device commands or credentials."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from pathlib import Path
import sqlite3
from zoneinfo import ZoneInfo

SCHEMA = """
CREATE TABLE IF NOT EXISTS hours (
 stamp INTEGER PRIMARY KEY, kwh REAL NOT NULL, temperature REAL,
 coverage REAL NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS predictions (
 stamp INTEGER PRIMARY KEY, issued INTEGER NOT NULL, predicted REAL NOT NULL,
 baseline REAL NOT NULL, actual REAL, error REAL);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


class ConsumptionDB:
    """UTC hour keys preserve DST; features use HA's local calendar."""
    def __init__(self, path, timezone_name="Europe/Berlin"):
        self.path, self.zone = str(path), ZoneInfo(timezone_name)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(SCHEMA)

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def put(self, rows):
        clean = []
        for stamp, kwh, temp, coverage, source in rows:
            kwh, temp, coverage = number(kwh), number(temp), number(coverage)
            if kwh is None or coverage is None or not 0 <= kwh <= 30 or not .85 <= coverage <= 1:
                continue
            if temp is not None and not -35 <= temp <= 45:
                temp = None
            if int(stamp) % 3600:
                continue
            clean.append((int(stamp), kwh, temp, coverage, source))
        with self.connect() as db:
            # A repeated import replaces the same hour; live observations win.
            db.executemany("""INSERT INTO hours VALUES (?,?,?,?,?)
              ON CONFLICT(stamp) DO UPDATE SET kwh=excluded.kwh,
              temperature=excluded.temperature,coverage=excluded.coverage,source=excluded.source
              WHERE hours.source != 'live'""", clean)
            # Only evaluate forecasts genuinely issued before that hour began.
            db.execute("""UPDATE predictions SET actual=(SELECT kwh FROM hours WHERE hours.stamp=predictions.stamp),
                error=(SELECT kwh FROM hours WHERE hours.stamp=predictions.stamp)-predicted
                WHERE actual IS NULL AND issued < stamp AND stamp IN (SELECT stamp FROM hours)""")
        return len(clean)

    def meta(self, key, value=None):
        with self.connect() as db:
            if value is not None:
                db.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", (key, str(value)))
            row = db.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def forecast(self, now, temperature, temperatures=None):
        now = int(now)
        local = datetime.fromtimestamp(now, self.zone)
        start = local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        end = (local.date() + timedelta(days=1))
        end = datetime.combine(end, datetime.min.time(), self.zone).timestamp()
        with self.connect() as db:
            rows = db.execute("SELECT stamp,kwh,temperature FROM hours WHERE stamp<? AND stamp>=? ORDER BY stamp", (now//3600*3600, now-730*86400)).fetchall()
            stats = db.execute("SELECT COUNT(*),COUNT(DISTINCT stamp/86400),MIN(stamp),MAX(stamp) FROM hours").fetchone()
            errors = db.execute("SELECT error,actual-baseline FROM predictions WHERE actual IS NOT NULL ORDER BY stamp DESC LIMIT 336").fetchall()
        # Latest rolling out-of-sample residual corrects systematic bias slowly.
        bias = 0.
        for error, _ in reversed(errors):
            bias = .95 * bias + .05 * error
        bias = max(-.3, min(.3, bias))
        samples = [(stamp, kwh, temp, datetime.fromtimestamp(stamp, self.zone)) for stamp,kwh,temp in rows]
        points = []
        hour = now//3600*3600
        while hour < end:
            dt = datetime.fromtimestamp(hour, self.zone)
            temp = number((temperatures or {}).get(hour, temperature))
            peers = [(stamp,kwh,t,d) for stamp,kwh,t,d in samples if d.hour == dt.hour and stamp < hour]
            baseline_peers = [k for stamp,k,t,d in peers if (d.weekday()<5)==(dt.weekday()<5) and hour-stamp<56*86400]
            baseline = sum(baseline_peers)/len(baseline_peers) if baseline_peers else None
            weighted = []
            for stamp,kwh,t,d in peers:
                weight = math.exp(-(hour-stamp)/(180*86400))
                weight *= 1 if d.weekday()==dt.weekday() else .65 if (d.weekday()<5)==(dt.weekday()<5) else .2
                if temp is not None and t is not None:
                    weight *= math.exp(-.5*((temp-t)/5)**2)
                else:
                    weight *= .3
                weighted.append((weight,kwh))
            total = sum(w for w,k in weighted)
            effective = total**2/sum(w*w for w,k in weighted) if total else 0
            simplified = effective < 5 and len(peers) >= 5
            if simplified:
                # Sparse night/weather matches fall back to an explicit hourly
                # prior, never to zero or to fabricated weather observations.
                weighted = [(1.,kwh) for stamp,kwh,t,d in peers]
                total = effective = len(peers)
            estimate = sum(w*k for w,k in weighted)/total if effective>=5 else None
            if baseline is None and peers:
                baseline = sum(k for _,k,_,_ in peers)/len(peers)
            if estimate is not None:
                estimate = max(0, estimate+bias)
            spread = math.sqrt(sum(w*(k-estimate)**2 for w,k in weighted)/total) if estimate is not None else None
            fraction = min(1, max(0, (hour+3600-now)/3600))
            points.append({"stamp":hour,"kwh":estimate,"low":max(0,estimate-spread) if estimate is not None else None,
                           "high":estimate+spread if estimate is not None else None,"remaining_fraction":fraction,
                           "samples":round(effective,1),"temperature":temp,"simplified":simplified})
            if hour > now and estimate is not None and baseline is not None:
                with self.connect() as db:
                    db.execute("INSERT OR IGNORE INTO predictions(stamp,issued,predicted,baseline) VALUES (?,?,?,?)",(hour,now,estimate,baseline))
            hour += 3600
        observed = [(stamp,k) for stamp,k,t in rows if stamp>=start]
        complete = bool(points) and all(p["kwh"] is not None for p in points)
        remaining = sum(p["kwh"]*p["remaining_fraction"] for p in points) if complete else None
        return {"available":complete,"remaining_kwh":remaining,"observed_kwh":sum(k for _,k in observed),
                "observed_hours":len(observed),"expected_elapsed_hours":int((now-start)//3600),
                "hours":points,"training_hours":stats[0],"training_days":stats[1],"first":stats[2],"last":stats[3],
                "evaluated_hours":len(errors),"mae_kwh":sum(abs(e) for e,_ in errors)/len(errors) if errors else None,
                "baseline_mae_kwh":sum(abs(e) for _,e in errors)/len(errors) if errors else None,
                "bias_kwh":bias,"weather_forecast":bool(temperatures),
                "temperature_mode":("Stündliche HA-Wetterprognose; fehlende Stunden mit aktueller Temperatur" if temperatures else "Aktuelle Temperatur fortgeschrieben" if temperature is not None else "Temperatur fehlt · nur Zeit- und Wochentagsprofil") + f" · {sum(p['simplified'] for p in points)} Stunden mit einfachem Uhrzeitprofil wegen weniger passender Vergleichswerte",
                "simplified_hours":sum(p["simplified"] for p in points),
                "mode":"Beobachtung · ohne Einfluss auf Ladesteuerung","updated":now}

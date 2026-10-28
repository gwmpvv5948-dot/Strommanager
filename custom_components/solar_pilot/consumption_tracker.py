"""Forecast collection and read-only import from an existing InfluxDB v1 entry."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import math
from pathlib import Path

from .consumption import ConsumptionDB, number

HISTORICAL_TEMPERATURE = "sensor.wohnzimmer_outdoor_temperatur"

DEFAULT_SOURCES = {
    "inverter": "sensor.inverter_wirkleistung",
    "garage": "sensor.garage_pv_sonoff_energy_power",
    "shed": "sensor.schuppen_pv_sonoff_energy_power",
    "temperature": "sensor.dresden_temperatur",
    "weather": "weather.dresden_stadt",
}


def historical_hours(series, temperatures, start, end, grid_positive=True):
    """5-min means, no gap filling for the grid; bounded holds for other loads.

    Influx state-change means are approximate, not time-integrated meter readings.
    Every accepted hour has at least 11/12 valid bins. Invalid data stays absent.
    """
    keys = ("inverter", "garage", "shed", "grid", "wallbox")
    held = {}
    hours = {}
    for stamp in range(start, end, 300):
        values = {}
        for key in keys:
            value = series.get(key, {}).get(stamp)
            if value is not None:
                held[key] = stamp, value
            previous = held.get(key)
            if previous and (stamp-previous[0]<=900 or previous[1]==0 and stamp-previous[0]<=21600):
                values[key] = previous[1]
        # An actual grid measurement must exist in this bin, including nights.
        if stamp not in series.get("grid", {}) or len(values)!=len(keys):
            continue
        grid = values["grid"] * (1 if grid_positive else -1)
        house = values["inverter"] + values["garage"] + values["shed"] - grid - values["wallbox"]
        if house < -100 or house>30000 or any(values[k]<0 for k in ("inverter","garage","shed","wallbox")):
            continue
        row = hours.setdefault(stamp//3600*3600, [])
        row.append(max(0,house))
    return [(stamp, sum(values)/len(values)/1000, temperatures.get(stamp),len(values)/12,"influx-v1-5min")
            for stamp,values in hours.items() if len(values)>=11 and stamp>=start and stamp+3600<=end]


class ConsumptionTracker:
    def __init__(self, hass, entry, entities, settings, changed=None):
        self.hass, self.entry, self.entities, self.settings = hass, entry, entities, settings
        self.sources = {**DEFAULT_SOURCES, **entry.options.get("consumption_sources", {})}
        self.changed = changed
        self.sampling = False
        self.db = None
        self.result = {}
        self.importing = False
        self.error = None
        self.last_refresh = 0
        self.last_sample = 0
        self.weather_checked = 0
        self.weather_temperatures = {}
        self.stopped = False

    def history_temperature_entities(self):
        return list(dict.fromkeys((HISTORICAL_TEMPERATURE, self.sources["temperature"])))

    async def start(self):
        path = self.hass.config.path(".storage", f"solar_pilot.consumption.{self.entry.entry_id}.sqlite")
        self.db = await self.hass.async_add_executor_job(ConsumptionDB, path, self.hass.config.time_zone)

    def _value(self, entity, temperature=False):
        state = self.hass.states.get(entity)
        if not state or state.state in ("unknown","unavailable") or state.attributes.get("restored"):
            return None
        value = number(state.state)
        unit = state.attributes.get("unit_of_measurement")
        if value is None:
            return None
        if temperature:
            return value if unit in ("°C","C") and -35<=value<=45 else None
        if unit not in ("W","kW"):
            return None
        value *= 1000 if unit=="kW" else 1
        stamp = getattr(state,"last_reported",state.last_updated).timestamp()
        age = datetime.now(timezone.utc).timestamp()-stamp
        return value if age<=300 or value==0 and age<=21600 else None

    async def sample(self, now):
        if self.sampling or self.stopped:
            return
        self.sampling = True
        try:
            await self._sample(now)
        except Exception as exc:
            self.error = f"Verbrauchslernen nicht aktualisiert ({type(exc).__name__})"
        finally:
            self.sampling = False
            if self.changed and not self.stopped:
                self.changed()

    async def _sample(self, now):
        if not self.db or self.stopped or now-self.last_sample<30:
            return
        self.last_sample = now
        values = [self._value(self.sources[k]) for k in ("inverter","garage","shed")]
        grid = self._value(self.entities["grid_power"])
        wallbox = self._value(self.entities["wallbox_power"])
        temp = self._value(self.sources["temperature"],True)
        if temp is None:
            weather = self.hass.states.get(self.sources["weather"])
            if weather and weather.state not in ("unknown","unavailable") and weather.attributes.get("temperature_unit")=="°C":
                candidate = number(weather.attributes.get("temperature"))
                temp = candidate if candidate is not None and -35<=candidate<=45 else None
        charge = self.hass.states.get(self.entities["grid_charge"])
        valid = all(v is not None for v in (*values,grid,wallbox)) and charge and charge.state=="off"
        house = sum(values)-grid*(1 if self.settings.grid_export_positive else -1)-wallbox if valid else None
        if house is not None and (house < -100 or house>30000):
            house = None
        await self.hass.async_add_executor_job(self._record, int(now), max(0,house) if house is not None else None,temp)
        if now-self.last_refresh>=300:
            self.last_refresh = now
            if now-self.weather_checked>=3600:
                self.weather_checked = now
                self.weather_temperatures = {}
                try:
                    response = await asyncio.wait_for(self.hass.services.async_call("weather","get_forecasts",
                        {"entity_id":self.sources["weather"],"type":"hourly"},blocking=True,return_response=True),timeout=10)
                    weather = self.hass.states.get(self.sources["weather"])
                    if weather and weather.attributes.get("temperature_unit")=="°C":
                        for point in (response or {}).get(self.sources["weather"],{}).get("forecast",[]):
                            stamp = datetime.fromisoformat(point["datetime"].replace("Z","+00:00"))
                            value = number(point.get("temperature"))
                            if stamp.tzinfo and value is not None and -35<=value<=45:
                                self.weather_temperatures[int(stamp.timestamp())//3600*3600] = value
                except Exception:
                    # Unsupported/missing weather forecast falls back to a named assumption.
                    self.weather_temperatures = {}
            self.result = await self.hass.async_add_executor_job(self.db.forecast,now,temp,self.weather_temperatures)
            self.result["history_days"] = await self.hass.async_add_executor_job(self.db.history_days,now)
            status = await self.hass.async_add_executor_job(self.db.meta,"import_status")
            self.result.update({"importing":self.importing,"import_status":status,"error":self.error})

    def _record(self, now, watts, temperature):
        with self.db.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS accumulation(stamp INTEGER PRIMARY KEY,wh REAL,seconds REAL,temp_sum REAL,temp_seconds REAL)")
            row = db.execute("SELECT value FROM metadata WHERE key='live_point'").fetchone()
            import json
            previous = json.loads(row[0]) if row else None
            db.execute("INSERT OR REPLACE INTO metadata VALUES ('live_point',?)",(json.dumps([now,watts,temperature]),))
            if previous and 0<now-previous[0]<=90 and previous[1] is not None and watts is not None:
                # Split intervals at UTC hour boundaries, including DST days.
                begin = previous[0]
                while begin<now:
                    hour = begin//3600*3600
                    duration = min(now,hour+3600)-begin
                    t = previous[2]
                    db.execute("""INSERT INTO accumulation VALUES (?,?,?,?,?) ON CONFLICT(stamp) DO UPDATE SET
                        wh=wh+excluded.wh,seconds=seconds+excluded.seconds,
                        temp_sum=temp_sum+excluded.temp_sum,temp_seconds=temp_seconds+excluded.temp_seconds""",
                        (hour,previous[1]*duration/3600,duration,(t or 0)*duration,duration if t is not None else 0))
                    begin += duration
            done = db.execute("SELECT stamp,wh,seconds,temp_sum,temp_seconds FROM accumulation WHERE stamp+3600<=?",(now,)).fetchall()
        rows = [(stamp,wh/seconds*3.6,t/ts if ts else None,min(1,seconds/3600),'live') for stamp,wh,seconds,t,ts in done if seconds>=3060]
        self.db.put(rows)
        with self.db.connect() as db:
            db.execute("DELETE FROM accumulation WHERE stamp+3600<=?",(now,))

    async def import_history(self):
        if self.importing or not self.db:
            return
        from aiohttp import BasicAuth, ClientTimeout
        from homeassistant.helpers.aiohttp_client import async_get_clientsession
        self.importing = True
        self.error = None
        try:
            entries = self.hass.config_entries.async_entries("influxdb")
            entry = next((e for e in entries if str(e.data.get("api_version","1"))=="1"),None)
            if entry is None:
                raise ValueError("Keine vorhandene InfluxDB-v1-Verbindung")
            cfg = {**entry.data,**entry.options}
            host = cfg["host"]
            scheme = "https" if cfg.get("ssl",False) else "http"
            port = cfg.get("port") or 8086
            path = (cfg.get("path") or "").strip("/")
            url = f"{scheme}://{host}:{port}/"+(path+"/" if path else "")+"query"
            auth = BasicAuth(cfg.get("username",""),cfg.get("password","")) if cfg.get("username") else None
            session = async_get_clientsession(self.hass,verify_ssl=cfg.get("verify_ssl",True))
            async def query(sql):
                async with session.get(url,params={"db":cfg.get("database","home_assistant"),"q":sql,"epoch":"s"},auth=auth,timeout=ClientTimeout(total=60)) as response:
                    response.raise_for_status()
                    data = await response.json()
                if data.get("error") or any(r.get("error") for r in data.get("results",[])):
                    raise ValueError("Influx-Leseabfrage abgelehnt")
                return [s for r in data.get("results",[]) for s in r.get("series",[])]
            mapping = {k:v.split(".",1)[1] for k,v in self.sources.items() if k not in ("temperature","weather")}
            mapping.update(grid=self.entities["grid_power"].split(".",1)[1],wallbox=self.entities["wallbox_power"].split(".",1)[1])
            # IDs are not inserted as raw regex or arbitrary SQL.
            import re
            names = "|".join(re.escape(v) for v in mapping.values())
            if not all(re.fullmatch(r"[a-z0-9_]+",v) for v in mapping.values()):
                raise ValueError("Ungültige Quellkennung")
            first = await query('SELECT FIRST("value") FROM "W" WHERE "entity_id"=\''+mapping["grid"]+'\'')
            if not first:
                raise ValueError("Keine historische Netzleistung")
            start = int(first[0]["values"][0][0])//3600*3600
            end = int(datetime.now(timezone.utc).timestamp())//3600*3600
            start = max(start,end-730*86400)
            # Resume interrupted import at week boundary; explicit repeated service
            # calls rescan safely (UPSERT), without duplicating training hours.
            checkpoint = await self.hass.async_add_executor_job(self.db.meta,"import_checkpoint")
            if checkpoint:
                start = max(start,min(int(checkpoint),end))
            total = 0
            while start<end and not self.stopped:
                until = min(end,start+7*86400)
                found = await query(f'SELECT MEAN("value") FROM "W" WHERE "entity_id" =~ /^({names})$/ AND time >= {start}s AND time < {until}s GROUP BY "entity_id",time(5m) fill(none)')
                inverse = {v:k for k,v in mapping.items()}
                series = {k:{} for k in mapping}
                for s in found:
                    key = inverse.get(s.get("tags",{}).get("entity_id"))
                    if key:
                        series[key] = {int(t):number(v) for t,v in s["values"] if number(v) is not None}
                temperatures = {}
                # The old outdoor channel covers winter, Dresden covers current data.
                for entity_id in self.history_temperature_entities():
                    entity = entity_id.split(".",1)[1]
                    if not re.fullmatch(r"[a-z0-9_]+",entity):
                        continue
                    result = await query(f'SELECT MEAN("value") FROM "°C" WHERE "entity_id"=\'{entity}\' AND time >= {start}s AND time < {until}s GROUP BY time(1h) fill(none)')
                    for s in result:
                        temperatures.update({int(t):v for t,v in s["values"] if number(v) is not None and -35<=v<=45})
                rows = historical_hours(series,temperatures,start,until,self.settings.grid_export_positive)
                total += await self.hass.async_add_executor_job(self.db.put,rows)
                await self.hass.async_add_executor_job(self.db.meta,"import_checkpoint",until)
                await self.hass.async_add_executor_job(self.db.meta,"import_status",f"Import bis {datetime.fromtimestamp(until,timezone.utc).date()}: {total} gültige Stunden in diesem Lauf")
                start = until
                await asyncio.sleep(0)
            self.last_refresh = 0
        except Exception as exc:
            # Never include URLs, response bodies, credentials or source config.
            self.error = f"Historienimport nicht abgeschlossen ({type(exc).__name__}); erneuter Versuch setzt fort."
        finally:
            self.importing = False

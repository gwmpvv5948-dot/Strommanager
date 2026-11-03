"""Energyforecast v2: raw market price as preference, never an EE estimate."""
from datetime import datetime
import math

URL = 'https://www.energyforecast.de/api/v2/forecast'
MAX_AGE = 8*3600
REFRESH = 3600  # 24 calls/day, below the free quota; failed calls also back off.


def stamp(value):
    result = datetime.fromisoformat(value.replace('Z','+00:00'))
    if result.tzinfo is None:
        raise ValueError('Zeitzone fehlt')
    return result.timestamp()


def parse_prices(data, now):
    generated = stamp(data['generated_at'])
    if not -300 <= now-generated <= MAX_AGE or stamp(data['valid_until']) <= now:
        raise ValueError('Preisantwort veraltet')
    if data['market_zone'] != 'DE-LU':
        raise ValueError('Falsche Marktzone')
    points = []
    for row in data['data']:
        start,end = stamp(row['start']),stamp(row['end'])
        value = row['price_ct_kwh']
        if (type(value) not in (int,float) or not math.isfinite(value) or not -100<=value<=500
                or abs(end-start-900)>.01 or points and start<points[-1]['end']
                or row['price_origin'] not in ('market','forecast')):
            raise ValueError('Ungültiges Preisraster')
        points.append({'start':start,'end':end,'spot_ct':value,'forecast':row['price_origin']=='forecast'})
    if not any(p['start']<=now<p['end'] for p in points):
        raise ValueError('Aktueller Preis fehlt')
    return points


class PriceForecast:
    def __init__(self, token=''):
        self.token = token
        self.points = []
        self.fetched = self.attempted = None
        self.busy = False
        self.error = None

    async def refresh(self, hass, now):
        if not self.token or self.busy or self.attempted is not None and now-self.attempted<REFRESH:
            return
        self.busy,self.attempted = True,now
        try:
            from homeassistant.helpers.aiohttp_client import async_get_clientsession
            async with async_get_clientsession(hass).get(URL,params={'token':self.token,'market_zone':'DE-LU'},timeout=20) as response:
                if response.status != 200:
                    self.error = f'Energyforecast HTTP {response.status} · erneuter Abruf frühestens in einer Stunde'
                    return
                data = await response.json()
            points = parse_prices(data,now)
            self.points,self.fetched,self.error = points,now,None
        except Exception:
            # Exceptions/URLs may contain the query token. Never expose them.
            self.error = 'Energyforecast nicht aktualisiert · Verbindung oder Daten ungültig'
        finally:
            self.busy = False

    def status(self, now, settings):
        fresh = settings.planner_price_enabled and self.fetched is not None and 0<=now-self.fetched<=MAX_AGE
        points = [p for p in self.points if p['end']>now] if fresh else []
        current = next((p for p in points if p['start']<=now<p['end']),None)
        complete = False
        cursor = now
        for p in points:
            if p['start']>cursor:break
            cursor = max(cursor,p['end'])
            if cursor>=now+86400:complete=True;break
        return {'configured':bool(self.token),'enabled':settings.planner_price_enabled,'available':current is not None,
                'spot_ct':current['spot_ct'] if current else None,'points':points,'complete':complete,
                'fetched':self.fetched,'error':self.error,'source':'Energyforecast · DE-LU · EPEX SPOT',
                'reason':'API-Key in Einstellungen hinterlegen' if not self.token else
                    'Preisplanung ausgeschaltet' if not settings.planner_price_enabled else
                    self.error or ('24 Stunden verfügbar' if complete else 'Preishorizont unvollständig · EE-Fallback für Lücken'),
                'license':'Börsenpreise: Bundesnetzagentur / SMARD.de · CC BY 4.0; Prognose: Energyforecast'}

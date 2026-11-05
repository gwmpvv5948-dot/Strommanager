"""Energy-Charts forecast and deterministic house policy (never a CO2 estimate)."""
from datetime import datetime
import math

MAX_AGE = 7200
URLS = ('https://api.energy-charts.info/v2/ren_share_forecast?country=de',
        'https://api.energy-charts.info/ren_share_forecast?country=de')


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def parse_forecast(data):
    """Retain explicit missing intervals. Never fill a missing forecast with zero."""
    if data.get('substitute') is True or str(data.get('attributes', {}).get('substitute', '')).lower() == 'true':
        raise ValueError('Nur Ersatzdaten verfügbar')
    if 'data' in data:
        descriptors = {s['id']: s.get('unit', data.get('unit')) for s in data.get('series', [])}
        key = next((k for k in ('renewable_share_of_load', 'ren_share') if descriptors.get(k) == '%'), None)
        if key is None:
            raise ValueError('Erneuerbaren-Anteil fehlt')
        rows = [(datetime.fromisoformat(p['timestamp'].replace('Z', '+00:00')).timestamp(), p.get('values', {}).get(key)) for p in data['data']]
    else:
        stamps, values = data.get('unix_seconds', []), data.get('ren_share', [])
        if len(stamps) != len(values):
            raise ValueError('Unvollständige Zeitreihe')
        rows = list(zip(stamps, values))
    points = []
    for stamp, value in rows:
        if not number(stamp) or (points and stamp <= points[-1]['start']):
            raise ValueError('Ungültige Zeitachse')
        points.append({'start': stamp, 'share': value if number(value) and 0 <= value <= 150 else None})
    if len(points) < 2:
        raise ValueError('Prognose fehlt')
    # Forecast currently uses 15 minute intervals; cap at one hour to expose gaps.
    for i, p in enumerate(points):
        step = points[i+1]['start']-p['start'] if i+1 < len(points) else p['start']-points[i-1]['start']
        p['end'] = p['start']+min(step, 3600)
    return points


def share_at(points, stamp):
    return next((p['share'] for p in points if p['start'] <= stamp < p['end']), None)


def hold_for(share, previous, settings):
    if share is None:
        return False
    return share >= (settings.grid_release_share if previous else settings.grid_hold_share)


class GridForecast:
    def __init__(self):
        self.points = []
        self.fetched = None
        self.attempted = None
        self.busy = False
        self.hold = False
        self.error = None
        self.source = None

    async def refresh(self, hass, now):
        if self.busy or (self.attempted is not None and now-self.attempted < 900):
            return
        self.busy = True
        self.attempted = now
        try:
            from homeassistant.helpers.aiohttp_client import async_get_clientsession
            session = async_get_clientsession(hass)
            for url in URLS:
                try:
                    async with session.get(url, timeout=20) as response:
                        response.raise_for_status()
                        data = await response.json()
                    generated = data.get("generated_at")
                    if generated:
                        stamp = datetime.fromisoformat(generated.replace("Z", "+00:00"))
                        if stamp.tzinfo is None or not 0 <= now-stamp.timestamp() <= MAX_AGE:
                            raise ValueError("Prognoseantwort veraltet")
                    points = parse_forecast(data)
                    if share_at(points, now) is None:
                        raise ValueError('Keine gültige Prognose für jetzt')
                    self.points, self.fetched, self.source = points, now, url
                    self.error = None
                    break
                except Exception as exc:
                    self.error = f'Energy-Charts nicht aktualisiert ({type(exc).__name__})'
        finally:
            self.busy = False

    def status(self, now, settings):
        fresh = self.fetched is not None and 0 <= now-self.fetched <= MAX_AGE
        share = share_at(self.points, now) if fresh else None
        self.hold = settings.grid_renewable_enabled and hold_for(share, self.hold, settings)
        valid = share is not None
        reason = ('Regelung ausgeschaltet' if not settings.grid_renewable_enabled else
                  'Prognose fehlt oder ist veraltet · Eigenverbrauch' if not valid else
                  'Netz bevorzugt · Hausspeicher bewahren' if self.hold else 'Hausspeicher fürs Haus freigegeben')
        previous = self.hold
        plan = []
        for point in self.points:
            if point['end'] <= now:
                continue
            value = point['share'] if fresh else None
            previous = settings.grid_renewable_enabled and hold_for(value, previous, settings)
            plan.append({**point, 'share': value, 'hold': previous, 'available': fresh and value is not None})
        return {'enabled': settings.grid_renewable_enabled, 'available': valid, 'share': share,
                'hold': self.hold, 'reason': reason, 'fetched': self.fetched, 'error': self.error,
                'source': self.source, 'points': plan, 'max_age_s': MAX_AGE}

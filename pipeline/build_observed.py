#!/usr/bin/env python3
"""What happened: the record of Fiona in Puerto Rico, for the reveal at the end of the exercise.

Inputs:
  RAW/iem/sbw_interval.geojson     NWS San Juan storm-based warnings 16-22 Sep 2022 (Iowa Environmental Mesonet)
  RAW/usgs/iv_00045.json.gz        USGS instantaneous precipitation, Puerto Rico, 16-22 Sep 2022
  RAW/usgs/iv_00065.json.gz        USGS instantaneous gauge height
  GARITA/data/seed/22-nwps-gauges  NWS flood categories per gauge (today's thresholds)
Output: SCEN/observed.json
"""
import argparse, datetime as dt, gzip, json, os, sys
from shapely.geometry import shape, mapping

def log(*a): print(*a, file=sys.stderr, flush=True)
def jl(p): return json.load(gzip.open(p, 'rt')) if p.endswith('.gz') else json.load(open(p))
def ms(s): return int(dt.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)

def rnd(geom, nd=4):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)): return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(geom); return {'type': m['type'], 'coordinates': r(m['coordinates'])}

# Rain window: from the first bands (17 Sep, 00 AST) to 21 Sep 00 AST, as in the TCR's storm-total map (18-21 Sep)
W0 = dt.datetime(2022, 9, 17, 4, tzinfo=dt.timezone.utc)
W1 = dt.datetime(2022, 9, 21, 4, tzinfo=dt.timezone.utc)

def series(ts):
    vals = []
    for v in ts['values'][0]['value']:
        t = dt.datetime.fromisoformat(v['dateTime'])
        try: x = float(v['value'])
        except: continue
        if x <= -999: continue
        vals.append((t.astimezone(dt.timezone.utc), x))
    return vals

def usgs_name(s):
    """'RIO PORTUGUES NR TIBES, PR' -> 'Río Portugués near Tibes' style, without inventing accents: 'Rio Portugues near Tibes'."""
    s = s.strip().removesuffix(', PR').removesuffix(' PR').rstrip(',')
    words = []
    for w in s.split():
        lw = w.lower()
        words.append({'nr': 'near', 'abv': 'above', 'blw': 'below', 'at': 'at', 'de': 'de', 'del': 'del', 'la': 'la', 'el': 'el', 'bo.': 'Bo.', 'hwy': 'Hwy'}.get(lw, w.capitalize()))
    if words: words[0] = words[0][0].upper() + words[0][1:]
    return ' '.join(words).replace(' ,', ',')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('garita'); ap.add_argument('raw'); ap.add_argument('scen')
    a = ap.parse_args()
    out = {'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}

    # warnings
    w = jl(os.path.join(a.raw, 'iem/sbw_interval.geojson'))
    emerg = set()
    wz = os.path.join(a.raw, 'iem/ww_all.zip')
    if os.path.exists(wz):
        import zipfile, io, shapefile
        with zipfile.ZipFile(wz) as zf:
            b = [n[:-4] for n in zf.namelist() if n.endswith('.shp')][0]
            r = shapefile.Reader(shp=io.BytesIO(zf.read(b + '.shp')), shx=io.BytesIO(zf.read(b + '.shx')), dbf=io.BytesIO(zf.read(b + '.dbf')))
            for rec in r.records():
                if rec['PHENOM'] == 'FF' and rec['SIG'] == 'W' and rec['EMERGENC'] in (True, 'T', 'True', 1):
                    emerg.add(int(rec['ETN']))
    log('flash flood emergencies (event ids)', sorted(emerg))
    feats = []
    for f in w['features']:
        p = f['properties']
        if p['phenomena'] not in ('FF', 'FA') or p['significance'] != 'W': continue
        g = shape(f['geometry']).simplify(0.001)
        feats.append({'type': 'Feature', 'properties': {'kind': p['ph_sig'], 'label': p['event_label'], 'issued': ms(p['utc_issue']),
                     'expires': ms(p['utc_expire']), 'where': p['locations'], 'product': p['product_id'], 'eventid': p['eventid'],
                     'emergency': p['phenomena'] == 'FF' and int(p['eventid']) in emerg},
                     'geometry': rnd(g, 4)})
    feats.sort(key=lambda f: f['properties']['issued'])
    out['warnings'] = {'type': 'FeatureCollection', 'features': feats,
                       'source': 'NWS WFO San Juan storm-based Flash Flood and Flood Warnings, 16-22 Sep 2022, Iowa Environmental Mesonet VTEC archive (https://mesonet.agron.iastate.edu/vtec/)',
                       'note': 'Polygons as issued; a warning can be reissued for the same area, so overlapping polygons are counted once each.'}
    log('warnings', len(feats))

    # rainfall totals at USGS gauges
    iv = jl(os.path.join(a.raw, 'usgs/iv_00045.json.gz'))
    rain = []
    for ts in iv['value']['timeSeries']:
        si = ts['sourceInfo']; site = si['siteCode'][0]['value']
        v = [(t, x) for t, x in series(ts) if W0 < t <= W1]
        if not v: continue
        tot = sum(x for _, x in v)
        # completeness: 15-minute steps expected over the window
        exp = (W1 - W0).total_seconds() / 900
        comp = min(1.0, len(v) / exp)
        last = max(t for t, _ in v)
        rain.append({'site': site, 'name': usgs_name(si['siteName']),
                     'lon': round(si['geoLocation']['geogLocation']['longitude'], 5), 'lat': round(si['geoLocation']['geogLocation']['latitude'], 5),
                     'in': round(tot, 2), 'complete': round(comp, 2), 'lastReport': int(last.timestamp() * 1000)})
    rain.sort(key=lambda r: -r['in'])
    out['rain'] = {'gauges': rain, 'window': [int(W0.timestamp() * 1000), int(W1.timestamp() * 1000)],
                   'source': 'USGS National Water Information System, instantaneous values, parameter 00045 (precipitation, inches), Puerto Rico (https://waterservices.usgs.gov/nwis/iv/)',
                   'note': 'Sum of reported increments 17 Sep 00:00 to 21 Sep 00:00 AST. Gauges that stopped reporting (power, damage) undercount: completeness is the share of 15-minute reports received.'}
    log('rain gauges', len(rain), 'max', rain[0] if rain else None)

    # peak stage vs NWS flood categories
    g = jl(os.path.join(a.garita, 'data/seed/22-nwps-gauges.batch.json'))
    cats = {o['key']: o for o in g['objects'] if o['type'] == 'stream_gauge' and o['props'].get('minor_stage_m')}
    iv = jl(os.path.join(a.raw, 'usgs/iv_00065.json.gz'))
    gauges = []
    for ts in iv['value']['timeSeries']:
        si = ts['sourceInfo']; site = si['siteCode'][0]['value']
        c = cats.get(site)
        v = [(t, x) for t, x in series(ts) if dt.datetime(2022, 9, 17, tzinfo=dt.timezone.utc) < t <= dt.datetime(2022, 9, 22, tzinfo=dt.timezone.utc)]
        if not v or not c: continue
        tpk, pk = max(v, key=lambda r: r[1])
        p = c['props']
        lv = None
        for name in ('major', 'moderate', 'minor', 'action'):
            st = p.get(f'{name}_stage_m')
            if st and pk >= st / 0.3048: lv = name; break
        gauges.append({'site': site, 'name': c['name'], 'lid': p.get('nws_lid'), 'lon': round(c['lon'], 5), 'lat': round(c['lat'], 5),
                       'peak_ft': round(pk, 2), 'peak_t': int(tpk.timestamp() * 1000), 'level': lv,
                       'stages_ft': {k: round(p[f'{k}_stage_m'] / 0.3048, 1) for k in ('action', 'minor', 'moderate', 'major') if p.get(f'{k}_stage_m')}})
    gauges.sort(key=lambda r: ['major', 'moderate', 'minor', 'action', None].index(r['level']))
    out['rivers'] = {'gauges': gauges,
                     'source': 'USGS NWIS gauge height (00065) peaks 17-22 Sep 2022, against the NWS flood categories for each gauge as published today (NWPS, via Garita)',
                     'note': 'Flood categories are today\'s; a few may have been revised since 2022. A gauge that failed during the flood shows a lower peak than occurred.'}
    import collections
    log('river gauges', len(gauges), collections.Counter(r['level'] for r in gauges))

    out['facts'] = FACTS
    json.dump(out, open(os.path.join(a.scen, 'observed.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    log('observed.json', os.path.getsize(os.path.join(a.scen, 'observed.json')))

# From the NHC Tropical Cyclone Report (Pasch, Reinhart and Alaka, 2023); page numbers of the PDF.
TCR = 'NHC Tropical Cyclone Report, Hurricane Fiona (AL072022), Pasch, Reinhart and Alaka, 23 March 2023'
FACTS = [
    {'k': 'landfall', 'en': 'Landfall near Punta Tocón, extreme southwestern Puerto Rico, around 3:20 PM AST Sunday 18 September, with sustained winds near 75 kt (85 mph).',
     'es': 'Tocó tierra cerca de Punta Tocón, en el extremo suroeste de Puerto Rico, hacia las 3:20 PM AST del domingo 18 de septiembre, con vientos sostenidos cerca de 75 nudos (85 mph).', 'src': TCR + ', p. 3'},
    {'k': 'warning', 'en': 'The Hurricane Warning came about 19 hours before tropical-storm-force winds arrived (the target is 36): Fiona strengthened earlier than forecast.',
     'es': 'El aviso de huracán llegó unas 19 horas antes de los vientos de tormenta tropical (lo previsto son 36): Fiona se intensificó antes de lo pronosticado.', 'src': TCR + ', p. 12'},
    {'k': 'rain', 'en': '8 to 16 inches fell widely, more in the south and east; many reports over two feet; 32.40 inches at the USGS gauge on the Río Cerrillos near Ponce.',
     'es': 'Cayeron de 8 a 16 pulgadas en gran parte de la isla, más en el sur y el este; muchos reportes de más de dos pies; 32.40 pulgadas en el pluviómetro del USGS en el Río Cerrillos cerca de Ponce.', 'src': TCR + ', pp. 7-8'},
    {'k': 'antecedent', 'en': 'Ground was already saturated: Earl had passed north of the island in early September and rivers were near or above normal.',
     'es': 'El terreno ya estaba saturado: Earl había pasado al norte de la isla a principios de septiembre y los ríos estaban en niveles normales o altos.', 'src': TCR + ', p. 7'},
    {'k': 'rescues', 'en': 'Thousands of water rescues in more than 25 municipios, over 400 of them in Salinas, where a flash flood emergency was issued for the Río Nigua.',
     'es': 'Miles de rescates en más de 25 municipios, más de 400 en Salinas, donde se emitió una emergencia por inundación repentina del Río Nigua.', 'src': TCR + ', pp. 8, 10'},
    {'k': 'rivers', 'en': 'Almost half of USGS river gauges rose above flood stage; over a dozen crested above major flood stage; some beat their María (2017) records.',
     'es': 'Casi la mitad de los ríos con medidor del USGS superó la etapa de inundación; más de una docena superó la etapa mayor; algunos rompieron sus récords de María (2017).', 'src': TCR + ', p. 8'},
    {'k': 'access', 'en': 'Landslides and rockfalls cut off several municipios. The temporary bridge over the Río Guaonica in Utuado, installed after María, washed away; a bridge in Guayama was destroyed.',
     'es': 'Deslizamientos y caídas de rocas aislaron varios municipios. El puente temporal sobre el Río Guaonica en Utuado, instalado tras María, fue arrastrado; un puente en Guayama fue destruido.', 'src': TCR + ', p. 10'},
    {'k': 'power', 'en': 'The entire island lost power, about 1.5 million customers; more than 760,000 customers had water service interrupted.',
     'es': 'Toda la isla se quedó sin electricidad, cerca de 1.5 millones de clientes; más de 760,000 clientes perdieron el servicio de agua.', 'src': TCR + ', p. 10'},
    {'k': 'deaths', 'en': '2 direct deaths in Puerto Rico (two men drowned near Bayamón) and 21 indirect, among them carbon monoxide poisoning, a generator explosion, an electrocution, and deaths tied to the outage and to lack of access to medical care.',
     'es': '2 muertes directas en Puerto Rico (dos hombres ahogados cerca de Bayamón) y 21 indirectas, entre ellas por monóxido de carbono, la explosión de un generador, una electrocución y muertes ligadas al apagón y a la falta de acceso a atención médica.', 'src': TCR + ', p. 9'},
    {'k': 'surge', 'en': 'Storm surge was 1 to 3 feet on the south coast, as forecast. The serious damage came from flash and river flooding driven by the rain.',
     'es': 'La marejada fue de 1 a 3 pies en la costa sur, como se pronosticó. El daño grave vino de las inundaciones repentinas y de los ríos causadas por la lluvia.', 'src': TCR + ', pp. 6, 12'},
    {'k': 'cost', 'en': 'About $2.5 billion in damage in Puerto Rico (NCEI), the island\'s third costliest hurricane after María and Georges; over 90% of commercial crops destroyed.',
     'es': 'Unos $2,500 millones en daños en Puerto Rico (NCEI), el tercer huracán más costoso de la isla después de María y Georges; más del 90 % de los cultivos comerciales se perdió.', 'src': TCR + ', pp. 9-10'},
]

if __name__ == '__main__':
    main()

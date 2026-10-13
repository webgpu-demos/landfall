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

def parse_tcr_rain(path):
    """Puerto Rico rows of TCR Table 3 with coordinates and a storm-total rain value."""
    import re
    if not os.path.exists(path): return []
    L = open(path, encoding='utf-8', errors='replace').read().split('\n')
    try:
        start = next(i for i, l in enumerate(L) if i > 900 and l.strip() == 'Puerto Rico')
        end = next(i for i, l in enumerate(L) if i > start and l.strip() == 'Dominican Republic')
    except StopIteration:
        return []
    coord = re.compile(r'\((\d+\.\d+)N\s+(\d+\.\d+)W\)')
    rows, block, section = [], [], None
    for l in L[start + 1:end]:
        if not l.strip(): continue
        if re.match(r'^\s*(Minimum Sea Level|Pressure|Location|Date/|time|\(UTC\)|\(mb\)|Hurricane Fiona|Press\.)', l) or 'Storm    Storm' in l or 'Sustained' in l: continue
        if re.match(r'^[A-Z][A-Za-z ()/.,&-]+(Sites|Gauges)\s*$', l.strip()) and len(l.strip()) < 90:
            section = l.strip(); block = []; continue
        block.append(l)
        m = coord.search(l)
        if not m: continue
        rain = None
        for b in block:
            for mm in re.finditer(r'(\d+\.\d+)I?', b):
                if mm.start() >= 100: rain = float(mm.group(1))
        name = ' '.join(b[:58] for b in block)
        name = re.sub(r'\([A-Z0-9-]{3,10}\)|\(\d+\.\d+N\s+\d+\.\d+W\)|\d+/\d+|\d+\.\d+|\bPress\.|\bSust\w*|elev\. \d+ ft|\(\d+ m\)', ' ', name)
        name = re.sub(r'\s+', ' ', name).strip(' –-')
        idm = re.search(r'\(([A-Z][A-Z0-9]{2,5})\)', ' '.join(block))
        block = []
        if rain is None: continue
        rows.append({'name': name, 'id': idm.group(1) if idm else None, 'network': section, 'lat': float(m.group(1)), 'lon': -float(m.group(2)), 'in': rain})
    return rows

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
                       'note': 'Each issued warning polygon counts once. This archive holds 26 flash flood warnings for 16-22 Sep; the NHC report counts about 50 issued 18-20 Sep, so counts here are a floor.'}
    log('warnings', len(feats))

    # storm-total rainfall: the NHC report's Table 3 for Puerto Rico (quality-controlled; USGS, NWS COOP, CoCoRaHS,
    # RAWS and other networks). Read from its text layer (pdftotext -layout): the total-rain column sits at the far right.
    rain = parse_tcr_rain(os.path.join(a.raw, 'nhc/tcr.txt'))
    rain.sort(key=lambda r: -r['in'])
    out['rain'] = {'gauges': rain,
                   'source': 'NHC Tropical Cyclone Report, Hurricane Fiona (Pasch, Reinhart and Alaka, 2023), Table 3, Puerto Rico: storm-total rain (https://www.nhc.noaa.gov/data/tcr/AL072022_Fiona.pdf)',
                   'note': 'Storm totals as listed by NHC, by observing network. Stations without a rain total in the table are left out.'}
    log('rain stations (TCR Table 3)', len(rain), 'max', rain[0] if rain else None)

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
                     'note': 'Only gauges that have NWS flood categories (so the share above flood stage is not comparable with the NHC report\'s count over all USGS gauges). Categories are today\'s; some may have been revised since 2022. A gauge that failed during the flood shows a lower peak than occurred.'}
    import collections
    log('river gauges', len(gauges), collections.Counter(r['level'] for r in gauges))

    out['facts'] = FACTS
    json.dump(out, open(os.path.join(a.scen, 'observed.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    log('observed.json', os.path.getsize(os.path.join(a.scen, 'observed.json')))

# From the NHC Tropical Cyclone Report (Pasch, Reinhart and Alaka, 2023); page numbers of the PDF.
TCR = 'NHC Tropical Cyclone Report, Hurricane Fiona (AL072022), Pasch, Reinhart and Alaka, 23 March 2023'
FACTS = [
    {'k': 'landfall', 'en': 'Landfall near Punta Tocón, extreme southwestern Puerto Rico, around 3:20 PM AST Sunday 18 September, with sustained winds near 75 kt (85 mph).',
     'es': 'Tocó tierra cerca de Punta Tocón, en el extremo suroeste de Puerto Rico, hacia las 3:20 PM AST del domingo 18 de septiembre, con vientos sostenidos cerca de 75 nudos (85 mph).', 'src': TCR + ', pp. 3, 16'},
    {'k': 'warning', 'en': 'The Hurricane Warning came about 19 hours before tropical-storm-force winds arrived; NHC typically issues one 36 hours ahead. Fiona strengthened earlier than forecast.',
     'es': 'El aviso de huracán llegó unas 19 horas antes de los vientos de tormenta tropical; normalmente se emite 36 horas antes. Fiona se intensificó antes de lo pronosticado.', 'src': TCR + ', p. 12'},
    {'k': 'rain', 'en': '8 to 16 inches fell widely, more in the south and east; many reports over two feet; 32.40 inches at the USGS gauge on the Río Cerrillos near Ponce.',
     'es': 'Cayeron de 8 a 16 pulgadas en gran parte de la isla, más en el sur y el este; muchos reportes de más de dos pies; 32.40 pulgadas en el pluviómetro del USGS en el Río Cerrillos cerca de Ponce.', 'src': TCR + ', pp. 7-8'},
    {'k': 'antecedent', 'en': 'Ground was already saturated: Earl had passed north of the island in early September and rivers were near or above normal.',
     'es': 'El terreno ya estaba saturado: Earl había pasado al norte de la isla a principios de septiembre y los ríos estaban en niveles normales o altos.', 'src': TCR + ', p. 7'},
    {'k': 'rescues', 'en': 'Thousands of water rescues in more than 25 municipios, over 400 of them in Salinas, where flooding on the Río Nigua prompted a flash flood emergency.',
     'es': 'Miles de rescates en más de 25 municipios, más de 400 en Salinas, donde la crecida del Río Nigua llevó a declarar una emergencia por inundaciones repentinas.', 'src': TCR + ', pp. 8, 10'},
    {'k': 'rivers', 'en': 'Almost half of USGS river gauges rose above flood stage; over a dozen crested above major flood stage; some beat their María (2017) records.',
     'es': 'Casi la mitad de los medidores de ríos del USGS superó la etapa de inundación; más de una docena superó la etapa de inundación mayor; algunos rompieron sus récords de María (2017).', 'src': TCR + ', p. 8'},
    {'k': 'access', 'en': 'Landslides and rockfalls cut off several municipios. The temporary bridge over the Río Guaonica in Utuado, installed after María, washed away; a bridge in Guayama was destroyed.',
     'es': 'Deslizamientos y caídas de rocas aislaron varios municipios. El puente temporal sobre el Río Guaonica en Utuado, instalado tras María, fue arrastrado; un puente en Guayama fue destruido.', 'src': TCR + ', p. 10'},
    {'k': 'power', 'en': 'The entire island lost power, about 1.5 million customers; more than 760,000 customers had water service interrupted.',
     'es': 'Toda la isla se quedó sin electricidad, cerca de 1.5 millones de clientes; más de 760,000 clientes perdieron el servicio de agua.', 'src': TCR + ', p. 10'},
    {'k': 'deaths', 'en': '2 direct deaths in Puerto Rico (two men drowned near Bayamón) and 21 indirect, among them carbon monoxide poisoning, a generator explosion, an electrocution, and deaths tied to the outage and to lack of access to medical care.',
     'es': '2 muertes directas en Puerto Rico (dos hombres ahogados cerca de Bayamón) y 21 indirectas, entre ellas por monóxido de carbono, la explosión de un generador, una electrocución y muertes ligadas al apagón y a la falta de acceso a atención médica.', 'src': TCR + ', p. 9'},
    {'k': 'surge', 'en': 'Storm surge inundation was 1 to 3 feet above ground on the south coast, as forecast. The serious damage came from flash and river flooding driven by the rain.',
     'es': 'La inundación por marejada ciclónica fue de 1 a 3 pies sobre el terreno en la costa sur, como se pronosticó. El daño grave vino de las inundaciones repentinas y de los ríos causadas por la lluvia.', 'src': TCR + ', pp. 6, 10, 12'},
    {'k': 'cost', 'en': 'About $2.5 billion in damage in Puerto Rico (NCEI), the island\'s third costliest hurricane after María and Georges; over 90% of commercial crops destroyed.',
     'es': 'Unos $2,500 millones en daños en Puerto Rico (NCEI), el tercer huracán más costoso de la isla después de María y Georges; más del 90 % de los cultivos comerciales se perdió.', 'src': TCR + ', pp. 9-10'},
]

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Compile Hurricane Fiona's (AL072022) official NHC products into the exercise scenario.

Inputs (from pipeline/fetch.sh, under RAW):
  nhc/gis/al072022_5day_NNN.zip   cone, track line, forecast points, coastal watches and warnings
  nhc/fcst/al072022_fcst_NNN.zip  forecast wind radii (34, 50, 64 kt) by forecast hour
  nhc/wsp/YYYYMMDDHH_wsp_120hr5km.zip  wind speed probability contours (cumulative, 120 h)
  nhc/text/{public,discus,wndprb,fstadv}.NNN.shtml  the advisory texts
  iem/HLSSJU.txt                  NWS San Juan hurricane local statements (IEM AFOS archive)
  nhc/hurdat/al072022.txt         HURDAT2 best track

Outputs (under OUT):
  scenario.json                   one record per full advisory: what NHC said, when, and the numbers
  geo/adv_NNN.json                that advisory's cone, track, points, warnings, radii, probability bands
  geo/besttrack.json              what happened

Nothing here is modelled except where a field says so (`derived`). Text is NHC's and NWS's own (public domain).
"""
import argparse, datetime as dt, glob, html, io, json, math, os, re, sys, zipfile
import shapefile  # pyshp
from shapely.geometry import shape, mapping, box, Point, Polygon, LineString, MultiPolygon
from shapely.ops import unary_union

STORM = 'al072022'
# Region the exercise map shows: Leeward Islands to Hispaniola.
REGION = box(-73.5, 13.0, -53.0, 25.5)
PR_BOX = box(-67.95, 17.85, -65.2, 18.55)
AST = dt.timezone(dt.timedelta(hours=-4))
FIRST, LAST = 4, 18   # full advisories kept: from 82 h before landfall to just after it

def log(*a): print(*a, file=sys.stderr, flush=True)

def read_shp(zf, suffix):
    """Read the shapefile in a zip whose name ends with suffix -> list of (geometry, record dict)."""
    names = zf.namelist()
    base = [n[:-4] for n in names if n.endswith(suffix + '.shp')]
    if not base: return []
    b = base[0]
    r = shapefile.Reader(shp=io.BytesIO(zf.read(b + '.shp')), shx=io.BytesIO(zf.read(b + '.shx')),
                         dbf=io.BytesIO(zf.read(b + '.dbf')))
    fields = [f[0] for f in r.fields[1:]]
    out = []
    for s, rec in zip(r.shapes(), r.records()):
        g = shape(s.__geo_interface__) if s.shapeType != 0 else None
        out.append((g, dict(zip(fields, list(rec)))))
    return out

def rnd(geom, nd=3):
    """GeoJSON geometry with coordinates rounded (3 decimals ~ 100 m: plenty for a regional view)."""
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(geom)
    return {'type': m['type'], 'coordinates': r(m['coordinates'])}

def pre_text(path):
    s = open(path, encoding='latin1').read()
    m = re.search(r'<pre>(.*?)</pre>', s, re.S)
    t = html.unescape(m.group(1) if m else s)
    t = t.replace('\r', '')
    return '\n'.join(l.rstrip() for l in t.split('\n')).strip('\n')

def utc_from_fstadv(t):
    m = re.search(r'(\d{4}) UTC \w{3} (\w{3}) (\d{1,2}) (\d{4})', t)
    hhmm, mon, day, yr = m.groups()
    month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].index(mon.upper()) + 1
    return dt.datetime(int(yr), month, int(day), int(hhmm[:2]), int(hhmm[2:]), tzinfo=dt.timezone.utc)

def ms(d): return int(d.timestamp() * 1000)

def section(text, name):
    """A block of a public advisory such as 'WIND:' up to the next ALL-CAPS label or section rule."""
    m = re.search(r'^' + re.escape(name) + r':\s*(.*?)(?=^\s*[A-Z][A-Z /]+:\s|^[A-Z][A-Z ]+\n-{4,}|\Z)', text, re.S | re.M)
    if not m: return None
    s = re.sub(r'\n\s*\n', '\n\n', m.group(1).strip())
    return reflow(s)

def reflow(s):
    """Join the 70-column lines of NWS text into paragraphs, keeping blank-line breaks and bullets."""
    paras = re.split(r'\n\s*\n', s.strip())
    out = []
    for p in paras:
        lines = [l.strip() for l in p.split('\n')]
        buf = ''
        for l in lines:
            if l.startswith('* ') or l.startswith('- '):
                if buf: out.append(buf); buf = ''
                buf = l
            else:
                buf = (buf + ' ' + l).strip() if buf else l
        if buf: out.append(buf)
    return '\n\n'.join(out)

def block(text, start, end):
    m = re.search(re.escape(start) + r'\s*\n-+\n(.*?)(?=\n' + end + r'|\Z)', text, re.S)
    return m.group(1).strip() if m else ''

WW_LABEL = {'HWR': 'Hurricane Warning', 'HWA': 'Hurricane Watch', 'TWR': 'Tropical Storm Warning', 'TWA': 'Tropical Storm Watch'}
WW_RANK = {'HWR': 4, 'HWA': 3, 'TWR': 2, 'TWA': 1}

def pr_warnings(pub):
    """Which watches/warnings the public advisory lists for Puerto Rico, highest first."""
    found = []
    for kind, code in [('Hurricane Warning', 'HWR'), ('Hurricane Watch', 'HWA'), ('Tropical Storm Warning', 'TWR'),
                       ('Tropical Storm Watch', 'TWA')]:
        m = re.search(r'A ' + kind + r' is in effect for\.\.\.\n(.*?)(?:\n\s*\n)', pub, re.S | re.I)
        if m and re.search(r'Puerto Rico', m.group(1)):
            found.append(code)
    return found

def rainfall_pr(rain):
    """Forecast rainfall for Puerto Rico from the RAINFALL section: (low, high, local max) inches."""
    if not rain: return None
    for para in rain.split('\n\n'):
        if 'Puerto Rico' not in para or 'inch' not in para: continue
        head = para.split(':')[0]
        if 'Puerto Rico' not in head and not para.startswith('Puerto Rico'): continue
        m = re.search(r'(\d+) to (\d+) inches', para)
        # "isolated maximum totals of 10", "local maximum of 25", "maximum totals of 12", "local 16 inches possible"
        mx = re.search(r'(?:maximum|local|isolated)[^.;]*?(\d+) inches', para[m.end():]) if m else None
        if m:
            return {'low_in': int(m.group(1)), 'high_in': int(m.group(2)),
                    'max_in': int(mx.group(1)) if mx else None, 'text': para}
    return None

def headline(pub):
    lines = pub.split('\n')
    out, on = [], False
    for l in lines:
        if l.startswith('...'): on = True
        if on:
            if not l.strip(): break
            out.append(l.strip())
    s = ' '.join(out)
    return [h.strip(' .') for h in re.findall(r'\.\.\.(.*?)\.\.\.(?=\s|$)', s)] or [s]

def summary_block(pub):
    m = re.search(r'SUMMARY OF .*?INFORMATION\n-+\n(.*?)\n\s*\n', pub, re.S)
    if not m: return []
    return [l.strip() for l in m.group(1).split('\n') if l.strip()]

def changes_block(pub):
    m = re.search(r'CHANGES WITH THIS ADVISORY:\s*\n(.*?)\n\s*SUMMARY OF WATCHES', pub, re.S)
    return reflow(m.group(1)) if m else ''

def key_messages(dis):
    m = re.search(r'Key Messages:\s*\n(.*?)\n\s*\n\s*FORECAST POSITIONS', dis, re.S)
    if not m: return []
    s = m.group(1)
    items = re.split(r'\n\s*(?=\d\.\s)', '\n' + s.strip())
    return [reflow(re.sub(r'^\d\.\s*', '', i.strip())) for i in items if i.strip()]

def discussion_body(dis):
    m = re.search(r'\d{4} (?:AM|PM) AST \w{3} \w{3} \d+ \d{4}\s*\n(.*?)\n\s*(?:Key Messages:|FORECAST POSITIONS)', dis, re.S)
    return reflow(m.group(1)) if m else ''

PWS_PERIOD = re.compile(r'(\d+)\s*\(\s*(\d+)\)|\b(\d+|X)\s*\(\s*(\d+|X)\)')

def pws_pr(txt, issued):
    """The wind speed probability table rows for Puerto Rico locations: cumulative % by period end."""
    lines = txt.split('\n')
    # period ends: line after 'TO' holds e.g. '00Z SUN 12Z SUN ...'
    ends = []
    for i, l in enumerate(lines):
        if l.strip().startswith('PERIODS') and 'TO' in l:
            ends = re.findall(r'(\d\dZ) (\w{3})', lines[i + 1]); break
    hours = []
    for l in lines:
        if l.startswith('FORECAST HOUR'):
            hours = [int(x) for x in re.findall(r'\((\d+)\)', l)]; break
    rows = {}
    for l in lines:
        m = re.match(r'^(.{14})\s*(34|50|64)\s+(\S+)\s+(.*)$', l)
        if not m: continue
        name = m.group(1).strip()
        if not name.endswith(' PR'): continue
        kt = int(m.group(2))
        first = m.group(3)
        cum = [0 if first == 'X' else int(first)]
        for a, b in re.findall(r'(\d+|X)\(\s*(\d+|X)\)', m.group(4)):
            cum.append(0 if b == 'X' else int(b))
        rows.setdefault(name.replace(' PR', '').title(), {})[str(kt)] = cum
    return {'hours': hours, 'rows': rows}

def radii_polygon(lat, lon, ne, se, sw, nw, steps=24):
    """Quadrant wind radii (nautical miles) as a polygon: the shape NHC draws for its radii graphics."""
    if max(ne, se, sw, nw) <= 0: return None
    pts = []
    quads = [(0, 90, ne), (90, 180, se), (180, 270, sw), (270, 360, nw)]
    for a0, a1, r in quads:
        for k in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * k / steps)
            d = r * 1852.0
            dlat = d * math.cos(a) / 111320.0
            dlon = d * math.sin(a) / (111320.0 * math.cos(math.radians(lat)))
            pts.append((lon + dlon, lat + dlat))
    return Polygon(pts).buffer(0)

def wsp_bands(zpath, kt):
    """NHC probability contours for one threshold: bands '<5%' .. '>90%' -> [{lo, hi, geometry}] clipped to region."""
    out = []
    with zipfile.ZipFile(zpath) as zf:
        for g, rec in read_shp(zf, f'wsp{kt}knt120hr_5km'):
            p = rec['PERCENTAGE']
            if p == '<5%' or g is None: continue
            if p.startswith('>'): lo, hi = int(p[1:-1]), 100
            else: lo, hi = [int(x) for x in p[:-1].split('-')]
            g = g.buffer(0).intersection(REGION)
            if g.is_empty: continue
            out.append({'lo': lo, 'hi': hi, 'geom': g})
    return out

def smooth(g, r=0.06):
    """For drawing only: NHC's 5-km contours step along grid cells; a morphological close-then-open (r ~ 6 km, about
    one grid cell) rounds the steps without moving a boundary by more than a cell. Places are sampled on the raw shapes."""
    g2 = g.buffer(r, quad_segs=4).buffer(-2 * r, quad_segs=4).buffer(r, quad_segs=4)
    return (g2 if not g2.is_empty else g).simplify(0.006, preserve_topology=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('raw'); ap.add_argument('out')
    a = ap.parse_args()
    RAW, OUT = a.raw, a.out
    os.makedirs(os.path.join(OUT, 'geo'), exist_ok=True)

    hls = parse_hls(os.path.join(RAW, 'iem/HLSSJU.txt'))
    advisories = []
    for n in range(FIRST, LAST + 1):
        nn = f'{n:03d}'
        T = lambda p: pre_text(os.path.join(RAW, f'nhc/text/{p}.{nn}.shtml'))
        pub, dis, prb, fst = T('public'), T('discus'), T('wndprb'), T('fstadv')
        issued = utc_from_fstadv(fst)
        with zipfile.ZipFile(os.path.join(RAW, f'nhc/gis/{STORM}_5day_{nn}.zip')) as zf:
            cone = read_shp(zf, '5day_pgn'); line = read_shp(zf, '5day_lin'); pts = read_shp(zf, '5day_pts')
            ww = read_shp(zf, 'ww_wwlin')
        points = []
        for g, r in sorted(pts, key=lambda x: x[1]['TAU']):
            vt = issued.replace(minute=0) if r['TAU'] == 0 else None
            m = re.match(r'(\d\d)/(\d\d)(\d\d)', r['VALIDTIME'])
            day, hh, mm = int(m.group(1)), int(m.group(2)), int(m.group(3))
            base = issued.replace(day=1, hour=0, minute=0)
            vt = base.replace(day=day, hour=hh, minute=mm)
            points.append({'tau': int(r['TAU']), 't': ms(vt), 'lon': round(g.x, 2), 'lat': round(g.y, 2),
                           'wind_kt': int(r['MAXWIND']), 'gust_kt': int(r['GUST']), 'type': r['TCDVLP'],
                           'dvlbl': r['DVLBL'], 'label': r['DATELBL']})
        c0 = points[0]
        # forecast wind radii polygons by forecast hour
        radii = []
        fz = os.path.join(RAW, f'nhc/fcst/{STORM}_fcst_{nn}.zip')
        if os.path.exists(fz):
            with zipfile.ZipFile(fz) as zf:
                for g, r in read_shp(zf, 'forecastradii'):
                    radii.append({'tau': int(r['TAU']), 'kt': int(r['RADII']),
                                  'q': [int(r['NE']), int(r['SE']), int(r['SW']), int(r['NW'])], 'geom': g})
        # watches/warnings along coasts (clip to region)
        wwf = []
        for g, r in ww:
            code = r['TCWW']
            gg = g.intersection(REGION)
            if gg.is_empty: continue
            wwf.append({'type': 'Feature', 'properties': {'code': code, 'label': WW_LABEL.get(code, code),
                        'rank': WW_RANK.get(code, 0)}, 'geometry': rnd(gg, 3)})
        syn = issued - dt.timedelta(hours=3)
        wz = os.path.join(RAW, f"nhc/wsp/{syn.strftime('%Y%m%d%H')}_wsp_120hr5km.zip")
        prob, prob_raw = {}, {}
        if os.path.exists(wz):
            for kt in (34, 50, 64):
                bands = wsp_bands(wz, kt)
                prob[str(kt)] = [{'type': 'Feature', 'properties': {'lo': b['lo'], 'hi': b['hi']},
                                  'geometry': rnd(smooth(b['geom']), 3)} for b in bands]
                prob_raw[str(kt)] = [{'type': 'Feature', 'properties': {'lo': b['lo'], 'hi': b['hi']},
                                      'geometry': rnd(b['geom'].simplify(0.002, preserve_topology=True), 4)} for b in bands]
        else:
            log('no wsp for', nn, wz)
        summ = summary_block(pub)
        haz = block(pub, 'HAZARDS AFFECTING LAND', r'NEXT ADVISORY')
        rain = section(haz, 'RAINFALL')
        rec = {
            'num': n, 'issued': ms(issued),
            'label': re.search(r'(\d{3,4} (?:AM|PM) AST \w{3} \w{3} \d+ \d{4})', pub).group(1),
            'stormType': re.search(r'^(Tropical Depression|Tropical Storm|Hurricane|Potential Tropical Cyclone)', pub.split('\n', 6)[-1].strip() if False else '', re.M) and None,
            'title': next(l for l in pub.split('\n') if 'Advisory Number' in l).strip(),
            'headline': headline(pub),
            'center': {'lat': c0['lat'], 'lon': c0['lon']},
            'wind_kt': c0['wind_kt'], 'gust_kt': c0['gust_kt'], 'type': c0['type'],
            'summary': summ,
            'changes': changes_block(pub),
            'prWarnings': pr_warnings(pub),
            'hazards': {k: section(haz, k) for k in ('WIND', 'RAINFALL', 'STORM SURGE', 'SURF', 'TORNADOES')},
            'rainPR': rainfall_pr(rain),
            'outlook': reflow(block(pub, 'DISCUSSION AND OUTLOOK', r'HAZARDS AFFECTING LAND')),
            'keyMessages': key_messages(dis),
            'discussion': discussion_body(dis),
            'forecaster': (re.search(r'Forecaster (.*)', pub) or re.search(r'FORECASTER (.*)', pub)).group(1).strip().title(),
            'points': points,
            'pws': pws_pr(prb, issued),
            'hls': hls_for(hls, issued),
            'source': {
                'public': f'https://www.nhc.noaa.gov/archive/2022/al07/{STORM}.public.{nn}.shtml',
                'discussion': f'https://www.nhc.noaa.gov/archive/2022/al07/{STORM}.discus.{nn}.shtml',
                'probabilities': f'https://www.nhc.noaa.gov/archive/2022/al07/{STORM}.wndprb.{nn}.shtml',
                'forecast': f'https://www.nhc.noaa.gov/archive/2022/al07/{STORM}.fstadv.{nn}.shtml',
                'gis': f'https://www.nhc.noaa.gov/gis/forecast/archive/{STORM}_5day_{nn}.zip',
                'radii': f'https://www.nhc.noaa.gov/gis/forecast/archive/{STORM}_fcst_{nn}.zip',
                'wsp': f"https://www.nhc.noaa.gov/gis/forecast/archive/{syn.strftime('%Y%m%d%H')}_wsp_120hr5km.zip",
            },
            'texts': {'public': pub, 'discussion': dis, 'probabilities': prb},
        }
        rec.pop('stormType')
        # forecast intensity and timing of closest approach to Puerto Rico (from the official points)
        rec['nearPR'] = closest_to_pr(points)
        advisories.append(rec)
        geo = {
            'cone': [{'type': 'Feature', 'properties': {}, 'geometry': rnd(g.intersection(REGION) if not g.within(REGION) else g, 3)} for g, _ in cone],
            'track': [{'type': 'Feature', 'properties': {}, 'geometry': rnd(g, 3)} for g, _ in line],
            'points': {'type': 'FeatureCollection', 'features': [
                {'type': 'Feature', 'properties': {k: p[k] for k in ('tau', 't', 'wind_kt', 'type', 'dvlbl', 'label')},
                 'geometry': {'type': 'Point', 'coordinates': [p['lon'], p['lat']]}} for p in points]},
            'warnings': {'type': 'FeatureCollection', 'features': sorted(wwf, key=lambda f: f['properties']['rank'])},
            'radii': [{'type': 'Feature', 'properties': {'tau': r['tau'], 'kt': r['kt'], 'q': r['q']},
                       'geometry': rnd(r['geom'].simplify(0.005), 3)} for r in radii if r['tau'] <= 72],
            'prob': prob,
        }
        json.dump(geo, open(os.path.join(OUT, f'geo/adv_{nn}.json'), 'w'), separators=(',', ':'))
        # the raw contours, for sampling places (pipeline-internal, not shipped)
        os.makedirs(os.path.join(OUT, '_work'), exist_ok=True)
        json.dump(prob_raw, open(os.path.join(OUT, f'_work/prob_{nn}.json'), 'w'), separators=(',', ':'))
        log(f'adv {nn} {rec["label"]}: {c0["wind_kt"]} kt, PR {rec["prWarnings"]}, rain {rec["rainPR"] and (rec["rainPR"]["low_in"], rec["rainPR"]["high_in"], rec["rainPR"]["max_in"])}, '
            f'{sum(len(v) for v in prob.values())} prob bands, {len(radii)} radii, HLS {rec["hls"] and rec["hls"]["label"]}')

    bt = best_track(os.path.join(RAW, 'nhc/hurdat/al072022.txt'))
    json.dump(bt, open(os.path.join(OUT, 'geo/besttrack.json'), 'w'), separators=(',', ':'))
    scen = {
        'id': 'fiona-2022',
        'storm': {'id': 'AL072022', 'name': 'Fiona', 'year': 2022},
        'landfall': bt['landfallPR'],
        'advisories': advisories,
        'sources': SOURCES,
        'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    json.dump(scen, open(os.path.join(OUT, 'scenario.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    log('scenario.json', os.path.getsize(os.path.join(OUT, 'scenario.json')), 'bytes')

def closest_to_pr(points):
    """Interpolate the official forecast hourly; return the hour the centre is closest to Puerto Rico's interior."""
    ref = Point(-66.45, 18.22)
    best = None
    for p, q in zip(points, points[1:]):
        steps = max(1, (q['t'] - p['t']) // 3600000)
        for k in range(steps + 1):
            f = k / steps
            lat = p['lat'] + f * (q['lat'] - p['lat']); lon = p['lon'] + f * (q['lon'] - p['lon'])
            w = p['wind_kt'] + f * (q['wind_kt'] - p['wind_kt'])
            d = haversine_km(lat, lon, ref.y, ref.x)
            if best is None or d < best['km']:
                best = {'km': round(d), 't': int(p['t'] + f * (q['t'] - p['t'])), 'lat': round(lat, 2), 'lon': round(lon, 2),
                        'wind_kt': round(w / 5) * 5}
    best['derived'] = 'interpolated hourly between the official forecast points; wind rounded to 5 kt'
    return best

def haversine_km(a, b, c, d):
    R = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = p2 - p1, math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def best_track(path):
    lines = [l for l in open(path).read().split('\n') if l.strip()]
    pts, lf = [], None
    for l in lines[1:]:
        f = [x.strip() for x in l.split(',')]
        if len(f) < 8 or not re.match(r'\d{8}', f[0]): break
        t = dt.datetime.strptime(f[0] + f[1], '%Y%m%d%H%M').replace(tzinfo=dt.timezone.utc)
        lat = float(f[4][:-1]) * (1 if f[4].endswith('N') else -1)
        lon = float(f[5][:-1]) * (-1 if f[5].endswith('W') else 1)
        p = {'t': ms(t), 'lat': lat, 'lon': lon, 'status': f[3], 'wind_kt': int(f[6]), 'pressure_mb': int(f[7]),
             'record': f[2], 'r34': [int(x) for x in f[8:12]], 'r50': [int(x) for x in f[12:16]], 'r64': [int(x) for x in f[16:20]]}
        pts.append(p)
        if f[2] == 'L' and -68 < lon < -65 and 17.5 < lat < 18.7 and lf is None:
            lf = {'t': p['t'], 'lat': lat, 'lon': lon, 'wind_kt': p['wind_kt'], 'pressure_mb': p['pressure_mb'],
                  'place': 'near Punta Tocón, Puerto Rico',
                  'source': 'NOAA NHC HURDAT2 (landfall record); place from the NHC Tropical Cyclone Report (Pasch, Reinhart and Alaka, 2023)'}
    keep = [p for p in pts if -75 < p['lon'] < -45 and p['lat'] < 30]
    feat = {'type': 'Feature', 'properties': {}, 'geometry': {'type': 'LineString', 'coordinates': [[p['lon'], p['lat']] for p in keep]}}
    return {'points': keep, 'line': feat, 'landfallPR': lf,
            'source': 'NOAA NHC HURDAT2 Atlantic best track (https://www.nhc.noaa.gov/data/hurdat/)'}

def parse_hls(path):
    """Split the AFOS dump into products; keep issue time (UTC), number and the pre-landfall sections."""
    if not os.path.exists(path): return []
    raw = open(path, encoding='latin1').read().replace('\r', '')
    prods = []
    for chunk in re.split(r'\n(?=\d{3}\s*\nWTCA82 TJSJ)', '\n' + raw):
        m = re.search(r'WTCA82 TJSJ (\d\d)(\d\d)(\d\d)', chunk)
        if not m: continue
        lm = re.search(r'(\d{3,4} (?:AM|PM) AST \w{3} \w{3} \d+ \d{4})', chunk)
        num = re.search(r'Local Statement (?:Intermediate )?Advisory Number (\w+)', chunk)
        day, hh, mi = int(m.group(1)), int(m.group(2)), int(m.group(3))
        t = dt.datetime(2022, 9, day, hh, mi, tzinfo=dt.timezone.utc)
        head = re.search(r'\*\*(.*?)\*\*', chunk, re.S)
        prods.append({'t': ms(t), 'label': lm.group(1) if lm else '', 'number': num.group(1) if num else '',
                      'headline': ' '.join(head.group(1).split()) if head else '',
                      'overview': reflow(block(chunk, 'SITUATION OVERVIEW', r'POTENTIAL IMPACTS')),
                      'impacts': impacts(block(chunk, 'POTENTIAL IMPACTS', r'PRECAUTIONARY')),
                      'text': chunk.strip()})
    prods.sort(key=lambda p: p['t'])
    return prods

def impacts(b):
    out = {}
    for m in re.finditer(r'\* ([A-Z /]+):\s*\n(.*?)(?=\n\* [A-Z /]+:|\Z)', b, re.S):
        out[m.group(1).strip()] = reflow(m.group(2))
    return out

def hls_for(hls, issued):
    """The first San Juan local statement issued at or after this NHC advisory (they follow within the hour)."""
    t = ms(issued)
    cand = [h for h in hls if t - 15 * 60000 <= h['t'] <= t + 150 * 60000]
    if not cand: return None
    h = dict(cand[0]); h['source'] = 'NWS San Juan Hurricane Local Statement (HLSSJU), via the Iowa Environmental Mesonet AFOS archive'
    return h

SOURCES = {
    'nhc_gis': 'NOAA National Hurricane Center GIS archive: 5-day cone, track, watches/warnings; forecast wind radii; wind speed probabilities (https://www.nhc.noaa.gov/gis/archive_forecast.php)',
    'nhc_text': 'NOAA National Hurricane Center advisory archive for Fiona: public advisories, discussions, wind speed probabilities (https://www.nhc.noaa.gov/archive/2022/FIONA.shtml)',
    'hls': 'NWS WFO San Juan Hurricane Local Statements, from the Iowa Environmental Mesonet AFOS archive (https://mesonet.agron.iastate.edu/wx/afos/)',
    'hurdat2': 'NOAA NHC HURDAT2 best track (https://www.nhc.noaa.gov/data/hurdat/)',
    'tcr': 'Pasch, R. J., B. J. Reinhart and L. Alaka, 2023: Hurricane Fiona (AL072022). NHC Tropical Cyclone Report (https://www.nhc.noaa.gov/data/tcr/AL072022_Fiona.pdf)',
}

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""What sits under the storm: Puerto Rico's places, people and facilities, and how each advisory touched them.

Inputs:
  GARITA   a checkout of webgpu-demos/garita's gh-pages branch (data/seed, data/geo, data/hazards, tiles/slide):
           shelters, facilities, housing, SVI, ACS, FEMA history, building exposure, boundaries, landslide tiles.
  RAW      empower/layer2_pr.json (HHS emPOWER, municipio level), osm/{roads,bridges,venues}.geojson.gz,
           ne/ne_10m_land.geojson (Natural Earth)
  SCEN     the output folder of build_scenario.py (geo/adv_NNN.json, scenario.json)

Outputs (under SCEN):
  places.json    every municipio, tract and point of interest with its attributes and, per advisory, the NHC wind
                 probability band it fell in and the forecast arrival of tropical-storm and hurricane-force winds
  geo/municipios.json, geo/tracts.json, geo/land.json, geo/roads.json, geo/bridges.json

Derived values say so in `derived` notes; sources are named in places.json `sources`.
"""
import argparse, collections, datetime as dt, gzip, io, json, math, os, re, sys
import numpy as np
import shapely
from shapely.geometry import shape, mapping, Point, Polygon, box, LineString, MultiLineString
from shapely.ops import unary_union
from PIL import Image

REGION = box(-73.5, 13.0, -53.0, 25.5)
BANDS = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90]

def log(*a): print(*a, file=sys.stderr, flush=True)

def jload(p):
    if p.endswith('.gz'):
        return json.load(gzip.open(p, 'rt', encoding='utf-8'))
    return json.load(open(p, encoding='utf-8'))

def polyonly(g):
    """Keep only the polygonal parts of an intersection result."""
    if g.geom_type in ('Polygon', 'MultiPolygon'): return g
    if hasattr(g, 'geoms'):
        parts = [x for x in g.geoms if x.geom_type in ('Polygon', 'MultiPolygon')]
        return unary_union(parts) if parts else Polygon()
    return Polygon()

def rnd(geom, nd=4):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(geom)
    return {'type': m['type'], 'coordinates': r(m['coordinates'])}

# ---------- landslide susceptibility from Garita's z13 tiles (USGS OFR 2020-1022 classes) ----------
SLIDE_COLORS = {(0x85, 0xa4, 0xd6): 5, (0xf3, 0x80, 0x7f): 4, (0xff, 0xd5, 0x80): 3, (0xfb, 0xf7, 0xbc): 2, (0xae, 0xad, 0xae): 1}
SLIDE_NAMES = {1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Very high', 5: 'Extremely high'}

class SlideTiles:
    def __init__(self, root, z=13):
        self.root, self.z, self.cache = root, z, {}
    def tile(self, x, y):
        k = (x, y)
        if k not in self.cache:
            p = os.path.join(self.root, str(self.z), str(x), f'{y}.png')
            if os.path.exists(p):
                im = np.array(Image.open(p).convert('RGBA'))
                cls = np.zeros(im.shape[:2], np.int8)
                for (r, g, b), c in SLIDE_COLORS.items():
                    m = (abs(im[..., 0].astype(int) - r) < 6) & (abs(im[..., 1].astype(int) - g) < 6) & (abs(im[..., 2].astype(int) - b) < 6) & (im[..., 3] > 0)
                    cls[m] = c
                self.cache[k] = cls
            else:
                self.cache[k] = None
        return self.cache[k]
    def at(self, lon, lat):
        n = 2 ** self.z
        fx = (lon + 180) / 360 * n
        fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
        x, y = int(fx), int(fy)
        t = self.tile(x, y)
        if t is None: return 0
        px, py = min(255, int((fx - x) * 256)), min(255, int((fy - y) * 256))
        return int(t[py, px])

# ---------- wind: NHC probability bands and forecast radii, per advisory ----------
def radii_poly(lat, lon, q, steps=12):
    if max(q) <= 0: return None
    pts = []
    for i, r in enumerate(q):
        a0 = 90 * i
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            d = r * 1852.0
            pts.append((lon + d * math.sin(a) / (111320.0 * math.cos(math.radians(lat))), lat + d * math.cos(a) / 111320.0))
    return Polygon(pts).buffer(0)

def hourly_radii(adv, geo, kt, hours=72):
    """The official forecast wind radii, interpolated hourly between forecast hours (centre and each quadrant linearly)."""
    pts = {p['tau']: p for p in adv['points']}
    rad = {}
    for f in geo['radii']:
        if f['properties']['kt'] == kt:
            rad[f['properties']['tau']] = f['properties']['q']
    taus = sorted(t for t in pts if t <= hours)
    out = []
    for h in range(0, hours + 1):
        lo = max([t for t in taus if t <= h], default=None); hi = min([t for t in taus if t >= h], default=None)
        if lo is None or hi is None: break
        f = 0 if hi == lo else (h - lo) / (hi - lo)
        p, q = pts[lo], pts[hi]
        lat = p['lat'] + f * (q['lat'] - p['lat']); lon = p['lon'] + f * (q['lon'] - p['lon'])
        ra, rb = rad.get(lo, [0, 0, 0, 0]), rad.get(hi, [0, 0, 0, 0])
        quad = [ra[i] + f * (rb[i] - ra[i]) for i in range(4)]
        out.append((h, radii_poly(lat, lon, quad)))
    return out

def band_of(geoms, bands, mode):
    """For each geometry: the highest NHC band lower bound it touches (polygons) or falls in (points)."""
    res = np.zeros(len(geoms), np.int16)
    for b in sorted(bands, key=lambda b: b['properties']['lo']):
        g = shape(b['geometry']).buffer(0)
        shapely.prepare(g)
        hit = shapely.intersects(g, geoms) if mode == 'poly' else shapely.contains(g, geoms)
        res = np.where(hit, np.maximum(res, b['properties']['lo']), res)
    return res

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('garita'); ap.add_argument('raw'); ap.add_argument('scen')
    a = ap.parse_args()
    G, RAW, S = a.garita, a.raw, a.scen
    seed = lambda n: jload(os.path.join(G, 'data/seed', n))
    scen = jload(os.path.join(S, 'scenario.json'))
    advs = scen['advisories']
    geos = [jload(os.path.join(S, f"geo/adv_{x['num']:03d}.json")) for x in advs]
    slide = SlideTiles(os.path.join(G, 'tiles/slide'))

    # ---------------- boundaries ----------------
    mfc = jload(os.path.join(G, 'data/geo/municipios_land.geojson'))
    mgeom = {f['properties']['GEOID']: shape(f['geometry']).buffer(0) for f in mfc['features']}
    mprops = {f['properties']['GEOID']: f['properties'] for f in mfc['features']}
    tfc = jload(os.path.join(G, 'data/geo/tracts.geojson'))
    tgeom = {f['properties']['GEOID']: shape(f['geometry']).buffer(0) for f in tfc['features']}
    tprops = {f['properties']['GEOID']: f['properties'] for f in tfc['features']}
    # clip tracts to land so water-only tracts drop out and coastal tracts follow the shore
    land_pr = unary_union(list(mgeom.values()))

    # ---------------- municipios ----------------
    svi = seed('02-svi.batch.json')
    svi_m = {o['key']: o['props'] for o in svi['objects'] if o['type'] == 'municipio'}
    svi_t = {o['key']: o['props'] for o in svi['objects'] if o['type'] == 'tract'}
    bexp = {o['key']: o['props'] for o in seed('52-building-exposure.batch.json')['objects']}
    acs = {o['key']: o['props'] for o in seed('04-acs.batch.json')['objects']}
    ia = {o['props']['municipio_name']: o['props'] for o in seed('31-housing-assistance.batch.json')['objects']
          if o['type'] == 'disaster_impact' and o['props'].get('disaster_number') == 4671}
    emp = {}
    ep = os.path.join(RAW, 'empower/layer2_pr.json')
    if os.path.exists(ep):
        for f in jload(ep)['features']:
            p = f['attributes']
            fips = str(p.get('FIPS_Code') or '').zfill(5)
            emp[fips] = {'benes': p.get('Medicare_Benes'), 'dme': p.get('Power_Dependent_Devices_DME')}
    log('emPOWER municipios', len(emp))

    munis = []
    for gid in sorted(mgeom):
        pr = mprops[gid]; s = svi_m.get(gid, {}); b = bexp.get(gid, {}); c = acs.get(gid, {})
        name = pr['NAME']
        ip = Point(pr['INTPTLON'], pr['INTPTLAT'])
        if not mgeom[gid].contains(ip): ip = mgeom[gid].representative_point()
        def v(x): return x['value'] if isinstance(x, dict) and 'value' in x else x
        m = {'id': gid, 'name': name, 'lon': round(ip.x, 4), 'lat': round(ip.y, 4),
             'pop': s.get('population'), 'hh': s.get('households'), 'hu': s.get('housing_units'),
             'svi': s.get('svi_overall'), 'age65': s.get('age65_pct'), 'disab': s.get('disability_pct'),
             'noveh': s.get('no_vehicle_pct'), 'pov150': s.get('poverty150_pct'), 'noins': s.get('no_health_insurance_pct'),
             'income': v(c.get('median_income_usd')), 'renter': v(c.get('renter_pct')),
             'bld': b.get('buildings'), 'bldAdded': b.get('buildings_added'), 'bldSfha': b.get('buildings_sfha'),
             'bldLe2': b.get('buildings_le_2m'), 'surge1': b.get('buildings_surge_cat1'), 'surge3': b.get('buildings_surge_cat3'),
             'slideHigh': b.get('buildings_slide_high'), 'slideHigh25': b.get('buildings_slide_high_25m'),
             'empower': emp.get(gid), 'ia': ({'reg': ia[name]['valid_registrations'], 'approved': round(ia[name]['approved_usd']),
                                              'inspected': ia[name]['total_inspected']} if name in ia else None)}
        munis.append(m)
    log('municipios', len(munis), 'with IA', sum(1 for m in munis if m['ia']))

    # ---------------- tracts (land part only) ----------------
    tracts, tract_geo = [], []
    for gid in sorted(tgeom):
        s = svi_t.get(gid)
        g = polyonly(tgeom[gid].intersection(land_pr))
        if g.is_empty or g.area < 1e-7 or not s: continue
        if (s.get('population') or 0) <= 0: continue
        ip = g.representative_point()
        th = {k: s.get(k) for k in ('svi_socioeconomic', 'svi_household', 'svi_minority', 'svi_housing_transport')}
        tracts.append({'id': gid, 'muni': gid[:5], 'pop': s.get('population'), 'hh': s.get('households'),
                       'svi': (s['svi_overall'] if s.get('svi_overall', -1) >= 0 else None),
                       'age65': s.get('age65_pct'), 'disab': s.get('disability_pct'), 'noveh': s.get('no_vehicle_pct'),
                       'pov': s.get('poverty_pct'), 'mobile': s.get('mobile_home_pct'), 'noins': s.get('no_health_insurance_pct'),
                       'lon': round(ip.x, 4), 'lat': round(ip.y, 4)})
        tract_geo.append((gid, g))
    log('tracts', len(tracts))

    # ---------------- points: shelters, facilities, housing, staging candidates ----------------
    sexp = {}
    for o in seed('53-asset-exposure.batch.json')['objects']:
        sexp[f"{o['type']}:{o['key']}"] = o['props']
    for o in seed('51-facility-exposure.batch.json')['objects']:
        sexp[f"{o['type']}:{o['key']}"] = o['props']
    surge_assets = jload(os.path.join(G, 'data/hazards/surge/assets.json'))
    pts = []
    def surge_cat(oid):
        arr = surge_assets.get(oid)
        if not arr: return None
        for i, cls in enumerate(arr):
            if cls and cls > 0: return i + 1
        return None
    def add(kind, oid, name, lon, lat, muni, extra):
        e = sexp.get(oid, {})
        rec = {'id': oid, 'kind': kind, 'name': name, 'lon': round(lon, 5), 'lat': round(lat, 5), 'muni': muni,
               'flood': e.get('flood_zone'), 'slide': short_slide(e.get('slide_class')), 'slide25': short_slide(e.get('slide_class_25m')),
               'elev': e.get('ground_elev_m'), 'surge': surge_cat(oid)}
        rec.update({k: v for k, v in extra.items() if v is not None})
        pts.append(rec)
    muni_by_name = {m['name']: m['id'] for m in munis}
    def muni_of(lon, lat, name=None):
        if name and name in muni_by_name: return muni_by_name[name]
        p = Point(lon, lat)
        for gid, g in mgeom.items():
            if g.contains(p): return gid
        return None

    sh = seed('40-shelters.batch.json')
    for o in sh['objects']:
        if o['type'] != 'shelter' or o.get('lon') is None: continue
        p = o['props']
        add('shelter', f"shelter:{o['key']}", o['name'], o['lon'], o['lat'], muni_of(o['lon'], o['lat'], p.get('municipio_name')),
            {'ftype': p.get('facility_type'), 'addr': p.get('address')})
    FAC = {'hospital': 'hospital', 'clinic': 'clinic', 'fire_station': 'fire', 'police_station': 'police',
           'power_plant': 'power', 'substation': 'substation', 'water_plant': 'water', 'airport': 'airport', 'seaport': 'seaport'}
    for o in seed('50-osm-facilities.batch.json')['objects']:
        if o['type'] not in FAC: continue
        add(FAC[o['type']], f"{o['type']}:{o['key']}", o['name'], o['lon'], o['lat'],
            muni_of(o['lon'], o['lat'], o['props'].get('municipio_name')), {'osm': o['props'].get('osm_url')})
    for f, kind in (('10-public-housing.batch.json', 'public_housing'), ('11-multifamily-assisted.batch.json', 'assisted_housing')):
        for o in seed(f)['objects']:
            if o['type'] != kind or o.get('lon') is None: continue
            p = o['props']
            add('housing', f"{kind}:{o['key']}", o['name'].title() if o['name'].isupper() else o['name'], o['lon'], o['lat'],
                muni_of(o['lon'], o['lat'], p.get('municipio_name')),
                {'htype': 'public' if kind == 'public_housing' else 'assisted', 'units': p.get('units') or p.get('total_units'),
                 'residents': p.get('residents'), 'elderly': p.get('pct_elderly'), 'disabled': p.get('pct_disabled'),
                 'located': p.get('location_basis', {}).get('value') if isinstance(p.get('location_basis'), dict) else None})
    # staging candidates: named stadiums, coliseums and sports centres from OSM (open, large, usually municipal)
    vp = os.path.join(RAW, 'osm/venues.geojson.gz')
    nven = 0
    if os.path.exists(vp):
        for f in jload(vp)['features']:
            pr = f['properties']; nm = pr.get('name')
            if not nm: continue
            if not re.search(r'coliseo|estadio|stadium|parque atl|complejo deportivo|cancha bajo techo|pabell', nm, re.I): continue
            g = shape(f['geometry'])
            c = g.representative_point() if g.geom_type != 'Point' else g
            if not land_pr.contains(c): continue
            otype = pr.get('@type') or ('node' if g.geom_type == 'Point' else 'way')
            oref = f"{otype}/{pr.get('@id')}"
            m = muni_of(c.x, c.y)
            pts.append({'id': f"venue:{oref}", 'kind': 'venue', 'name': nm, 'lon': round(c.x, 5), 'lat': round(c.y, 5),
                        'muni': m, 'slide': SLIDE_NAMES.get(slide.at(c.x, c.y)), 'flood': None, 'elev': None, 'surge': None,
                        'osm': f"https://www.openstreetmap.org/{oref}"})
            nven += 1
    log('points', len(pts), collections.Counter(p['kind'] for p in pts).most_common(), 'venues', nven)
    # flood zone for venues (FEMA NFHL polygons from Garita)
    nf = jload(os.path.join(G, 'data/geo/nfhl_zones.geojson'))
    nfg = [shape(f['geometry']).buffer(0) for f in nf['features']]
    nfz = [f['properties'].get('FLD_ZONE') or f['properties'].get('zone') for f in nf['features']]
    tree = shapely.STRtree(nfg)
    def zone_at(lon, lat):
        p = Point(lon, lat)
        for i in tree.query(p, predicate='within'):
            return nfz[i]
        return 'X'
    for p in pts:
        if p['kind'] == 'venue': p['flood'] = zone_at(p['lon'], p['lat'])

    # ---------------- roads and bridges: where access may be cut ----------------
    roads_out, bridges_out = [], []
    rstat = collections.defaultdict(lambda: {'roadKm': 0.0, 'roadKmSlide': 0.0, 'bridges': 0, 'bridgesSfha': 0, 'bridgesSlide': 0})
    rp = os.path.join(RAW, 'osm/roads.geojson.gz')
    MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary'}
    muni_tree = shapely.STRtree([mgeom[k] for k in sorted(mgeom)]); muni_ids = sorted(mgeom)
    def muni_pt(x, y):
        idx = muni_tree.query(Point(x, y), predicate='within')
        return muni_ids[idx[0]] if len(idx) else None
    if os.path.exists(rp):
        for f in jload(rp)['features']:
            pr = f['properties']; hw = pr.get('highway')
            if hw not in MAJOR: continue
            g = shape(f['geometry'])
            if g.length == 0: continue
            # sample every ~40 m
            L = g.length
            n = max(2, int(L / 0.0004))
            cls = []
            for i in range(n + 1):
                p = g.interpolate(i / n, normalized=True)
                cls.append(slide.at(p.x, p.y))
            km = LineString(g.coords).length * 111.0 * math.cos(math.radians(18.2))  # approx
            mid = g.interpolate(0.5, normalized=True)
            mu = muni_pt(mid.x, mid.y)
            hi = sum(1 for c in cls if c >= 3) / len(cls)
            if mu:
                rstat[mu]['roadKm'] += km
                rstat[mu]['roadKmSlide'] += km * hi
            if hw in MAJOR - {'tertiary'}:
                cat = {'motorway': 1, 'trunk': 1, 'primary': 2, 'secondary': 3}.get(hw.replace('_link', ''), 3)
                roads_out.append({'type': 'Feature', 'properties': {'c': cat, 'r': pr.get('ref'), 's': round(hi, 2)},
                                  'geometry': rnd(g.simplify(0.0002), 4)})
    bp = os.path.join(RAW, 'osm/bridges.geojson.gz')
    ROADLIKE = MAJOR | {'unclassified', 'residential', 'tertiary_link', 'service', 'track'}
    if os.path.exists(bp):
        for f in jload(bp)['features']:
            pr = f['properties']; hw = pr.get('highway')
            if hw not in ROADLIKE or hw in ('service', 'track'): continue
            g = shape(f['geometry'])
            mid = g.interpolate(0.5, normalized=True)
            mu = muni_pt(mid.x, mid.y)
            if not mu: continue
            z = zone_at(mid.x, mid.y)
            ends = [Point(g.coords[0]), Point(g.coords[-1])]
            sl = max(slide.at(p.x, p.y) for p in ends + [mid])
            sfha = z not in (None, 'X', 'D', 'AREA NOT INCLUDED', 'OPEN WATER')
            rstat[mu]['bridges'] += 1
            rstat[mu]['bridgesSfha'] += 1 if sfha else 0
            rstat[mu]['bridgesSlide'] += 1 if sl >= 3 else 0
            if sfha or sl >= 3:
                bridges_out.append({'type': 'Feature', 'properties': {'n': pr.get('name'), 'h': hw, 'z': z, 's': sl, 'm': mu,
                                    'id': pr.get('@id')},
                                    'geometry': {'type': 'Point', 'coordinates': [round(mid.x, 5), round(mid.y, 5)]}})
    for m in munis:
        r = rstat.get(m['id'])
        if r:
            m['roads'] = {'km': round(r['roadKm']), 'kmSlide': round(r['roadKmSlide'], 1), 'bridges': r['bridges'],
                          'bridgesSfha': r['bridgesSfha'], 'bridgesSlide': r['bridgesSlide']}
    log('roads kept for map', len(roads_out), 'bridges flagged', len(bridges_out))

    # ---------------- wind, advisory by advisory ----------------
    mg = [mgeom[m['id']] for m in munis]
    tg = [Point(t['lon'], t['lat']) for t in tracts]
    pg = [Point(p['lon'], p['lat']) for p in pts]
    for coll in (mg, tg, pg): shapely.prepare(coll)
    W = {'m': {k: [] for k in ('p34', 'p50', 'p64', 'a34', 'a64', 'cone')},
         't': {k: [] for k in ('p34', 'p50', 'p64', 'a34', 'a64')},
         'p': {k: [] for k in ('p34', 'p50', 'p64', 'a34', 'a64')}}
    for adv, geo in zip(advs, geos):
        rawp = os.path.join(S, f"_work/prob_{adv['num']:03d}.json")
        rawb = jload(rawp) if os.path.exists(rawp) else geo['prob']
        for kt in ('34', '50', '64'):
            bands = rawb.get(kt, [])
            W['m']['p' + kt].append(band_of(np.array(mg), bands, 'poly'))
            W['t']['p' + kt].append(band_of(np.array(tg), bands, 'point'))
            W['p']['p' + kt].append(band_of(np.array(pg), bands, 'point'))
        for kt in (34, 64):
            hr = hourly_radii(adv, geo, kt)
            for key, coll, mode in (('m', mg, 'poly'), ('t', tg, 'pt'), ('p', pg, 'pt')):
                arr = np.full(len(coll), -1, np.int16)
                for h, poly in hr:
                    if poly is None: continue
                    shapely.prepare(poly)
                    hit = shapely.intersects(poly, np.array(coll))
                    arr = np.where((arr < 0) & hit, h, arr)
                W[key][f'a{kt}'].append(arr)
        cone = shape(geo['cone'][0]['geometry']).buffer(0) if geo['cone'] else None
        W['m']['cone'].append(shapely.intersects(cone, np.array(mg)).astype(np.int8) if cone is not None else np.zeros(len(mg), np.int8))
    def attach(items, key):
        for i, it in enumerate(items):
            it['w'] = {k: [int(v[i]) for v in arrs] for k, arrs in W[key].items()}
    attach(munis, 'm'); attach(tracts, 't'); attach(pts, 'p')

    # ---------------- geometry for the map ----------------
    os.makedirs(os.path.join(S, 'geo'), exist_ok=True)
    def fc(feats): return {'type': 'FeatureCollection', 'features': feats}
    json.dump(fc([{'type': 'Feature', 'id': int(m['id']), 'properties': {'id': m['id'], 'name': m['name']},
                   'geometry': rnd(mgeom[m['id']].simplify(0.0006, preserve_topology=True), 4)} for m in munis]),
              open(os.path.join(S, 'geo/municipios.json'), 'w'), separators=(',', ':'))
    json.dump(fc([{'type': 'Feature', 'id': int(gid), 'properties': {'id': gid},
                   'geometry': rnd(g.simplify(0.0005, preserve_topology=True), 4)} for gid, g in tract_geo]),
              open(os.path.join(S, 'geo/tracts.json'), 'w'), separators=(',', ':'))
    # region land: Natural Earth 10 m outside Puerto Rico, Census coastline for Puerto Rico
    ne = jload(os.path.join(RAW, 'ne/ne_10m_land.geojson'))
    other = []
    pr_box = box(-67.4, 17.8, -65.15, 18.6)
    for f in ne['features']:
        g = polyonly(shape(f['geometry']).buffer(0).intersection(REGION))
        if g.is_empty: continue
        other.append(g)
    others = polyonly(unary_union(other).difference(pr_box))
    # the coast that carries Puerto Rico's watch/warning band: the main islands, not every cay
    big = [g for g in (land_pr.geoms if hasattr(land_pr, 'geoms') else [land_pr]) if g.area > 0.0004]
    land_feats = [{'type': 'Feature', 'properties': {'pr': 0}, 'geometry': rnd(others.simplify(0.003), 3)},
                  {'type': 'Feature', 'properties': {'pr': 1}, 'geometry': rnd(land_pr.simplify(0.0006), 4)},
                  {'type': 'Feature', 'properties': {'pr': 2}, 'geometry': rnd(unary_union(big).simplify(0.002), 4)}]
    json.dump(fc(land_feats), open(os.path.join(S, 'geo/land.json'), 'w'), separators=(',', ':'))
    json.dump(fc(roads_out), open(os.path.join(S, 'geo/roads.json'), 'w'), separators=(',', ':'))
    json.dump(fc(bridges_out), open(os.path.join(S, 'geo/bridges.json'), 'w'), separators=(',', ':'))

    out = {
        'advisories': [x['num'] for x in advs],
        'bands': BANDS,
        'municipios': munis, 'tracts': tracts, 'points': pts,
        'derived': {
            'p': 'NHC 5-km wind speed probability contours (cumulative, 120 h): the band a point falls in; for a municipio, the highest band touching it',
            'a': 'hours after the advisory when the official forecast 34-kt / 64-kt wind radii, interpolated hourly, first reach the place (-1: not within 72 h). NHC publishes its own arrival-time graphics; this is a stand-in computed from its radii',
            'slide': 'USGS OFR 2020-1022 susceptibility class at the point (Garita sampling); slide25 = highest class within 25 m',
            'roads': 'OpenStreetMap roads (motorway..tertiary) sampled every ~40 m against the USGS landslide map: km on High or above; bridges: OSM bridges on public roads, midpoint in a FEMA 1% zone or ends on High+ susceptibility',
        },
        'sources': SOURCES,
        'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    json.dump(out, open(os.path.join(S, 'places.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    log('places.json', os.path.getsize(os.path.join(S, 'places.json')))

def short_slide(s):
    if not s: return None
    return s.split(' / ')[0].capitalize() if ' / ' in s else s

SOURCES = {
    'shelters': 'Departamento de la Vivienda de Puerto Rico, Refugios, Temporada de Huracanes 2026 (via Garita)',
    'facilities': 'OpenStreetMap contributors, ODbL: hospitals, clinics, fire, police, power plants, substations, water plants, airports, seaports (via Garita)',
    'housing': 'HUD Public Housing Developments; HUD Multifamily Assisted Properties (via Garita)',
    'svi': 'CDC/ATSDR Social Vulnerability Index 2022, Puerto Rico tracts and municipios (via Garita)',
    'acs': 'US Census ACS 5-year (via Garita)',
    'buildings': 'OpenStreetMap footprints plus machine-detected footprints (Google Open Buildings, Microsoft) via Overture Maps; exposure computed by Garita',
    'surge': 'NOAA NHC National Storm Surge Risk Maps, Puerto Rico (SLOSH MOM, high tide, 2018)',
    'slide': 'USGS Open-File Report 2020-1022 (Hughes and Schulz, 2020), landslide susceptibility',
    'flood': 'FEMA National Flood Hazard Layer',
    'empower': 'HHS emPOWER Program, Medicare beneficiaries with electricity-dependent durable medical equipment, by municipio (HHS_emPOWER_REST_Service_Public)',
    'ia': 'OpenFEMA Housing Assistance (owners and renters), DR-4671-PR Hurricane Fiona, by municipio (via Garita)',
    'roads': 'OpenStreetMap contributors, ODbL, Geofabrik Puerto Rico extract',
    'land': 'Natural Earth 10 m land (public domain); US Census TIGER municipio boundaries for Puerto Rico',
}

if __name__ == '__main__':
    main()

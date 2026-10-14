"""Opening sequence data: a GOES-16 infrared loop of the storm's formation up to the first round, world land for the
globe shot, and terrain tiles for Puerto Rico.

  python build_intro.py <raw> <out>

<raw>/goes/*.nc  ABI L2 cloud and moisture imagery, full disk, band 13 (10.3 um "clean" infrared), NOAA via AWS,
                 hourly from 13 Sep 21Z (GOES-16 has no imagery 13 Sep 11-21Z) to 15 Sep 21Z, the first round
<raw>/ne/ne_50m_land.geojson
<raw>/dem/{z}/{x}/{y}.png   AWS Terrain Tiles (Terrarium encoding)

Writes <out>/intro/sat/NN.webp (cloud as white over transparent sea, Web Mercator; see colour()), <out>/intro/intro.json,
<out>/intro/world.json, <out>/tiles/dem/...
"""
import json, math, os, re, sys, glob
import numpy as np
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
W_LON, E_LON, S_LAT, N_LAT = -74.0, -28.0, 4.0, 28.0
WIDTH = 1200
T_WARM, T_COLD = 302.0, 195.0   # K: the warm end (clear ocean) to the coldest cloud tops

def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)

def colour(v, mask):
    """v: 0 (warm) .. 1 (cold) -> RGBA. Clear sky (warmer than ~285 K) is transparent, low cloud a cool grey, cold
    tops white; the loop's edges fade out so its rectangle never shows on the globe. Done here, not in the browser, so
    the projector laptop only decodes and cross-fades."""
    a = smooth(0.16, 0.55, v) * 0.94 * mask
    k = smooth(0.16, 0.62, v)
    return np.stack([150 + 105 * k, 166 + 89 * k, 188 + 67 * k, a * 255], -1).round().astype('u1')

def merc_y(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

def grid():
    y0, y1 = merc_y(N_LAT), merc_y(S_LAT)
    x0, x1 = math.radians(W_LON), math.radians(E_LON)
    h = round(WIDTH * (y0 - y1) / (x1 - x0))
    xs = np.linspace(x0, x1, WIDTH, endpoint=False) + (x1 - x0) / WIDTH / 2
    ys = np.linspace(y0, y1, h, endpoint=False) + (y1 - y0) / h / 2
    lon = np.degrees(xs)[None, :].repeat(h, 0)
    lat = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)[:, None].repeat(WIDTH, 1)
    return lon, lat, h

def geos_xy(lon, lat, p):
    """lat/lon -> GOES fixed grid scan angles (radians), GOES-R PUG vol. 3, 4.2.8."""
    r_eq, r_pol, H, lam0 = p['r_eq'], p['r_pol'], p['H'], math.radians(p['lon0'])
    e2 = (r_eq ** 2 - r_pol ** 2) / r_eq ** 2
    phi, lam = np.radians(lat), np.radians(lon)
    phic = np.arctan((r_pol ** 2 / r_eq ** 2) * np.tan(phi))
    rc = r_pol / np.sqrt(1 - e2 * np.cos(phic) ** 2)
    sx = H - rc * np.cos(phic) * np.cos(lam - lam0)
    sy = -rc * np.cos(phic) * np.sin(lam - lam0)
    sz = rc * np.sin(phic)
    y = np.arctan(sz / sx)
    x = np.arcsin(-sy / np.sqrt(sx ** 2 + sy ** 2 + sz ** 2))
    return x, y

def satellite():
    from netCDF4 import Dataset
    files = sorted(glob.glob(os.path.join(RAW, 'goes', '*.nc')))
    lon, lat, h = grid()
    os.makedirs(os.path.join(OUT, 'intro', 'sat'), exist_ok=True)
    frames = []
    idx = None
    yy, xx = np.arange(h) / h, np.arange(WIDTH) / WIDTH
    mask = (smooth(0, 0.22, yy) * smooth(0, 0.22, 1 - yy))[:, None] * (smooth(0, 0.16, xx) * smooth(0, 0.16, 1 - xx))[None, :]
    for i, f in enumerate(files):
        m = re.search(r'_s(\d{4})(\d{3})(\d{2})(\d{2})', os.path.basename(f))
        yr, doy, hh, mm = map(int, m.groups())
        import datetime as dt
        t = dt.datetime(yr, 1, 1, hh, mm, tzinfo=dt.timezone.utc) + dt.timedelta(days=doy - 1)
        with Dataset(f) as ds:
            if idx is None:
                pr = ds['goes_imager_projection']
                p = dict(r_eq=pr.semi_major_axis, r_pol=pr.semi_minor_axis, H=pr.perspective_point_height + pr.semi_major_axis, lon0=pr.longitude_of_projection_origin)
                xr, yr_ = ds['x'][:].astype('f8'), ds['y'][:].astype('f8')
                gx, gy = geos_xy(lon, lat, p)
                col = np.clip(np.round((gx - xr[0]) / (xr[1] - xr[0])).astype(int), 0, len(xr) - 1)
                row = np.clip(np.round((gy - yr_[0]) / (yr_[1] - yr_[0])).astype(int), 0, len(yr_) - 1)
                r0, r1, c0, c1 = row.min(), row.max() + 1, col.min(), col.max() + 1
                idx = (row - r0, col - c0, r0, r1, c0, c1)
                print('subset rows', r0, r1, 'cols', c0, c1)
            rr, cc, r0, r1, c0, c1 = idx
            cmi = ds['CMI'][r0:r1, c0:c1]
            T = np.ma.filled(cmi.astype('f4'), np.nan)[rr, cc]
        v = np.clip((T_WARM - T) / (T_WARM - T_COLD), 0, 1)
        v = np.nan_to_num(v, nan=0.0)
        name = f'{len(frames):02d}.webp'
        Image.fromarray(colour(v, mask), 'RGBA').save(os.path.join(OUT, 'intro', 'sat', name), quality=70, alpha_quality=70, method=6)
        frames.append({'t': int(t.timestamp() * 1000), 'f': name})
        print(t.isoformat(), name, os.path.getsize(os.path.join(OUT, 'intro', 'sat', name)))
    return {'bounds': [W_LON, S_LAT, E_LON, N_LAT], 'width': WIDTH, 'height': h, 'tWarmK': T_WARM, 'tColdK': T_COLD,
            'frames': frames, 'source': 'NOAA GOES-16 ABI L2 Cloud and Moisture Imagery, full disk, band 13 (10.3 um), via NOAA Open Data Dissemination on AWS'}

def world():
    from shapely.geometry import shape, mapping, box
    from shapely.ops import unary_union
    src = json.load(open(os.path.join(RAW, 'ne', 'ne_50m_land.geojson')))
    clip = box(-130, -45, 40, 65)
    geoms = []
    for f in src['features']:
        g = shape(f['geometry']).intersection(clip)
        if g.is_empty: continue
        g = g.simplify(0.04, preserve_topology=True)
        if g.area < 0.02: continue
        geoms.append(g)
    def rnd(c):
        if isinstance(c[0], (int, float)): return [round(c[0], 2), round(c[1], 2)]
        return [rnd(x) for x in c]
    feats = [{'type': 'Feature', 'properties': {}, 'geometry': {**mapping(g), 'coordinates': rnd(mapping(g)['coordinates'])}} for g in geoms]
    out = os.path.join(OUT, 'intro', 'world.json')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'), separators=(',', ':'))
    print('world.json', len(feats), os.path.getsize(out))

def dem():
    """Terrarium tiles with the sea floor flattened to 0 m and heights rounded to the metre: the opening's 3D view
    needs land relief only, and flat sea compresses to almost nothing."""
    src = os.path.join(RAW, 'dem')
    n, size = 0, 0
    for p in sorted(glob.glob(os.path.join(src, '*', '*', '*.png'))):
        a = np.asarray(Image.open(p).convert('RGB')).astype('f8')
        e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        v = (np.clip(np.round(e), 0, None) + 32768).astype('u4')
        o = np.zeros(a.shape, 'u1'); o[..., 0] = v // 256; o[..., 1] = v % 256
        d = os.path.join(OUT, 'tiles', 'dem', os.path.relpath(p, src))
        os.makedirs(os.path.dirname(d), exist_ok=True)
        Image.fromarray(o, 'RGB').save(d, optimize=True); n += 1; size += os.path.getsize(d)
    print('dem tiles', n, size)

if __name__ == '__main__':
    meta = satellite()
    world()
    dem()
    json.dump(meta, open(os.path.join(OUT, 'intro', 'intro.json'), 'w'), separators=(',', ':'))

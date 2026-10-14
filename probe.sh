cat > build_intro.py <<'PYEOF'
"""Opening sequence data: a GOES-16 infrared loop of the storm's formation up to the first round, world land for the
globe shot, and terrain tiles for Puerto Rico.

  python build_intro.py <raw> <out>

<raw>/goes/*.nc  ABI L2 cloud and moisture imagery, full disk, band 13 (10.3 um "clean" infrared), NOAA via AWS
<raw>/ne/ne_50m_land.geojson
<raw>/dem/{z}/{x}/{y}.png   AWS Terrain Tiles (Terrarium encoding)

Writes <out>/intro/sat/NN.jpg (brightness temperature as 8-bit grey, Web Mercator), <out>/intro/intro.json,
<out>/intro/world.json, <out>/tiles/dem/...
"""
import json, math, os, re, sys, glob, shutil
import numpy as np
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
W_LON, E_LON, S_LAT, N_LAT = -74.0, -28.0, 4.0, 28.0
WIDTH = 1280
T_WARM, T_COLD = 302.0, 195.0   # K: grey 0 at the warm end (clear ocean), 255 at the coldest cloud tops

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
        img = Image.fromarray((v * 255).round().astype('u1'), 'L')
        name = f'{len(frames):02d}.jpg'
        img.save(os.path.join(OUT, 'intro', 'sat', name), quality=78, optimize=True, progressive=False)
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
    src = os.path.join(RAW, 'dem')
    n, size = 0, 0
    for p in glob.glob(os.path.join(src, '*', '*', '*.png')):
        rel = os.path.relpath(p, src)
        d = os.path.join(OUT, 'tiles', 'dem', rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy(p, d); n += 1; size += os.path.getsize(p)
    print('dem tiles', n, size)

if __name__ == '__main__':
    meta = satellite()
    world()
    dem()
    json.dump(meta, open(os.path.join(OUT, 'intro', 'intro.json'), 'w'), separators=(',', ':'))
PYEOF
set -x
pip install -q netCDF4 numpy pillow shapely 2>&1 | tail -1
RAW=$PWD/raw; mkdir -p $RAW/goes $RAW/ne $RAW/dem
# GOES-16 full disk, band 13, every 2 hours, Sep 12 12Z to Sep 15 21Z 2022 (first frame at or after each hour)
t=$(date -u -d '2022-09-12 12:00' +%s); end=$(date -u -d '2022-09-15 21:00' +%s)
while [ $t -le $end ]; do
  doy=$(date -u -d @$t +%j); hh=$(date -u -d @$t +%H)
  f=$(aws s3 ls --no-sign-request s3://noaa-goes16/ABI-L2-CMIPF/2022/$doy/$hh/ | awk '{print $4}' | grep M6C13 | head -1)
  echo "$doy $hh $f"
  [ -n "$f" ] && aws s3 cp --no-sign-request --only-show-errors s3://noaa-goes16/ABI-L2-CMIPF/2022/$doy/$hh/$f $RAW/goes/$f
  t=$((t + 7200))
done
# make sure the last frame is exactly 21Z (Thu 5 PM AST)
ls -la $RAW/goes | head -5; du -sh $RAW/goes
curl -sSL -o $RAW/ne/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
python3 - <<'PY'
import math, os, subprocess
def tile(lon, lat, z):
    n = 2 ** z; x = int((lon + 180) / 360 * n); y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n); return x, y
for z in range(5, 11):
    x0, y0 = tile(-67.6, 18.75, z); x1, y1 = tile(-65.0, 17.6, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            d = f'raw/dem/{z}/{x}'; os.makedirs(d, exist_ok=True)
            subprocess.run(['curl', '-sSf', '-o', f'{d}/{y}.png', f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'])
PY
python3 build_intro.py $RAW $OUT/o 2>&1
du -sh $OUT/o/intro/sat $OUT/o/tiles/dem
python3 - <<'PY'
from PIL import Image
import glob, os
fs = sorted(glob.glob(os.environ['OUT'] + '/o/intro/sat/*.jpg'))
pick = [fs[i] for i in (0, len(fs)//3, 2*len(fs)//3, len(fs)-1)]
ims = [Image.open(f) for f in pick]
w, h = ims[0].size
sheet = Image.new('L', (w, h * 4))
for i, im in enumerate(ims): sheet.paste(im, (0, i * h))
sheet.save(os.environ['OUT'] + '/sheet.jpg', quality=70)
PY

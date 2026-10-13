#!/usr/bin/env python3
"""Checks of the compiled scenario against its sources. Run after the pipeline: python tests/check_data.py <out-dir>
Fails loudly (non-zero exit) on any mismatch; the data workflow runs it before committing."""
import json, sys, os, math
from shapely.geometry import shape, Point

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/data'
S = json.load(open(os.path.join(OUT, 'scenario.json')))
P = json.load(open(os.path.join(OUT, 'places.json')))
O = json.load(open(os.path.join(OUT, 'observed.json')))
A = {a['num']: a for a in S['advisories']}
bad = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: bad.append(msg)

# 1. Watches and warnings for Puerto Rico, against the TCR's Table 7 (times UTC)
def utc(n): import datetime as dt; return dt.datetime.fromtimestamp(A[n]['issued'] / 1000, dt.timezone.utc).strftime('%d/%H%M')
check(utc(6) == '15/2100' and 'TWA' in A[6]['prWarnings'] and 'TWA' not in A[5]['prWarnings'], 'TS watch for PR issued 15/2100 UTC (advisory 6)')
check(utc(9) == '16/1500' and 'TWR' in A[9]['prWarnings'] and 'TWR' not in A[8]['prWarnings'], 'TS warning for PR issued 16/1500 UTC (advisory 9)')
check(utc(12) == '17/0900' and 'HWA' in A[12]['prWarnings'] and 'HWA' not in A[11]['prWarnings'], 'Hurricane watch for PR issued 17/0900 UTC (advisory 12)')
check(utc(13) == '17/1500' and A[13]['prWarnings'] == ['HWR'], 'Hurricane warning for PR issued 17/1500 UTC (advisory 13)')

# 2. Landfall (TCR Table 1 / HURDAT2)
lf = S['landfall']
import datetime as dt
check(dt.datetime.fromtimestamp(lf['t'] / 1000, dt.timezone.utc).strftime('%Y-%m-%d %H%M') == '2022-09-18 1920' and lf['lat'] == 18.0 and lf['lon'] == -67.1 and lf['wind_kt'] == 75,
      f"landfall 18 Sep 1920 UTC, 18.0N 67.1W, 75 kt (got {lf['lat']} {lf['lon']} {lf['wind_kt']})")

# 3. Rain forecasts as worded in the public advisories
check(A[6]['rainPR'] and (A[6]['rainPR']['low_in'], A[6]['rainPR']['high_in'], A[6]['rainPR']['max_in']) == (4, 6, 10), 'adv 6 rain for PR: 4-6 in, isolated 10')
check(A[13]['rainPR'] and (A[13]['rainPR']['low_in'], A[13]['rainPR']['high_in'], A[13]['rainPR']['max_in']) == (12, 16, 20), 'adv 13 rain for PR: 12-16 in, local 20')
check(A[16]['rainPR'] and A[16]['rainPR']['max_in'] == 25, 'adv 16 rain for PR: local maximum 25 in')
check(A[9]['rainPR'] and A[9]['rainPR']['max_in'] == 12 and A[12]['rainPR']['max_in'] == 16 and A[4]['rainPR']['max_in'] is None, 'adv 9 maximum 12 in; adv 12 local 16 in; adv 4 none stated')

# 4. NHC's own station table vs the probability contours sampled at the stations (within one band)
ST = {'San Juan': (18.43, -66.0), 'Ponce': (18.01, -66.56), 'Aguadilla': (18.49, -67.13), 'Vieques': (18.13, -65.49)}
NEXT = {0: 5, 5: 10, 10: 20, 20: 30, 30: 40, 40: 50, 50: 60, 60: 70, 70: 80, 80: 90, 90: 100}
worst = 0; n = 0
for num, a in A.items():
    rawp = next((q for q in (os.path.join(OUT, '_work', f'prob_{num:03d}.json'), os.path.join(os.path.dirname(OUT.rstrip('/')), 'out', '_work', f'prob_{num:03d}.json'), os.path.join('out', '_work', f'prob_{num:03d}.json')) if os.path.exists(q)), '')
    src = json.load(open(rawp)) if os.path.exists(rawp) else json.load(open(os.path.join(OUT, f'geo/adv_{num:03d}.json')))['prob']
    for name, (lat, lon) in ST.items():
        row = a['pws']['rows'].get(name, {}).get('34')
        if not row: continue
        # the station table is computed at the point; the contours on a 5-km grid: take the highest band within ~10 km
        v = row[-1]; lo = 0; near = Point(lon, lat).buffer(0.09)
        for f in src['34']:
            if f['properties']['lo'] > lo and shape(f['geometry']).buffer(0).intersects(near): lo = f['properties']['lo']
        hi = NEXT[lo]
        off = 0 if lo <= v < hi or (v >= 99 and lo == 90) else min(abs(v - lo), abs(v - hi))
        worst = max(worst, off); n += 1
        if off > 10: print(f'     adv {num} {name}: table {v} %, contour band {lo}-{hi} %')
check(n > 40 and worst <= 10, f'wind speed probability contours within 10 km agree with NHC\'s station table to 10 points ({n} station-advisories, worst off by {worst} points)')

# 5. Places
check(len(P['municipios']) == 78, '78 municipios')
check(sum(1 for p in P['points'] if p['kind'] == 'shelter') >= 330, 'located 2026 shelters (>= 330 of 343)')
check(all(len(m['w']['p34']) == len(P['advisories']) for m in P['municipios']), 'wind arrays aligned with advisories')
check(all(m['ia'] for m in P['municipios']), 'FEMA DR-4671 housing assistance for every municipio')
mono = all(all(m['w']['p34'][i] >= m['w']['p50'][i] >= m['w']['p64'][i] for i in range(len(P['advisories']))) for m in P['municipios'])
check(mono, 'chance of 39+ >= 58+ >= 74+ mph everywhere')

# 6. What happened
ff = [f for f in O['warnings']['features'] if f['properties']['kind'] == 'FF.W']
check(len(ff) >= 20, f"NWS San Juan flash flood warnings in the IEM archive ({len(ff)}; the TCR counts about 50 issued 18-20 Sep, so the app calls its counts a floor)")
top = O['rain']['gauges'][0]
check(top['in'] == 32.4 and 'Cerrillos' in top['name'], f"heaviest storm total is the TCR's 32.40 in at Rio Cerrillos near Ponce ({top['in']} in at {top['name']})")
check(len(O['rain']['gauges']) >= 50, f"rain stations read from TCR Table 3 ({len(O['rain']['gauges'])})")
check(sum(1 for g in O['rivers']['gauges'] if g['level'] == 'major') >= 12, 'over a dozen gauges above major flood stage (TCR)')

print(f"\n{len(bad)} failed" if bad else '\nall checks passed')
sys.exit(1 if bad else 0)

#!/usr/bin/env python3
"""Shaded relief for Puerto Rico, from the USGS-derived terrain Garita already mirrors.

Input:  GARITA/data/island/dem_z10.png + meta.json (Web Mercator zoom 10 mosaic, Terrarium-encoded metres)
Output: SCEN/geo/hillshade.png (grey ink with alpha: land only) and SCEN/geo/hillshade.json (corner coordinates)
"""
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CROP = (-67.98, 17.82, -65.18, 18.56)   # lon/lat box: main island, Mona left out, Vieques and Culebra in

def merc_y(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def lat_of(y): return math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('garita'); ap.add_argument('scen')
    a = ap.parse_args()
    meta = json.load(open(os.path.join(a.garita, 'data/island/meta.json')))
    im = np.array(Image.open(os.path.join(a.garita, 'data/island/dem_z10.png')).convert('RGB')).astype(np.float64)
    elev = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    H, W = elev.shape
    b = meta['bounds']
    x0, x1 = b['west'], b['east']; y0, y1 = merc_y(b['north']), merc_y(b['south'])
    def col(lon): return int(round((lon - x0) / (x1 - x0) * W))
    def row(lat): return int(round((y0 - merc_y(lat)) / (y0 - y1) * H))
    c0, c1 = col(CROP[0]), col(CROP[2]); r0, r1 = row(CROP[3]), row(CROP[1])
    e = elev[r0:r1, c0:c1].copy()
    # tame the documented outliers (single bad pixels) with a 3x3 median where they disagree with neighbours
    pad = np.pad(e, 1, mode='edge')
    stack = np.stack([pad[i:i + e.shape[0], j:j + e.shape[1]] for i in range(3) for j in range(3)])
    med = np.median(stack, axis=0)
    bad = np.abs(e - med) > 150
    e[bad] = med[bad]
    # pixel size in metres (z10: 156543.03/1024 m at the equator, times cos(lat))
    lat_mid = (CROP[1] + CROP[3]) / 2
    px = 156543.03392 / 1024 * math.cos(math.radians(lat_mid))
    # land = inside the Census municipio shorelines (the DEM's own sea mask has lidar specks offshore)
    mask = Image.new('L', (e.shape[1], e.shape[0]), 0)
    dr = ImageDraw.Draw(mask)
    gj = json.load(open(os.path.join(a.garita, 'data/geo/municipios_land.geojson')))
    def pix(lon, lat): return ((lon - x0) / (x1 - x0) * W - c0, (y0 - merc_y(lat)) / (y0 - y1) * H - r0)
    for f in gj['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            dr.polygon([pix(*c) for c in poly[0]], fill=255)
            for hole in poly[1:]: dr.polygon([pix(*c) for c in hole], fill=0)
    land = np.array(mask.filter(ImageFilter.MaxFilter(3))) > 0
    z = np.where(land, e, 0) * 1.6   # modest vertical exaggeration so the Cordillera reads at island scale
    gy, gx = np.gradient(z, px)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(42)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0, 1)
    flat = math.sin(alt)
    # ink only where the slope darkens (and a little light on sun-facing slopes): neutral ground stays clear
    dark = np.clip((flat - shade) / flat, 0, 1) ** 0.85
    light = np.clip((shade - flat) / (1 - flat), 0, 1)
    alpha = np.where(land, np.clip(dark * 0.72 + light * 0.05, 0, 1), 0)
    rgba = np.zeros(e.shape + (4,), np.uint8)
    rgba[..., 0] = np.where(dark >= light, 34, 255); rgba[..., 1] = np.where(dark >= light, 44, 255); rgba[..., 2] = np.where(dark >= light, 58, 255)
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    os.makedirs(os.path.join(a.scen, 'geo'), exist_ok=True)
    out = os.path.join(a.scen, 'geo/hillshade.png')
    img.save(out, optimize=True)
    # true corner coordinates of the cropped pixels
    west = x0 + c0 / W * (x1 - x0); east = x0 + c1 / W * (x1 - x0)
    north = lat_of(y0 - r0 / H * (y0 - y1)); south = lat_of(y0 - r1 / H * (y0 - y1))
    json.dump({'coordinates': [[west, north], [east, north], [east, south], [west, south]],
               'size': [img.width, img.height],
               'source': 'Elevation: USGS 3DEP via AWS Terrain Tiles (zoom 10 mosaic mirrored by Garita); shaded here, 1.6x vertical exaggeration'},
              open(os.path.join(a.scen, 'geo/hillshade.json'), 'w'))
    print('hillshade', img.size, os.path.getsize(out), 'bytes', 'outliers fixed', int(bad.sum()))

if __name__ == '__main__':
    main()

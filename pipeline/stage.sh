#!/usr/bin/env bash
# Put the compiled scenario and the overlay tiles where the app serves them from (public/).
#   pipeline/stage.sh <scenario-out-dir> <garita-gh-pages-checkout>
set -euo pipefail
OUT="$1"; GARITA="$2"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/public/data" "$ROOT/public/tiles"
mkdir -p "$ROOT/public/data" "$ROOT/public/tiles"
cp -r "$OUT"/scenario.json "$OUT"/places.json "$OUT"/observed.json "$OUT"/geo "$ROOT/public/data/"
# _work/ holds pipeline-internal files (raw probability contours): not shipped
for t in surge slide; do cp -r "$GARITA/tiles/$t" "$ROOT/public/tiles/$t"; done
# the opening: satellite loop, world land, terrain
cp -r "$OUT/intro" "$ROOT/public/data/intro"
cp -r "$OUT/tiles/dem" "$ROOT/public/tiles/dem"
# Garita's provenance, so the app can say which build of its data this exercise used
cp "$GARITA/data/manifest.json" "$ROOT/public/data/garita-manifest.json"
du -sh "$ROOT/public/data" "$ROOT/public/tiles"

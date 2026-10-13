#!/usr/bin/env bash
# Fetch every raw source the scenario is compiled from. Runs on a GitHub Actions runner (open network); the
# development sandbox reaches only GitHub and npm. Writes under $1 (default raw/).
#   pipeline/fetch.sh raw
set -uo pipefail
RAW="${1:-raw}"; mkdir -p "$RAW"; cd "$RAW"
UA="landfall-exercise (github.com/webgpu-demos/landfall)"
FAILS=0
get() { for i in 1 2 3 4; do curl -sSfL -A "$UA" --max-time 900 "$1" -o "$2" && return 0; sleep 6; done; echo "FAIL $1" >&2; FAILS=$((FAILS+1)); return 1; }
mkdir -p nhc/gis nhc/fcst nhc/text nhc/wsp nhc/hurdat iem usgs empower osm ne

# --- NHC: Fiona (AL072022), full advisories 4..20 ------------------------------------------------------------
for n in $(seq 4 20); do a=$(printf %03d $n)
  get https://www.nhc.noaa.gov/gis/forecast/archive/al072022_5day_$a.zip nhc/gis/al072022_5day_$a.zip &
  get https://www.nhc.noaa.gov/gis/forecast/archive/al072022_fcst_$a.zip nhc/fcst/al072022_fcst_$a.zip &
  for p in public discus wndprb fstadv; do get https://www.nhc.noaa.gov/archive/2022/al07/al072022.$p.$a.shtml nhc/text/$p.$a.shtml & done
  wait
done
# wind speed probabilities: one product per synoptic time (advisory time minus 3 h)
for d in 15 16 17 18 19; do for h in 00 06 12 18; do t=202209$d$h
  get https://www.nhc.noaa.gov/gis/forecast/archive/${t}_wsp_120hr5km.zip nhc/wsp/${t}_wsp_120hr5km.zip &
done; done; wait
# best track: latest HURDAT2, Fiona's block only
get https://www.nhc.noaa.gov/data/hurdat/ nhc/hurdat/index.html
H=$(grep -o 'hurdat2-1851-[0-9]*-[0-9]*\.txt' nhc/hurdat/index.html | sort | tail -1)
get "https://www.nhc.noaa.gov/data/hurdat/$H" nhc/hurdat/hurdat2.txt && \
  awk '/^AL072022,/{on=1; print; next} on && /^AL[0-9]/{exit} on{print}' nhc/hurdat/hurdat2.txt > nhc/hurdat/al072022.txt
echo "$H" > nhc/hurdat/version.txt; rm -f nhc/hurdat/hurdat2.txt nhc/hurdat/index.html

# --- NWS San Juan: local statements and storm-based warnings (Iowa Environmental Mesonet archive) ----------------
get "https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=HLSSJU&sdate=2022-09-15&edate=2022-09-20&fmt=text&limit=80" iem/HLSSJU.txt
get "https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson?begints=2022-09-16T00:00Z&endts=2022-09-22T00:00Z&wfo=JSJ" iem/sbw_interval.geojson
# the same period as a shapefile: carries the flash flood emergency flag the JSON leaves out
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?year1=2022&month1=9&day1=16&hour1=0&minute1=0&year2=2022&month2=9&day2=22&hour2=0&minute2=0&wfo%5B%5D=JSJ&accept=shapefile" iem/ww_all.zip

# --- USGS gauges, 16..22 Sep 2022: precipitation and gauge height -------------------------------------------------
for p in 00045 00065; do
  get "https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=pr&parameterCd=$p&startDT=2022-09-16T00:00-04:00&endDT=2022-09-22T00:00-04:00" usgs/iv_$p.json && gzip -f -9 usgs/iv_$p.json
done

# --- HHS emPOWER, municipio level (layer 2: electricity-dependent DME, county level) -----------------------------
get "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/2/query?where=State%3D%27Puerto%20Rico%27%20OR%20State%3D%27PR%27&outFields=*&returnGeometry=false&f=json&resultRecordCount=2000" empower/layer2_pr.json

# --- OpenStreetMap roads, bridges, venues (Geofabrik extract, filtered with osmium) --------------------------------
if ! command -v osmium >/dev/null; then sudo apt-get -qq update >/dev/null 2>&1; sudo apt-get -qq install -y osmium-tool >/dev/null 2>&1; fi
if get https://download.geofabrik.de/north-america/us/puerto-rico-latest.osm.pbf osm/pr.osm.pbf; then
  osmium fileinfo -g header.option.osmosis_replication_timestamp osm/pr.osm.pbf > osm/timestamp.txt 2>/dev/null || true
  osmium tags-filter osm/pr.osm.pbf w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary -o osm/roads.osm.pbf --overwrite
  osmium export osm/roads.osm.pbf -o osm/roads.geojson --geometry-types=linestring --attributes=type,id --overwrite
  osmium tags-filter osm/pr.osm.pbf w/bridge=yes,viaduct,aqueduct,boardwalk,covered,movable -o osm/bridges.osm.pbf --overwrite
  osmium export osm/bridges.osm.pbf -o osm/bridges.geojson --geometry-types=linestring --attributes=type,id --overwrite
  osmium tags-filter osm/pr.osm.pbf nwr/leisure=stadium,sports_centre nwr/building=stadium -o osm/venues.osm.pbf --overwrite
  osmium export osm/venues.osm.pbf -o osm/venues.geojson --attributes=type,id --overwrite
  rm -f osm/*.osm.pbf; gzip -f -9 osm/*.geojson
fi

# --- Natural Earth 10 m land (public domain), from the project's GitHub mirror -------------------------------------
get https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson ne/ne_10m_land.geojson

echo "fetch finished with $FAILS failures"; ls -la nhc/gis | wc -l; ls nhc/text | wc -l; ls nhc/wsp | wc -l
exit 0

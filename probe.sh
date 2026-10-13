set -u
UA="landfall-exercise (github.com/webgpu-demos/landfall)"
get() { for i in 1 2 3 4; do curl -sSfL -A "$UA" --max-time 600 "$1" -o "$2" && return 0; sleep 5; done; echo "FAIL $1" >&2; return 1; }
cd $OUT; mkdir -p nhc/fcst iem empower osm nhc/hurdat
for n in $(seq 4 18); do a=$(printf %03d $n); get https://www.nhc.noaa.gov/gis/forecast/archive/al072022_fcst_$a.zip nhc/fcst/al072022_fcst_$a.zip & done; wait
get "https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson?begints=2022-09-16T00:00Z&endts=2022-09-22T00:00Z&wfo=SJU" iem/sbw_interval.geojson
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?year1=2022&month1=9&day1=16&hour1=0&minute1=0&year2=2022&month2=9&day2=22&hour2=0&minute2=0&wfo%5B%5D=SJU&limitps=yes&accept=shapefile" iem/ww_sbw_legacy.zip
get "https://mesonet.agron.iastate.edu/api/1/vtec/events.json?wfo=SJU&year=2022" iem/events_2022.json
ls -la iem; head -c 600 iem/sbw_interval.geojson; echo
get "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer?f=json" empower/service.json
python3 - <<'PY'
import json,urllib.request,urllib.parse,os
UA={'User-Agent':'landfall-exercise'}
s=json.load(open('empower/service.json'))
print('layers',[(l['id'],l['name']) for l in s.get('layers',[])])
for l in s.get('layers',[]):
    base=f"https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/{l['id']}"
    try:
        meta=json.load(urllib.request.urlopen(urllib.request.Request(base+'?f=json',headers=UA),timeout=60))
        json.dump(meta,open(f"empower/layer{l['id']}_meta.json",'w'))
        flds=[f['name'] for f in meta.get('fields',[])]
        print(l['id'],l['name'],flds[:40])
        # find a state field
        sf=[f for f in flds if f.lower() in ('state','state_name','statefips','state_fips','st_abbr','stusps','fips_state','state_abbr','statefp')]
        where="1=1"
        for f in flds:
            if f.lower() in('state','state_name'): where=f"{f}='Puerto Rico' OR {f}='PR'"; break
            if f.lower() in('statefips','state_fips','statefp','fips_state'): where=f"{f}='72'"; break
        q=base+'/query?'+urllib.parse.urlencode({'where':where,'outFields':'*','returnGeometry':'false','f':'json','resultRecordCount':2000})
        d=json.load(urllib.request.urlopen(urllib.request.Request(q,headers=UA),timeout=120))
        json.dump(d,open(f"empower/layer{l['id']}_pr.json",'w'))
        print('  where',where,'->',len(d.get('features',[])), d.get('error'))
    except Exception as e: print('ERR',l,e)
PY
get https://www.nhc.noaa.gov/data/hurdat/ nhc/hurdat/index.html; H=$(grep -o 'hurdat2-1851-[0-9]*-[0-9]*\.txt' nhc/hurdat/index.html | sort | tail -1); echo "hurdat $H"; get https://www.nhc.noaa.gov/data/hurdat/$H nhc/hurdat/hurdat2.txt; grep -n -A60 'AL072022' nhc/hurdat/hurdat2.txt | head -70 > nhc/hurdat/al072022.txt; rm nhc/hurdat/hurdat2.txt
sudo apt-get -qq update >/dev/null 2>&1; sudo apt-get -qq install -y osmium-tool >/dev/null 2>&1; osmium --version | head -1
get https://download.geofabrik.de/central-america/puerto-rico-latest.osm.pbf osm/pr.osm.pbf; ls -la osm
osmium tags-filter osm/pr.osm.pbf w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary -o osm/roads.osm.pbf --overwrite
osmium export osm/roads.osm.pbf -o osm/roads.geojsonseq -f geojsonseq --geometry-types=linestring --attributes=id --overwrite -c /dev/null 2>&1 | tail -2 || true
osmium export osm/roads.osm.pbf -o osm/roads.geojson --geometry-types=linestring --overwrite
osmium fileinfo -e osm/pr.osm.pbf | grep -E 'Timestamp|timestamp|Last' | head -5 > osm/fileinfo.txt
osmium tags-filter osm/pr.osm.pbf w/bridge -o osm/bridges.osm.pbf --overwrite; osmium export osm/bridges.osm.pbf -o osm/bridges.geojson --geometry-types=linestring --overwrite
rm -f osm/pr.osm.pbf osm/roads.osm.pbf osm/bridges.osm.pbf osm/roads.geojsonseq; gzip -9 osm/*.geojson; ls -la osm nhc/fcst empower

set -u
UA="landfall-exercise (github.com/webgpu-demos/landfall)"
get() { for i in 1 2 3 4; do curl -sSfL -A "$UA" --max-time 900 "$1" -o "$2" && return 0; sleep 5; done; echo "FAIL $1" >&2; return 1; }
cd $OUT; mkdir -p iem osm
get "https://mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson?begints=2022-09-16T00:00Z&endts=2022-09-22T00:00Z&wfo=JSJ" iem/sbw_interval.geojson
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?year1=2022&month1=9&day1=16&hour1=0&minute1=0&year2=2022&month2=9&day2=22&hour2=0&minute2=0&wfo%5B%5D=JSJ&accept=shapefile" iem/ww_all.zip
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?year1=2022&month1=9&day1=16&hour1=0&minute1=0&year2=2022&month2=9&day2=22&hour2=0&minute2=0&wfo%5B%5D=JSJ&limitps=yes&accept=shapefile" iem/ww_sbw.zip
ls -la iem; python3 -c "import json;d=json.load(open('iem/sbw_interval.geojson'));print(len(d['features']));import collections;print(collections.Counter((f['properties'].get('phenomena'),f['properties'].get('significance')) for f in d['features']))"
sudo apt-get -qq update >/dev/null 2>&1; sudo apt-get -qq install -y osmium-tool >/dev/null 2>&1; osmium --version | head -1
get https://download.geofabrik.de/north-america/us/puerto-rico-latest.osm.pbf osm/pr.osm.pbf; ls -la osm
osmium fileinfo -e osm/pr.osm.pbf > osm/fileinfo.txt 2>&1; grep -i -E 'timestamp|osmosis_replication' osm/fileinfo.txt | head
osmium tags-filter osm/pr.osm.pbf w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary -o osm/roads.osm.pbf --overwrite
osmium export osm/roads.osm.pbf -o osm/roads.geojson --geometry-types=linestring --attributes=id --overwrite
osmium tags-filter osm/pr.osm.pbf w/bridge=yes,viaduct,aqueduct,boardwalk,covered,movable -o osm/bridges.osm.pbf --overwrite
osmium export osm/bridges.osm.pbf -o osm/bridges.geojson --geometry-types=linestring --attributes=id --overwrite
osmium tags-filter osm/pr.osm.pbf nw/amenity=fuel -o osm/fuel.osm.pbf --overwrite; osmium export osm/fuel.osm.pbf -o osm/fuel.geojson --attributes=id --overwrite
osmium tags-filter osm/pr.osm.pbf nwr/shop=supermarket,wholesale nwr/amenity=pharmacy -o osm/supply.osm.pbf --overwrite; osmium export osm/supply.osm.pbf -o osm/supply.geojson --attributes=id --overwrite
osmium tags-filter osm/pr.osm.pbf nwr/leisure=stadium,sports_centre nwr/building=stadium -o osm/venues.osm.pbf --overwrite; osmium export osm/venues.osm.pbf -o osm/venues.geojson --attributes=id --overwrite
rm -f osm/*.osm.pbf; for f in osm/*.geojson; do echo $f $(grep -c '"Feature"' $f); done; gzip -9 osm/*.geojson; ls -la osm

# Fetch the raw sources for the Fiona scenario. Results come back as files under $OUT.
set -u
UA="landfall-exercise (github.com/webgpu-demos/landfall)"
get() { for i in 1 2 3 4; do curl -sSfL -A "$UA" --max-time 300 "$1" -o "$2" && return 0; sleep 5; done; echo "FAIL $1" >&2; return 1; }
mkdir -p $OUT/nhc/gis $OUT/nhc/text $OUT/nhc/wsp $OUT/atcf $OUT/iem $OUT/usgs
cd $OUT
# 5-day forecast GIS (cone, track, points, watches/warnings), full advisories 1..20
for n in $(seq -w 1 20); do a=$(printf %03d $((10#$n))); get https://www.nhc.noaa.gov/gis/forecast/archive/al072022_5day_$a.zip nhc/gis/al072022_5day_$a.zip & done; wait
# text products
for n in $(seq 1 20); do a=$(printf %03d $n); for p in public discus wndprb fstadv; do get https://www.nhc.noaa.gov/archive/2022/al07/al072022.$p.$a.shtml nhc/text/$p.$a.shtml & done; get https://www.nhc.noaa.gov/archive/2022/al07/al072022.public_a.$a.shtml nhc/text/public_a.$a.shtml & wait; done
# wind speed probability grids (5 km), synoptic times 14/18Z .. 19/12Z
for d in 14 15 16 17 18 19; do for h in 00 06 12 18; do t=202209$d$h; get https://www.nhc.noaa.gov/gis/forecast/archive/${t}_wsp_120hr5km.zip nhc/wsp/${t}_wsp_120hr5km.zip & done; done; wait
get https://ftp.nhc.noaa.gov/atcf/archive/2022/bal072022.dat.gz atcf/bal072022.dat.gz
get https://ftp.nhc.noaa.gov/atcf/archive/2022/aal072022.dat.gz atcf/aal072022.dat.gz
# NWS San Juan warnings (storm-based polygons) 16..22 Sep 2022
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?accept=shapefile&sts=2022-09-16T00:00Z&ets=2022-09-22T00:00Z&wfos=SJU&limitps=yes" iem/sju_warnings_sbw.zip
get "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/watchwarn.py?accept=shapefile&sts=2022-09-16T00:00Z&ets=2022-09-22T00:00Z&wfos=SJU" iem/sju_warnings_all.zip
# Hurricane Local Statements and TCV from WFO San Juan
for pil in HLSSJU TCVSJU; do get "https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=$pil&sdate=2022-09-15&edate=2022-09-20&fmt=text&limit=60" iem/$pil.txt; done
# USGS instantaneous values: precipitation, stage, discharge, PR, 16..22 Sep 2022
get "https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=pr&parameterCd=00045&startDT=2022-09-16T00:00-04:00&endDT=2022-09-22T00:00-04:00" usgs/iv_00045.json
get "https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=pr&parameterCd=00065&startDT=2022-09-16T00:00-04:00&endDT=2022-09-22T00:00-04:00" usgs/iv_00065.json
ls -la nhc/gis | head -5; ls nhc/gis | wc -l; ls nhc/text | wc -l; ls nhc/wsp | wc -l; ls -la atcf iem usgs
du -sh nhc/wsp; gzip -9 usgs/*.json 2>/dev/null; ls -la usgs

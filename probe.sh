set -x
npm i --no-save --silent playwright@1.56.0 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
cat > plan.json <<'JSON'
[{"id":"setup-live","query":"?nointro","wait":2500}]
JSON
node tools/shot.mjs https://webgpu-demos.github.io/landfall/ plan.json $OUT/shots > $OUT/shots.log 2>&1
node tools/flow.mjs https://webgpu-demos.github.io/landfall/ $OUT/flow > $OUT/flow.log 2>&1
for f in $OUT/shots/*.png $OUT/flow/*.png; do [ -f "$f" ] && convert "$f" -quality 82 "${f%.png}.jpg" && rm "$f"; done 2>/dev/null || true

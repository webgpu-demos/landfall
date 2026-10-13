#!/usr/bin/env bash
# Screenshots and the end-to-end flow against the DEPLOYED site, run on a GitHub runner (live network, real hosting).
#   tools/cloudshot.sh <name> <plan.json>      -> /tmp/claude-0/lfprobe/<name>/  (shots, results.json, flow log)
set -euo pipefail
NAME="$1"; PLAN="$(realpath "$2")"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$(mktemp -d)/cloudshot.sh"
cat > "$S" <<SH
set -x
npm i --no-save --silent playwright@1.56.0 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
cat > plan.json <<'JSON'
$(cat "$PLAN")
JSON
node tools/shot.mjs https://webgpu-demos.github.io/landfall/ plan.json \$OUT/shots > \$OUT/shots.log 2>&1
node tools/flow.mjs https://webgpu-demos.github.io/landfall/ \$OUT/flow > \$OUT/flow.log 2>&1
for f in \$OUT/shots/*.png \$OUT/flow/*.png; do [ -f "\$f" ] && convert "\$f" -quality 82 "\${f%.png}.jpg" && rm "\$f"; done 2>/dev/null || true
SH
bash "$ROOT/tools/probe.sh" "$NAME" "$S"

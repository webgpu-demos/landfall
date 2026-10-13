#!/usr/bin/env bash
# Runs a shell script on a GitHub runner (open network) and brings back what it wrote. Nothing runs locally.
#   tools/probe.sh <name> <script.sh>
# The script gets $OUT (a directory to write results into); its stdout and stderr are saved there too. Installing
# things is the script's own business (sudo apt-get, pip). Results: /tmp/claude-0/lfprobe/<name>/. Limit: 17 minutes,
# files over 45 MB are dropped. One name = one run at a time; use different names in parallel.
set -euo pipefail
NAME="$1"; SCRIPT="$(realpath "$2")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WT="/home/claude/lf-probe-wt-$NAME"; OUT="/tmp/claude-0/lfprobe/$NAME"
REPO="https://github.com/webgpu-demos/landfall"
retry() { for i in 1 2 3 4 5 6; do "$@" && return 0; sleep 15; done; return 1; }
if [ ! -d "$WT/.git" ]; then retry git clone -q --depth 1 --no-tags "$REPO" "$WT"; fi
cd "$WT"
retry git fetch -q --depth 1 origin main
git checkout -q -B "probe/$NAME" FETCH_HEAD
cp "$ROOT/.github/workflows/probe.yml" .github/workflows/probe.yml
cp "$SCRIPT" probe.sh
STAMP="$(date -u +%FT%TZ)"; echo "$STAMP" > probe.stamp
git add -A && git commit -q -m "probe $NAME $STAMP"
BEFORE="$(git ls-remote origin "refs/heads/probe-out/$NAME" 2>/dev/null | cut -f1 || true)"
retry git push -q -f origin "HEAD:refs/heads/probe/$NAME" 2>/dev/null
echo "probe: requested $NAME at $STAMP; waiting for the runner…"
for i in $(seq 1 100); do
  sleep 12
  NOW="$(git ls-remote origin "refs/heads/probe-out/$NAME" 2>/dev/null | cut -f1 || true)"
  if [ -n "$NOW" ] && [ "$NOW" != "$BEFORE" ]; then
    rm -rf "$OUT"; mkdir -p "$OUT"
    retry git fetch -q --depth 1 origin "refs/heads/probe-out/$NAME"
    git archive FETCH_HEAD | tar -x -C "$OUT"
    echo "probe: done -> $OUT"; ls -la "$OUT" | tail -n +2 | head -40
    exit 0
  fi
done
echo "probe: timed out waiting for probe-out/$NAME (check: gh run list -R webgpu-demos/landfall --workflow probe.yml -L 3)" >&2; exit 1

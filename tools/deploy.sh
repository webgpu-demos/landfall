#!/usr/bin/env bash
# Build the app and publish dist/ to the gh-pages branch (GitHub Pages serves that branch).
#   tools/deploy.sh
# The deploy workflow does the same on every push to main; this is for publishing from a checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
npx vite build --logLevel warn
W="$(mktemp -d)"; cp -r dist/. "$W/"; touch "$W/.nojekyll"
cd "$W"; git init -q -b gh-pages; git add -A
git -c user.name="${GIT_NAME:-landfall-deploy}" -c user.email="${GIT_EMAIL:-actions@users.noreply.github.com}" commit -q -m "Deploy $(git -C "$ROOT" rev-parse --short HEAD) $(date -u +%FT%TZ)"
git push -q -f "${REPO_URL:-https://github.com/webgpu-demos/landfall}" HEAD:gh-pages
echo "deployed -> https://webgpu-demos.github.io/landfall/ (Pages takes about a minute)"

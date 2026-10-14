npm i --no-save --silent playwright@1.56.0 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
cat > t.mjs <<'JS'
import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext()
ctx.on('serviceworker', w => { console.log('SW started', w.url()); w.on('console', m => console.log('SW console', m.type(), m.text().slice(0, 200))) })
const p = await ctx.newPage()
p.on('console', m => { if (m.type() !== 'log') console.log('page', m.type(), m.text().slice(0, 200)) })
ctx.on('requestfailed', r => console.log('FAILED', r.url().slice(0, 140), r.failure()?.errorText))
ctx.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 140)) })
await p.goto('https://webgpu-demos.github.io/landfall/?nointro', { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 80; i++) {
  const s = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ a: r?.active?.state, w: r?.waiting?.state, i: r?.installing?.state, c: !!navigator.serviceWorker.controller }) })
  if (i % 5 === 0) console.log(i * 3, 's', s)
  await p.waitForTimeout(3000)
}
console.log("offline status:", await p.locator(".offline").getAttribute("class")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000); console.log("controlled after reload:", await p.evaluate(() => !!navigator.serviceWorker.controller))
await b.close()
JS
node t.mjs > $OUT/sw.txt 2>&1

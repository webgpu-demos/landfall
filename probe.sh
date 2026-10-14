npm i --no-save --silent playwright@1.56.0 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
cat > t.mjs <<'JS'
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const logs = []; p.on('console', m => logs.push(m.type() + ' ' + m.text().slice(0, 160)))
await p.goto('https://webgpu-demos.github.io/landfall/?nointro', { waitUntil: 'domcontentloaded' })
await p.locator('.offline').waitFor({ timeout: 60000 })
for (let i = 0; i < 80; i++) { const c = await p.locator('.offline').getAttribute('class'); if (c.includes('ready')) break; await p.waitForTimeout(3000) }
console.log('status:', await p.locator('.offline').getAttribute('class'), '|', await p.locator('.offline').innerText())
await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000)
console.log('controlled after reload:', await p.evaluate(() => !!navigator.serviceWorker.controller), '| version:', await p.locator('.version').innerText())
console.log(logs.filter(l => !l.startsWith('log')).slice(0, 8).join('\n'))
await b.close()
JS
node t.mjs > $OUT/sw.txt 2>&1

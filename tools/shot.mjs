// Screenshots of the app driven through window.__landfall, for review rounds.
//   node tools/shot.mjs <base-url> <plan.json> <out-dir>
// plan: [{ id, w?, h?, dpr?, query?, before?: "js run before the app loads (e.g. localStorage)", eval?: "js after ready", wait? }]
// Uses the pre-installed Chromium with software GL (SwiftShader).
import fs from 'node:fs'
// the sandbox has playwright-core and a Chromium preinstalled; a runner installs playwright (see tools/cloudshot.sh)
const pw = await import(process.env.PW_CORE || '/opt/npm-tools/node_modules/playwright-core/index.mjs').catch(() => import('playwright'))
const { chromium } = pw
const [base, planPath, out] = process.argv.slice(2)
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
fs.mkdirSync(out, { recursive: true })
const exe = process.env.CHROME ?? (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined)
const browser = await chromium.launch({ executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] })
const results = []
for (const s of plan) {
  const ctx = await browser.newContext({ viewport: { width: s.w ?? 1920, height: s.h ?? 1080 }, deviceScaleFactor: s.dpr ?? 1, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
  page.on('pageerror', e => logs.push(`[pageerror] ${String(e).slice(0, 400)}`))
  page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url().slice(0, 160)}`))
  if (s.before) await page.addInitScript(s.before)
  const t0 = Date.now()
  await page.goto(base + (s.query ?? ''), { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => globalThis.__landfall?.ready, null, { timeout: 120000 }).catch(() => logs.push('[shot] ready never set'))
  if (s.eval) await page.evaluate(s.eval).catch(e => logs.push('[eval] ' + e))
  await page.waitForFunction(() => !document.querySelector('.map') || globalThis.__landfall?.mapIdle, null, { timeout: 120000 }).catch(() => logs.push('[shot] map never idle'))
  if (s.eval2) { await page.waitForTimeout(500); await page.evaluate(s.eval2).catch(e => logs.push('[eval2] ' + e)) }
  await page.waitForTimeout(s.wait ?? 2500)
  // wait for map to settle again after evals
  await page.evaluate(() => new Promise(r => { const m = window.__map; if (!m) return r(0); if (m.loaded() && !m.isMoving()) return setTimeout(r, 300); m.once('idle', () => r(1)); setTimeout(r, 30000) })).catch(() => {})
  await page.screenshot({ path: `${out}/${s.id}.png`, fullPage: !!s.full })
  results.push({ id: s.id, ms: Date.now() - t0, logs })
  await ctx.close()
}
await browser.close()
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1))
for (const r of results) console.log(r.id, r.ms + ' ms', JSON.stringify(r.logs.slice(0, 8)))

// End-to-end walk through the facilitator flow with real clicks: start, pick a municipio on the map, add outreach with
// a reason, drop a pin for staging, advance, review, reveal and its points, debrief. Starts with the opening. Fails on any missing step.
//   node tools/flow.mjs <base-url> <out-dir>
import fs from 'node:fs'
const pw = await import(process.env.PW_CORE || '/opt/npm-tools/node_modules/playwright-core/index.mjs').catch(() => import('playwright'))
const [base, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const exe = process.env.CHROME ?? (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined)
const browser = await pw.chromium.launch({ executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-networking', '--disable-component-update'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('dialog', d => d.accept())
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name) } catch (e) { console.log('FAIL', name, String(e).slice(0, 200)); errors.push(name); await page.screenshot({ path: `${out}/fail-${name.replace(/\W+/g, '-')}.png` }) } }
const idle = () => page.evaluate(() => new Promise(r => { const m = window.__map; if (!m) return r(0); if (m.loaded() && !m.isMoving()) return setTimeout(r, 300); m.once('idle', () => r(1)); setTimeout(r, 20000) }))
const at = (lon, lat) => page.evaluate(([lon, lat]) => { const p = window.__map.project([lon, lat]); const r = window.__map.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y } }, [lon, lat])

await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await step('the opening plays', async () => {
  await page.locator('.intro-go:not([disabled])').click({ timeout: 90000 })
  await page.locator('.intro-cap h2', { hasText: 'tropical wave' }).waitFor({ timeout: 60000 })
  await page.waitForFunction(() => globalThis.__intro?.t > 1, null, { timeout: 60000 })
})
await page.screenshot({ path: `${out}/flow-0.png` })
await step('the opening skips to setup (Esc), and can be replayed', async () => {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Start round 1/ }).first().waitFor({ timeout: 40000 })
  await page.getByRole('button', { name: /Play the opening/ }).click()
  await page.locator('.intro-title.start').waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: 'Skip to setup' }).click()
})
await step('setup shows', () => page.getByRole('button', { name: /Start round 1/ }).first().waitFor({ timeout: 30000 }))
await step('setup says how it works', async () => { const n = await page.locator('.how-steps li').count(); if (n !== 5) throw new Error('steps: ' + n) })
const dismiss = async () => { await page.locator('.roundcard .rc-go').click(); await page.locator('.roundcard').waitFor({ state: 'detached', timeout: 3000 }) }
const release = async () => { await page.locator('.top .next').click(); await page.locator('.top .next.armed').waitFor({ timeout: 2000 }); await page.locator('.top .next').click(); await page.locator('.roundcard').waitFor({ timeout: 3000 }); await dismiss() }
await step('start', async () => { await page.getByRole('button', { name: /Start round 1/ }).first().click(); await page.waitForFunction(() => globalThis.__landfall?.mapIdle, null, { timeout: 60000 }) })
await step('advisory card shows and dismisses', dismiss)
await step('threat call', async () => { await page.locator('.threat-opts button', { hasText: 'Rain' }).click(); await page.locator('.tchip.active .callmark:not(.none)').waitFor({ timeout: 2000 }) })
await step('zoom to Puerto Rico', async () => { await page.getByRole('button', { name: 'Puerto Rico', exact: true }).click(); await page.waitForTimeout(900); await idle() })
await step('click Utuado on the map', async () => {
  const m = await page.evaluate(() => __landfall.data.places.value.municipios.find(x => x.name === 'Utuado'))
  const p = await at(m.lon, m.lat + 0.03)
  await page.mouse.click(p.x, p.y)
  await page.locator('.inspector h2', { hasText: 'Utuado' }).waitFor({ timeout: 5000 })
})
await step('add outreach for table 1', async () => { await page.locator('.inspector .add-btn', { hasText: 'Outreach' }).click(); await page.locator('.drow', { hasText: 'Utuado' }).waitFor({ timeout: 3000 }) })
await step('live points on the table chip', async () => { await page.waitForFunction(() => +document.querySelector('[data-xp="t1"]')?.textContent?.replace(/\D/g, '') > 0, null, { timeout: 3000 }) })
await step('a team is spent', async () => { const n = await page.locator('.kind-outreach .pip.free').count(); if (n !== 2) throw new Error('free outreach teams: ' + n) })
await step('give a reason in the inspector', async () => { await page.locator('.inspector .reasons button', { hasText: 'Landslides' }).click(); await page.locator('.drow .tag', { hasText: 'Landslides' }).waitFor({ timeout: 3000 }) })
await step('switch to table 4 with the key', async () => { await page.keyboard.press('Escape'); await page.keyboard.press('4'); await page.locator('.tchip.active', { hasText: 'Power' }).waitFor({ timeout: 3000 }) })
await step('drop a pin for staging', async () => {
  await page.locator('.layers .views button', { hasText: 'Drop a pin' }).click()
  const p = await at(-66.1, 18.2)
  await page.mouse.click(p.x, p.y)
  await page.locator('.inspector .add-btn', { hasText: 'Stage here' }).click()
  await page.locator('.kind-staging .drow').first().waitFor({ timeout: 3000 })
})
await page.screenshot({ path: `${out}/flow-1.png` })
await step('release the next advisory (two taps)', async () => { await release(); await page.locator('.round-label', { hasText: 'Round 2' }).waitFor({ timeout: 5000 }) })
await step('decisions ask for review', async () => { await page.locator('.review-banner', { hasText: '2 to review' }).waitFor({ timeout: 3000 }) })
await step('keep Utuado, drop the pin', async () => {
  await page.locator('.drow', { hasText: 'Utuado' }).getByRole('button', { name: 'Keep' }).click()
  await page.locator('.kind-staging .drow').first().getByRole('button', { name: 'Drop' }).click()
  await page.locator('.review-banner').waitFor({ state: 'detached', timeout: 3000 })
})
await step('peek at round 1 from the timeline', async () => { await page.locator('.tl-round').first().click(); await page.locator('.peek-note').waitFor({ timeout: 3000 }); await page.locator('.peek-note button').click() })
await step('ask the data: shelters', async () => { await page.getByRole('tab', { name: 'Ask the data' }).click(); await page.getByRole('button', { name: 'Which shelters need a second look?' }).click(); await page.locator('.lens-result ol.rows li').first().click(); await page.locator('.inspector').waitFor({ timeout: 3000 }) })
await step('add closer look from the list', async () => { await page.locator('.inspector .add-btn', { hasText: 'Closer look' }).click(); await page.locator('.kind-closer .drow').first().waitFor({ timeout: 3000 }) })
await step('write a public message', async () => { await page.locator('.message textarea').fill('Heavy rain could cause landslides in the central mountains from Saturday night. Charge phones and be ready to move if you live below a slope.'); await page.locator('.chk.ok').nth(3).waitFor({ timeout: 2000 }) })
await page.screenshot({ path: `${out}/flow-2.png` })
await step('advance to the reveal', async () => {
  for (let i = 0; i < 4; i++) { await release(); await page.waitForTimeout(300) }
  await page.locator('.reveal h1', { hasText: 'Fiona' }).waitFor({ timeout: 5000 })
  await page.locator('.scoreboard .sb-row').first().waitFor({ timeout: 3000 })
})
await step('points reveal runs, can be skipped, marks the leader', async () => {
  await page.locator('.scoreboard.jackpot .sb-head button', { hasText: 'Skip' }).click({ timeout: 8000 })
  await page.locator('.scoreboard.jackpot.done .sb-row.winner').waitFor({ timeout: 3000 })
  if (await page.locator('.evchip:not(.hit):not(.miss)').count()) throw new Error('unrevealed outcomes after skip')
  await page.waitForTimeout(1200); await idle()
})
await page.screenshot({ path: `${out}/flow-3.png` })
await step('debrief lists the standing decisions', async () => { await page.getByRole('button', { name: 'Go to the debrief' }).click(); await page.locator('.db-cols li', { hasText: 'Utuado' }).waitFor({ timeout: 3000 }) })
await page.screenshot({ path: `${out}/flow-4.png`, fullPage: true })
await step('a reload starts at the opening, then setup offers to resume the saved session', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.intro-title.start').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Skip to setup' }).click()
  await page.locator('.resume-card', { hasText: '3 decisions' }).waitFor({ timeout: 40000 })
  const n = await page.evaluate(() => __landfall.state.session.value.decisions.length); if (n !== 3) throw new Error('decisions after reload: ' + n)
})
console.log(errors.length ? `\n${errors.length} problems: ${JSON.stringify(errors.slice(0, 6))}` : '\nflow passed')
await browser.close()
process.exit(errors.length ? 1 : 0)

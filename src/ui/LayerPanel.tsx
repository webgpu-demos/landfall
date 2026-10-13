import { useState } from 'preact/hooks'
import { layers, setLayer, isReveal, pinMode, type Layers } from '../state'
import { t } from '../i18n'
import { PROB, COMMUNITY, FLOOD_LEVEL, RAIN } from '../theme'
import { fitView, revealLayers } from '../map/MapView'

export function LayerPanel() {
  const L = layers.value
  const [open, setOpen] = useState(false)
  const reveal = isReveal.value
  const rl = revealLayers.value
  const set = (k: keyof typeof rl) => (revealLayers.value = { ...rl, [k]: !rl[k] })

  return (
    <div class={'layers' + (open ? ' open' : '')}>
      <div class="lbar">
        <button class="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 1.5 1.5 5 8 8.5 14.5 5Z M1.5 8 8 11.5 14.5 8 M1.5 11 8 14.5 14.5 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg>
          {t('layers')}
        </button>
        <span class="views">
          <button class="ghost" onClick={() => fitView('region')}>{t('region')}</button>
          <button class="ghost" onClick={() => fitView('pr')}>{t('island')}</button>
          {!reveal && <button class={'ghost' + (pinMode.value ? ' on' : '')} aria-pressed={pinMode.value} onClick={() => (pinMode.value = !pinMode.value)}>{t('dropPin')}</button>}
        </span>
      </div>
      {open && !reveal && (
        <div class="lbody">
          <fieldset>
            <legend>{t('lForecast')}</legend>
            <div class="seg small" role="group" aria-label={t('lWind')}>
              <span class="seg-lbl">{t('lWind')}</span>
              {(['off', '34', '50', '64'] as Layers['wind'][]).map(v => (
                <button aria-pressed={L.wind === v} onClick={() => setLayer('wind', v)}>{v === 'off' ? t('lOff') : v === '34' ? '39+' : v === '50' ? '58+' : '74+'}</button>
              ))}
            </div>
            {L.wind !== 'off' && (
              <div class="ramp" aria-hidden="true">
                {PROB.map(([v, c]) => <span style={{ background: c }} title={`${v}%`} />)}
                <span class="ramp-lbl"><span>5 %</span><span>50 %</span><span>90 %</span></span>
              </div>
            )}
            <Check on={L.cone} set={v => setLayer('cone', v)} label={t('lCone')} hint={t('coneNote')} />
            <Check on={L.ghosts} set={v => setLayer('ghosts', v)} label={t('lGhosts')} />
            <Check on={L.radii} set={v => setLayer('radii', v)} label={t('lRadii')} />
          </fieldset>
          <fieldset>
            <legend>{t('lCommunity')}</legend>
            <select value={L.community} onChange={(e) => setLayer('community', (e.target as HTMLSelectElement).value as Layers['community'])}>
              <option value="off">{t('lOff')}</option>
              <option value="svi">{t('lSvi')}</option>
              <option value="age65">{t('lAge65')}</option>
              <option value="disab">{t('lDisab')}</option>
              <option value="noveh">{t('lNoveh')}</option>
              <option value="empower">{t('lEmpower')}</option>
            </select>
            {L.community !== 'off' && <div class="ramp" aria-hidden="true">{COMMUNITY.map(([, c]) => <span style={{ background: c }} />)}
              <span class="ramp-lbl"><span>{L.community === 'svi' ? '0' : '0 %'}</span><span>{L.community === 'svi' ? '1' : L.community === 'empower' ? '40 / 1,000' : L.community === 'disab' ? '35 %' : '40 %'}</span></span></div>}
          </fieldset>
          <fieldset>
            <legend>{t('lHazards')}</legend>
            <div class="seg small" role="group" aria-label={t('lSurge')}>
              <span class="seg-lbl">{t('lSurge')}</span>
              {(['off', 'c1', 'c2', 'c3', 'c4', 'c5'] as Layers['surge'][]).map(v => (
                <button aria-pressed={L.surge === v} onClick={() => setLayer('surge', v)}>{v === 'off' ? t('lOff') : v.slice(1)}</button>
              ))}
            </div>
            {L.surge !== 'off' && <div class="keyrow"><i style={{ background: '#005ce6' }} />&lt;3 ft <i style={{ background: '#ffff00' }} />3+ <i style={{ background: '#ffaa00' }} />6+ <i style={{ background: '#ff0000' }} />9+ ft</div>}
            <Check on={L.slide} set={v => setLayer('slide', v)} label={t('lSlide')} />
            {L.slide && <div class="keyrow"><i style={{ background: '#ffd580' }} />{t('lOff') && 'High'} <i style={{ background: '#f3807f' }} />Very high <i style={{ background: '#85a4d6' }} />Extreme</div>}
            <Check on={L.roads} set={v => setLayer('roads', v)} label={t('lRoads')} />
          </fieldset>
          <fieldset>
            <legend>{t('lPlaces')}</legend>
            <Check on={L.shelters} set={v => setLayer('shelters', v)} label={t('lShelters')} />
            <Check on={L.health} set={v => setLayer('health', v)} label={t('lHealth')} />
            <Check on={L.clinics} set={v => setLayer('clinics', v)} label={t('lClinics')} />
            <Check on={L.utilities} set={v => setLayer('utilities', v)} label={t('lUtilities')} />
            <Check on={L.transport} set={v => setLayer('transport', v)} label={t('lTransport')} />
            <Check on={L.venues} set={v => setLayer('venues', v)} label={t('lVenues')} />
            <Check on={L.housing} set={v => setLayer('housing', v)} label={t('lHousing')} />
            <Check on={L.responders} set={v => setLayer('responders', v)} label={t('lResponders')} />
          </fieldset>
        </div>
      )}
      {open && reveal && (
        <div class="lbody">
          <Check on={rl.tracks} set={() => set('tracks')} label={t('lTracks')} />
          <Check on={rl.ffw} set={() => set('ffw')} label={t('lFfw')} />
          <Check on={rl.rain} set={() => set('rain')} label={t('lRain')} />
          {rl.rain && <div class="ramp" aria-hidden="true">{RAIN.map(([, c]) => <span style={{ background: c }} />)}<span class="ramp-lbl"><span>0</span><span>28+ in</span></span></div>}
          <Check on={rl.rivers} set={() => set('rivers')} label={t('lRivers')} />
          {rl.rivers && <div class="keyrow">{Object.entries(FLOOD_LEVEL).map(([k, c]) => <><i style={{ background: c }} />{k} </>)}</div>}
          <Check on={rl.ia} set={() => set('ia')} label={t('lIa')} />
        </div>
      )}
    </div>
  )
}

function Check({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label class="check" title={hint}>
      <input type="checkbox" checked={on} onChange={(e) => set((e.target as HTMLInputElement).checked)} /> {label}
    </label>
  )
}

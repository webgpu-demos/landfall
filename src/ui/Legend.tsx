import { layers, isReveal, lang } from '../state'
import { PROB, RAIN, FLOOD_LEVEL } from '../theme'
import { revealLayers } from '../map/MapView'
import { KindGlyph } from './Decisions'

// A small key that is always on: what the colours on the map mean right now.

export function Legend() {
  const L = layers.value
  const es = lang.value === 'es'
  if (isReveal.value) {
    const rl = revealLayers.value
    return (
      <div class="legend">
        <div class="lg-row"><svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke="#C8102E" stroke-width="3.4" stroke-linecap="round" /></svg>{es ? 'Trayectoria real (HURDAT2)' : 'Actual track (HURDAT2)'}</div>
        {rl.tracks && <div class="lg-row"><svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke="#4C6790" stroke-width="1.6" stroke-dasharray="4 3" /></svg>{es ? 'Pronósticos oficiales, ronda a ronda' : 'Official forecasts, round by round'}</div>}
        {rl.ffw && <div class="lg-row"><i class="sw" style={{ background: 'rgba(139,0,0,0.14)', borderColor: '#8B0000' }} />{es ? 'Aviso de inundaciones repentinas' : 'Flash flood warning'} <i class="sw" style={{ background: 'rgba(30,138,58,0.14)', borderColor: '#1E8A3A' }} />{es ? 'Aviso de inundaciones' : 'Flood warning'}</div>}
        {rl.rain && <div class="lg-row lg-ramp"><span>{es ? 'Lluvia medida' : 'Rain measured'}</span>{RAIN.map(([v, c]) => <i style={{ background: c }} title={v + ' in'} />)}<span>28+ in</span></div>}
        {rl.rivers && <div class="lg-row">{Object.entries(FLOOD_LEVEL).map(([k, c]) => <><i class="dot" style={{ background: c }} />{k} </>)}</div>}
      </div>
    )
  }
  const kt = L.wind === '34' ? '39+' : L.wind === '50' ? '58+' : '74+'
  return (
    <div class="legend">
      {L.wind !== 'off' && (
        <div class="lg-row lg-ramp"><span>{es ? `Probabilidad de vientos de ${kt} mph` : `Chance of ${kt} mph winds`}</span>
          {PROB.map(([v, c]) => <i style={{ background: c }} title={v + '%'} />)}<span>90 %</span></div>
      )}
      <div class="lg-row">
        {L.cone && <><svg width="22" height="12"><path d="M1 6 Q8 1 21 2 L21 10 Q8 11 1 6Z" fill="#fff" stroke="#14213D" stroke-width="1.2" /></svg>{es ? 'Cono' : 'Cone'}</>}
        <svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#fff" stroke="#14213D" stroke-width="1.5" /><text x="7" y="10" text-anchor="middle" font-size="8" font-weight="700" fill="#14213D">S</text></svg>{es ? 'Tormenta' : 'Storm'}
        <svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#C8102E" /><text x="7" y="10" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">H</text></svg>{es ? 'Huracán' : 'Hurricane'}
        {L.ghosts && <><svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="#3D4B63" stroke-width="1.4" opacity="0.6" /></svg>{es ? 'Antes' : 'Earlier'}</>}
      </div>
      <div class="lg-row lg-dec">
        <span class="kg-chip"><KindGlyph kind="outreach" /></span>{es ? 'Alcance' : 'Outreach'}
        <span class="kg-chip"><KindGlyph kind="staging" /></span>{es ? 'Suministros' : 'Supplies'}
        <span class="kg-chip"><KindGlyph kind="closer" /></span>{es ? 'De cerca' : 'Closer look'}
        <span class="quiet">{es ? 'en el color de cada mesa' : "in each table's color"}</span>
      </div>
    </div>
  )
}

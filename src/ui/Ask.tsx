import { useState } from 'preact/hooks'
import { lens, session, advNum, peek, selected, activeDecisions, tableById } from '../state'
import { t } from '../i18n'
import { LENSES, QUESTIONS, lensText } from '../lib/lens'
import { flyTo } from '../map/MapView'
import { TableDot } from './common'

export function Ask() {
  const cur = lens.value
  const s = session.value
  const n = advNum.value
  const r = peek.value ?? Math.min(s.round, s.rounds.length - 1)
  const prev = r > 0 ? s.rounds[r - 1] : null
  const [all, setAll] = useState(false)
  const L = LENSES.find(l => l.id === cur)
  const res = L ? L.run(n, prev) : null
  const onBoard = new Map<string, string[]>()
  for (const d of activeDecisions.value) {
    const k = d.target.id
    onBoard.set(k, [...(onBoard.get(k) ?? []), tableById.value[d.table]?.color ?? '#999'])
  }

  return (
    <div class="ask scroll">
      <p class="intro">{t('askIntro')}</p>
      {[1, 2, 3, 4, 5].map(q => (
        <section class="q">
          <h2><span class="qn">{q}</span>{lensText(QUESTIONS[q])}</h2>
          <div class="lenses">
            {LENSES.filter(l => l.q === q).map(l => (
              <button class={'lens' + (cur === l.id ? ' on' : '')} aria-pressed={cur === l.id} onClick={() => { lens.value = cur === l.id ? null : l.id; setAll(false) }}>
                {lensText(l.title)}
              </button>
            ))}
          </div>
          {L && L.q === q && res && (
            <div class="lens-result">
              {res.note && <p class="quote">{res.note}</p>}
              {res.rows.length > 0 && (
                <ol class="rows">
                  {(all ? res.rows : res.rows.slice(0, 8)).map(row => (
                    <li class={selected.value?.id === row.target.id ? 'sel' : ''}>
                      <button onClick={() => { selected.value = row.target; flyTo(row.target) }}>
                        <span class="rname">{row.target.name}{onBoard.get(row.target.id)?.map(c => <TableDot color={c} />)}</span>
                        <span class={'rval' + (row.value.length > 14 ? ' long' : '')}>{row.value}</span>
                        <span class="rdet">{row.detail}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {res.rows.length > 8 && <button class="link" onClick={() => setAll(!all)}>{all ? t('showFewer') : t('showAll', { n: res.rows.length })}</button>}
              <details class="method"><summary>{t('method')}</summary><p>{lensText(L.method)}</p></details>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

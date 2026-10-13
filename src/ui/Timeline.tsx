import { session, peek, isReveal, view, goBack } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { dayTime } from '../lib/format'
import { prStatus } from '../lib/conditions'
import { PR_STATUS_COLOR } from '../theme'

// The status board across the bottom: a time axis from the first round to the last, filled with Puerto Rico's watch
// and warning colour as each round is reached. Future rounds are ticks only: the forecast hasn't been issued yet.

const DAY = 86400e3

export function Timeline() {
  const s = session.value
  const S = data.scenario.value!
  const advs = s.rounds.map(n => S.advisories.find(a => a.num === n)!)
  const reveal = isReveal.value
  const t0 = advs[0].issued - 6 * 3600e3
  const t1 = advs[advs.length - 1].issued + 10 * 3600e3
  const x = (tm: number) => ((tm - t0) / (t1 - t0)) * 100
  const cur = Math.min(s.round, s.rounds.length - 1)
  const shown = peek.value ?? cur
  const reached = reveal ? advs.length : s.round + 1
  // day boundaries (midnight AST = 04:00 UTC)
  const days: number[] = []
  for (let d = Math.ceil((t0 - 4 * 3600e3) / DAY) * DAY + 4 * 3600e3; d < t1; d += DAY) days.push(d)

  return (
    <footer class="timeline" aria-label="Rounds">
      <div class="tl-track">
        {days.map(d => <span class="tl-day" style={{ left: x(d) + '%' }}><span>{new Intl.DateTimeFormat(document.documentElement.lang === 'es' ? 'es-PR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Puerto_Rico' }).format(new Date(d + 3600e3))}</span></span>)}
        {advs.slice(0, reached).map((a, i) => {
          const end = i + 1 < reached ? advs[i + 1].issued : (reveal ? t1 : a.issued + 4 * 3600e3)
          const code = prStatus(a)
          return <span class="tl-seg" style={{ left: x(a.issued) + '%', width: (x(end) - x(a.issued)) + '%', background: code ? PR_STATUS_COLOR[code] : '#DDE3E8' }} />
        })}
        {advs.map((a, i) => (
          <button class={'tl-round' + (i === shown && !reveal ? ' shown' : '') + (i < reached ? ' reached' : ' future') + (i === cur && !reveal ? ' current' : '')}
            style={{ left: x(a.issued) + '%' }} disabled={i >= reached}
            onClick={() => { if (view.value === 'reveal') { if (confirm(t('backToExercise') + '?')) { while (session.value.round > i) goBack() } return } peek.value = i === cur ? null : i }}
            title={i < reached ? `${t('advisory', { n: a.num })}, ${dayTime(a.issued)} AST` : ''}>
            <span class="tl-dot" />
            <span class="tl-lbl"><b>{i + 1}</b>{i < reached && <span>{dayTime(a.issued)}</span>}</span>
          </button>
        ))}
        <span class={'tl-reveal' + (reveal ? ' on' : '')} style={{ left: '100%' }}>{t('reveal')}</span>
      </div>
      <div class="tl-legend">
        {(['TWA', 'TWR', 'HWA', 'HWR'] as const).map(c => <span><i style={{ background: PR_STATUS_COLOR[c] }} />{t(c)}</span>)}
      </div>
    </footer>
  )
}

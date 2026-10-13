import { about, lang } from '../state'
import { data } from '../data'
import { t } from '../i18n'
import { Src } from './common'

// What is real, what is today's, what is computed here, and what is missing. Shown from the session menu and setup.

export function About() {
  if (!about.value) return null
  const es = lang.value === 'es'
  const P = data.places.value, S = data.scenario.value
  const L = (en: string, sp: string) => (es ? sp : en)
  return (
    <div class="drawer-scrim" onClick={(e) => { if (e.target === e.currentTarget) about.value = false }}>
      <section class="drawer about" role="dialog" aria-label={t('about')}>
        <header><h2>{t('about')}</h2><button class="ghost x" onClick={() => (about.value = false)} aria-label={t('close')}>×</button></header>
        <div class="about-body">
          <h3>{L('As issued in September 2022', 'Tal como se emitió en septiembre de 2022')}</h3>
          <ul>
            <li>{L('Every advisory, cone, track, wind radius, watch and warning, and wind speed probability: NOAA National Hurricane Center, Hurricane Fiona (AL072022), advisories 4 to 18.', 'Cada aviso, cono, trayectoria, radio de viento, vigilancia, aviso y probabilidad de viento: Centro Nacional de Huracanes de NOAA, huracán Fiona (AL072022), avisos 4 a 18.')} <Src href="https://www.nhc.noaa.gov/archive/2022/FIONA.shtml" /></li>
            <li>{L('Local impacts text: NWS San Juan hurricane local statements, through the Iowa Environmental Mesonet archive.', 'Texto de impactos locales: comunicados locales del NWS de San Juan, del archivo del Iowa Environmental Mesonet.')} <Src href="https://mesonet.agron.iastate.edu/wx/afos/" /></li>
            <li>{L('What happened: HURDAT2 best track; NHC Tropical Cyclone Report (2023); NWS flood warnings; USGS rain and river gauges; FEMA housing assistance (DR-4671-PR).', 'Lo que pasó: trayectoria HURDAT2; Informe de Ciclón Tropical del NHC (2023); avisos de inundación del NWS; pluviómetros y ríos del USGS; asistencia de vivienda de FEMA (DR-4671-PR).')} <Src href="https://www.nhc.noaa.gov/data/tcr/AL072022_Fiona.pdf" /></li>
          </ul>
          <h3>{L('Today\'s Puerto Rico', 'El Puerto Rico de hoy')}</h3>
          <ul>
            <li>{L('Shelters are the Departamento de la Vivienda\'s 2026 list (the list gives no capacities). Facilities and roads: OpenStreetMap. Housing: HUD. People: CDC/ATSDR SVI 2022 and ACS. Electricity-dependent Medicare users: HHS emPOWER. Flood zones, surge and landslide maps: FEMA, NOAA, USGS.', 'Los refugios son la lista 2026 del Departamento de la Vivienda (sin capacidades). Instalaciones y carreteras: OpenStreetMap. Vivienda: HUD. Personas: CDC/ATSDR SVI 2022 y ACS. Usuarios de Medicare con equipo eléctrico: HHS emPOWER. Zonas inundables, marejada y deslizamientos: FEMA, NOAA, USGS.')}</li>
            <li>{L('These were compiled for Garita, a digital twin of Puerto Rico; this exercise reuses them.', 'Se recopilaron para Garita, un gemelo digital de Puerto Rico; este ejercicio los reutiliza.')} <Src href="https://webgpu-demos.github.io/garita/">Garita</Src></li>
            <li>{L('The storm is 2022\'s; the places are today\'s. A shelter on the 2026 list may not have existed in 2022.', 'La tormenta es de 2022; los lugares son de hoy. Un refugio de la lista 2026 pudo no existir en 2022.')}</li>
          </ul>
          <h3>{L('Computed here (marked on screen)', 'Calculado aquí (marcado en pantalla)')}</h3>
          <ul>
            {P && Object.entries(P.derived).map(([, v]) => <li>{v}</li>)}
            <li>{L('Closest approach: the official forecast points interpolated hourly.', 'Paso más cercano: los puntos del pronóstico oficial interpolados por hora.')}</li>
            <li>{L('Questions for the tables are generated from what changed between advisories; they are prompts, not forecasts.', 'Las preguntas para las mesas se generan a partir de lo que cambió entre avisos; son guías, no pronósticos.')}</li>
          </ul>
          <h3>{L('Not here', 'Lo que no está')}</h3>
          <ul>
            <li>{L('No rainfall forecast map: NHC words the rain for the island as a whole. No shelter capacities, staffing or status. No live data: the exercise runs entirely from files and works offline.', 'No hay mapa de lluvia pronosticada: el NHC describe la lluvia para toda la isla. No hay capacidades, personal ni estado de refugios. No hay datos en vivo: el ejercicio corre desde archivos y funciona sin conexión.')}</li>
          </ul>
          <p class="fine">{S?.built && `Scenario built ${S.built}.`} {data.garita.value && `Garita data ${data.garita.value.seedVersion}.`} {L('An independent demonstrator; not affiliated with NOAA, FEMA or the Government of Puerto Rico, and not for operational use. Map labels: Open Sans (Apache 2.0).', 'Demostrador independiente; sin afiliación con NOAA, FEMA ni el Gobierno de Puerto Rico, y no es para uso operacional. Etiquetas del mapa: Open Sans (Apache 2.0).')}</p>
        </div>
      </section>
    </div>
  )
}

# 72 Hours Before Landfall

*Turning hurricane data into decisions for Puerto Rico.* A tabletop exercise run on one projected map. A hurricane
approaches; each round is one of the National Hurricane Center's real advisories; tables of emergency managers,
health, housing and utility staff decide where to act first, say why, and revisit those choices as the forecast
changes. The storm's name stays hidden until the end, when its actual track and what it did are laid over the
decisions.

**[Open it → webgpu-demos.github.io/landfall](https://webgpu-demos.github.io/landfall/)**

An independent demonstrator. Not affiliated with NOAA, FEMA or the Government of Puerto Rico, and not for
operational use. Built with the lessons and the baked data of [Garita](https://github.com/webgpu-demos/garita).

## The session

| Part | Time | What happens |
|---|---|---|
| Opening | ~1 min | Plays when the app opens on setup (or from setup: *Play the opening*; or any time with `?intro` on the address). Real GOES-16 infrared imagery of the storm forming over the Atlantic, its best track up to the first round, advisory 6's cone reaching Puerto Rico, then down onto the island in 3D: people, shelters and hospitals, electricity-dependent Medicare users, roads on landslide ground. Ends on the title. Space pauses, → jumps to the next line, Esc skips |
| Setup | before | Every visit (and every reload) starts with the opening and then this page, never mid-dashboard: it says how the session works in five steps, starts round 1, or offers to resume a session saved in this browser. Facilitator opens the site on the projector laptop, names the tables (default: municipal emergency management, health and medical, housing and shelters, power, water and roads), picks the rounds, waits for "Saved for offline use" |
| 5 rounds | ~10 min each | Advisories 6, 9, 12, 13, 16: Thu 5 PM (tropical storm watch, 70 h before landfall) to Sun 5 AM (hurricane warning, 10 h). The title's 72 hours is the window; NHC advisories come every 6 hours, and the first one inside it is 70 h out. Each round: headline and "For the tables" prompts, tables decide, one report each |
| Reveal | ~10 min | The storm was Fiona (2022): actual track, landfall, flash flood warnings, measured rain, river crests, FEMA aid, and where each table acted |
| Debrief | ~10 min | An after-action page: the session in five numbers (decisions, reviews as the forecast moved, first action in hours before landfall, standing decisions on target, threat calls naming rain); a map of every decision over the actual track, landfall and measured rain (on-target decisions ringed, dropped ones faded); final points; each decision as a line through the rounds (made, kept, changed, dropped, outcome at landfall); the action list by kind; the five questions and how to say it; public messages. Print, CSV or session file |

Three kinds of decision, from the session abstract: **targeted outreach** (municipios, census tracts, housing),
**supply staging** (airports, seaports, coliseums, or a pin anywhere), and a **closer look** at shelters and critical
facilities. Each carries reasons (wind, flooding rain, landslides, surge, hard to prepare, needs power, could be cut
off, facility at risk), a note and a trigger to revisit. When the next advisory arrives, every standing decision asks
to be kept, changed or dropped, with arrows for what moved at that place: the chance of 39, 58 and 74 mph winds and
when tropical-storm winds arrive.

**The opening** sets the scene without giving the storm away: it shows nothing after the first round (Thursday 5 PM,
advisory 6) and never names the storm. Its story lines are the NHC Tropical Cyclone Report's synoptic history (the
tropical wave off Africa on 7 September, the depression on the 14th, the shear that left its center exposed) and
advisory 6's own words; its numbers come from the same data the exercise uses. Sound is a quiet synthesised bed of
wind and a low drone that follows the mute switch. With reduced motion set, the camera cuts between shots instead of
flying.

**Ask the data** puts five questions to the advisory on screen, each answered with today's data and a stated method:
the hazard and its likelihood; when it arrives and what can't wait; who will find it hardest to prepare or cope; what
could fail or cut people off; what changed and what would change our minds. Each table also drafts the two-sentence
public message it would give, checked for hazard, where, when, how sure and what to do.

**Game feel.** Each table has a limited set of teams (3 outreach teams, 2 supply caches, 2 inspection crews;
dropping a decision frees its team), so tables must choose where to act first. Each round every table makes a
one-tap *threat call*: the biggest threat to people in Puerto Rico, wind, rain and landslides, or storm surge. Every
action gets immediate, understated feedback: points rise off the table's chip with a soft tone, a ring spreads on the
map where a team deploys, and four round goals (threat call, a team deployed, every decision reviewed, a public
message) tick off and close a ring when complete. A full-screen
card announces each new advisory (hours elapsed, the watch or warning, wind, rain and the countdown to tropical-storm
winds), and points for decisions held through it arrive table by table. At the reveal every standing decision flips,
one by one, to a hit or a miss against what happened, and the board re-sorts. The tone is an operations board, not an
arcade: no confetti, trophies or fanfare, since the audience is emergency management professionals. Sounds are
synthesised (Web Audio, no files) and can be muted; motion follows the system's reduced-motion setting.

| Points | Rule |
|---|---|
| During play | +1 per team deployed, +1 for a reason, +1 for a "revisit if" trigger, +1 per advisory a decision is held through, +1 per review (keep, change or drop), +1 per threat call, +3 when all four round goals are met. All knowable at the time |
| On target, +3 at the reveal | per standing decision where the place was hit hard: 15+ in of storm-total rain nearby (inverse-distance mean of the NHC report's stations within 25 km) or a municipio in the top third for FEMA housing aid per household. Supplies: the site stayed usable (no flood zone, surge area, landslide or low-ground flag; a pin, outside the heaviest rain) and lies near people hit hard |
| Right call, +2 at the reveal | per round the table named rain and landslides (the NHC report: flooding rain did the serious damage; surge 1–3 ft; strongest measured wind 68 kt) |

Badges mark early rain calls, first movers, reasoning shown, usable supplies, changing course with the forecast, every
team on target and a three-round streak. The board says what it is: game points against what happened, where
outcomes carry luck.

Keys: `1`–`6` choose the table, `N` release the next advisory (press twice), `T` timer, `P` drop a pin, `M` map only, `Esc` close.
English and Spanish (Puerto Rico; advisory = *advertencia*, warning = *aviso*, watch = *vigilancia*). The session lives
in the browser's storage; save it as a file from the Session menu.

## What is real, what is today's, what is computed

**As issued in September 2022** (Hurricane Fiona, AL072022, advisories 4 to 18):

| What | Source |
|---|---|
| Cone, track, forecast points, coastal watches and warnings | NHC GIS archive, `al072022_5day_NNN.zip` |
| Forecast wind radii (34, 50, 64 kt) | NHC GIS archive, `al072022_fcst_NNN.zip` |
| Wind speed probabilities: map contours and NHC's station table | NHC `YYYYMMDDHH_wsp_120hr5km.zip`; `al072022.wndprb.NNN` |
| Headlines, hazards, rain forecast, key messages | NHC public advisories and discussions |
| Local impacts | NWS San Juan hurricane local statements (Iowa Environmental Mesonet AFOS archive) |
| The opening's satellite loop | GOES-16 ABI L2 Cloud and Moisture Imagery, full disk, band 13 (10.3 µm), hourly 13 Sep 21Z–15 Sep 21Z, NOAA Open Data Dissemination on AWS (`noaa-goes16`); GOES-16 has no imagery 13 Sep 11–21Z |
| What happened | HURDAT2 best track; NHC Tropical Cyclone Report (Pasch, Reinhart and Alaka, 2023), including its Table 3 storm-total rainfall (66 Puerto Rico stations); NWS San Juan flood warning polygons (IEM VTEC archive); USGS gauge height against NWS flood categories; OpenFEMA housing assistance, DR-4671-PR |

**Today's Puerto Rico** (compiled for Garita, reused here): the Departamento de la Vivienda's 2026 shelter list (343,
336 located; no capacities), OpenStreetMap facilities and roads, HUD public and assisted housing, CDC/ATSDR SVI 2022
and ACS, building exposure to FEMA flood zones, NOAA surge and USGS landslide maps, HHS emPOWER counts of Medicare users
of electricity-dependent equipment. The storm is 2022's; the places are today's.

**Computed here, and marked on screen:**
- the chance of wind at a place: the NHC 5-km probability band it falls in (for a municipio, the highest band
  touching it). NHC's own table for named places can read a few points apart; the checks hold them to 10 points
  within 10 km;
- when tropical-storm and hurricane-force winds arrive: NHC's forecast radii interpolated hourly (NHC publishes
  arrival-time graphics of its own; these stand in for them);
- closest approach to Puerto Rico: the official forecast points interpolated hourly;
- roads and bridges exposed to landslides and flooding;
- "For the tables" prompts, generated from what changed between advisories: prompts, not forecasts.

Probability contours are smoothed for drawing (Douglas-Peucker under one 5-km cell, then Chaikin); places are
sampled on NHC's raw shapes.

## Known limits

- **No rainfall forecast map.** NHC words the rain for the island as a whole; the app shows its words and numbers.
- **Flash flood warning counts are a floor.** The IEM archive holds 26 for 16–22 Sep; the NHC report counts about 50
  issued 18–20 Sep.
- **River gauges** are only those with NWS flood categories (72), against today's thresholds; the share above flood
  stage is not comparable with the NHC report's count over all USGS gauges.
- **FEMA housing aid per household** reflects damage and also access to aid.
- **Shelters** are 2026's list and carry no capacity, staffing or status.
- **One facilitator, one screen.** Tables do not enter decisions on their own devices; that needs a shared backend.
- Reviewed under software rendering (SwiftShader) at 1920×1080, 1440×900, 1366×768 and 390×844; not yet on a real
  projector.

## How it is built

A static site on GitHub Pages; nothing costs money (all workflows refuse to run if the repository is private).

```
pipeline/fetch.sh            every raw source, fetched on a GitHub runner (the dev sandbox reaches only GitHub and npm)
pipeline/build_scenario.py   NHC products -> public/data/scenario.json, geo/adv_NNN.json, geo/besttrack.json
pipeline/build_places.py     Garita's places + emPOWER + OSM roads, sampled against every advisory -> places.json
pipeline/build_observed.py   what happened -> observed.json
pipeline/build_basemap.py    shaded relief for Puerto Rico
pipeline/build_intro.py      the opening: GOES-16 loop (reprojected to Web Mercator, cloud coloured), world land, terrain tiles
pipeline/stage.sh            data and Garita's surge/landslide tiles into public/
tests/check_data.py          the compiled data against its sources (watch/warning times, landfall, rain wording,
                             NHC's station table, the TCR's rain maximum ...)
src/                         Vite + Preact + MapLibre GL; state in @preact/signals; strings in src/i18n.ts
src/intro/                   the opening: a timeline that is a pure function of time (seekable for review and tests)
tools/shot.mjs, flow.mjs     screenshots and an end-to-end facilitator walk-through (headless Chromium)
tools/cloudshot.sh           the same, against the deployed site, on a runner
```

Workflows: `data` (manual: fetch, compile, check, commit `public/data` and `public/tiles`, publish its log to the
`data-log` branch), `deploy` (every push to `main`: test, build, publish `dist/` to `gh-pages`), `probe` (run a script
on a runner and bring back what it wrote).

```bash
npm install
npm run build && npx vite preview --port 5291     # http://127.0.0.1:5291
npm test                                          # unit tests
node tools/flow.mjs http://127.0.0.1:5291/ out/   # the facilitator flow, end to end
```

The service worker precaches the whole exercise (about 25 MB: app, data, tiles, fonts, the opening), so a session survives
conference Wi-Fi. A newer version downloads in the background and never reloads the page by itself: the setup page
and the Session menu offer "Reload to use it" (the session is kept); on the opening's title screen, before anything
has started, it is applied at once. The setup page shows which version is running. `?resume` reopens the saved session
directly and `?nointro` skips the opening (for tests and screenshots).

## Credits and licences

NOAA National Hurricane Center and GOES-16 (public domain); NWS San Juan via the Iowa Environmental Mesonet; USGS; FEMA; CDC/ATSDR;
HHS emPOWER; US Census; HUD; Departamento de la Vivienda de Puerto Rico. Roads, facilities and venues © OpenStreetMap
contributors, ODbL. Land: Natural Earth (public domain). Terrain: USGS 3DEP via AWS Terrain Tiles. Garita's compiled
data: see its README. Map labels: Open Sans (Apache 2.0) via OpenMapTiles fonts; interface: Public Sans (OFL), IBM
Plex Mono (OFL). MapLibre GL JS (BSD-3), Preact (MIT).

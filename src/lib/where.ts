// "ABOUT 425 MI...685 KM E OF THE LEEWARD ISLANDS" -> "425 mi (685 km) east of the Leeward Islands"
const DIR: Record<string, [string, string]> = {
  N: ['north', 'norte'], NNE: ['north-northeast', 'nornordeste'], NE: ['northeast', 'nordeste'], ENE: ['east-northeast', 'estenordeste'],
  E: ['east', 'este'], ESE: ['east-southeast', 'estesudeste'], SE: ['southeast', 'sudeste'], SSE: ['south-southeast', 'sursudeste'],
  S: ['south', 'sur'], SSW: ['south-southwest', 'sursudoeste'], SW: ['southwest', 'sudoeste'], WSW: ['west-southwest', 'oestesudoeste'],
  W: ['west', 'oeste'], WNW: ['west-northwest', 'oestenoroeste'], NW: ['northwest', 'noroeste'], NNW: ['north-northwest', 'nornoroeste'],
}
const PLACES: [RegExp, string][] = [[/PUERTO RICO/g, 'Puerto Rico'], [/ST\. CROIX/g, 'St. Croix'], [/U\.S\. VIRGIN ISLANDS/g, 'U.S. Virgin Islands']]

function titleCase(s: string) {
  let out = s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/\bThe\b/g, 'the')
  for (const [re, v] of PLACES) out = out.replace(new RegExp(re.source, 'gi'), v)
  return out.replace(/ (Puerto Rico)$/, ', $1')
}

export function whereLine(lines: string[], es: boolean): string[] {
  return lines.filter(l => l.startsWith('ABOUT')).map(l => {
    const m = l.match(/^ABOUT (\d+) MI\.\.\.(\d+) KM ([NSEW]{1,3}) OF (.*)$/)
    if (!m) return l
    const [, mi, km, d, place] = m
    const dir = DIR[d] ?? [d, d]
    const p = titleCase(place)
    return es ? `${km} km (${mi} mi) al ${dir[1]} de ${p.replace(/^the /i, '')}` : `${mi} mi (${km} km) ${dir[0]} of ${p}`
  })
}

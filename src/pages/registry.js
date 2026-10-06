/*
 * Every page, in teaching order. The landing page, the contents menu and
 * the previous/next links all read from this list.
 */

export const SECTIONS = [
  {
    id: 'field',
    title: 'Force and field',
    spec: '3.7.2.1–2',
    blurb: 'What gravity does, and how a field describes it.',
  },
  {
    id: 'potential',
    title: 'Potential',
    spec: '3.7.2.3',
    blurb: 'Energy per kilogram, and how it shapes the field.',
  },
  {
    id: 'orbits',
    title: 'Orbits',
    spec: '3.7.2.4',
    blurb: 'Satellites, planets and the energy they carry.',
  },
  {
    id: 'measure',
    title: 'Measuring gravity',
    spec: 'Background',
    blurb: 'How G and the mass of the Earth were first found.',
  },
];

export const PAGES = [
  {
    path: '/newton',
    section: 'field',
    spec: '3.7.2.1',
    specTitle: "Newton's law",
    title: "Newton's law of gravitation",
    short: "Newton's law",
    summary:
      'Every mass attracts every other mass. Halve the distance between them and the force becomes four times as big.',
    glyph: 'newton',
  },
  {
    path: '/field-lines',
    section: 'field',
    spec: '3.7.2.2',
    specTitle: 'Gravitational field strength',
    title: 'Field lines and field strength',
    short: 'Field lines',
    summary:
      'Field lines show which way a mass is pulled. How tightly they are packed shows how strongly.',
    glyph: 'lines',
  },
  {
    path: '/equipotentials',
    section: 'potential',
    spec: '3.7.2.3',
    specTitle: 'Gravitational potential',
    title: 'Equipotentials and work',
    short: 'Equipotentials',
    summary:
      'Potential is the work done per kilogram to bring a mass in from infinity. Moving along an equipotential costs nothing.',
    glyph: 'equipotentials',
  },
  {
    path: '/potential-well',
    section: 'potential',
    spec: '3.7.2.3',
    specTitle: 'Gravitational potential',
    title: 'The potential well',
    short: 'Potential well',
    summary:
      'Draw potential as height and every mass sits at the bottom of a well. The steeper the slope, the stronger the field.',
    glyph: 'well',
  },
  {
    path: '/gradient',
    section: 'potential',
    spec: '3.7.2.3',
    specTitle: 'Gravitational potential',
    title: 'Field strength from potential',
    short: 'g from V',
    summary:
      'Field strength is minus the gradient of the potential graph, and a change in potential is the area under the field strength graph.',
    glyph: 'gradient',
  },
  {
    path: '/earth-moon',
    section: 'potential',
    spec: '3.7.2.3',
    specTitle: 'Gravitational potential',
    title: 'Earth and Moon',
    short: 'Earth and Moon',
    summary:
      'Two fields combine. Field strengths add as vectors and potentials add as plain numbers. Where do the pulls cancel?',
    glyph: 'twobody',
  },
  {
    path: '/from-infinity',
    section: 'potential',
    spec: '3.7.2.3–4',
    specTitle: 'Potential and escape velocity',
    title: 'From infinity, and escape',
    short: 'Infinity and escape',
    summary:
      'Potential is zero infinitely far away, so close to a planet it is negative. Launch fast enough and you never come back.',
    glyph: 'infinity',
  },
  {
    path: '/orbits',
    section: 'orbits',
    spec: '3.7.2.4',
    specTitle: 'Orbits of planets and satellites',
    title: 'Circular orbits',
    short: 'Circular orbits',
    summary:
      'Gravity provides the centripetal force. Further out, orbits are slower and longer, and one radius gives exactly one (sidereal) day.',
    glyph: 'orbits',
  },
  {
    path: '/orbital-energy',
    section: 'orbits',
    spec: '3.7.2.4',
    specTitle: 'Orbits of planets and satellites',
    title: 'Orbital energy',
    short: 'Orbital energy',
    summary:
      'A satellite has kinetic and potential energy. A higher orbit is slower, yet it takes energy to get there.',
    glyph: 'energy',
  },
  {
    path: '/cavendish',
    section: 'measure',
    spec: 'Background',
    specTitle: '',
    title: "Cavendish's experiment",
    short: 'Cavendish',
    summary:
      'In 1798 Henry Cavendish measured the pull between lead balls with a twisting wire, and from it found the density of the Earth.',
    glyph: 'cavendish',
  },
  {
    path: '/schiehallion',
    section: 'measure',
    spec: 'Background',
    specTitle: '',
    title: 'Schiehallion',
    short: 'Schiehallion',
    summary:
      'In 1774 a Scottish mountain pulled plumb lines a few seconds of arc aside, and gave the first measurement of the density of the Earth.',
    glyph: 'mountain',
  },
];

/*
 * Specification statements (AQA 7408, 3.7.2) and the pages that show them.
 */
export const SPEC_MAP = [
  { spec: '3.7.2.1', text: 'Gravity as a universal attractive force acting between all matter', pages: ['/newton'] },
  { spec: '3.7.2.1', text: 'F = Gm₁m₂/⁠r² between point masses', pages: ['/newton', '/cavendish'] },
  { spec: '3.7.2.1', text: 'Estimating gravitational forces between objects', pages: ['/newton'] },
  { spec: '3.7.2.2', text: 'Representing a field with field lines', pages: ['/field-lines', '/equipotentials'] },
  { spec: '3.7.2.2', text: 'g = F/⁠m, force per unit mass', pages: ['/field-lines'] },
  { spec: '3.7.2.2', text: 'g = GM/⁠r² in a radial field', pages: ['/field-lines', '/gradient'] },
  { spec: '3.7.2.3', text: 'Potential, zero at infinity; potential difference', pages: ['/equipotentials', '/from-infinity'] },
  { spec: '3.7.2.3', text: 'Work done moving a mass, ΔW = mΔV', pages: ['/equipotentials'] },
  { spec: '3.7.2.3', text: 'Equipotential surfaces; no work along them', pages: ['/equipotentials', '/potential-well'] },
  { spec: '3.7.2.3', text: 'V = −GM/⁠r, and why it is negative', pages: ['/from-infinity', '/gradient'] },
  { spec: '3.7.2.3', text: 'Graphs of g and V against r', pages: ['/gradient', '/earth-moon'] },
  { spec: '3.7.2.3', text: 'g = −ΔV/⁠Δr', pages: ['/gradient', '/potential-well', '/earth-moon'] },
  { spec: '3.7.2.3', text: 'ΔV from the area under a g–r graph', pages: ['/gradient'] },
  { spec: '3.7.2.4', text: 'Orbital speed and period against radius; T² ∝ r³', pages: ['/orbits'] },
  { spec: '3.7.2.4', text: 'Logarithmic plot of T against r', pages: ['/orbits'] },
  { spec: '3.7.2.4', text: 'Energy of an orbiting satellite; total energy', pages: ['/orbital-energy'] },
  { spec: '3.7.2.4', text: 'Escape velocity', pages: ['/from-infinity'] },
  { spec: '3.7.2.4', text: 'Synchronous orbits; low and geostationary satellites', pages: ['/orbits'] },
];

export const pageByPath = (path) => PAGES.find((p) => p.path === path);

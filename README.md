# Gravitational fields

Interactive companion to AQA A-level Physics, section 3.7.2 (Gravitational fields).
Eleven pages, each showing one idea from the chapter, with a landing page and a
specification map.

## Running it

```sh
npm install
npm run dev      # local development server
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Needs Node 18 or later. The only runtime dependencies are React 19 and three.js.

The build uses relative paths (`base: './'`) and hash routing (`#/orbits`), so
`dist/` can be served from any folder, including a GitHub Pages project site,
with no server configuration.

## The pages

| Section | Page | Route | Spec |
| --- | --- | --- | --- |
| Force and field | Newton's law of gravitation | `#/newton` | 3.7.2.1 |
| | Field lines and field strength (3D) | `#/field-lines` | 3.7.2.2 |
| Potential | Equipotentials and work | `#/equipotentials` | 3.7.2.3 |
| | The potential well (3D) | `#/potential-well` | 3.7.2.3 |
| | Field strength from potential | `#/gradient` | 3.7.2.3 |
| | Earth and Moon | `#/earth-moon` | 3.7.2.3 |
| | From infinity, and escape | `#/from-infinity` | 3.7.2.3–4 |
| Orbits | Circular orbits | `#/orbits` | 3.7.2.4 |
| | Orbital energy | `#/orbital-energy` | 3.7.2.4 |
| Measuring gravity | Cavendish's experiment | `#/cavendish` | Background to G |
| | Schiehallion | `#/schiehallion` | Background to g |

The landing page lists every statement in 3.7.2 and the pages that show it.

## Project layout

```
src/
  main.jsx, App.jsx        entry point and hash router
  pages/registry.js        page order, titles, spec references, spec map
  pages/*.jsx              one file per page, plus Home.jsx
  components/Shell.jsx     top bar, contents menu, page layout
  components/ui.jsx        sliders, switches, readouts, key ideas, legends
  components/Plot.jsx      small SVG graphs
  components/Eq.jsx        equation typesetting
  components/Glyph.jsx     contents-page icons
  lib/physics.js           constants (G, Earth, Moon) and orbit helpers
  lib/draw.js              shared canvas drawing (bodies, arrows, labels)
  lib/threeStage.js        three.js renderer with a small orbit camera
  lib/contours.js          marching squares for equipotentials
  lib/useCanvas.js         a resizing, high-DPI 2D canvas hook
  lib/format.jsx           number formatting (standard form, thin spaces)
  styles/global.css        the whole design system
```

To add a page: write `src/pages/YourPage.jsx` using `PageLayout`, add an entry to
`PAGES` in `registry.js`, and map its route in `App.jsx`.

## Models and simplifications

The physics is computed, not animated by hand, but each page simplifies where it
has to. These are also stated on the pages.

- Planets are uniform spheres. Inside them, g ∝ r and V = −GM(3R² − r²)/2R³.
- Field lines (3D page) are radial lines spread evenly over the surface, with the
  number proportional to mass, so the count through a loop falls as 1/r².
- The potential well's marble is moved by the true field, not by rolling.
- Earth and Moon: the bodies are fixed; distances are to scale, the bodies are
  drawn at twice their true size.
- Escape: the launch is vertical, with no air resistance and no planetary spin.
- Orbits are circular and ignore every body except the Earth.
- Orbital energy: the change of orbit is shown as a slow spiral (a gentle,
  continuous burn), always at the circular speed for the current radius.
- Cavendish: a typical reconstruction of the apparatus (158 kg and 0.73 kg balls,
  1.86 m rod, 22.5 cm separation, 7 minute period). The twist is exaggerated on
  screen; the light-spot scale is 5 m away.
- Schiehallion: the mountain's sideways pull is set so that Hutton's figures
  (rock 2500 kg m⁻³, Earth 4500 kg m⁻³) give Maskelyne's 5.8″ at each station.

Constants: G = 6.674 × 10⁻¹¹ N m² kg⁻², M(Earth) = 5.972 × 10²⁴ kg,
R(Earth) = 6371 km, M(Moon) = 7.342 × 10²² kg, Earth–Moon distance 384 400 km,
sidereal day 86 164 s.

## Accessibility

Controls are native inputs and buttons with labels, focus is visible, colour is
never the only signal, and `prefers-reduced-motion` stops the decorative and
time-lapse animations (results are shown directly instead).

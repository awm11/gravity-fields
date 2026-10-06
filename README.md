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

### Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the site and publishes it on every push to
`main` (or by hand from the Actions tab). In the repository's Settings → Pages,
set Source to **GitHub Actions**. Committing a `package-lock.json` makes installs
faster and repeatable.

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
  number proportional to mass. The loop always surrounds a curved patch of
  50 million km² on the sphere of radius r (a spherical cap), so its count is the
  number of lines per 50 million km², which falls as 1/r². The close-up shows a
  13 × 13 patch of lines and a small loop that can be dragged up and down.
- The potential well's marble is moved by the true field, not by rolling. With a
  moon, "Launch into orbit" tries a spread of speeds and directions and uses the
  one whose distance from the body it circles varies least over a lap. "Figure
  of eight" starts at the neutral point at 0.532 (in units of √(GM/R)), 51.85°
  from the line to the planet: found by search, it holds its shape for many laps. At the
  edge of the sheet the marble keeps its speed, which matches √(2(E − V)).
- Field strength from potential: the surface field is set to 9.81 N kg⁻¹ (the
  quoted G, M and R give 9.82), with V = −gR at the surface to match.
- Earth and Moon: the bodies are fixed; distances are to scale, the bodies are
  drawn at twice their true size.
- Escape: the launch is vertical, with no air resistance and no planetary spin.
  Every flight is a time-lapse whose rate is always shown. Flights that come
  back down (and falls from a held height) use one steady rate: at most about
  20 s. Escapes: up to the axis break the rate grows gently, as (r/R)^¼, so the
  probe is still seen to slow; an escape-speed run reaches the break in about
  7 s, then about 1 s more to infinity. Falls from infinity: the same squeezed
  rule beyond the break, then one steady rate inside 10.5 R (about 6 s).
  Beyond the axis break the potential and potential-energy graphs are drawn as
  a flat line at zero.
- Orbits are circular and ignore every body except the Earth. The view is from
  below the South Pole, with a very simple map, so the Earth and a geostationary
  satellite both turn clockwise.
- Orbital energy: the change of orbit is shown as a slow spiral (a gentle,
  continuous burn), always at the circular speed for the current radius.
- Cavendish: a typical reconstruction of the apparatus (158 kg and 0.73 kg balls,
  1.86 m rod, 22.5 cm separation, 7 minute period). The twist is exaggerated on
  screen. The balance is drawn turned 45°, with the mirror fixed along the rod;
  a laser below shines up at it, the reflected beam is drawn at its true angle
  (stopping short), and the spot on a screen 5 m away shows its movement in mm.
  Red arrows are the pulls on the small balls; green arrows their velocities.
  The page shows three pictures, linked from their sources with credits: the
  NIST torsion-balance animation (S. Kelley/NIST), Cavendish's Fig. 1 from
  Phil. Trans. 88 (1798) via the IAU OAE (CC BY 4.0), and the 1798 drawing on
  Wikimedia Commons (public domain). To host copies yourself, save them in
  `public/media/` and change the `src` values in `PICTURES` in `Cavendish.jsx`.
- Schiehallion: the mountain's sideways pull is set so that Hutton's figures
  (rock 2500 kg m⁻³, Earth 4500 kg m⁻³) give Maskelyne's 5.8″ at each station.

Constants: G = 6.674 × 10⁻¹¹ N m² kg⁻², M(Earth) = 5.972 × 10²⁴ kg,
R(Earth) = 6371 km, M(Moon) = 7.342 × 10²² kg, Earth–Moon distance 384 400 km,
sidereal day 86 164 s.

## Layout

Each page keeps its controls and readouts in the side panel, which stays in view
as the page scrolls. Explanation (Key ideas, Try this, and any
`<Section below>`) is laid out under the stage. On phones everything stacks:
stage, controls, then explanation. The top bar hides itself only on windows
less than 860 px tall.

## Branding

The logo at the top left is `public/favicon.svg` (also the tab icon); it links to
https://awm11.github.io/ and tips to the right when pointed at. Every page ends
with a footer holding the Buy me a coffee button (`src/components/BuyMeCoffee.jsx`)
at the bottom right.

## Accessibility

Controls are native inputs and buttons with labels, focus is visible, colour is
never the only signal, and `prefers-reduced-motion` stops the decorative and
time-lapse animations (results are shown directly instead).

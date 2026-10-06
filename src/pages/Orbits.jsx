import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, Switch, TryThis } from '../components/ui.jsx';
import { Eq, Frac, Nw, V } from '../components/Eq.jsx';
import { Plot } from '../components/Plot.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, clamp, orbitalPeriod, orbitalSpeed, prefersReducedMotion, radiusForPeriod } from '../lib/physics.js';
import { duration, grouped, sci, sig } from '../lib/format.jsx';

/*
 * A satellite in a circular orbit, seen from below the South Pole, drawn
 * to scale, so the Earth (with a simple map) turns clockwise and so does a
 * satellite orbiting the same way. The Earth turns once per sidereal day; a
 * marked ground station turns with it. Time is sped up so that whichever is
 * quicker, one orbit or one turn of the Earth, takes about five seconds.
 */

const GEO_R = radiusForPeriod(EARTH.M, EARTH.day); // 42 164 km

// A real place on the equator for the ground station: Quito, Ecuador
// (0.2° S, 78.5° W), on land and almost exactly on the equator.
const STATION = { name: 'Quito', lon: -78.5, lat: -0.2 };
const STATION_A = (STATION.lon * Math.PI) / 180;

const PRESETS = [
  { key: 'iss', label: 'ISS', name: 'International Space Station', r: EARTH.R + 408e3 },
  { key: 'gps', label: 'GPS', name: 'GPS satellite', r: EARTH.R + 20200e3 },
  { key: 'geo', label: 'Geostationary', name: 'Geostationary satellite', r: GEO_R },
  { key: 'moon', label: 'Moon', name: 'The Moon', r: 3.844e8 },
];

const LOG_MIN = Math.log10(EARTH.R * 1.05);
const T_ISS = orbitalPeriod(EARTH.M, PRESETS[0].r);
const SCREEN_PERIOD_ISS = 3; // s on screen for one ISS orbit
const SCREEN_PERIOD_MOON = 60; // s on screen for one orbit of the Moon
const SCREEN_POWER =
  Math.log(SCREEN_PERIOD_MOON / SCREEN_PERIOD_ISS) / Math.log(orbitalPeriod(EARTH.M, PRESETS[3].r) / T_ISS);
const LOG_MAX = Math.log10(4.2e8);
const K = (4 * Math.PI * Math.PI) / (G * EARTH.M); // T²/r³

export default function Orbits({ page }) {
  const [logR, setLogR] = useState(Math.log10(PRESETS[0].r));
  const [showStation, setShowStation] = useState(true);
  const sim = useRef({ t: 0, last: null, sat: 0.9, wasGeo: false });
  const still = prefersReducedMotion();

  const r = 10 ** logR;
  const v = orbitalSpeed(EARTH.M, r);
  const T = orbitalPeriod(EARTH.M, r);
  const altitude = r - EARTH.R;
  const isGeo = Math.abs(T - EARTH.day) / EARTH.day < 0.01;
  const preset = PRESETS.find((p) => Math.abs(Math.log10(p.r) - logR) < 0.002);
  // seconds of orbit per second on screen
  // Time-lapse: an orbit on screen takes 3 s at the ISS and longer further
  // out, as a power of the real period chosen so the Moon takes 60 s (about
  // 8 s for GPS and 12 s for a geostationary orbit). warp is real seconds
  // per second.
  const screenPeriod = SCREEN_PERIOD_ISS * (T / T_ISS) ** SCREEN_POWER;
  const warp = T / screenPeriod;

  const { canvasRef } = useCanvas(
    (ctx, w, h, now) => {
      const s = sim.current;
      const dt = s.last == null ? 0 : Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      if (!still) {
        s.t += dt * warp;
        s.sat += ((2 * Math.PI) / T) * dt * warp;
      }
      // on reaching geostationary, start the satellite above the station
      if (isGeo && !s.wasGeo) s.sat = (2 * Math.PI * s.t) / EARTH.day + STATION_A;
      s.wasGeo = isGeo;
      const spin = (2 * Math.PI * s.t) / EARTH.day;

      const cx = w / 2;
      const cy = h / 2;
      const scale = (Math.min(w, h) * 0.4) / r; // px per metre, so the orbit fills the view
      const earthPx = EARTH.R * scale;

      // the stars drift in a little as the view zooms out to bigger orbits
      stars(ctx, w, h, Math.round((w * h) / 5000), 5, (10 ** LOG_MIN / r) ** 0.12);

      // the orbit
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = isGeo ? COLORS.brass : COLORS.text3;
      ctx.lineWidth = isGeo ? 1.6 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // the Earth, turning (clockwise, seen from below the South Pole)
      body(ctx, cx, cy, Math.max(earthPx, 2.5), 'earth');
      if (earthPx > 14) southMap(ctx, cx, cy, earthPx, spin);

      // ground station and the line straight up from it
      if (showStation) {
        const a = spin + STATION_A;
        const rho = Math.max(earthPx * ((90 + STATION.lat) / 90), 2.5);
        const gx = cx + Math.cos(a) * rho;
        const gy = cy + Math.sin(a) * rho;
        ctx.save();
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(227,178,91,0.55)';
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(cx + Math.cos(a) * Math.hypot(w, h), cy + Math.sin(a) * Math.hypot(w, h));
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = COLORS.brass;
        ctx.beginPath();
        ctx.arc(gx, gy, 4, 0, Math.PI * 2);
        ctx.fill();
        if (earthPx > 40) {
          label(ctx, STATION.name, gx - Math.cos(a) * 22, gy - Math.sin(a) * 22, { align: 'center', size: 12, color: COLORS.brass });
        }
      }

      // the satellite, its velocity, and the pull of gravity on it
      const sa = s.sat; // clockwise on screen, the same way as the Earth turns
      const sx = cx + Math.cos(sa) * r * scale;
      const sy = cy + Math.sin(sa) * r * scale;
      const tx = -Math.sin(sa);
      const ty = Math.cos(sa);
      arrow(ctx, sx, sy, sx + tx * 58, sy + ty * 58, COLORS.text, { width: 2, head: 9 });
      label(ctx, 'v', sx + tx * 70, sy + ty * 70, { font: SERIF, italic: true, size: 16, color: COLORS.text, align: 'center' });
      arrow(ctx, sx, sy, sx - Math.cos(sa) * 44, sy - Math.sin(sa) * 44, COLORS.coral, { width: 2.4, head: 10 });
      label(ctx, 'F', sx - Math.cos(sa) * 56, sy - Math.sin(sa) * 56, {
        font: SERIF,
        italic: true,
        size: 16,
        color: COLORS.coral,
        align: 'center',
      });
      body(ctx, sx, sy, preset?.key === 'moon' ? 7 : 5, preset?.key === 'moon' ? 'moon' : 'sat');

      // scale bar
      const barKm = niceKm((w * 0.2) / scale / 1000);
      const barPx = barKm * 1000 * scale;
      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w - 16 - barPx, h - 18);
      ctx.lineTo(w - 16, h - 18);
      ctx.moveTo(w - 16 - barPx, h - 22);
      ctx.lineTo(w - 16 - barPx, h - 14);
      ctx.moveTo(w - 16, h - 22);
      ctx.lineTo(w - 16, h - 14);
      ctx.stroke();
      label(ctx, `${grouped(barKm)} km`, w - 16 - barPx / 2, h - 32, { align: 'center', size: 12, color: COLORS.text3 });

      if (isGeo) {
        label(ctx, 'Geostationary: it stays above the same point on the Earth', 14, h - 18, { size: 13, color: COLORS.brass });
      }
    },
    [r, showStation, isGeo, warp, still],
    { animate: true },
  );

  const legend = (
    <Legend
      items={[
        { label: 'Velocity', color: COLORS.text, kind: 'arrow' },
        { label: 'Gravitational force', color: COLORS.coral, kind: 'arrow' },
        ...(showStation ? [{ label: 'Ground station, Quito', color: COLORS.brass, kind: 'dot' }] : []),
      ]}
    />
  );

  const stage = (
    <>
      <canvas ref={canvasRef} role="img" aria-label={`A satellite orbiting the Earth at radius ${grouped(r / 1000)} km, period ${duration(T)}`} />
      <p className="stage-note">Seen from below the South Pole, to scale.</p>
      <div className="speed-box" aria-live="polite">
        <span className="speed-box-rate">{grouped(Number(warp.toPrecision(3)))}× speed</span>
        <span className="speed-box-note">1 second here is {duration(warp)} of real time</span>
      </div>
    </>
  );

  // log–log plot of T against r
  const lgT = (lgr) => 1.5 * lgr + 0.5 * Math.log10(K);
  const X0 = 6.7;
  const X1 = 8.8;
  const below = (
    <div className="figures">
      <div className="figure">
        <div className="figure-head">
          <h3>Period against radius, on log scales</h3>
          <p>A straight line of gradient 1.5, because <Nw><V>T</V>² ∝ <V>r</V>³</Nw>.</p>
        </div>
        <Plot
          x={[X0, X1]}
          y={[3.4, 6.6]}
          height={250}
          xTicks={[7, 7.5, 8, 8.5]}
          yTicks={[3.5, 4, 4.5, 5, 5.5, 6, 6.5]}
          xLabel="lg (r / m)"
          yLabel="lg (T / s)"
          onPointer={(xv) => setLogR(clamp(xv, LOG_MIN, LOG_MAX))}
          ariaLabel="Log of period against log of radius: a straight line of gradient 1.5"
        >
          {({ sx, sy }) => (
            <>
              <line x1={sx(X0)} y1={sy(lgT(X0))} x2={sx(X1)} y2={sy(lgT(X1))} stroke={COLORS.sky} strokeWidth="2" />
              {/* gradient triangle, above the line and clear of the labels */}
              <path
                d={`M${sx(7.85)},${sy(lgT(7.85))} L${sx(7.85)},${sy(lgT(8.45))} L${sx(8.45)},${sy(lgT(8.45))}`}
                fill="none"
                stroke={COLORS.text3}
                strokeDasharray="3 3"
              />
              <text className="plot-note" x={sx(7.85) - 6} y={sy((lgT(7.85) + lgT(8.45)) / 2)} textAnchor="end" dominantBaseline="middle">
                0.9
              </text>
              <text className="plot-note" x={sx(8.15)} y={sy(lgT(8.45)) - 7} textAnchor="middle">
                0.6
              </text>
              <line x1={sx(X0)} x2={sx(X1)} y1={sy(Math.log10(EARTH.day))} y2={sy(Math.log10(EARTH.day))} stroke={COLORS.brass} strokeOpacity="0.4" strokeDasharray="2 4" />
              <text className="plot-note" x={sx(X0) + 6} y={sy(Math.log10(EARTH.day)) - 6} style={{ fill: COLORS.brass }}>
                one (sidereal) day
              </text>
              {PRESETS.map((p) => (
                <g key={p.key}>
                  <circle cx={sx(Math.log10(p.r))} cy={sy(lgT(Math.log10(p.r)))} r="4" fill={COLORS.deep} stroke={COLORS.sky} strokeWidth="1.6" />
                  <text className="plot-note" x={sx(Math.log10(p.r)) + 8} y={sy(lgT(Math.log10(p.r))) + 14}>
                    {p.label}
                  </text>
                </g>
              ))}
              <circle cx={sx(logR)} cy={sy(lgT(logR))} r="6.5" fill={COLORS.brass} />
            </>
          )}
        </Plot>
      </div>
      <div className="figure">
        <div className="figure-head">
          <h3>Four real orbits</h3>
          <p>Choose one to show it.</p>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Orbit</th>
              <th scope="col">Radius</th>
              <th scope="col">Speed</th>
              <th scope="col">Period</th>
            </tr>
          </thead>
          <tbody>
            {PRESETS.map((p) => (
              <tr key={p.key} className={preset?.key === p.key ? 'is-on' : ''}>
                <th scope="row">
                  <button type="button" onClick={() => setLogR(Math.log10(p.r))}>
                    {p.name}
                  </button>
                </th>
                <td>{grouped(p.r / 1000)} km</td>
                <td>{sig(orbitalSpeed(EARTH.M, p.r) / 1000, 3)} km s⁻¹</td>
                <td>{duration(orbitalPeriod(EARTH.M, p.r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="plot-caption">
          The Moon&rsquo;s real period is 27.3 days. The model ignores the Moon&rsquo;s pull on the Earth and the Sun&rsquo;s on both.
        </p>
      </div>
    </div>
  );

  const panel = (
    <>
      <Section title="Choose an orbit">
        <Controls>
          <Segmented
            label="Real orbits"
            value={preset?.key}
            onChange={(key) => setLogR(Math.log10(PRESETS.find((p) => p.key === key).r))}
            options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
          />
          <Slider
            label="Orbit radius r (log scale)"
            value={logR}
            min={LOG_MIN}
            max={LOG_MAX}
            step={0.001}
            onChange={setLogR}
            display={`${grouped(r / 1000)} km`}
            marks={[{ value: Math.log10(GEO_R), label: 'geostationary' }]}
          />
          <Switch label="Show a ground station" checked={showStation} onChange={setShowStation} />
        </Controls>
      </Section>

      <Section title="This orbit">
        <Readouts>
          <Readout label="Height above the surface" value={grouped(altitude / 1000)} unit="km" />
          <Readout label="Radius r" value={sci(r)} unit="m" />
          <Readout label="Speed v" value={sig(v / 1000, 3)} unit="km s⁻¹" tone={COLORS.text} />
          <Readout label="Period T" value={duration(T)} tone={isGeo ? COLORS.brass : undefined} />
          <Readout label="Field strength there" value={sig((G * EARTH.M) / (r * r), 3)} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="T² / r³" value={sci((T * T) / r ** 3)} unit="s² m⁻³" />
          <Readout label="One orbit on screen takes" value={sig(screenPeriod, 2)} unit="s" wide />
        </Readouts>
      </Section>

      <Section title="Why T² ∝ r³">
        <p>Gravity provides the centripetal force:</p>
        <Eq block>
          <Nw><Frac n={<><V>GMm</V></>} d={<><V>r</V>²</>} /> = <Frac n={<><V>mv</V>²</>} d={<V>r</V>} /></Nw> <Nw>⇒&nbsp; <V>v</V> = √(<V>GM</V>/<V>r</V>)</Nw>
        </Eq>
        <p>One orbit is <Nw>2π<V>r</V></Nw> long, so</p>
        <Eq block>
          <Nw><V>T</V> = <Frac n={<>2π<V>r</V></>} d={<V>v</V>} /></Nw> <Nw>⇒&nbsp; <V>T</V>² = <Frac n={<>4π²</>} d={<V>GM</V>} /> <V>r</V>³</Nw>
        </Eq>
        <p>
          The satellite&rsquo;s mass cancels: any object at this radius orbits at the same speed.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          Further out, orbits are slower and take longer: <Nw><V>v</V> ∝ 1/√<V>r</V></Nw> and <Nw><V>T</V> ∝ <V>r</V><sup>3/2</sup></Nw>.
        </li>
        <li>
          A synchronous orbit has a period equal to the time the planet takes to turn once. For
          the Earth that is <Nw>23 h 56 min</Nw>, at a radius of 42 200 km.
        </li>
        <li>
          A geostationary satellite is in a synchronous orbit over the equator, moving the same
          way as the Earth turns. It stays above one point, so dishes on the ground can point at
          it without moving: ideal for television and weather pictures.
        </li>
        <li>
          Low orbits, a few hundred kilometres up, take about 90 minutes. They are close enough
          for detailed imaging, but each satellite is overhead only briefly.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Start at the ISS and quadruple the radius. By what factor does the period grow?</li>
        <li>Drag the radius until the ground station stays under the satellite. What radius is that?</li>
        <li>Read the gradient of the log–log graph. Why does it not depend on the mass of the Earth?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="top" below={below} panel={panel} notesWide />;
}

/*
 * A very simple map of the southern hemisphere, as seen from below the
 * South Pole: an azimuthal projection centred on the pole, with the equator
 * at the rim. Longitude runs clockwise on screen (east is clockwise from
 * below), and the whole map turns by `spin`.
 * Outlines are rough [longitude, latitude] pairs in degrees.
 */
const LAND = [
  // Antarctica
  [[-180, -78], [-150, -76], [-120, -73], [-90, -72], [-70, -68], [-60, -63], [-56, -64], [-58, -70], [-45, -77], [-30, -76], [-20, -72],
    [0, -70], [30, -69], [60, -67], [90, -66], [120, -66], [150, -68], [165, -72], [180, -78]],
  // Australia
  [[113, -22], [114, -34], [117, -35], [123, -34], [131, -31.5], [135, -34], [138, -35], [140, -38], [146, -39], [150, -37], [153, -32],
    [153, -25], [146, -19], [142, -11], [141, -13], [136, -12], [130, -12], [126, -14], [122, -18], [114, -22]],
  // Tasmania
  [[145, -40.8], [148.3, -40.9], [148, -43], [146, -43.6]],
  // New Zealand
  [[166.5, -46], [169, -46.6], [174.3, -41.6], [172.7, -40.5]],
  [[172.7, -34.5], [175.3, -37], [178.5, -37.7], [175.2, -41.6], [174.5, -39]],
  // South America, south of the equator
  [[-80, 0], [-81, -5], [-77, -12], [-71, -18], [-70.3, -25], [-71.5, -30], [-73.5, -38], [-74, -45], [-75.5, -50], [-72.5, -54], [-68, -55.5],
    [-66, -55], [-68.5, -52], [-66, -48], [-65, -45], [-63.5, -42], [-62, -39], [-57.5, -38], [-57, -35], [-53, -34], [-48.5, -28], [-48, -25],
    [-41, -22], [-39, -15], [-35, -8], [-35, -5], [-40, -3], [-50, 0]],
  // Africa, south of the equator
  [[9, 0], [9.3, -1], [12, -6], [13.5, -12], [12, -17], [15, -27], [18, -31], [18.4, -34.3], [20, -34.8], [25, -34], [28, -33], [31, -29.5],
    [32.8, -26], [35.3, -24], [35, -20], [39.5, -15], [40.3, -10], [39.2, -5], [42, 0]],
  // Madagascar
  [[44, -25], [47.2, -25], [50.4, -15.5], [49.3, -12], [44.2, -16.5]],
];

function southMap(ctx, cx, cy, R, spin) {
  const toXY = ([lon, lat]) => {
    const rho = (R * (90 + lat)) / 90;
    const a = (lon * Math.PI) / 180 + spin;
    return [cx + Math.cos(a) * rho, cy + Math.sin(a) * rho];
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  // a faint graticule: latitude circles and meridians every 30°
  ctx.strokeStyle = 'rgba(232,236,245,0.14)';
  ctx.lineWidth = 1;
  for (const lat of [-60, -30]) {
    ctx.beginPath();
    ctx.arc(cx, cy, (R * (90 + lat)) / 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const [x, y] = toXY([lon, 0]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  // land: each edge is followed in small steps of latitude and longitude,
  // so edges along the equator follow the rim instead of cutting across
  LAND.forEach((shape, i) => {
    ctx.beginPath();
    shape.forEach((pt, k) => {
      const prev = shape[(k + shape.length - 1) % shape.length];
      if (k === 0) {
        ctx.moveTo(...toXY(pt));
        return;
      }
      for (let j = 1; j <= 8; j++) {
        ctx.lineTo(...toXY([prev[0] + ((pt[0] - prev[0]) * j) / 8, prev[1] + ((pt[1] - prev[1]) * j) / 8]));
      }
    });
    const first = shape[0];
    const last = shape[shape.length - 1];
    // (Antarctica wraps right round: its ends meet at ±180°, so no closing edge)
    for (let j = 1; j <= 16 && Math.abs(first[0] - last[0]) < 359; j++) {
      ctx.lineTo(...toXY([last[0] + ((first[0] - last[0]) * j) / 16, last[1] + ((first[1] - last[1]) * j) / 16]));
    }
    ctx.closePath();
    ctx.fillStyle = i === 0 ? 'rgba(236,242,248,0.92)' : 'rgba(142,178,104,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(9,13,25,0.35)';
    ctx.stroke();
  });
  ctx.restore();
  // the South Pole
  ctx.fillStyle = COLORS.deep;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/** A round number of km for the scale bar. */
function niceKm(km) {
  const mag = 10 ** Math.floor(Math.log10(km));
  const n = km / mag;
  return (n < 2 ? 1 : n < 5 ? 2 : 5) * mag;
}

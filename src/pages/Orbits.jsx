import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, Switch, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot } from '../components/Plot.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, clamp, orbitalPeriod, orbitalSpeed, prefersReducedMotion, radiusForPeriod } from '../lib/physics.js';
import { duration, grouped, sci, sig } from '../lib/format.jsx';

/*
 * A satellite in a circular orbit, seen from above the North Pole, drawn
 * to scale. The Earth turns once per sidereal day; a marked ground station
 * turns with it. Time is sped up so that whichever is quicker, one orbit
 * or one turn of the Earth, takes about five seconds.
 */

const GEO_R = radiusForPeriod(EARTH.M, EARTH.day); // 42 164 km

const PRESETS = [
  { key: 'iss', label: 'ISS', name: 'International Space Station', r: EARTH.R + 408e3 },
  { key: 'gps', label: 'GPS', name: 'GPS satellite', r: EARTH.R + 20200e3 },
  { key: 'geo', label: 'Geostationary', name: 'Geostationary satellite', r: GEO_R },
  { key: 'moon', label: 'Moon', name: 'The Moon', r: 3.844e8 },
];

const LOG_MIN = Math.log10(EARTH.R * 1.05);
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
  const warp = Math.min(T, EARTH.day) / 5;

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
      if (isGeo && !s.wasGeo) s.sat = (2 * Math.PI * s.t) / EARTH.day + 0.9;
      s.wasGeo = isGeo;
      const spin = (2 * Math.PI * s.t) / EARTH.day;

      const cx = w / 2;
      const cy = h / 2;
      const scale = (Math.min(w, h) * 0.4) / r; // px per metre, so the orbit fills the view
      const earthPx = EARTH.R * scale;

      stars(ctx, w, h, Math.round((w * h) / 5000), 5);

      // the orbit
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = isGeo ? COLORS.brass : COLORS.text3;
      ctx.lineWidth = isGeo ? 1.6 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // the Earth, turning (anticlockwise, seen from above the North Pole)
      body(ctx, cx, cy, Math.max(earthPx, 2.5), 'earth');
      if (earthPx > 14) {
        // a few meridians so its turning shows
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, earthPx, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(232,236,245,0.18)';
        for (let k = 0; k < 6; k++) {
          const a = -spin + (k * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * earthPx, cy + Math.sin(a) * earthPx);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ground station and the line straight up from it
      if (showStation) {
        const a = -spin - 0.9;
        const gx = cx + Math.cos(a) * Math.max(earthPx, 2.5);
        const gy = cy + Math.sin(a) * Math.max(earthPx, 2.5);
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
      }

      // the satellite, its velocity, and the pull of gravity on it
      const sa = -s.sat;
      const sx = cx + Math.cos(sa) * r * scale;
      const sy = cy + Math.sin(sa) * r * scale;
      const tx = Math.sin(sa);
      const ty = -Math.cos(sa);
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
      label(ctx, `${grouped(barKm)} km`, w - 16 - barPx / 2, h - 32, { align: 'center', size: 12, color: COLORS.text3 });

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
        ...(showStation ? [{ label: 'Ground station', color: COLORS.brass, kind: 'dot' }] : []),
      ]}
    />
  );

  const stage = (
    <>
      <canvas ref={canvasRef} role="img" aria-label={`A satellite orbiting the Earth at radius ${grouped(r / 1000)} km, period ${duration(T)}`} />
      <p className="stage-note">
        Seen from above the North Pole, to scale. 1 second here is {duration(warp)} of real time.
      </p>
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
          <p>A straight line of gradient 1.5, because <V>T</V>² ∝ <V>r</V>³.</p>
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
                one day
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
                <td>{grouped(p.r / 1000)} km</td>
                <td>{sig(orbitalSpeed(EARTH.M, p.r) / 1000, 3)} km s⁻¹</td>
                <td>{duration(orbitalPeriod(EARTH.M, p.r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="plot-caption">
          The Moon&rsquo;s real period is 27.3 days. The model ignores the Moon&rsquo;s pull on the Earth and the Sun&rsquo;s on both.
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
            display={`${grouped(r / 1000)} km`}
            marks={[{ value: Math.log10(GEO_R), label: 'geostationary' }]}
          />
          <Switch label="Show a ground station" checked={showStation} onChange={setShowStation} />
        </Controls>
      </Section>

      <Section title="This orbit">
        <Readouts>
          <Readout label="Height above the surface" value={grouped(altitude / 1000)} unit="km" />
          <Readout label="Radius r" value={sci(r)} unit="m" />
          <Readout label="Speed v" value={sig(v / 1000, 3)} unit="km s⁻¹" tone={COLORS.text} />
          <Readout label="Period T" value={duration(T)} tone={isGeo ? COLORS.brass : undefined} />
          <Readout label="Field strength there" value={sig((G * EARTH.M) / (r * r), 3)} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="T² / r³" value={sci((T * T) / r ** 3)} unit="s² m⁻³" />
        </Readouts>
      </Section>

      <Section title="Why T² ∝ r³">
        <p>Gravity provides the centripetal force:</p>
        <Eq block>
          <Frac n={<><V>GMm</V></>} d={<><V>r</V>²</>} /> = <Frac n={<><V>mv</V>²</>} d={<V>r</V>} /> &nbsp;⇒&nbsp; <V>v</V> = √(<V>GM</V>/<V>r</V>)
        </Eq>
        <p>One orbit is 2π<V>r</V> long, so</p>
        <Eq block>
          <V>T</V> = <Frac n={<>2π<V>r</V></>} d={<V>v</V>} /> &nbsp;⇒&nbsp; <V>T</V>² = <Frac n={<>4π²</>} d={<V>GM</V>} /> <V>r</V>³
        </Eq>
        <p>
          The satellite&rsquo;s mass cancels: any object at this radius orbits at the same speed.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          Further out, orbits are slower and take longer: <V>v</V> ∝ 1/√<V>r</V> and <V>T</V> ∝ <V>r</V>
          <sup>3/2</sup>.
        </li>
        <li>
          A synchronous orbit has a period equal to the time the planet takes to turn once. For
          the Earth that is 23 h 56 min, at a radius of 42 200 km.
        </li>
        <li>
          A geostationary satellite is in a synchronous orbit over the equator, moving the same
          way as the Earth turns. It stays above one point, so dishes on the ground can point at
          it without moving: ideal for television and weather pictures.
        </li>
        <li>
          Low orbits, a few hundred kilometres up, take about 90 minutes. They are close enough
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

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="top" below={below} panel={panel} />;
}

/** A round number of km for the scale bar. */
function niceKm(km) {
  const mag = 10 ** Math.floor(Math.log10(km));
  const n = km / mag;
  return (n < 2 ? 1 : n < 5 ? 2 : 5) * mag;
}

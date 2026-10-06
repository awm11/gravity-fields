import { useEffect, useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { useCanvas, localPoint } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, MOON, clamp, escapeSpeed, prefersReducedMotion } from '../lib/physics.js';
import { duration, sig } from '../lib/format.jsx';

/*
 * One straight line out from a planet, all the way to infinity.
 *
 * Distances r are in planet radii. Out to 10.5 R the axis is linear; past
 * the break it is squeezed so that infinity fits on the page:
 *   x = 11.5 − 1/(r − 9.5), which meets the linear part smoothly at
 *   r = 10.5 and reaches 11.5 as r → ∞.
 *
 * "In from infinity": a probe is lowered slowly (no kinetic energy), so the
 * work done on it by whatever lowers it is exactly mΔV.
 * "Launch": a probe fired straight up. Total energy E = KE + PE decides
 * whether it comes back.
 */

const BREAK = 10.5;
const X_INF = 11.5;
const PROBE_MASS = 1000; // kg
const LEFT = 14 + 58; // canvas inset that matches the graph's left edge
const RIGHT = 14 + 14;

const xFromR = (r) => (r <= BREAK ? r : X_INF - 1 / (r - (BREAK - 1)));
const rFromX = (x) => (x <= BREAK ? x : x >= X_INF - 1e-6 ? Infinity : BREAK - 1 + 1 / (X_INF - x));

const PLANETS = {
  earth: { name: 'Earth', M: EARTH.M, R: EARTH.R, kind: 'earth' },
  moon: { name: 'Moon', M: MOON.M, R: MOON.R, kind: 'moon' },
  mars: { name: 'Mars', M: 6.417e23, R: 3.3895e6, kind: 'mars' },
};

const X_TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, X_INF];
const xFormat = (v) => (v === X_INF ? '∞' : `${v}`);

export default function FromInfinity({ page }) {
  const [mode, setMode] = useState('lower');
  const [planetKey, setPlanetKey] = useState('earth');
  const planet = PLANETS[planetKey];
  const vEsc = escapeSpeed(planet.M, planet.R);

  // lowering in from infinity
  const [xLower, setXLower] = useState(X_INF);
  const [lowering, setLowering] = useState(false);
  // launching
  const [speed, setSpeed] = useState(Math.round((vEsc * 0.8) / 100) / 10); // km/s
  const [flight, setFlight] = useState({ r: 1, v: 0, t: 0, running: false, rMax: 1, outcome: null });
  const dragging = useRef(false);

  const GM = G * planet.M;
  const pe = (r) => (-GM * PROBE_MASS) / (r * planet.R); // J, r in planet radii
  const Vof = (r) => -GM / (r * planet.R); // J kg⁻¹

  const rLower = rFromX(xLower);
  const r = mode === 'lower' ? rLower : flight.r;
  const v0 = speed * 1000;
  const E = 0.5 * PROBE_MASS * v0 * v0 + pe(1); // total energy of the launched probe
  const rTurn = E < 0 ? -(GM * PROBE_MASS) / E / planet.R : Infinity; // in R

  const switchPlanet = (key) => {
    setPlanetKey(key);
    const p = PLANETS[key];
    setSpeed(Math.round((escapeSpeed(p.M, p.R) * 0.8) / 100) / 10);
    setFlight({ r: 1, v: 0, t: 0, running: false, rMax: 1, outcome: null });
  };

  // --- lowering animation: slowly, from infinity to the surface ------------
  useEffect(() => {
    if (!lowering) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let done = false;
      setXLower((x) => {
        const next = x - dt * 2.1;
        if (next <= 1) {
          done = true;
          return 1;
        }
        return next;
      });
      if (done) setLowering(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lowering]);

  // --- flight: radial motion under gravity alone ---------------------------
  useEffect(() => {
    if (!flight.running) return undefined;
    const R = planet.R;
    const tChar = Math.sqrt(R ** 3 / GM); // a natural time for this planet
    let raf;
    let last = performance.now();
    let s = { ...flight, r: flight.r * R }; // SI inside the loop
    const tick = (now) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      // time runs faster further out, so the whole flight fits on screen
      let budget = dtReal * 0.6 * tChar * Math.max(1, s.r / R) ** 1.5;
      let outcome = null;
      while (budget > 0 && !outcome) {
        const h = Math.min(budget, 0.01 * Math.sqrt(s.r ** 3 / GM));
        const a1 = -GM / (s.r * s.r);
        const rNew = s.r + s.v * h + 0.5 * a1 * h * h;
        const a2 = -GM / (rNew * rNew);
        s.v += 0.5 * (a1 + a2) * h;
        s.r = rNew;
        s.t += h;
        budget -= h;
        s.rMax = Math.max(s.rMax, s.r / R);
        if (s.r <= R) {
          s.r = R;
          outcome = 'fell';
        } else if (s.r > 1000 * R) {
          outcome = 'escaped';
        }
      }
      const next = { ...s, r: s.r / R, running: !outcome, outcome };
      setFlight(next);
      if (!outcome) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.running, planetKey]);

  const launch = () => {
    if (v0 <= 0) {
      setFlight({ r: 1, v: 0, t: 0, running: false, rMax: 1, outcome: 'still' });
      return;
    }
    if (prefersReducedMotion()) {
      // jump straight to the result
      setFlight({
        r: E < 0 ? 1 : 1000,
        v: E < 0 ? -v0 : Math.sqrt(Math.max(0, (2 * E) / PROBE_MASS)),
        t: 0,
        running: false,
        rMax: rTurn,
        outcome: E < 0 ? 'fell' : 'escaped',
      });
      return;
    }
    setFlight({ r: 1, v: v0, t: 0, running: true, rMax: 1, outcome: null });
  };

  // --- the scene -------------------------------------------------------------
  const { canvasRef } = useCanvas(
    (ctx, w, h) => {
      const scale = (w - LEFT - RIGHT) / X_INF;
      const px = (x) => LEFT + x * scale;
      const cy = h * 0.46;

      stars(ctx, w, h, Math.round((w * h) / 6000), 11);

      // the planet: its centre is at x = 0, its surface at x = 1
      body(ctx, px(0), cy, scale, planet.kind);
      label(ctx, planet.name, px(0), cy, { align: 'center', color: COLORS.text, size: 13 });

      // the radial line, with a break before infinity
      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(1), cy);
      ctx.lineTo(px(BREAK) - 5, cy);
      ctx.moveTo(px(BREAK) + 5, cy);
      ctx.lineTo(px(X_INF), cy);
      ctx.stroke();
      [-5, 5].forEach((dx) => {
        ctx.beginPath();
        ctx.moveTo(px(BREAK) + dx - 4, cy + 7);
        ctx.lineTo(px(BREAK) + dx + 4, cy - 7);
        ctx.stroke();
      });
      for (let k = 1; k <= 10; k++) {
        ctx.beginPath();
        ctx.moveTo(px(k), cy + 4);
        ctx.lineTo(px(k), cy + 9);
        ctx.stroke();
        label(ctx, `${k}`, px(k), cy + 22, { align: 'center', size: 11, color: COLORS.text3 });
      }
      label(ctx, '∞', px(X_INF), cy + 22, { align: 'center', size: 16, color: COLORS.text2 });
      label(ctx, 'r / R', px(X_INF), cy + 42, { align: 'center', size: 11, color: COLORS.text3 });
      label(ctx, 'V = 0', px(X_INF), cy - 22, { align: 'center', size: 12, color: COLORS.sage });

      const xr = xFromR(r);
      const ppx = px(Math.min(xr, X_INF));

      if (mode === 'lower') {
        // the line it is lowered on, back towards infinity
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = COLORS.text2;
        ctx.beginPath();
        ctx.moveTo(ppx + 6, cy - 3);
        ctx.lineTo(w - 4, cy - 3);
        ctx.stroke();
        ctx.restore();
        // its weight, towards the planet (longer where g is bigger)
        if (Number.isFinite(r)) {
          const len = clamp(70 / Math.sqrt(r * r), 10, 70);
          arrow(ctx, ppx, cy + 34, ppx - len, cy + 34, COLORS.sky, { width: 2.2, head: 9 });
          label(ctx, 'weight', ppx - len / 2, cy + 50, { align: 'center', size: 11, color: COLORS.sky });
        }
      } else {
        if (flight.rMax > 1.01 && Number.isFinite(rTurn) && rTurn < 900) {
          const tx = px(xFromR(rTurn));
          ctx.strokeStyle = COLORS.brass;
          ctx.beginPath();
          ctx.moveTo(tx, cy - 10);
          ctx.lineTo(tx, cy + 30);
          ctx.stroke();
          label(ctx, 'highest point', tx, cy + 42, { align: 'center', size: 11, color: COLORS.brass });
        }
        if (Math.abs(flight.v) > 1) {
          const len = clamp((Math.abs(flight.v) / vEsc) * 70, 8, 90) * Math.sign(flight.v);
          arrow(ctx, ppx, cy - 30, ppx + len, cy - 30, COLORS.coral, { width: 2.4, head: 10 });
          label(ctx, 'v', ppx + len + Math.sign(len) * 10, cy - 30, {
            font: SERIF,
            italic: true,
            size: 16,
            color: COLORS.coral,
            align: 'center',
          });
        }
      }

      ctx.beginPath();
      ctx.arc(ppx, cy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.deep;
      ctx.stroke();
    },
    [mode, planetKey, r, flight, rTurn],
  );

  const onPointer = (e, phase) => {
    if (mode !== 'lower' || lowering) return;
    if (phase === 'down') dragging.current = true;
    if (!dragging.current) return;
    const [x] = localPoint(e, e.currentTarget);
    const w = e.currentTarget.getBoundingClientRect().width;
    const scale = (w - LEFT - RIGHT) / X_INF;
    setXLower(clamp((x - LEFT) / scale, 1, X_INF));
    if (phase === 'up') dragging.current = false;
  };

  const stage = (
    <>
      <div
        style={{ position: 'absolute', inset: 0, cursor: mode === 'lower' ? 'ew-resize' : 'default', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPointer(e, 'down');
        }}
        onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')}
      >
        <canvas ref={canvasRef} role="img" aria-label={`A probe ${Number.isFinite(r) ? `${sig(r, 3)} radii` : 'infinitely far'} from the centre of ${planet.name}`} />
      </div>
      <p className="stage-note">
        {mode === 'lower'
          ? 'Drag the probe, or lower it in from infinity. Beyond the break the scale is squeezed so infinity fits.'
          : 'The probe is fired straight up. Time runs faster the further out it gets.'}
      </p>
    </>
  );

  // --- the graph under the scene ---------------------------------------------
  const curveTo = (f) => (x) => {
    const rr = rFromX(x);
    return x < 1 || !Number.isFinite(rr) ? NaN : f(rr);
  };
  const breakMark = (sx, sy, y) => (
    <g stroke={COLORS.text3}>
      <line x1={sx(BREAK) - 9} x2={sx(BREAK) - 1} y1={sy(y) + 7} y2={sy(y) - 7} />
      <line x1={sx(BREAK) + 1} x2={sx(BREAK) + 9} y1={sy(y) + 7} y2={sy(y) - 7} />
    </g>
  );

  const vMin = Vof(1) / 1e6;
  const peS = pe(1) / 1e9; // GJ
  const eTop = Math.max(Math.abs(peS) * 0.6, (0.5 * PROBE_MASS * (vEsc * 1.5) ** 2) / 1e9 + peS);

  const below =
    mode === 'lower' ? (
      <div className="figure">
        <div className="figure-head">
          <h3>Potential against distance</h3>
          <p>Zero at infinity, and negative everywhere else.</p>
        </div>
        <Plot
          x={[0, X_INF]}
          y={[Math.floor(vMin * 1.1), 0]}
          height={240}
          xTicks={X_TICKS}
          xFormat={xFormat}
          xLabel="r / R"
          yLabel="V / MJ kg⁻¹"
          ariaLabel="Potential against distance, rising from a negative value at the surface to zero at infinity"
          onPointer={(xv) => mode === 'lower' && !lowering && setXLower(clamp(xv, 1, X_INF))}
        >
          {({ sx, sy }) => (
            <>
              <path d={fnPath(curveTo((rr) => Vof(rr) / 1e6), 1, X_INF - 0.002, sx, sy, 500)} fill="none" stroke={COLORS.sage} strokeWidth="2.4" />
              {breakMark(sx, sy, 0)}
              <circle cx={sx(X_INF)} cy={sy(0)} r="4" fill={COLORS.sage} />
              <line x1={sx(Math.min(xLower, X_INF))} x2={sx(Math.min(xLower, X_INF))} y1={sy(0)} y2={sy(Number.isFinite(rLower) ? Vof(rLower) / 1e6 : 0)} stroke={COLORS.brass} strokeWidth="2" />
              <circle cx={sx(Math.min(xLower, X_INF))} cy={sy(Number.isFinite(rLower) ? Vof(rLower) / 1e6 : 0)} r="6" fill={COLORS.text} stroke={COLORS.deep} strokeWidth="2" />
            </>
          )}
        </Plot>
      </div>
    ) : (
      <div className="figure">
        <div className="figure-head">
          <h3>Energy of a {PROBE_MASS} kg probe</h3>
          <p>The gap between the total energy and the potential energy is the kinetic energy.</p>
        </div>
        <Plot
          x={[0, X_INF]}
          y={[peS * 1.1, eTop]}
          height={260}
          xTicks={X_TICKS}
          xFormat={xFormat}
          xLabel="r / R"
          yLabel="energy / GJ"
          ariaLabel="Potential energy curve with a horizontal line for the total energy"
        >
          {({ sx, sy }) => {
            const xp = Math.min(xFromR(flight.r), X_INF);
            const peNow = Number.isFinite(flight.r) ? pe(flight.r) / 1e9 : 0;
            return (
              <>
                <path d={fnPath(curveTo((rr) => pe(rr) / 1e9), 1, X_INF - 0.002, sx, sy, 500)} fill="none" stroke={COLORS.pe} strokeWidth="2.4" />
                {breakMark(sx, sy, 0)}
                <line x1={sx(1)} x2={sx(X_INF)} y1={sy(E / 1e9)} y2={sy(E / 1e9)} stroke={COLORS.brass} strokeWidth="2" strokeDasharray={E < 0 ? '0' : '6 4'} />
                <text className="plot-note" x={sx(BREAK) - 8} y={sy(E / 1e9) + 16} textAnchor="end" style={{ fill: COLORS.brass }}>
                  total energy E = {sig(E / 1e9, 3)} GJ
                </text>
                {E < 0 && rTurn < 1000 && (
                  <circle cx={sx(xFromR(rTurn))} cy={sy(E / 1e9)} r="5" fill="none" stroke={COLORS.brass} strokeWidth="2" />
                )}
                {/* kinetic energy: the gap up to the total-energy line */}
                <line x1={sx(xp)} x2={sx(xp)} y1={sy(peNow)} y2={sy(E / 1e9)} stroke={COLORS.ke} strokeWidth="5" strokeLinecap="round" />
                <circle cx={sx(xp)} cy={sy(peNow)} r="5" fill={COLORS.pe} />
              </>
            );
          }}
        </Plot>
        <div style={{ marginTop: 4 }}>
          <Legend
            items={[
              { label: 'Potential energy, −GMm/r', color: COLORS.pe },
              { label: 'Total energy (fixed)', color: COLORS.brass },
              { label: 'Kinetic energy', color: COLORS.ke },
            ]}
          />
        </div>
      </div>
    );

  // --- panel -------------------------------------------------------------------
  const lowerPanel = (
    <>
      <Section title="Lower a probe in from infinity">
        <Controls>
          <Slider
            label="Distance from the centre, r"
            value={xLower}
            min={1}
            max={X_INF}
            step={0.01}
            onChange={setXLower}
            disabled={lowering}
            display={Number.isFinite(rLower) ? `${sig(rLower, 3)} R` : '∞'}
          />
          <div className="row">
            <Button
              primary
              disabled={lowering}
              onClick={() => {
                if (prefersReducedMotion()) {
                  setXLower(1);
                  return;
                }
                setXLower(X_INF);
                setLowering(true);
              }}
            >
              Lower it in from infinity
            </Button>
          </div>
        </Controls>
      </Section>
      <Section title={`For a ${PROBE_MASS} kg probe`}>
        <Readouts>
          <Readout label="Potential V" value={Number.isFinite(rLower) ? sig(Vof(rLower) / 1e6, 3) : '0'} unit="MJ kg⁻¹" tone={COLORS.sage} />
          <Readout label="Potential energy mV" value={Number.isFinite(rLower) ? sig(pe(rLower) / 1e9, 3) : '0'} unit="GJ" tone={COLORS.pe} />
          <Readout label="Work done by gravity" value={Number.isFinite(rLower) ? `+${sig(-pe(rLower) / 1e9, 3)}` : '0'} unit="GJ" tone={COLORS.sky} />
          <Readout label="Work done by you" value={Number.isFinite(rLower) ? sig(pe(rLower) / 1e9, 3) : '0'} unit="GJ" tone={COLORS.coral} />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          You hold the probe back so it never speeds up. Gravity pulls it inward, the way it moves,
          so gravity does positive work and you do negative work. The potential is your work per
          kilogram, so it is negative.
        </p>
      </Section>
    </>
  );

  const outcomeText = (() => {
    if (flight.outcome === 'still') return 'With no speed it stays where it is.';
    if (flight.outcome === 'fell')
      return `Fell back after ${duration(flight.t)}. It reached ${sig(flight.rMax, 3)} R from the centre.`;
    if (flight.outcome === 'escaped') {
      const vInf = Math.sqrt(Math.max(0, v0 * v0 - vEsc * vEsc));
      return vInf < 0.05 * vEsc
        ? 'Escaped, only just. Its speed falls towards zero as it heads for infinity.'
        : `Escaped. Far away it is still moving at ${sig(vInf / 1000, 3)} km s⁻¹.`;
    }
    if (flight.running) return `In flight: ${duration(flight.t)} since launch.`;
    return E < 0 ? 'Total energy is negative: it will come back.' : 'Total energy is zero or more: it will escape.';
  })();

  const launchPanel = (
    <>
      <Section title="Fire a probe straight up">
        <Controls>
          <Slider
            label="Launch speed"
            value={speed}
            min={0}
            max={Math.round((vEsc * 1.5) / 100) / 10}
            step={0.1}
            onChange={(s) => {
              setSpeed(s);
              setFlight({ r: 1, v: 0, t: 0, running: false, rMax: 1, outcome: null });
            }}
            disabled={flight.running}
            display={`${sig(speed, 3)} km s⁻¹`}
            marks={[{ value: vEsc / 1000, label: 'escape' }]}
          />
          <div className="row">
            <Button primary onClick={launch} disabled={flight.running}>
              Launch
            </Button>
            <Button onClick={() => setSpeed(Math.round(vEsc / 100) / 10)} disabled={flight.running}>
              Set to escape speed
            </Button>
          </div>
          <p className="status-line" aria-live="polite">{outcomeText}</p>
        </Controls>
      </Section>
      <Section title={`Energy of the ${PROBE_MASS} kg probe`}>
        <Readouts>
          <Readout label="Kinetic energy at launch" value={sig((0.5 * PROBE_MASS * v0 * v0) / 1e9, 3)} unit="GJ" tone={COLORS.ke} />
          <Readout label="Potential energy at surface" value={sig(peS, 3)} unit="GJ" tone={COLORS.pe} />
          <Readout label="Total energy E" value={sig(E / 1e9, 3)} unit="GJ" tone={COLORS.brass} />
          <Readout label="Distance now" value={flight.r >= 999 ? '∞' : sig(flight.r, 3)} unit={flight.r >= 999 ? '' : 'R'} />
          <Readout label="Speed now" value={sig(Math.abs(flight.v) / 1000, 3)} unit="km s⁻¹" tone={COLORS.coral} />
          <Readout label={`Escape speed from ${planet.name}`} value={sig(vEsc / 1000, 3)} unit="km s⁻¹" tone={COLORS.brass} />
        </Readouts>
      </Section>
      <Section title="Escape velocity">
        <Eq block>
          ½<V>mv</V>² = <Frac n={<><V>GMm</V></>} d={<V>R</V>} /> &nbsp; ⇒ &nbsp; <V>v</V> = √(2<V>GM</V>/<V>R</V>)
        </Eq>
        <p>
          Enough kinetic energy to climb all the way to <V>V</V> = 0 at infinity. The probe&rsquo;s
          mass cancels, so the escape speed is the same for a pebble and a spacecraft. (Air
          resistance and the planet&rsquo;s spin are ignored.)
        </p>
      </Section>
    </>
  );

  const panel = (
    <>
      <Section title="Set up">
        <Controls>
          <Segmented
            label="Experiment"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setLowering(false);
            }}
            options={[
              { value: 'lower', label: 'In from infinity' },
              { value: 'launch', label: 'Launch and escape' },
            ]}
          />
          <Segmented
            label="Planet"
            value={planetKey}
            onChange={switchPlanet}
            options={Object.entries(PLANETS).map(([value, p]) => ({ value, label: p.name }))}
          />
        </Controls>
      </Section>

      {mode === 'lower' ? lowerPanel : launchPanel}

      <KeyIdeas>
        <li>
          Gravitational potential is zero at infinity. Every point nearer a mass has a lower,
          negative potential: <V>V</V> = −<V>GM</V>/<V>r</V>.
        </li>
        <li>
          Potential energy is <V>mV</V> = −<V>GMm</V>/<V>r</V>. As a mass falls in, it becomes more
          negative and kinetic energy grows.
        </li>
        <li>
          A probe launched upwards keeps a fixed total energy <V>E</V> = KE + PE. If <V>E</V> is
          negative it must turn back where KE = 0. If <V>E</V> is zero or more it escapes.
        </li>
        <li>
          The escape velocity is √(2<V>GM</V>/<V>R</V>): 11.2 km s⁻¹ from the Earth, 2.4 km s⁻¹ from
          the Moon.
        </li>
      </KeyIdeas>

      <TryThis>
        {mode === 'lower' ? (
          <>
            <li>How much work does gravity do bringing the probe from infinity to 2 R? And from 2 R to the surface?</li>
            <li>Half the potential at the surface is reached at what distance?</li>
          </>
        ) : (
          <>
            <li>Launch at 0.8 of the escape speed. How high does it get? Check with <V>E</V> = −<V>GMm</V>/<V>r</V>.</li>
            <li>Launch just above escape speed. Why does it hardly slow down once it is far away?</li>
            <li>Compare the Moon. Why did the Apollo ascent stages need so much less fuel?</li>
          </>
        )}
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} below={below} panel={panel} stageClass="is-strip" />;
}

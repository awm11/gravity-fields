import { useEffect, useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { useCanvas, localPoint } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, MOON, clamp, escapeSpeed, prefersReducedMotion } from '../lib/physics.js';
import { duration, grouped, sig } from '../lib/format.jsx';

/*
 * One straight line out from a planet, all the way to infinity.
 *
 * Distances r are in planet radii. Out to 10.5 R the axis is linear; past
 * the break it is squeezed so that infinity fits on the page:
 *   x = 11.5 − 1/(r − 9.5), which meets the linear part smoothly at
 *   r = 10.5 and reaches 11.5 as r → ∞.
 *
 * "In from infinity": drag the probe (held, so it never speeds up: the work
 * done on it by whatever holds it is exactly mΔV), or let it fall in from
 * rest at infinity, speeding up as ½mv² = −mV.
 * "Launch": a probe fired straight up. Total energy E = KE + PE decides
 * whether it comes back.
 *
 * Time: every flight plays as a time-lapse whose rate is always shown on
 * screen. An escape (or a fall from infinity) speeds up the clock in steps
 * as the probe gets further out, so the run takes about 8 s; a flight that
 * comes back keeps one steady rate, chosen so the whole flight takes at most
 * about 20 s.
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
const R_FAR = 1000; // in R: far enough to count as infinity on this scale

/** Round down / up to 1, 1.5, 2, 3, 5 or 7 × a power of ten, so rates read cleanly. */
const LADDER = [1, 1.5, 2, 3, 5, 7];
const niceDown = (x) => {
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  return [...LADDER].reverse().find((l) => m >= l - 1e-9) * 10 ** e;
};
const niceUp = (x) => {
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * 10 ** e;
};
const rateText = (k) => (k <= 1 ? 'Real time' : `${grouped(k)}× speed`);

/*
 * Time-lapse plans. The rate k is how many seconds of flight pass per
 * second on screen, snapped down to the ladder above.
 *
 * Flights that come back down (a launch below escape speed, or a fall from
 * rest at a finite height): one steady rate, so the whole flight takes at
 * most about 20 s (a fall, half a flight, at most about 10 s).
 *
 * Escapes: up to the axis break (10.5 R) the rate grows gently, as
 * K0·(r/R)^¼, so the probe is still seen to slow down; an escape-speed run
 * reaches the break in about 7 s. Beyond the break the axis is squeezed, so
 * the rate grows to keep the probe moving across the screen at the speed it
 * had at the break: about 1 s more to "infinity".
 *
 * Falls from infinity: the same rule beyond the break; inside 10.5 R one
 * steady rate, chosen so the fall from there to the surface takes about 6 s.
 */
const ESCAPE_TO_BREAK = 7; // s on screen, escape speed, surface to the break
const FALL_FROM_BREAK = 5; // s on screen, from the break to the surface

function boundRate(planet, v0) {
  // a radial ellipse reaching rmax: time up and back down, from the surface
  const GM = G * planet.M;
  const E = 0.5 * v0 * v0 - GM / planet.R; // per kg, negative
  const a = -GM / (2 * E);
  const eta1 = Math.acos(clamp(1 - planet.R / a, -1, 1));
  const flightTime = 2 * Math.sqrt(a ** 3 / GM) * (Math.PI - (eta1 - Math.sin(eta1)));
  const base = niceDown((1.25 * planet.R) / escapeSpeed(planet.M, planet.R));
  return Math.max(base, niceUp(flightTime / 19));
}

function escapePlan(planet) {
  const vEsc = escapeSpeed(planet.M, planet.R);
  const K0 = ((planet.R / vEsc) * 0.8 * (BREAK ** 1.25 - 1)) / ESCAPE_TO_BREAK;
  return { kind: 'escape', K0, vEsc };
}

function fallInfPlan(planet) {
  const GM = G * planet.M;
  const R = planet.R;
  const tIn = ((2 / 3) * ((BREAK * R) ** 1.5 - R ** 1.5)) / Math.sqrt(2 * GM);
  const kIn = niceDown(tIn / FALL_FROM_BREAK);
  return { kind: 'fallInf', kIn, vBreak: Math.sqrt((2 * GM) / (BREAK * R)) };
}

/** The rate now, for plan p, at distance rR (in R) and speed v (m/s). */
function rateFor(p, rR, v, vAtBreak) {
  if (p.fixed) return p.fixed;
  if (p.kind === 'escape') {
    const kB = p.K0 * BREAK ** 0.25 * Math.min(1, Math.sqrt(p.vEsc / Math.sqrt(BREAK) / Math.max(vAtBreak || 1, 1e-9)));
    // a launch faster than escape speed is slowed part of the way back
    // towards the escape-speed pace, so it does not rush off the screen
    const vEscHere = p.vEsc / Math.sqrt(rR);
    const calm = Math.min(1, Math.sqrt(vEscHere / Math.max(Math.abs(v), 1e-9)));
    if (rR <= BREAK || !vAtBreak) return Math.max(1, niceDown(p.K0 * rR ** 0.25 * calm));
    return niceDown(kB * (vAtBreak / Math.max(Math.abs(v), 1e-9)) * (rR - (BREAK - 1)) ** 2);
  }
  // fall from infinity
  if (rR <= BREAK) return p.kIn;
  return Math.max(p.kIn, niceDown(p.kIn * (p.vBreak / Math.max(Math.abs(v), 1e-9)) * (rR - (BREAK - 1)) ** 2));
}

const IDLE = { kind: null, r: 1, v: 0, t: 0, running: false, rMax: 1, outcome: null, k: 1, plan: null, r0: null, vAtBreak: null, noTime: false };
const xFormat = (v) => (v === X_INF ? '∞' : `${v}`);

export default function FromInfinity({ page }) {
  const [mode, setMode] = useState('lower');
  const [planetKey, setPlanetKey] = useState('earth');
  const planet = PLANETS[planetKey];
  const vEsc = escapeSpeed(planet.M, planet.R);

  // in from infinity: the probe's place when held, and the time mode
  const [xLower, setXLower] = useState(X_INF);
  // launching
  const [speed, setSpeed] = useState(Math.round((vEsc * 0.8) / 100) / 10); // km/s
  const [flight, setFlight] = useState(IDLE);
  const dragging = useRef(false);

  const GM = G * planet.M;
  const pe = (r) => (-GM * PROBE_MASS) / (r * planet.R); // J, r in planet radii
  const Vof = (r) => -GM / (r * planet.R); // J kg⁻¹

  // 'fall' from rest where it was held, or 'fallInf' from rest at infinity
  const falling = mode === 'lower' && (flight.kind === 'fall' || flight.kind === 'fallInf');
  const rLower = falling ? flight.r : rFromX(xLower);
  const r = mode === 'lower' ? rLower : flight.r;
  const v0 = speed * 1000;
  // total energy of the launched probe; at exactly escape speed it is zero
  // (rounding errors far smaller than a joule are treated as zero)
  const Eraw = 0.5 * PROBE_MASS * v0 * v0 + pe(1);
  const E = Math.abs(Eraw) < 1e-9 * Math.abs(pe(1)) ? 0 : Eraw;
  const rTurn = E < 0 ? -(GM * PROBE_MASS) / E / planet.R : Infinity; // in R

  const switchPlanet = (key) => {
    setPlanetKey(key);
    const p = PLANETS[key];
    setSpeed(Math.round((escapeSpeed(p.M, p.R) * 0.8) / 100) / 10);
    setFlight(IDLE);
  };

  // --- flight: radial motion under gravity alone ---------------------------
  useEffect(() => {
    if (!flight.running) return undefined;
    const R = planet.R;
    let raf;
    let last = performance.now();
    const s = { ...flight, r: flight.r * R }; // SI inside the loop
    const rateNow = () => rateFor(s.plan, s.r / R, s.v, s.vAtBreak);
    const tick = (now) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The rate depends on where the probe is, so it is worked out afresh
      // for every small step: the frame's screen time is spent step by step.
      let screen = dtReal;
      let k = rateNow();
      let outcome = null;
      while (screen > 1e-9 && !outcome) {
        k = rateNow();
        const h = Math.min(screen * k, 0.01 * Math.sqrt(s.r ** 3 / GM));
        screen -= h / k;
        const a1 = -GM / (s.r * s.r);
        const rNew = s.r + s.v * h + 0.5 * a1 * h * h;
        const a2 = -GM / (rNew * rNew);
        s.v += 0.5 * (a1 + a2) * h;
        s.r = rNew;
        s.t += h;
        s.rMax = Math.max(s.rMax, s.r / R);
        // an escaping probe: note its speed as it passes the axis break
        if (!s.vAtBreak && s.v > 0 && s.r >= BREAK * R) s.vAtBreak = s.v;
        if (s.r <= R) {
          // the last step went slightly below the surface: give the speed at
          // the surface itself, from ½v² − GM/r staying the same
          s.v = -Math.sqrt(Math.max(0, s.v * s.v - 2 * GM * (1 / s.r - 1 / R)));
          s.r = R;
          outcome = s.kind === 'launch' ? 'fell' : 'landed';
        } else if (s.r > R_FAR * R) {
          s.r = R_FAR * R;
          outcome = 'escaped';
        }
      }
      setFlight({ ...s, r: s.r / R, k, running: !outcome, outcome });
      if (!outcome) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.running, planetKey]);

  /** Let the probe fall from rest at infinity: total energy zero. */
  const letFallFromInfinity = () => {
    const vStart = -Math.sqrt((2 * GM) / (R_FAR * planet.R));
    if (prefersReducedMotion()) {
      setFlight({ ...IDLE, kind: 'fallInf', r: 1, v: -vEsc, outcome: 'landed', r0: Infinity, noTime: true });
      return;
    }
    const plan = fallInfPlan(planet);
    setFlight({ ...IDLE, kind: 'fallInf', r: R_FAR, v: vStart, running: true, rMax: R_FAR, plan, k: plan.kIn, r0: Infinity });
  };

  /** Let go of the probe where it is held: it falls from rest. */
  const letFall = () => {
    const r0 = rFromX(xLower);
    if (!Number.isFinite(r0) || r0 >= R_FAR) {
      letFallFromInfinity();
      return;
    }
    // the speed it would need at the surface to rise to r0: same flight time
    const vEquiv = Math.sqrt(2 * GM * (1 / planet.R - 1 / (r0 * planet.R)));
    if (prefersReducedMotion()) {
      setFlight({ ...IDLE, kind: 'fall', r: 1, v: -vEquiv, outcome: 'landed', r0, noTime: true });
      return;
    }
    const k = boundRate(planet, vEquiv);
    setFlight({ ...IDLE, kind: 'fall', r: r0, v: 0, running: true, rMax: r0, plan: { fixed: k }, k, r0 });
  };

  /** Stop the fall: hold the probe where it has got to. */
  const stopFall = () => {
    setXLower(Math.min(xFromR(flight.r), X_INF));
    setFlight(IDLE);
  };

  const launch = () => {
    if (v0 <= 0) {
      setFlight({ ...IDLE, kind: 'launch', outcome: 'still' });
      return;
    }
    if (prefersReducedMotion()) {
      // jump straight to the result
      setFlight({
        ...IDLE,
        kind: 'launch',
        r: E < 0 ? 1 : R_FAR,
        v: E < 0 ? -v0 : Math.sqrt(Math.max(0, (2 * E) / PROBE_MASS)),
        t: 0,
        noTime: true, // jumped straight to the result, so no flight time to report
        running: false,
        rMax: rTurn,
        outcome: E < 0 ? 'fell' : 'escaped',
      });
      return;
    }
    const plan = E < 0 ? { fixed: boundRate(planet, v0) } : escapePlan(planet);
    setFlight({ ...IDLE, kind: 'launch', v: v0, running: true, plan, k: rateFor(plan, 1, v0, null) });
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
      label(ctx, 'V = 0', px(X_INF), cy - 54, { align: 'center', size: 12, color: COLORS.sage });

      const xr = xFromR(r);
      const ppx = px(Math.min(xr, X_INF));

      if (mode === 'lower' && falling) {
        // falling freely: its velocity, growing as it falls
        if (Math.abs(flight.v) > 1) {
          const len = -clamp((Math.abs(flight.v) / vEsc) * 70, 8, 90);
          arrow(ctx, ppx, cy - 30, ppx + len, cy - 30, COLORS.coral, { width: 2.4, head: 10 });
          label(ctx, 'v', ppx + len - 10, cy - 30, { font: SERIF, italic: true, size: 16, color: COLORS.coral, align: 'center' });
        }
      } else if (mode === 'lower') {
        // the line it is held on, back towards infinity
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

      // the playback rate, always on show while the probe moves
      if (flight.running && (mode === 'launch' || falling)) {
        label(ctx, rateText(flight.k), w - 14, 22, { align: 'right', size: 18, weight: 700, color: flight.k > 1 ? COLORS.brass : COLORS.text });
        const since =
          flight.kind === 'fallInf'
            ? 'An infinitely long time since it started falling'
            : `${duration(flight.t)} since ${flight.kind === 'fall' ? 'it was let go' : 'launch'}`;
        label(ctx, since, w - 14, 44, {
          align: 'right',
          size: 12,
          color: COLORS.text2,
        });
      }
    },
    [mode, planetKey, r, flight, rTurn, falling],
  );

  const onPointer = (e, phase) => {
    if (mode !== 'lower' || flight.running) return;
    if (phase === 'down') {
      dragging.current = true;
      setFlight(IDLE); // holding it again
    }
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
          ? 'Drag the probe to hold it anywhere, then let it fall, or let it fall from infinity. Beyond the break the scale is squeezed so infinity fits.'
          : 'The probe is fired straight up. The playback rate is shown top right.'}
      </p>
    </>
  );

  // --- the graph under the scene ---------------------------------------------
  // Curves are drawn out to the break; beyond it (far away) they are shown
  // as a flat line at zero, the value at infinity.
  const curveTo = (f) => (x) => {
    const rr = rFromX(x);
    return x < 1 || x > BREAK - 0.12 ? NaN : f(rr);
  };
  const farLine = (sx, sy, color) => (
    <line x1={sx(BREAK) + 10} x2={sx(X_INF)} y1={sy(0)} y2={sy(0)} stroke={color} strokeWidth="2.4" />
  );
  const shownValue = (rr, f) => (Number.isFinite(rr) && xFromR(rr) <= BREAK ? f(rr) : 0);
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
          onPointer={(xv) => {
            if (mode !== 'lower' || flight.running) return;
            setFlight(IDLE);
            setXLower(clamp(xv, 1, X_INF));
          }}
        >
          {({ sx, sy }) => (
            <>
              <path d={fnPath(curveTo((rr) => Vof(rr) / 1e6), 1, X_INF - 0.002, sx, sy, 500)} fill="none" stroke={COLORS.sage} strokeWidth="2.4" />
              {breakMark(sx, sy, 0)}
              {farLine(sx, sy, COLORS.sage)}
              <circle cx={sx(X_INF)} cy={sy(0)} r="4" fill={COLORS.sage} />
              <line x1={sx(Math.min(xFromR(rLower), X_INF))} x2={sx(Math.min(xFromR(rLower), X_INF))} y1={sy(0)} y2={sy(shownValue(rLower, Vof) / 1e6)} stroke={COLORS.brass} strokeWidth="2" />
              <circle cx={sx(Math.min(xFromR(rLower), X_INF))} cy={sy(shownValue(rLower, Vof) / 1e6)} r="6" fill={COLORS.text} stroke={COLORS.deep} strokeWidth="2" />
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
            const peNow = shownValue(flight.r, pe) / 1e9;
            return (
              <>
                <path d={fnPath(curveTo((rr) => pe(rr) / 1e9), 1, X_INF - 0.002, sx, sy, 500)} fill="none" stroke={COLORS.pe} strokeWidth="2.4" />
                {breakMark(sx, sy, 0)}
                {farLine(sx, sy, COLORS.pe)}
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
  const vNow = Math.abs(flight.v);
  const fromInf = flight.kind === 'fallInf';
  const fallText = (() => {
    if (!falling) return 'Drag the probe to hold it at any distance, then let it fall, or let it fall from infinity.';
    if (flight.outcome === 'landed')
      return fromInf
        ? `Hit the surface at ${sig(vNow / 1000, 3)} km s⁻¹, the escape speed, after falling for an infinitely long time.`
        : flight.noTime
          ? `Hit the surface at ${sig(vNow / 1000, 3)} km s⁻¹.`
          : `Hit the surface at ${sig(vNow / 1000, 3)} km s⁻¹, ${duration(flight.t)} after it was let go.`;
    return fromInf
      ? 'Falling from infinity, and speeding up.'
      : `Falling, and speeding up: ${duration(flight.t)} since it was let go.`;
  })();
  // speed expected from energy: ½v² = GM(1/r − 1/r₀)
  const vFromEnergy = (rr) =>
    Math.sqrt(Math.max(0, 2 * GM * (1 / (rr * planet.R) - (Number.isFinite(flight.r0) ? 1 / (flight.r0 * planet.R) : 0))));

  const lowerPanel = (
    <>
      <Section title="Bring a probe in from infinity">
        <Controls>
          <Slider
            label="Hold the probe at distance r"
            value={Math.min(xFromR(rLower), X_INF)}
            min={1}
            max={X_INF}
            step={0.01}
            onChange={(v) => {
              setFlight(IDLE);
              setXLower(v);
            }}
            disabled={flight.running}
            display={Number.isFinite(rLower) && rLower < R_FAR ? `${sig(rLower, 3)} R` : '∞'}
          />
          <div className="row">
            {flight.running ? (
              <Button primary onClick={stopFall}>
                Stop fall
              </Button>
            ) : (
              <>
                <Button onClick={letFall} disabled={rFromX(xLower) <= 1.001 && !falling}>
                  Let probe fall
                </Button>
                <Button primary onClick={letFallFromInfinity}>
                  Let probe fall from infinity
                </Button>
              </>
            )}
          </div>
          <p className="status-line" aria-live="polite">{fallText}</p>
        </Controls>
      </Section>
      <Section title={`For a ${PROBE_MASS} kg probe`}>
        <Readouts>
          <Readout label="Potential V" value={Number.isFinite(rLower) ? sig(Vof(rLower) / 1e6, 3) : '0'} unit="MJ kg⁻¹" tone={COLORS.sage} />
          <Readout label="Potential energy mV" value={Number.isFinite(rLower) ? sig(pe(rLower) / 1e9, 3) : '0'} unit="GJ" tone={COLORS.pe} />
          {falling ? (
            <>
              <Readout
                label="Work done by gravity in the fall"
                value={`+${sig((PROBE_MASS * vFromEnergy(rLower) ** 2) / 2 / 1e9, 3)}`}
                unit="GJ"
                tone={COLORS.sky}
              />
              <Readout label="Kinetic energy gained" value={sig((0.5 * PROBE_MASS * vNow * vNow) / 1e9, 3)} unit="GJ" tone={COLORS.ke} />
              <Readout label="Speed now" value={sig(vNow / 1000, 3)} unit="km s⁻¹" tone={COLORS.coral} />
              <Readout
                label={fromInf ? '√(2GM/r) here' : '√(2GM(1/r − 1/r₀)) here'}
                value={sig(vFromEnergy(rLower) / 1000, 3)}
                unit="km s⁻¹"
                tone={COLORS.coral}
              />
            </>
          ) : (
            <>
            <Readout label="Work done by gravity" value={Number.isFinite(rLower) ? `+${sig(-pe(rLower) / 1e9, 3)}` : '0'} unit="GJ" tone={COLORS.sky} />
            <Readout label="Work done by you" value={Number.isFinite(rLower) ? sig(pe(rLower) / 1e9, 3) : '0'} unit="GJ" tone={COLORS.coral} />
            </>
          )}
        </Readouts>
        {falling ? (
          <p style={{ marginTop: 10 }}>
            {fromInf ? (
              <>
                Let go at infinity, the probe speeds up all the way in. Nothing holds it back, so
                gravity&rsquo;s work all becomes kinetic energy: ½<V>mv</V>² = −<V>mV</V>, so{' '}
                <V>v</V> = √(2<V>GM</V>/<V>r</V>). It reaches the surface at the escape speed: escaping is
                this fall run backwards.
              </>
            ) : (
              <>
                Let go at <V>r</V>₀, the probe speeds up all the way in. Gravity&rsquo;s work becomes
                kinetic energy: ½<V>mv</V>² = <V>m</V>(<V>V</V>(<V>r</V>₀) − <V>V</V>(<V>r</V>)). It lands
                slower than a probe that fell from infinity.
              </>
            )}
          </p>
        ) : (
          <p style={{ marginTop: 10 }}>
            Held, the probe never speeds up. Gravity pulls it inward, the way it moves, so gravity
            does positive work and you do negative work. The potential is your work per kilogram,
            so it is negative.
          </p>
        )}
      </Section>
    </>
  );

  const outcomeText = (() => {
    if (flight.kind !== 'launch') return E < 0 ? 'Total energy is negative: it will come back.' : 'Total energy is zero or more: it will escape.';
    if (flight.outcome === 'still') return 'With no speed it stays where it is.';
    if (flight.outcome === 'fell')
      return flight.noTime
        ? `Fell back. It reached ${sig(flight.rMax, 3)} R from the centre.`
        : `Fell back after ${duration(flight.t)}. It reached ${sig(flight.rMax, 3)} R from the centre.`;
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
              setFlight(IDLE);
            }}
            disabled={flight.running}
            display={`${sig(speed, 3)} km s⁻¹`}
            marks={[{ value: vEsc / 1000, label: 'escape' }]}
          />
          <div className="row">
            <Button primary onClick={launch} disabled={flight.running}>
              Launch
            </Button>
            <Button onClick={() => setSpeed(vEsc / 1000)} disabled={flight.running}>
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
          <Readout label="Distance now" value={flight.r >= R_FAR ? '∞' : sig(flight.r, 3)} unit={flight.r >= R_FAR ? '' : 'R'} />
          <Readout label="Speed now" value={sig(Math.abs(flight.v) / 1000, 3)} unit="km s⁻¹" tone={COLORS.coral} />
          <Readout label={`Escape speed from ${planet.name}`} value={sig(vEsc / 1000, 3)} unit="km s⁻¹" tone={COLORS.brass} />
        </Readouts>
      </Section>
      <Section title="Escape velocity">
        <Eq block>
          ½<V>mv</V>² = <Frac n={<><V>GMm</V></>} d={<V>R</V>} />
          <br />⇒ &nbsp; <V>v</V> = √(2<V>GM</V>/<V>R</V>)
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
              setFlight(IDLE);
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
          Potential energy is <V>mV</V> = −<V>GMm</V>/<V>r</V>. As a mass falls in, its potential
          energy becomes more negative and its kinetic energy grows.
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
            <li>At what distance is the potential half its value at the surface?</li>
          </>
        ) : (
          <>
            <li>Launch at 0.8 of the escape speed. How high does it get? Check with<br /><V>E</V> = −<V>GMm</V>/<V>r</V>.</li>
            <li>Launch just above escape speed. Why does it hardly slow down once it is far away?</li>
            <li>Compare the Moon. Why did the Apollo ascent stages need so much less fuel than a rocket leaving the Earth?</li>
          </>
        )}
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} below={below} panel={panel} stageClass="is-strip" notesWide />;
}

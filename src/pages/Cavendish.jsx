import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot } from '../components/Plot.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, body, label } from '../lib/draw.js';
import { EARTH, G, prefersReducedMotion } from '../lib/physics.js';
import { sci, sig } from '../lib/format.jsx';

/*
 * Cavendish's torsion balance, seen from above. A light rod carrying two
 * small lead balls hangs from a thin wire. Two large lead balls, swung
 * close to the small ones, pull them sideways and twist the wire.
 *
 * The twist settles where the wire's restoring torque κθ balances the
 * gravitational torque GMmL/r². With κ = 4π²I/T² and I = mL²/2:
 *   θ = GMT²/(2π²r²L), and so G = 2π²r²Lθ/(MT²). The small mass cancels.
 *
 * Values follow a typical reconstruction of Cavendish's apparatus. A light
 * beam reflected from a mirror on the wire reads the twist on a scale D
 * away: the spot moves 2Dθ.
 */

const SMALL_M = 0.73; // kg
const L = 1.86; // m, rod length (centre to centre of the small balls)
const R_SEP = 0.225; // m, centre to centre, large ball to small ball
const T = 420; // s, period of the balance
const D = 5; // m, mirror to scale
const WARP = 40; // simulated seconds per second
const DECAY = 1.6 * T; // s, amplitude falls by e in this time
const EXAG = 40; // drawn rotation is about 40 × the real one (eased off near contact)
const LEAD = 11340; // kg m⁻³
const radiusOf = (m) => Math.cbrt((3 * m) / (4 * Math.PI * LEAD));
const HISTORY_MIN = 40; // minutes shown on the trace

const thetaEq = (M, place) => (place === 'away' ? 0 : ((place === 'a' ? 1 : -1) * G * M * T * T) / (2 * Math.PI ** 2 * R_SEP ** 2 * L));

export default function Cavendish({ page }) {
  const [place, setPlace] = useState('away');
  const [bigM, setBigM] = useState(158);
  const [reading, setReading] = useState({ t: 0, theta: 0, history: [] });
  const sim = useRef({ t: 0, theta: 0, omega: 0, last: null, history: [[0, 0]], lastSample: 0, lastReport: 0 });
  const target = useRef(0);
  target.current = thetaEq(bigM, place);
  const still = prefersReducedMotion();

  const { canvasRef } = useCanvas(
    (ctx, w, h, now) => {
      const s = sim.current;
      const dtReal = s.last == null ? 0 : Math.min(0.05, (now - s.last) / 1000);
      s.last = now;

      // damped torsional oscillation about the current equilibrium
      if (still) {
        s.theta = target.current;
        s.omega = 0;
        s.t += dtReal * WARP;
      } else {
        let left = dtReal * WARP;
        const w0 = (2 * Math.PI) / T;
        while (left > 0) {
          const h = Math.min(left, 0.5);
          const acc = -w0 * w0 * (s.theta - target.current) - (2 / DECAY) * s.omega;
          s.omega += acc * h;
          s.theta += s.omega * h;
          s.t += h;
          left -= h;
        }
      }
      if (s.t - s.lastSample >= 5) {
        s.lastSample = s.t;
        s.history.push([s.t / 60, 2 * D * s.theta * 1000]);
        const cutoff = s.t / 60 - HISTORY_MIN;
        while (s.history.length && s.history[0][0] < cutoff) s.history.shift();
      }
      if (now - s.lastReport > 100) {
        s.lastReport = now;
        setReading({ t: s.t, theta: s.theta, history: s.history.slice() });
      }

      // --- the balance, to scale, rotation exaggerated ---
      const scaleX = w > 640 ? w - 120 : w - 70; // where the reading scale sits
      const cx = scaleX * 0.47;
      const cy = h * 0.52;
      const px = Math.min((scaleX - 40) / (L + 0.7), (h - 40) / 2.05); // px per metre
      // exaggerate the twist, but never let a small ball reach a large one
      const gap = R_SEP - radiusOf(bigM) - radiusOf(SMALL_M);
      const limit = 0.45 * gap;
      const ang = (limit * Math.tanh((EXAG * s.theta * (L / 2)) / limit)) / (L / 2);
      const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      const toPx = ([x, y]) => [cx + x * px, cy - y * px];

      ctx.fillStyle = COLORS.deep;
      ctx.fillRect(0, 0, w, h);

      // the frame that carries the large balls, and their two positions
      const bigR = radiusOf(bigM) * px;
      ctx.strokeStyle = COLORS.ruleSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.hypot(L / 2, R_SEP) * px, 0, Math.PI * 2);
      ctx.stroke();
      const spots = {
        a: [[L / 2, R_SEP], [-L / 2, -R_SEP]],
        b: [[L / 2, -R_SEP], [-L / 2, R_SEP]],
      };
      ['a', 'b'].forEach((key) => {
        spots[key].forEach((p, i) => {
          const [x, y] = toPx(p);
          ctx.save();
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = 'rgba(174,184,203,0.3)';
          ctx.beginPath();
          ctx.arc(x, y, bigR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if (i === 0) {
            label(ctx, key.toUpperCase(), x + bigR + 8, y, { size: 13, color: COLORS.text3 });
          }
        });
      });
      // the large balls swung out of the way sit at right angles
      const away = [[R_SEP + 0.25, L / 2], [-(R_SEP + 0.25), -L / 2]];
      const bigs = place === 'away' ? away : spots[place];
      bigs.forEach((p) => {
        const [x, y] = toPx(p);
        body(ctx, x, y, bigR, 'lead');
      });

      // the rod and small balls
      const end1 = toPx(rot(L / 2, 0, ang));
      const end2 = toPx(rot(-L / 2, 0, ang));
      const zero1 = toPx([L / 2, 0]);
      const zero2 = toPx([-L / 2, 0]);
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(174,184,203,0.35)';
      ctx.beginPath();
      ctx.moveTo(...zero1);
      ctx.lineTo(...zero2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#c9ced8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(...end1);
      ctx.lineTo(...end2);
      ctx.stroke();
      const smallR = Math.max(5, radiusOf(SMALL_M) * px);
      body(ctx, end1[0], end1[1], smallR, 'lead');
      body(ctx, end2[0], end2[1], smallR, 'lead');

      // the wire (seen end on) with its mirror
      const mirror = rot(0, 0.07, ang);
      const m1 = toPx([mirror[0], mirror[1]]);
      const m2 = toPx([-mirror[0], -mirror[1]]);
      ctx.strokeStyle = COLORS.sky;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...m1);
      ctx.lineTo(...m2);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // pulls on the small balls when the large balls are in place
      if (place !== 'away') {
        const sign = place === 'a' ? 1 : -1;
        [end1, end2].forEach(([x, y], i) => {
          const dir = (i === 0 ? -1 : 1) * sign; // canvas y is down
          ctx.strokeStyle = COLORS.coral;
          ctx.fillStyle = COLORS.coral;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + dir * 22);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y + dir * 28);
          ctx.lineTo(x - 4, y + dir * 20);
          ctx.lineTo(x + 4, y + dir * 20);
          ctx.fill();
        });
      }

      // --- light beam to the reading scale ---
      const spot = 2 * D * s.theta * 1000; // mm
      const mmPx = (h * 0.38) / 30;
      const spotY = cy - spot * mmPx;
      ctx.save();
      ctx.strokeStyle = 'rgba(242,115,94,0.55)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(scaleX, spotY);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scaleX, cy - 30 * mmPx);
      ctx.lineTo(scaleX, cy + 30 * mmPx);
      ctx.stroke();
      for (let mm = -30; mm <= 30; mm += 5) {
        const y = cy - mm * mmPx;
        const big = mm % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(scaleX, y);
        ctx.lineTo(scaleX + (big ? 12 : 7), y);
        ctx.stroke();
        if (big) label(ctx, `${mm}`, scaleX + 16, y, { size: 11, color: COLORS.text3 });
      }
      label(ctx, 'mm', scaleX + 16, cy - 30 * mmPx - 16, { size: 11, color: COLORS.text3 });
      const glow = ctx.createRadialGradient(scaleX, spotY, 0, scaleX, spotY, 12);
      glow.addColorStop(0, 'rgba(255,120,100,1)');
      glow.addColorStop(1, 'rgba(255,120,100,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(scaleX, spotY, 12, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, 'scale 5 m away', scaleX, cy + 30 * mmPx + 18, { size: 11, color: COLORS.text3, align: 'center' });
    },
    [bigM, place, still],
    { animate: true },
  );

  const settle = () => {
    const s = sim.current;
    s.theta = target.current;
    s.omega = 0;
  };

  const stage = (
    <>
      <canvas ref={canvasRef} role="img" aria-label="Top view of Cavendish's torsion balance, with a light beam reading its twist on a scale" />
      <p className="stage-note">
        Seen from above, to scale, except that the twist is exaggerated. Time runs {WARP} times faster.
      </p>
    </>
  );

  // trace of the spot against time
  const tNow = reading.t / 60;
  const t0 = Math.max(0, tNow - HISTORY_MIN);
  const eqA = 2 * D * thetaEq(bigM, 'a') * 1000;
  const yMax = Math.max(20, Math.ceil((Math.abs(eqA) * 2.2) / 10) * 10);

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Position of the light spot</h3>
        <p>The swing dies away and settles at the new equilibrium. Read its centre, and the period.</p>
      </div>
      <Plot
        x={[t0, t0 + HISTORY_MIN]}
        y={[-yMax, yMax]}
        height={220}
        xLabel="time / min"
        yLabel="spot / mm"
        ariaLabel="Position of the light spot against time: a damped oscillation"
      >
        {({ sx, sy }) => (
          <>
            {['a', 'b'].map((k) => (
              <g key={k}>
                <line x1={sx(t0)} x2={sx(t0 + HISTORY_MIN)} y1={sy(2 * D * thetaEq(bigM, k) * 1000)} y2={sy(2 * D * thetaEq(bigM, k) * 1000)} stroke={COLORS.brass} strokeOpacity="0.45" strokeDasharray="3 5" />
                <text className="plot-note" x={sx(t0 + HISTORY_MIN) - 4} y={sy(2 * D * thetaEq(bigM, k) * 1000) - 6} textAnchor="end" style={{ fill: COLORS.brass }}>
                  {k === 'a' ? 'A at rest' : 'B at rest'}
                </text>
              </g>
            ))}
            <path
              d={reading.history
                .map(([t, s], i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(s).toFixed(1)}`)
                .join('')}
              fill="none"
              stroke={COLORS.coral}
              strokeWidth="2"
            />
          </>
        )}
      </Plot>
    </div>
  );

  // the calculation, using the equilibrium shift between A and B
  const shift = 4 * D * thetaEq(bigM, 'a') * 1000; // mm, A to B
  const thetaFromShift = shift / 1000 / (4 * D);
  const Gfound = (2 * Math.PI ** 2 * R_SEP ** 2 * L * thetaFromShift) / (bigM * T * T);
  const force = (G * bigM * SMALL_M) / R_SEP ** 2;

  const panel = (
    <>
      <Section title="Move the large balls">
        <Controls>
          <Segmented
            label="Large balls"
            value={place}
            onChange={setPlace}
            options={[
              { value: 'away', label: 'Away' },
              { value: 'a', label: 'Position A' },
              { value: 'b', label: 'Position B' },
            ]}
          />
          <Slider
            label="Mass of each large ball M"
            value={bigM}
            min={50}
            max={300}
            step={1}
            onChange={setBigM}
            display={`${bigM} kg`}
            marks={[{ value: 158, label: 'Cavendish' }]}
          />
          <div className="row">
            <Button onClick={settle}>Let it settle</Button>
          </div>
        </Controls>
      </Section>

      <Section title="Readings">
        <Readouts>
          <Readout label="Spot position" value={sig(2 * D * reading.theta * 1000, 3)} unit="mm" tone={COLORS.coral} />
          <Readout label="Twist of the wire θ" value={sci(reading.theta)} unit="rad" />
          <Readout label="Pull on each small ball" value={place === 'away' ? '0' : sci(force)} unit="N" tone={COLORS.coral} />
          <Readout label="Period T" value={`${T / 60}`} unit="min" />
        </Readouts>
      </Section>

      <Section title="Finding G">
        <ol className="steps">
          <li>
            Swinging the balls from A to B moves the resting spot by Δ<V>s</V> = {sig(shift, 3)} mm. That is
            4<V>D</V>θ, so θ = {sci(thetaFromShift)} rad.
          </li>
          <li>
            The period gives the wire&rsquo;s stiffness: κ = 4π²<V>I</V>/<V>T</V>², with <V>I</V> = <V>mL</V>²/2.
          </li>
          <li>
            At rest the torques balance: 2 × <V>F</V> × <V>L</V>/2 = κθ, with <V>F</V> = <V>GMm</V>/<V>r</V>².
          </li>
        </ol>
        <Eq block>
          <V>G</V> = <Frac n={<>2π²<V>r</V>²<V>L</V>θ</>} d={<><V>MT</V>²</>} /> = {sci(Gfound)} N m² kg⁻²
        </Eq>
        <p>
          With <V>r</V> = {R_SEP * 100} cm, <V>L</V> = {L} m, <V>M</V> = {bigM} kg and <V>T</V> = {T} s. The small
          mass cancels.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          The pull between the balls is about {sci(force, 2)} N: roughly the weight of a few grains
          of sand. A long, thin wire twists a measurable amount under so small a torque.
        </li>
        <li>
          Cavendish worked from outside the room, reading the scale through a telescope, so that
          his body heat would not stir up air currents.
        </li>
        <li>
          Measuring <V>G</V> let him find the mass of the Earth: from <V>g</V> = <V>GM</V>/<V>R</V>²,{' '}
          <V>M</V> = <V>gR</V>²/<V>G</V> = {sci((9.81 * EARTH.R ** 2) / G)} kg. He described his result as
          the Earth&rsquo;s density, 5.48 times that of water.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Swing the balls to A and let it settle. Then swing them to B. Why measure the shift between A and B rather than from the &lsquo;away&rsquo; position?</li>
        <li>Double the mass of the large balls. What happens to the twist?</li>
        <li>Why does a stiffer wire make the experiment harder?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} below={below} panel={panel} />;
}

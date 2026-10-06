import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot } from '../components/Plot.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, arrow, body, label } from '../lib/draw.js';
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
 * beam reflected from a mirror on the rod reads the twist on a screen D
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
const VEL_COLOR = COLORS.sage;

const thetaEq = (M, place) => (place === 'away' ? 0 : ((place === 'a' ? 1 : -1) * G * M * T * T) / (2 * Math.PI ** 2 * R_SEP ** 2 * L));

/*
 * Pictures, hot-linked from their sources with full credits. If one cannot
 * load, a card with the credit and a link to the source is shown instead.
 * To serve copies from this site, save them in public/media/ and change
 * `src` to e.g. './media/nist-cavendish.gif'.
 */
const PICTURES = [
  {
    src: 'https://www.nist.gov/sites/default/files/images/2023/08/14/image001.gif',
    alt: 'Animation of a torsion balance: a rod with small balls on its ends, hung from a fibre, twists as large balls are moved close to it',
    caption: 'Traditional Cavendish experiment for measuring the strength of gravity.',
    credit: 'S. Kelley/NIST',
    links: [
      { href: 'https://www.nist.gov/image/cavendish-torsion-balance', text: 'NIST: Cavendish torsion balance' },
      { href: 'https://www.nist.gov/copyrights-disclaimers', text: 'NIST copyright and reuse' },
    ],
    note: 'NIST material is public information; NIST asks that its image credit is given.',
  },
  {
    src: 'https://astro4edu.org/media/multimedia/apparatus-for-determining-the-gravitional-constant.png',
    alt: 'Engraved vertical section of Cavendish’s apparatus inside its wooden case and the room that housed it',
    caption: 'Cavendish’s own drawing (Fig. 1): a vertical section of the instrument and the room it stood in. He watched it through telescopes set in the walls.',
    credit:
      'H. Cavendish (1798), “Experiments to determine the density of the earth”, Phil. Trans. R. Soc. Lond. 88, 469–526, Fig. 1. Cropped and adjusted by the IAU Office of Astronomy for Education (CC BY 4.0); the original is in the public domain.',
    links: [
      { href: 'https://doi.org/10.1098/rstl.1798.0022', text: 'The 1798 paper (doi:10.1098/rstl.1798.0022)' },
      { href: 'https://astro4edu.org/resources/media/Is35Tq19o343/', text: 'IAU OAE image page' },
    ],
  },
  {
    src: 'https://upload.wikimedia.org/wikipedia/commons/d/dd/Cavendish_Experiment.png',
    alt: 'Line drawing of the torsion balance from Cavendish’s 1798 paper, showing the rod, the small balls and the large balls',
    caption: 'Drawing of the torsion balance from Cavendish’s 1798 paper, as reprinted in A. S. Mackenzie (ed.), The Laws of Gravitation (Scientific Memoirs vol. 9, 1900).',
    credit: 'Henry Cavendish, 1798. Public domain.',
    links: [{ href: 'https://commons.wikimedia.org/wiki/File:Cavendish_Experiment.png', text: 'Wikimedia Commons: Cavendish Experiment.png' }],
  },
];

function Picture({ src, alt, caption, credit, links, note }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="picture">
      <a className="picture-frame" href={links[0].href} target="_blank" rel="noreferrer">
        {failed ? (
          <span className="picture-missing">Image could not be loaded here. Open the source to see it.</span>
        ) : (
          <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        )}
      </a>
      <figcaption>
        <span>{caption}</span>
        <span className="picture-credit">Credit: {credit}</span>
        {note && <span className="picture-credit">{note}</span>}
        <span className="picture-links">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
              {l.text}
            </a>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

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
      // The balance is drawn turned 45° anticlockwise, so at rest the rod
      // lies along the mirror. Positions below are in the balance's own frame
      // (rod along x) and turned by BASE onto the page.
      const BASE = Math.PI / 4;
      const turn = ([x, y]) => rot(x, y, BASE);
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
          const [x, y] = toPx(turn(p));
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
      // the large balls swung out of the way sit at right angles to the rod,
      // where they pull it equally both ways (and are clear of the beams)
      const away = [[0, 1.04], [0, -1.04]];
      const bigs = place === 'away' ? away : spots[place];
      bigs.forEach((p) => {
        const [x, y] = toPx(turn(p));
        body(ctx, x, y, bigR, 'lead');
      });

      // the rod and small balls
      const end1 = toPx(rot(L / 2, 0, BASE + ang));
      const end2 = toPx(rot(-L / 2, 0, BASE + ang));
      const zero1 = toPx(turn([L / 2, 0]));
      const zero2 = toPx(turn([-L / 2, 0]));
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

      // the wire (seen end on) with a small mirror fixed to the centre of
      // the rod at 45° to it, so light from the laser below is reflected
      // towards the screen; it turns with the rod
      const mHalf = Math.max(18, 0.07 * px);
      const along = rot(Math.SQRT1_2, Math.SQRT1_2, ang); // along the mirror's face
      const back = rot(-Math.SQRT1_2, Math.SQRT1_2, ang); // behind it (its silvered side faces down-right)
      const m1 = [cx + along[0] * mHalf, cy - along[1] * mHalf];
      const m2 = [cx - along[0] * mHalf, cy + along[1] * mHalf];
      ctx.save();
      ctx.strokeStyle = 'rgba(124,198,242,0.45)';
      ctx.lineWidth = 1;
      for (let k = -mHalf + 3; k <= mHalf; k += 5) {
        const bx = cx + along[0] * k;
        const by = cy - along[1] * k;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + (back[0] * 0.8 - along[0] * 0.5) * 7, by - (back[1] * 0.8 - along[1] * 0.5) * 7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = COLORS.sky;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(...m1);
      ctx.lineTo(...m2);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // pulls on the small balls when the large balls are in place (red),
      // at right angles to the rod, towards the large balls
      if (place !== 'away') {
        const sign = place === 'a' ? 1 : -1;
        [end1, end2].forEach(([x, y], i) => {
          const [ux, uy] = rot(0, (i === 0 ? 1 : -1) * sign, BASE);
          arrow(ctx, x, y, x + ux * 28, y - uy * 28, COLORS.coral, { width: 2, head: 8 });
        });
      }

      // velocities of the small balls (green), drawn on the rod just inside
      // each ball, at right angles to it; 40 px for the fastest swing after
      // the balls are moved with Cavendish's 158 kg
      const vScale = 40 / (((2 * Math.PI) / T) * Math.abs(thetaEq(158, 'a')));
      const vLen = Math.max(-55, Math.min(55, s.omega * vScale));
      if (Math.abs(vLen) > 3) {
        [1, -1].forEach((side) => {
          const [bx, by] = toPx(rot(side * L * 0.4, 0, BASE + ang));
          const [ux, uy] = rot(0, side, BASE + ang); // direction of motion for positive ω
          arrow(ctx, bx, by, bx + ux * vLen, by - uy * vLen, VEL_COLOR, { width: 2.2, head: 8 });
        });
      }

      // --- laser, mirror and screen ---
      // The laser sits at 6 o'clock and shines up at the mirror, which sends
      // the beam towards the screen. Turning the mirror by θ turns the
      // reflected beam by 2θ, so the spot moves 2Dθ on a screen D away. The
      // beam is drawn at its true angle (far too small to see), stopping
      // short of the screen; the spot shows the movement, in mm.
      const spot = 2 * D * s.theta * 1000; // mm
      const mmPx = (h * 0.36) / 30;
      const laserX = cx;
      const laserY = h - 30;
      const zeroY = cy;
      const spotY = zeroY - spot * mmPx;
      const beamEnd = scaleX - 70;
      const beamEndY = cy - (beamEnd - cx) * Math.tan(2 * s.theta);

      ctx.save();
      ctx.strokeStyle = 'rgba(242,115,94,0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(laserX, laserY - 14);
      ctx.lineTo(cx, cy);
      ctx.lineTo(beamEnd, beamEndY);
      ctx.stroke();
      ctx.restore();

      // the laser: a small box pointing up at the mirror
      ctx.save();
      ctx.translate(laserX, laserY);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#3a4560';
      ctx.strokeStyle = COLORS.text2;
      ctx.lineWidth = 1;
      ctx.fillRect(-12, -6, 30, 12);
      ctx.strokeRect(-12, -6, 30, 12);
      ctx.fillStyle = COLORS.coral;
      ctx.fillRect(-14, -2.5, 3, 5);
      ctx.restore();
      label(ctx, 'laser', laserX + 14, laserY + 2, { size: 12, color: COLORS.text2 });

      // label the mirror, clear of the rod and beams
      ctx.save();
      ctx.strokeStyle = 'rgba(174,184,203,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy + 7);
      ctx.lineTo(cx + 30, cy + 30);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'mirror', cx + 34, cy + 40, { size: 13, color: COLORS.sky });

      // the scale, with 0 where the spot rests when the wire is untwisted
      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scaleX, zeroY - 30 * mmPx);
      ctx.lineTo(scaleX, zeroY + 30 * mmPx);
      ctx.stroke();
      for (let mm = -30; mm <= 30; mm += 5) {
        const y = zeroY - mm * mmPx;
        const big = mm % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(scaleX, y);
        ctx.lineTo(scaleX + (big ? 12 : 7), y);
        ctx.stroke();
        if (big) label(ctx, `${mm}`, scaleX + 16, y, { size: 11, color: COLORS.text3 });
      }
      label(ctx, 'mm', scaleX + 16, zeroY - 30 * mmPx - 16, { size: 11, color: COLORS.text3 });
      const glow = ctx.createRadialGradient(scaleX, spotY, 0, scaleX, spotY, 12);
      glow.addColorStop(0, 'rgba(255,120,100,1)');
      glow.addColorStop(1, 'rgba(255,120,100,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(scaleX, spotY, 12, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, `screen ${D} m away`, scaleX, Math.min(h - 12, zeroY + 30 * mmPx + 18), { size: 11, color: COLORS.text3, align: 'center' });
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
      <canvas ref={canvasRef} role="img" aria-label="Top view of Cavendish's torsion balance, with a laser beam reflected from a mirror on the rod onto a screen" />
      <p className="stage-note">
        Seen from above. The twist of the rod is exaggerated; the light spot
        shows the true twist, doubled by the mirror. Time runs {WARP} times faster.
      </p>
    </>
  );

  // trace of the spot against time
  const tNow = reading.t / 60;
  const t0 = Math.max(0, tNow - HISTORY_MIN);
  const eqA = 2 * D * thetaEq(bigM, 'a') * 1000;
  const yMax = Math.max(20, Math.ceil((Math.abs(eqA) * 2.2) / 10) * 10);

  const below = (
    <>
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
                  {k === 'a' ? 'Rest position, balls at A' : 'Rest position, balls at B'}
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
    <div className="figure">
      <div className="figure-head">
        <h3>The apparatus, then and now</h3>
        <p>Click an image to open its source.</p>
      </div>
      <div className="picture-grid">
        {PICTURES.map((pic) => (
          <Picture key={pic.src} {...pic} />
        ))}
      </div>
      <p className="plot-caption">
        No photographs of Cavendish&rsquo;s own apparatus are known. He rebuilt it, based on John
        Michell&rsquo;s earlier apparatus, and used it in 1797–98, decades before photography. His engraved drawings are the record of what it looked like.
      </p>
    </div>
    </>
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
          With <V>r</V> = {R_SEP * 100} cm, <V>L</V> = {L} m, <V>M</V> = {bigM} kg and
          <br />
          <V>T</V> = {T} s. The small mass cancels.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          The pull between the balls is about {sci(force, 2)} N: roughly the weight of one grain
          of sand. A long, thin wire twists a measurable amount under so small a torque.
        </li>
        <li>
          Cavendish worked from outside the room, reading the scale through a telescope, so that
          his body heat would not stir up air currents.
        </li>
        <li>
          Cavendish reported his result as the density of the Earth: 5.48 times that of water. In
          modern terms, that is the same as measuring <V>G</V>: it gives <V>G</V> ≈ 6.7 × 10⁻¹¹ N m² kg⁻²
          (today&rsquo;s value is 6.674 × 10⁻¹¹), and then <V>g</V> = <V>GM</V>/<V>R</V>² gives the
          Earth&rsquo;s mass, <V>M</V> = <V>gR</V>²/<V>G</V> = {sci((9.81 * EARTH.R ** 2) / G)} kg.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Swing the balls to A and let it settle. Then swing them to B. Why measure the shift between A and B rather than from the &lsquo;away&rsquo; position?</li>
        <li>Double the mass of the large balls. What happens to the twist?</li>
        <li>Why does a stiffer wire make the experiment harder?</li>
      </TryThis>
    </>
  );

  const legend = (
    <Legend
      items={[
        { label: 'Gravitational pull on a small ball', color: COLORS.coral, kind: 'arrow' },
        { label: 'Velocity of a small ball', color: VEL_COLOR, kind: 'arrow' },
      ]}
    />
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} notesWide />;
}

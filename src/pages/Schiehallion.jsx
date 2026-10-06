import { useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Slider, Switch, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, label, stars } from '../lib/draw.js';
import { EARTH, G } from '../lib/physics.js';
import { sci, sig } from '../lib/format.jsx';

/*
 * The Schiehallion experiment (1774). A plumb line beside a mountain hangs
 * a little towards it. Maskelyne measured the deflection against the stars
 * from stations on the north and south slopes.
 *
 * Model: the plumb line lies along the resultant of the Earth's field g
 * (down) and the mountain's sideways field g_h, so its deflection is
 *   δ = g_h / g.
 * With g_h = G ρ_m K (K set by the mountain's shape) and
 * g = (4/3)πGρ_E R, G cancels: δ depends on ρ_m/ρ_E.
 *
 * K is chosen so that Hutton's figures, a mountain of 2500 kg m⁻³ and an
 * Earth of 4500 kg m⁻³, give Maskelyne's 5.8″ at each station.
 */

const MEASURED = 5.8; // arcseconds at each station (11.6″ between them)
const ARCSEC = Math.PI / (180 * 3600);
const K_SHAPE = (MEASURED * ARCSEC * (4 / 3) * Math.PI * 4500 * EARTH.R) / 2500; // m
const G_SURFACE = 9.81;
const DRAW = 4000; // deflections are drawn 4000 times larger
const MODERN_EARTH = 5510;

const deflection = (rhoM, rhoE) => (3 * rhoM * K_SHAPE) / (4 * Math.PI * rhoE * EARTH.R) / ARCSEC; // arcseconds

export default function Schiehallion({ page }) {
  const [rhoM, setRhoM] = useState(2500);
  const [rhoE, setRhoE] = useState(2500);
  const [showForces, setShowForces] = useState(true);

  const delta = deflection(rhoM, rhoE);
  const gH = G * rhoM * K_SHAPE; // N kg⁻¹, sideways
  const match = Math.abs(delta - MEASURED) < 0.05;
  const solvedRhoE = (3 * rhoM * K_SHAPE) / (4 * Math.PI * EARTH.R * MEASURED * ARCSEC);
  const earthMass = rhoE * (4 / 3) * Math.PI * EARTH.R ** 3;
  const impliedG = (G_SURFACE * EARTH.R ** 2) / earthMass;

  const { canvasRef } = useCanvas(
    (ctx, w, h) => {
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#070b16');
      sky.addColorStop(1, '#101a30');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      stars(ctx, w, h * 0.5, Math.round((w * h) / 9000), 21);

      // the mountain in profile, north–south, no vertical exaggeration
      const ground = h * 0.84;
      const cx = w * 0.5;
      const mPerPx = (w < 560 ? 3200 : 4600) / (w * 0.9);
      const peak = 1083 - 300; // height above the surrounding land, m
      const profile = (xm) => peak * Math.exp(-((xm / 1150) ** 2)); // height at xm metres from the summit
      const toPx = (xm, ym) => [cx + xm / mPerPx, ground - ym / mPerPx];

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let px = 0; px <= w; px += 3) {
        const xm = (px - cx) * mPerPx;
        ctx.lineTo(px, ground - profile(xm) / mPerPx);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const rock = ctx.createLinearGradient(0, ground - peak / mPerPx, 0, h);
      rock.addColorStop(0, '#3b4a5f');
      rock.addColorStop(1, '#1d2636');
      ctx.fillStyle = rock;
      ctx.fill();
      ctx.strokeStyle = 'rgba(174,184,203,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      label(ctx, 'Schiehallion', cx, ground - peak / mPerPx - 18, { align: 'center', color: COLORS.text2, size: 13 });
      label(ctx, 'South', 16, ground + 22, { size: 12, color: COLORS.text3 });
      label(ctx, 'North', w - 16, ground + 22, { size: 12, color: COLORS.text3, align: 'right' });

      // a zenith star, far away: its light arrives parallel to the true vertical
      const starX = cx;
      const starY = 30;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(starX, starY, 3.2, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, 'a star overhead', starX, starY + 16, { size: 12, color: COLORS.text3, align: 'center' });

      // the two stations, on the slopes
      const stations = [
        { xm: -650, side: 1, name: 'South station' }, // the mountain is to its north (right)
        { xm: 650, side: -1, name: 'North station' },
      ];
      const tilt = delta * ARCSEC * DRAW; // drawn deflection, radians
      stations.forEach((s) => {
        const [x, y] = toPx(s.xm, profile(s.xm));
        const top = y - 170;

        // starlight: straight down (parallel rays from a distant star)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,246,216,0.45)';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();

        // the plumb line hangs along the resultant field, tilted towards the mountain
        const len = 150;
        const bx = x + Math.sin(tilt) * len * s.side;
        const by = top + Math.cos(tilt) * len;
        ctx.strokeStyle = '#d9dee8';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = COLORS.brass;
        ctx.beginPath();
        ctx.moveTo(bx, by + 12);
        ctx.lineTo(bx - 6, by);
        ctx.lineTo(bx + 6, by);
        ctx.closePath();
        ctx.fill();
        // the stand that holds the plumb line (drawn far larger than life)
        ctx.strokeStyle = 'rgba(174,184,203,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 2);
        ctx.lineTo(x - 12, top);
        ctx.lineTo(x + 12, top);
        ctx.lineTo(x + 22, y - 2);
        ctx.stroke();
        ctx.fillStyle = COLORS.text3;
        ctx.fillRect(x - 14, top - 4, 28, 4);

        // the angle between them
        ctx.strokeStyle = COLORS.coral;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const a0 = Math.PI / 2;
        const a1 = Math.PI / 2 - tilt * s.side;
        ctx.arc(x, top, 70, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
        label(ctx, 'δ', x + s.side * 22 + Math.sin(tilt) * 70 * s.side * 0.5, top + 86, {
          font: SERIF,
          italic: true,
          size: 17,
          color: COLORS.coral,
          align: 'center',
        });

        // the fields on the bob
        if (showForces) {
          const gLen = 72;
          const hLen = gLen * Math.tan(tilt); // same exaggeration as the angle
          arrow(ctx, bx, by + 18, bx, by + 18 + gLen, COLORS.sky, { width: 2, head: 8 });
          arrow(ctx, bx, by + 18, bx + hLen * s.side, by + 18, COLORS.coral, { width: 2, head: 7 });
          label(ctx, 'g', bx - 12 * s.side, by + 18 + gLen * 0.65, { font: SERIF, italic: true, size: 15, color: COLORS.sky, align: 'center' });
          label(ctx, 'gₕ', bx - 16 * s.side, by + 16, { font: SERIF, italic: true, size: 15, color: COLORS.coral, align: 'center' });
        }

        label(ctx, s.name, x - s.side * 34, y + 22, { align: 'center', size: 12, color: COLORS.text2 });
      });

      label(ctx, `Deflections drawn ${DRAW} times larger`, 14, h - 14, { size: 12, color: COLORS.text2 });
    },
    [delta, showForces],
  );

  const legend = (
    <Legend
      items={[
        { label: 'Starlight', color: '#fff6d8', kind: 'dashed' },
        { label: 'Plumb line', color: '#d9dee8' },
        ...(showForces
          ? [
              { label: 'Earth’s field', color: COLORS.sky, kind: 'arrow' },
              { label: 'Mountain’s sideways pull', color: COLORS.coral, kind: 'arrow' },
            ]
          : []),
      ]}
    />
  );

  const stage = (
    <>
      <canvas ref={canvasRef} role="img" aria-label={`Plumb lines on either side of Schiehallion, each pulled ${sig(delta, 2)} seconds of arc towards the mountain`} />
    </>
  );

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Predicted against measured</h3>
        <p>Change the Earth&rsquo;s density until the prediction matches Maskelyne&rsquo;s measurement.</p>
      </div>
      <Gauge value={delta} measured={MEASURED} />
    </div>
  );

  const panel = (
    <>
      <Section title="The densities">
        <Controls>
          <Slider
            label="Density of the mountain ρₘ"
            value={rhoM}
            min={2000}
            max={3000}
            step={10}
            onChange={setRhoM}
            display={`${rhoM} kg m⁻³`}
            marks={[{ value: 2500, label: 'Hutton' }]}
          />
          <Slider
            label="Mean density of the Earth ρₑ"
            value={rhoE}
            min={2000}
            max={8000}
            step={10}
            onChange={setRhoE}
            display={`${rhoE} kg m⁻³`}
            marks={[{ value: MODERN_EARTH, label: 'today' }]}
          />
          <div className="row">
            <Button primary onClick={() => setRhoE(Math.round(solvedRhoE / 10) * 10)}>
              Match the measurement
            </Button>
          </div>
          <Switch label="Show the fields on the bob" checked={showForces} onChange={setShowForces} />
        </Controls>
      </Section>

      <Section title="Deflection at each station">
        <Eq block>
          tan δ ≈ δ = <Frac n={<><V>g</V><sub>h</sub></>} d={<V>g</V>} />
        </Eq>
        <Readouts>
          <Readout label="Predicted δ" value={`${sig(delta, 3)}″`} tone={match ? COLORS.sage : COLORS.coral} />
          <Readout label="Measured δ" value={`${MEASURED}″`} tone={COLORS.brass} />
          <Readout label="Mountain’s sideways pull gₕ" value={sci(gH)} unit="N kg⁻¹" tone={COLORS.coral} wide />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          Both <V>g</V><sub>h</sub> and <V>g</V> are proportional to <V>G</V>, so <V>G</V> cancels. The
          deflection compares the mountain&rsquo;s density with the Earth&rsquo;s.
        </p>
      </Section>

      <Section title="Weighing the Earth">
        <Readouts>
          <Readout label="Mass of the Earth" value={sci(earthMass)} unit="kg" wide />
          <Readout label="So G = gR²/M" value={sci(impliedG)} unit="N m² kg⁻²" tone={COLORS.brass} wide />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          {match
            ? `This density matches the measurement. Hutton found 4500 kg m⁻³ in 1778, about 80% of today’s ${MODERN_EARTH} kg m⁻³, mostly because the rock density was hard to know.`
            : 'Volume × density gives the Earth’s mass. Then g = GM/R², with g and R already known, gives G.'}
        </p>
      </Section>

      <KeyIdeas>
        <li>
          A plumb line hangs along the gravitational field. Beside a mountain the field is the
          resultant of the Earth&rsquo;s pull, straight down, and the mountain&rsquo;s much smaller
          pull, sideways.
        </li>
        <li>
          The sideways pull was only about 1/36 000 of <V>g</V>. Comparing the plumb lines with the
          stars on both sides doubles the effect and cancels many errors.
        </li>
        <li>
          This was the first measurement of the Earth&rsquo;s density, and so of its mass. With the
          mass known, <V>g</V> = <V>GM</V>/<V>R</V>² gives <V>G</V>.
        </li>
        <li>
          To find the mountain&rsquo;s volume, Charles Hutton joined points of equal height on the
          survey map: one of the first uses of contour lines, the idea behind equipotentials.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>With the Earth&rsquo;s density at today&rsquo;s value, how big would the deflection be?</li>
        <li>If the mountain were denser, would the Earth come out denser or less dense?</li>
        <li>Why choose an isolated, symmetrical mountain like Schiehallion?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} />;
}

/** A horizontal scale of deflection in arcseconds, with the measured value marked. */
function Gauge({ value, measured }) {
  const max = 14;
  const pct = (v) => `${(Math.min(max, Math.max(0, v)) / max) * 100}%`;
  const ticks = [0, 2, 4, 6, 8, 10, 12, 14];
  return (
    <div className="gauge" role="img" aria-label={`Predicted deflection ${sig(value, 3)} seconds of arc; measured ${measured}`}>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: pct(value) }} />
        <div className="gauge-measured" style={{ left: pct(measured) }}>
          <span>measured {measured}″</span>
        </div>
        <div className="gauge-value" style={{ left: pct(value) }}>
          <span>predicted {sig(value, 3)}″</span>
        </div>
      </div>
      <div className="gauge-ticks">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {t}″
          </span>
        ))}
      </div>
    </div>
  );
}

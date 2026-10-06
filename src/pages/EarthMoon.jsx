import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Switch, TryThis } from '../components/ui.jsx';
import { Eq, Frac, Sqrt, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { useCanvas, localPoint } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, MOON, clamp } from '../lib/physics.js';
import { grouped, sci, sig } from '../lib/format.jsx';

/*
 * A craft on the line between the Earth and the Moon. Distances are along
 * that line, in thousands of km from the Earth's centre, and to scale.
 * Field strength is signed: positive means towards the Moon.
 *
 * The canvas uses the same horizontal scale as the graphs beneath it, so
 * the craft lines up with its point on each graph.
 */

const D = MOON.distance / 1e6; // 384.4 thousand km
const X_MAX = 400;
const PLOT_PAD_L = 58;
const PLOT_PAD_R = 14;
const FIGURE_PAD = 14;
const MOON_COLOR = '#d6d1c4';

const RATIOS = [
  { value: MOON.M / EARTH.M, label: 'Real, 1/81' },
  { value: 1 / 20, label: '1/20' },
  { value: 1 / 4, label: '1/4' },
  { value: 1, label: 'Equal' },
];

export default function EarthMoon({ page }) {
  const [ratio, setRatio] = useState(RATIOS[0].value);
  const [x, setX] = useState(250); // craft, thousands of km from the Earth's centre
  const [parts, setParts] = useState(true);
  const geometry = useRef(null);
  const dragging = useRef(false);

  const Mm = EARTH.M * ratio;
  // the moon keeps the real Moon's density, so a heavier moon is bigger
  const moonR = (MOON.R / 1e6) * Math.cbrt(ratio / (MOON.M / EARTH.M));
  const earthR = EARTH.R / 1e6;

  // signed field strength (N kg⁻¹, + towards the Moon) and potential (J kg⁻¹)
  const gEarth = (p) => {
    const d = Math.abs(p) * 1e6;
    const R = EARTH.R;
    return -(d >= R ? (G * EARTH.M) / (d * d) : (G * EARTH.M * d) / R ** 3);
  };
  const gMoon = (p) => {
    const d = Math.abs(D - p) * 1e6;
    const R = moonR * 1e6;
    return d >= R ? (G * Mm) / (d * d) : (G * Mm * d) / R ** 3;
  };
  const vOf = (M, R, d) => (d >= R ? -(G * M) / d : (-(G * M) * (3 * R * R - d * d)) / (2 * R ** 3));
  const vEarth = (p) => vOf(EARTH.M, EARTH.R, Math.abs(p) * 1e6);
  const vMoon = (p) => vOf(Mm, moonR * 1e6, Math.abs(D - p) * 1e6);
  const gTotal = (p) => gEarth(p) + gMoon(p);
  const vTotal = (p) => vEarth(p) + vMoon(p);

  const neutral = D / (1 + Math.sqrt(ratio));
  const gE = gEarth(x);
  const gM = gMoon(x);
  const g = gE + gM;
  const Vx = vTotal(x);

  const { canvasRef } = useCanvas(
    (ctx, w, h) => {
      const left = FIGURE_PAD + PLOT_PAD_L;
      const right = FIGURE_PAD + PLOT_PAD_R;
      const scale = (w - left - right) / X_MAX; // px per thousand km
      const px = (p) => left + p * scale;
      geometry.current = { left, scale };
      const cy = h * 0.5;

      stars(ctx, w, h, Math.round((w * h) / 7000), 3);

      // the line through both centres, with a scale
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(0), cy);
      ctx.lineTo(px(D), cy);
      ctx.stroke();
      for (let k = 0; k <= 350; k += 50) {
        ctx.beginPath();
        ctx.moveTo(px(k), h - 34);
        ctx.lineTo(px(k), h - 28);
        ctx.strokeStyle = COLORS.text3;
        ctx.stroke();
        label(ctx, `${k}`, px(k), h - 18, { align: 'center', size: 11, color: COLORS.text3 });
      }
      ctx.beginPath();
      ctx.moveTo(px(0), h - 31);
      ctx.lineTo(px(350), h - 31);
      ctx.stroke();
      label(ctx, '10³ km', w - 10, h - 18, { size: 11, color: COLORS.text3, align: 'right' });

      // the neutral point
      const nx = px(neutral);
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = COLORS.brass;
      ctx.beginPath();
      ctx.moveTo(nx, 44);
      ctx.lineTo(nx, h - 58);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'g = 0', nx, h - 48, { align: 'center', size: 13, color: COLORS.brass });

      // bodies, drawn at twice their true size
      body(ctx, px(0), cy, Math.max(3, earthR * scale * 2), 'earth');
      body(ctx, px(D), cy, Math.max(3, moonR * scale * 2), 'moon');
      label(ctx, 'Earth', px(0), cy + earthR * scale * 2 + 16, { align: 'center', color: COLORS.text2 });
      label(ctx, 'Moon', px(D), cy + Math.max(moonR * scale * 2, 4) + 16, { align: 'center', color: COLORS.text2 });

      // arrows on the craft: each pull above the line, the resultant below
      const k = 9; // px per mN kg⁻¹
      const len = (v) => clamp(Math.abs(v) * 1000 * k, 0, 150) * Math.sign(v);
      const cx = px(x);
      const up = cy - 26;
      const down = cy + 26;
      // Near the neutral point the resultant is too small to draw: the
      // arrow and its g label give way to a note.
      const showResultant = Math.abs(len(g)) > 5;
      if (Math.abs(len(gE)) > 2) arrow(ctx, cx, up, cx + len(gE), up, COLORS.sky, { width: 2.4, head: 10 });
      if (Math.abs(len(gM)) > 2) arrow(ctx, cx, up, cx + len(gM), up, MOON_COLOR, { width: 2.4, head: 10 });
      if (showResultant) arrow(ctx, cx, down, cx + len(g), down, COLORS.coral, { width: 3, head: 12 });
      else label(ctx, 'no resultant pull', cx, down + 4, { align: 'center', size: 12, color: COLORS.coral });

      // the craft
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.deep;
      ctx.stroke();
      label(ctx, 'craft', cx, cy - 46, { align: 'center', size: 12, color: COLORS.text2 });
      if (showResultant) {
        label(ctx, 'g', cx + len(g) + (g < 0 ? -12 : 12), down, {
          font: SERIF,
          italic: true,
          size: 17,
          color: COLORS.coral,
          align: 'center',
        });
      }
    },
    [x, ratio],
  );

  const minX = earthR * 1.2;
  const maxX = D - moonR * 1.5;
  const moveTo = (p) => setX(clamp(Math.round(p * 2) / 2, minX, maxX));

  const onPointer = (e, phase) => {
    const geo = geometry.current;
    if (!geo) return;
    if (phase === 'down') dragging.current = true;
    if (!dragging.current) return;
    const [px] = localPoint(e, e.currentTarget);
    moveTo((px - geo.left) / geo.scale);
    if (phase === 'up') dragging.current = false;
  };

  const legend = (
    <Legend
      items={[
        { label: 'Earth’s pull', color: COLORS.sky, kind: 'arrow' },
        { label: 'Moon’s pull', color: MOON_COLOR, kind: 'arrow' },
        { label: 'Resultant', color: COLORS.coral, kind: 'arrow' },
      ]}
    />
  );

  const stage = (
    <>
      <div
        style={{ position: 'absolute', inset: 0, cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPointer(e, 'down');
        }}
        onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')}
      >
        <canvas ref={canvasRef} role="img" aria-label="A craft on the line between the Earth and the Moon, with the pull of each" />
      </div>
      <p className="stage-note">Drag the craft. Distances are to scale; the bodies are drawn twice their true size.</p>
    </>
  );

  const xTicks = [0, 50, 100, 150, 200, 250, 300, 350, 400];
  const marks = (sx, sy, top, bottom) => (
    <>
      <line x1={sx(neutral)} x2={sx(neutral)} y1={sy(top)} y2={sy(bottom)} stroke={COLORS.brass} strokeDasharray="3 4" />
      <line x1={sx(x)} x2={sx(x)} y1={sy(top)} y2={sy(bottom)} stroke={COLORS.text} strokeOpacity="0.25" />
      <rect x={sx(0)} y={sy(top)} width={sx(earthR) - sx(0)} height={sy(bottom) - sy(top)} fill="rgba(47,127,184,0.2)" />
      <rect x={sx(D - moonR)} y={sy(top)} width={sx(D + moonR) - sx(D - moonR)} height={sy(bottom) - sy(top)} fill="rgba(214,209,196,0.16)" />
    </>
  );

  const below = (
    <div className="figures is-stacked">
      <div className="figure">
        <div className="figure-head">
          <h3>Potential along the line</h3>
          <p>Potentials are scalars: the two simply add.</p>
        </div>
        <Plot
          x={[0, X_MAX]}
          y={[-6, 0]}
          height={230}
          xTicks={xTicks}
          xLabel="distance from Earth’s centre / 10³ km"
          yLabel="V / MJ kg⁻¹"
          onPointer={moveTo}
          ariaLabel="Potential against distance from the Earth: a hill with its top at the neutral point"
        >
          {({ sx, sy }) => (
            <>
              {marks(sx, sy, 0, -6)}
              {parts && (
                <>
                  <path d={fnPath((p) => vEarth(p) / 1e6, 0, X_MAX, sx, sy, 500)} fill="none" stroke={COLORS.sky} strokeDasharray="5 4" strokeOpacity="0.8" />
                  <path d={fnPath((p) => vMoon(p) / 1e6, 0, X_MAX, sx, sy, 500)} fill="none" stroke={MOON_COLOR} strokeDasharray="5 4" strokeOpacity="0.8" />
                </>
              )}
              <path d={fnPath((p) => vTotal(p) / 1e6, 0, X_MAX, sx, sy, 600)} fill="none" stroke={COLORS.sage} strokeWidth="2.4" />
              <circle cx={sx(x)} cy={sy(Math.max(-6.5, Vx / 1e6))} r="6" fill={COLORS.text} stroke={COLORS.deep} strokeWidth="2" />
            </>
          )}
        </Plot>
      </div>
      <div className="figure">
        <div className="figure-head">
          <h3>Field strength along the line</h3>
          <p>Field strengths are vectors: positive means towards the Moon.</p>
        </div>
        <Plot
          x={[0, X_MAX]}
          y={[-12, 12]}
          height={230}
          xTicks={xTicks}
          yTicks={[-12, -8, -4, 0, 4, 8, 12]}
          xLabel="distance from Earth’s centre / 10³ km"
          yLabel="g / 10⁻³ N kg⁻¹"
          onPointer={moveTo}
          ariaLabel="Field strength against distance: negative near the Earth, crossing zero at the neutral point"
        >
          {({ sx, sy }) => (
            <>
              {marks(sx, sy, 12, -12)}
              {parts && (
                <>
                  <path d={fnPath((p) => gEarth(p) * 1000, 0, X_MAX, sx, sy, 500)} fill="none" stroke={COLORS.sky} strokeDasharray="5 4" strokeOpacity="0.8" />
                  <path d={fnPath((p) => gMoon(p) * 1000, 0, X_MAX, sx, sy, 500)} fill="none" stroke={MOON_COLOR} strokeDasharray="5 4" strokeOpacity="0.8" />
                </>
              )}
              <path d={fnPath((p) => gTotal(p) * 1000, 0, X_MAX, sx, sy, 800)} fill="none" stroke={COLORS.coral} strokeWidth="2.4" />
              <circle cx={sx(x)} cy={sy(clamp(g * 1000, -13, 13))} r="6" fill={COLORS.text} stroke={COLORS.deep} strokeWidth="2" />
            </>
          )}
        </Plot>
        <div style={{ marginTop: 4 }}>
          <Legend
            items={[
              { label: 'Total', color: COLORS.coral },
              { label: 'Earth alone', color: COLORS.sky, kind: 'dashed' },
              { label: 'Moon alone', color: MOON_COLOR, kind: 'dashed' },
              { label: 'Neutral point', color: COLORS.brass, kind: 'dashed' },
            ]}
          />
        </div>
      </div>
    </div>
  );

  const towards = Math.abs(g) < 1e-6 ? '' : g < 0 ? 'towards the Earth' : 'towards the Moon';

  const panel = (
    <>
      <Section title="Set up">
        <Controls>
          <div>
            <p className="control-label">Mass of the moon, as a fraction of the Earth&rsquo;s</p>
            <Segmented
              label="Mass of the moon compared with the Earth"
              value={ratio}
              onChange={setRatio}
              options={RATIOS.map((r) => ({ value: r.value, label: r.label }))}
            />
            <p className="slider-hint">A heavier moon is drawn bigger, at the same density.</p>
          </div>
          <Switch label="Show each body’s contribution" checked={parts} onChange={setParts} />
        </Controls>
      </Section>

      <Section title="At the craft">
        <Readouts>
          <Readout label="Distance from Earth’s centre" value={`${grouped(Math.round(x) * 1000)}`} unit="km" wide />
          <Readout label="Earth’s pull" value={sci(Math.abs(gE))} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="Moon’s pull" value={sci(Math.abs(gM))} unit="N kg⁻¹" tone={MOON_COLOR} />
          <Readout label={`Resultant g ${towards}`} value={sci(Math.abs(g))} unit="N kg⁻¹" tone={COLORS.coral} wide />
          <Readout label="Potential V" value={sig(Vx / 1e6, 3)} unit="MJ kg⁻¹" tone={COLORS.sage} />
          <Readout label="Force on a 1000 kg craft" value={sci(Math.abs(g) * 1000)} unit="N" tone={COLORS.coral} />
        </Readouts>
      </Section>

      <Section title="The neutral point">
        <Eq block>
          <Frac2 />
        </Eq>
        <Eq block>
          <V>x</V> ={' '}
          <span className="frac">
            <span className="frac-n">
              <V>d</V>
            </span>
            <span className="frac-d">
              1 +{' '}
              <Sqrt>
                <Frac
                  n={<><V>M</V><sub>Moon</sub></>}
                  d={<><V>M</V><sub>Earth</sub></>}
                />
              </Sqrt>
            </span>
          </span>
        </Eq>
        <p>
          The pulls cancel {grouped(Math.round(neutral) * 1000)} km from the Earth&rsquo;s centre,{' '}
          {sig(neutral / D, 2)} of the way to the {ratio === 1 ? 'other body' : 'Moon'}. Here the
          potential graph is flat, at the top of a hill:{' '}
          <span style={{ whiteSpace: 'nowrap' }}>
            <V>g</V> = −Δ<V>V</V>/Δ<V>r</V> = 0
          </span>
          .
          The potential is still negative. It is not zero.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          Field strengths add as vectors. Between the bodies the two pulls point in opposite
          directions, so they partly cancel.
        </li>
        <li>
          Potentials add as plain numbers. Both are negative, so the total is negative everywhere
          and is never zero between the bodies.
        </li>
        <li>
          The resultant field strength is minus the gradient of the total potential. Where the
          potential graph is flat, the field strength is zero.
        </li>
        <li>
          A craft heading for the Moon must climb to the top of the potential hill. Beyond it, the
          Moon wins and the craft falls the rest of the way.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Find the neutral point. How far is it from the Moon&rsquo;s centre, as a fraction of the distance?</li>
        <li>Make the masses equal. Where is the neutral point now, and why?</li>
        <li>
          Near the Earth the Moon&rsquo;s pull is tiny. At 50 000 km, what percentage of the
          resultant does it make?
        </li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="top" below={below} panel={panel} stageClass="is-strip" notesWide />;
}

/** GM_E/x² = GM_M/(d − x)² */
function Frac2() {
  return (
    <>
      <span className="frac">
        <span className="frac-n">
          <V>GM</V>
          <sub>Earth</sub>
        </span>
        <span className="frac-d">
          <V>x</V>²
        </span>
      </span>{' '}
      ={' '}
      <span className="frac">
        <span className="frac-n">
          <V>GM</V>
          <sub>Moon</sub>
        </span>
        <span className="frac-d">
          (<V>d</V> − <V>x</V>)²
        </span>
      </span>
    </>
  );
}

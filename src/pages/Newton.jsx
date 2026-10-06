import { useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Controls, KeyIdeas, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { useCanvas, localPoint } from '../lib/useCanvas.js';
import { COLORS, SERIF, arrow, body, label } from '../lib/draw.js';
import { G, clamp } from '../lib/physics.js';
import { sci, sig } from '../lib/format.jsx';

const PRESETS = {
  people: {
    label: 'Two people',
    a: { name: 'Person A', m: 60, kind: 'mass', massLabel: 'Mass of person A' },
    b: { name: 'Person B', m: 70, kind: 'mass', massLabel: 'Mass of person B' },
    r0: 1,
    r0Text: '1.0 m',
  },
  cavendish: {
    label: 'Lead spheres',
    a: { name: 'Large lead ball', m: 158, kind: 'lead', massLabel: 'Mass of the large ball' },
    b: { name: 'Small lead ball', m: 0.73, kind: 'lead', massLabel: 'Mass of the small ball' },
    r0: 0.225,
    r0Text: '22.5 cm',
  },
  you: {
    label: 'Earth and you',
    a: { name: 'Earth', m: 5.972e24, kind: 'earth', massLabel: 'Mass of the Earth' },
    b: { name: 'You', m: 60, kind: 'mass', massLabel: 'Your mass' },
    r0: 6.371e6,
    r0Text: '6371 km (Earth’s radius)',
  },
  moon: {
    label: 'Earth and Moon',
    a: { name: 'Earth', m: 5.972e24, kind: 'earth', massLabel: 'Mass of the Earth' },
    b: { name: 'Moon', m: 7.342e22, kind: 'moon', massLabel: 'Mass of the Moon' },
    r0: 3.844e8,
    r0Text: '384 400 km',
  },
};

const R_MIN = 0.5;
const R_MAX = 4;

export default function Newton({ page }) {
  const [presetKey, setPresetKey] = useState('people');
  const [ratio, setRatio] = useState(1); // r / r0
  const [ka, setKa] = useState(1); // mass multipliers
  const [kb, setKb] = useState(1);
  const dragging = useRef(false);
  const geometry = useRef(null);

  const preset = PRESETS[presetKey];
  const m1 = preset.a.m * ka;
  const m2 = preset.b.m * kb;
  const r = preset.r0 * ratio;
  const F = (G * m1 * m2) / (r * r);
  const F0 = (G * preset.a.m * preset.b.m) / (preset.r0 * preset.r0);
  const relative = F / F0;

  const { canvasRef } = useCanvas(
    (ctx, w, h) => {
      const cy = h * 0.5;
      const left = 70;
      const right = w - 70;
      const pxPerR0 = (right - left) / (R_MAX + 0.4);
      const ax = left + 20;
      const bx = ax + ratio * pxPerR0;
      geometry.current = { ax, pxPerR0 };

      // faint grid of r0 marks
      ctx.save();
      for (let k = 1; k <= R_MAX; k++) {
        const x = ax + k * pxPerR0;
        ctx.strokeStyle = COLORS.ruleSoft;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(x, 30);
        ctx.lineTo(x, h - 30);
        ctx.stroke();
        label(ctx, `${k} r₀`, x, h - 18, { align: 'center', color: COLORS.text3, size: 12 });
      }
      ctx.restore();

      const sizeA = clamp(16 + Math.cbrt(ka) * 14, 14, 46);
      const sizeB = clamp(10 + Math.cbrt(kb) * 10, 8, 36);

      // centre-to-centre dimension line
      const dimY = cy + Math.max(sizeA, sizeB) + 34;
      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, cy);
      ctx.lineTo(ax, dimY + 6);
      ctx.moveTo(bx, cy);
      ctx.lineTo(bx, dimY + 6);
      ctx.moveTo(ax, dimY);
      ctx.lineTo(bx, dimY);
      ctx.stroke();
      label(ctx, `r = ${sig(ratio, 3)} r₀`, (ax + bx) / 2, dimY - 12, {
        align: 'center',
        font: SERIF,
        italic: true,
        size: 16,
        color: COLORS.text,
      });

      body(ctx, ax, cy, sizeA, preset.a.kind);
      body(ctx, bx, cy, sizeB, preset.b.kind);
      // centres: spheres act as point masses there
      [ax, bx].forEach((x) => {
        ctx.fillStyle = COLORS.deep;
        ctx.beginPath();
        ctx.arc(x, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });

      label(ctx, preset.a.name, ax, cy - sizeA - 16, { align: 'center', color: COLORS.text2 });
      label(ctx, preset.b.name, bx, cy - sizeB - 16, { align: 'center', color: COLORS.text2 });

      // force arrows, drawn to scale (40 px for F at r0 with base masses)
      const gap = bx - ax - sizeA - sizeB - 12;
      const want = 40 * relative;
      const len = Math.min(want, Math.max(gap / 2, 4));
      const clipped = want > len + 0.5;
      const yA = cy - 4;
      arrow(ctx, ax + sizeA + 2, yA, ax + sizeA + 2 + len, yA, COLORS.coral, { width: 3, head: 11 });
      arrow(ctx, bx - sizeB - 2, yA, bx - sizeB - 2 - len, yA, COLORS.coral, { width: 3, head: 11 });
      if (clipped) {
        label(ctx, 'arrows too long to show in full', (ax + bx) / 2, cy + 22, {
          align: 'center',
          size: 12,
          color: COLORS.coral,
        });
      }
      label(ctx, 'F', ax + sizeA + 6 + Math.min(len, 30) / 2, yA - 14, {
        font: SERIF,
        italic: true,
        size: 17,
        color: COLORS.coral,
        align: 'center',
      });
      label(ctx, 'F', bx - sizeB - 6 - Math.min(len, 30) / 2, yA - 14, {
        font: SERIF,
        italic: true,
        size: 17,
        color: COLORS.coral,
        align: 'center',
      });

      label(ctx, 'Drag the right-hand mass', 14, 18, { size: 13, color: COLORS.text3 });
    },
    [ratio, ka, kb, presetKey],
  );

  const onPointer = (e, phase) => {
    const g = geometry.current;
    if (!g) return;
    if (phase === 'down') dragging.current = true;
    if (!dragging.current) return;
    const [x] = localPoint(e, e.currentTarget);
    setRatio(clamp(Math.round(((x - g.ax) / g.pxPerR0) * 20) / 20, R_MIN, R_MAX));
    if (phase === 'up') dragging.current = false;
  };

  const stage = (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'ew-resize', touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPointer(e, 'down');
      }}
      onPointerMove={(e) => onPointer(e, 'move')}
      onPointerUp={(e) => onPointer(e, 'up')}
    >
      <canvas ref={canvasRef} role="img" aria-label={`Two masses ${sig(ratio, 3)} r₀ apart, each pulled towards the other`} />
    </div>
  );

  const k = ka * kb;
  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Force against separation</h3>
        <p>Dots mark r₀, 2r₀ and 3r₀: the force falls to ¼ and then ⅑.</p>
      </div>
      <Plot
        x={[0.4, 4.2]}
        y={[0, 4.4]}
        height={240}
        xLabel="r / r₀"
        yLabel="F / F₀"
        onPointer={(xv) => setRatio(clamp(Math.round(xv * 20) / 20, R_MIN, R_MAX))}
        ariaLabel="Graph of force against separation, an inverse-square curve"
      >
        {({ sx, sy }) => (
          <>
            {k !== 1 && (
              <path d={fnPath((x) => 1 / (x * x), 0.4, 4.2, sx, sy)} fill="none" stroke={COLORS.text3} strokeDasharray="4 4" />
            )}
            <path d={fnPath((x) => k / (x * x), 0.4, 4.2, sx, sy)} fill="none" stroke={COLORS.coral} strokeWidth="2.2" />
            {[1, 2, 3].map((n) => (
              <g key={n}>
                <circle cx={sx(n)} cy={sy(k / (n * n))} r="4" fill={COLORS.deep} stroke={COLORS.coral} strokeWidth="1.6" />
                <text x={sx(n) + 7} y={sy(k / (n * n)) - 8} fill={COLORS.text2} fontSize="12">
                  {n === 1 ? sig(k, 3) : `${sig(k, 3)}/${n * n}`}
                </text>
              </g>
            ))}
            <line x1={sx(ratio)} x2={sx(ratio)} y1={sy(0)} y2={sy(Math.min(4.4, relative))} stroke={COLORS.brass} strokeDasharray="3 3" />
            <circle cx={sx(ratio)} cy={sy(Math.min(4.4, relative))} r="6" fill={COLORS.brass} />
          </>
        )}
      </Plot>
    </div>
  );

  const panel = (
    <>
      <Section title="Choose two masses">
        <Controls>
          <Segmented
            label="Preset pair"
            value={presetKey}
            onChange={(v) => {
              setPresetKey(v);
              setRatio(1);
              setKa(1);
              setKb(1);
            }}
            options={Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))}
          />
          <Slider
            label="Separation r"
            value={ratio}
            min={R_MIN}
            max={R_MAX}
            step={0.05}
            onChange={setRatio}
            display={`${sig(ratio, 3)} r₀`}
            hint={`r₀ = ${preset.r0Text}`}
          />
          <Slider label={preset.a.massLabel} value={ka} min={0.5} max={3} step={0.5} onChange={setKa} display={`× ${ka}`} />
          <Slider label={preset.b.massLabel} value={kb} min={0.5} max={3} step={0.5} onChange={setKb} display={`× ${kb}`} />
        </Controls>
      </Section>

      <Section title="The force">
        <Eq block>
          <V>F</V> = <Frac n={<><V>G</V><V>m</V><sub>1</sub><V>m</V><sub>2</sub></>} d={<><V>r</V><sup>2</sup></>} />
        </Eq>
        <Readouts>
          <Readout label="Force on each mass" value={sci(F)} unit="N" tone={COLORS.coral} wide />
          <Readout label="m₁" value={sci(m1)} unit="kg" tone={COLORS.brass} />
          <Readout label="m₂" value={sci(m2)} unit="kg" tone={COLORS.brass} />
          <Readout label="r" value={sci(r)} unit="m" />
          <Readout label="Compared with F₀" value={`× ${sig(relative, 3)}`} />
        </Readouts>
      </Section>

      <KeyIdeas>
        <li>Gravity is a universal force of attraction between all masses.</li>
        <li>
          The two forces are equal in size and opposite in direction, even when one mass is
          the Earth and the other is you (Newton&rsquo;s third law).
        </li>
        <li>
          It is an inverse-square law: double <V>r</V> and <V>F</V> falls to a quarter; triple
          it and <V>F</V> falls to a ninth.
        </li>
        <li>
          A uniform sphere pulls as if all its mass were at its centre, so <V>r</V> is measured
          centre to centre.
        </li>
        <li>
          <V>G</V> = 6.67 × 10⁻¹¹ N m² kg⁻². Its tiny size is why gravity between everyday
          objects goes unnoticed.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Double one mass. What happens to the force? Now double both.</li>
        <li>Estimate the force between two people a metre apart. Could you ever feel it?</li>
        <li>
          Choose Earth and you: the force is your weight. Move to 2 r₀ (one Earth radius up).
          What do you weigh now?
        </li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} below={below} panel={panel} stageClass="is-short" />;
}

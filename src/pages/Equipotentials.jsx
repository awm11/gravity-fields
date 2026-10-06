import { useEffect, useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, Switch, TryThis } from '../components/ui.jsx';
import { Eq, V } from '../components/Eq.jsx';
import { useCanvas, localPoint } from '../lib/useCanvas.js';
import { contourSegments } from '../lib/contours.js';
import { COLORS, SERIF, arrow, body, chevron, label } from '../lib/draw.js';
import { EARTH, G } from '../lib/physics.js';
import { sci, sig } from '../lib/format.jsx';

/*
 * A planet (Earth's mass and radius), optionally with a second, smaller
 * body. Equipotentials are drawn at equal steps of potential, so they
 * crowd together where the field is strong. Drag the test mass: the work
 * done on it is m × (change in V), whatever route it takes.
 */

const WORLD_HALF_WIDTH = 7.5; // Earth radii from the centre of the view to its side
const STEP = 5e6; // equipotential spacing, J kg⁻¹ (5 MJ kg⁻¹)

export default function Equipotentials({ page }) {
  const [mode, setMode] = useState('one');
  const [moonRatio, setMoonRatio] = useState(0.3);
  const [showLines, setShowLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [mass, setMass] = useState(1);
  const [probe, setProbe] = useState({ x: 3.2, y: 1.6 }); // in Earth radii
  const [trip, setTrip] = useState(null); // { start, path: [[x,y]...] }
  const [walking, setWalking] = useState(false);
  const view = useRef(null);
  const drag = useRef(false);

  const bodies =
    mode === 'one'
      ? [{ x: 0, y: 0, M: EARTH.M, R: 1, kind: 'earth' }]
      : [
          { x: -2.6, y: 0, M: EARTH.M, R: 1, kind: 'earth' },
          { x: 3.6, y: 0, M: EARTH.M * moonRatio, R: 0.35 + 0.45 * Math.cbrt(moonRatio), kind: 'moon' },
        ];

  // potential at a point given in Earth radii
  const potential = (x, y) => {
    let v = 0;
    for (const b of bodies) {
      const d = Math.max(Math.hypot(x - b.x, y - b.y), b.R) * EARTH.R;
      v -= (G * b.M) / d;
    }
    return v;
  };
  const field = (x, y) => {
    let gx = 0;
    let gy = 0;
    for (const b of bodies) {
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.max(Math.hypot(dx, dy), b.R);
      const g = (G * b.M) / (d * EARTH.R) ** 2;
      gx += (g * dx) / d;
      gy += (g * dy) / d;
    }
    return [gx, gy];
  };

  const inside = (x, y, margin = 1.04) => bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.R * margin);

  const Vp = potential(probe.x, probe.y);
  const [gx, gy] = field(probe.x, probe.y);
  const g = Math.hypot(gx, gy);
  // ΔV along the route; differences far below one step are rounding noise
  const rawDV = trip && trip.path.length > 1 ? Vp - potential(...trip.path[0]) : 0;
  const dV = Math.abs(rawDV) < 1e-5 * Math.abs(Vp) ? 0 : rawDV;
  const work = mass * dV;
  const pathLength = trip
    ? trip.path.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - trip.path[i - 1][0], p[1] - trip.path[i - 1][1]) : 0), 0)
    : 0;

  const { canvasRef } = useCanvas(
    (ctx, w, h) => {
      const scale = w / (2 * WORLD_HALF_WIDTH);
      const toPx = (x, y) => [w / 2 + x * scale, h / 2 - y * scale];
      const toWorld = (px, py) => [(px - w / 2) / scale, (h / 2 - py) / scale];
      view.current = { toPx, toWorld, scale };

      ctx.fillStyle = COLORS.deep;
      ctx.fillRect(0, 0, w, h);

      // potential sampled on a grid, contoured at equal steps
      const step = 4;
      const nx = Math.ceil(w / step) + 1;
      const ny = Math.ceil(h / step) + 1;
      const values = new Float32Array(nx * ny);
      const skip = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const [x, y] = toWorld(i * step, j * step);
          values[j * nx + i] = potential(x, y);
          if (inside(x, y, 0.97)) skip[j * nx + i] = 1;
        }
      }
      const levels = [];
      for (let k = 1; k <= 11; k++) levels.push(-STEP * k);
      const segs = contourSegments(values, nx, ny, levels, skip);

      ctx.lineWidth = 1.4;
      segs.forEach((list) => {
        ctx.strokeStyle = 'rgba(158,214,140,0.75)';
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of list) {
          ctx.moveTo(x1 * step, y1 * step);
          ctx.lineTo(x2 * step, y2 * step);
        }
        ctx.stroke();
      });

      // field lines: traced outward from each body, arrows pointing in
      if (showLines) {
        ctx.strokeStyle = 'rgba(124,198,242,0.55)';
        ctx.lineWidth = 1.1;
        for (const b of bodies) {
          const count = Math.max(2, Math.round(16 * (b.M / EARTH.M)));
          for (let n = 0; n < count; n++) {
            const a = (n / count) * Math.PI * 2 + 0.2;
            let x = b.x + Math.cos(a) * b.R;
            let y = b.y + Math.sin(a) * b.R;
            const pts = [toPx(x, y)];
            for (let s = 0; s < 900; s++) {
              const [fx, fy] = field(x, y);
              const f = Math.hypot(fx, fy);
              x -= (fx / f) * 0.03;
              y -= (fy / f) * 0.03;
              if (Math.abs(x) > WORLD_HALF_WIDTH + 1 || Math.abs(y) > (h / scale) / 2 + 1) break;
              if (bodies.some((o) => o !== b && Math.hypot(x - o.x, y - o.y) < o.R)) break;
              pts.push(toPx(x, y));
            }
            ctx.beginPath();
            pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
            ctx.stroke();
            const k = Math.min(pts.length - 2, Math.round(1.4 / 0.03));
            if (k > 1) {
              const [ax, ay] = pts[k];
              const [bx, by] = pts[k - 1];
              const len = Math.hypot(bx - ax, by - ay) || 1;
              chevron(ctx, ax, ay, (bx - ax) / len, (by - ay) / len, 8, 'rgba(124,198,242,0.9)');
            }
          }
        }
      }

      // labels: one per level, on the right-hand side of the main body
      if (showLabels) {
        const main = bodies[0];
        const ang = mode === 'one' ? -0.62 : 2.35;
        let last = null;
        // outermost first; skip a label that would crowd the one before
        levels.forEach((L) => {
          const r = (G * main.M) / -L / EARTH.R; // radius for a lone mass
          if (r < main.R * 1.15) return;
          const [px, py] = toPx(main.x + Math.cos(ang) * r, main.y + Math.sin(ang) * r);
          if (px < 30 || px > w - 30 || py < 14 || py > h - 14) return;
          if (last && Math.hypot(px - last[0], py - last[1]) < 24) return;
          last = [px, py];
          label(ctx, `${-L / 1e6}`, px, py, { size: 11, color: COLORS.sage, align: 'center' });
        });
        label(ctx, 'V in −MJ kg⁻¹', 14, h - 18, { size: 12, color: COLORS.sage });
      }

      bodies.forEach((b) => {
        const [px, py] = toPx(b.x, b.y);
        body(ctx, px, py, b.R * scale, b.kind);
      });

      // the trip so far
      if (trip && trip.path.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLORS.coral;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        trip.path.forEach(([x, y], i) => {
          const [px, py] = toPx(x, y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
        const [sx, sy] = toPx(...trip.path[0]);
        ctx.fillStyle = COLORS.coral;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        label(ctx, 'start', sx + 8, sy - 10, { size: 12, color: COLORS.coral });
      }

      // the test mass and the field on it
      const [px, py] = toPx(probe.x, probe.y);
      const glen = Math.min(90, 14 + 26 * Math.log10(1 + g * 10));
      arrow(ctx, px, py, px + (gx / g) * glen, py - (gy / g) * glen, COLORS.sky, { width: 2.4, head: 10 });
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.deep;
      ctx.stroke();
      label(ctx, 'm', px + 12, py + 12, { font: SERIF, italic: true, size: 16, color: COLORS.text });
    },
    [mode, moonRatio, showLines, showLabels, probe, trip],
  );

  // walk the test mass along its equipotential, one full loop
  useEffect(() => {
    if (!walking) return undefined;
    const level = potential(probe.x, probe.y);
    let { x, y } = probe;
    let raf;
    let travelled = 0;
    const startAngle = Math.atan2(y - bodies[0].y, x - bodies[0].x);
    let turned = 0;
    let lastAngle = startAngle;
    const stepOnce = () => {
      for (let k = 0; k < 6; k++) {
        const [fx, fy] = field(x, y);
        const f = Math.hypot(fx, fy);
        // move at right angles to the field (along the equipotential)
        x += (-fy / f) * 0.02;
        y += (fx / f) * 0.02;
        // pull back onto the level: Newton step along the field
        const err = potential(x, y) - level;
        const [gx2, gy2] = field(x, y);
        const g2 = gx2 * gx2 + gy2 * gy2;
        const corr = err / (g2 * EARTH.R);
        x += gx2 * corr;
        y += gy2 * corr;
        travelled += 0.02;
        const ang = Math.atan2(y - bodies[0].y, x - bodies[0].x);
        let da = ang - lastAngle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        turned += da;
        lastAngle = ang;
      }
      const pt = { x, y };
      setProbe(pt);
      setTrip((t) => (t ? { ...t, path: [...t.path, [x, y]] } : t));
      if (Math.abs(turned) >= Math.PI * 2 || travelled > 80) {
        setWalking(false);
        return;
      }
      raf = requestAnimationFrame(stepOnce);
    };
    setTrip({ path: [[x, y]] });
    raf = requestAnimationFrame(stepOnce);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking]);

  const onPointer = (e, phase) => {
    const v = view.current;
    if (!v || walking) return;
    const [px, py] = localPoint(e, e.currentTarget);
    let [x, y] = v.toWorld(px, py);
    if (phase === 'down') {
      const [tx, ty] = v.toPx(probe.x, probe.y);
      if (Math.hypot(px - tx, py - ty) > 26) {
        // tap elsewhere: move the test mass there, start a fresh trip
        if (inside(x, y)) return;
        setProbe({ x, y });
        setTrip(null);
        return;
      }
      drag.current = true;
      setTrip({ path: [[probe.x, probe.y]] });
      return;
    }
    if (!drag.current) return;
    if (phase === 'up') {
      drag.current = false;
      return;
    }
    // stay outside the bodies
    for (const b of bodies) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.R * 1.08) {
        x = b.x + ((x - b.x) / (d || 1)) * b.R * 1.08;
        y = b.y + ((y - b.y) / (d || 1)) * b.R * 1.08;
      }
    }
    setProbe({ x, y });
    setTrip((t) => (t ? { ...t, path: [...t.path, [x, y]] } : t));
  };

  const legend = (
    <Legend
      items={[
        { label: 'Equipotentials, 5 MJ kg⁻¹ apart', color: COLORS.sage },
        { label: 'Field lines', color: COLORS.sky },
        { label: 'Your route', color: COLORS.coral, kind: 'dashed' },
      ]}
    />
  );

  const stage = (
    <>
      <div
        style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPointer(e, 'down');
        }}
        onPointerMove={(e) => onPointer(e, 'move')}
        onPointerUp={(e) => onPointer(e, 'up')}
      >
        <canvas ref={canvasRef} role="img" aria-label="Equipotential lines and field lines around a planet, with a test mass" />
      </div>
      <p className="stage-note">Drag the test mass m. Its route is drawn as you go.</p>
    </>
  );

  const panel = (
    <>
      <Section title="Set up">
        <Controls>
          <Segmented
            label="Bodies"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setTrip(null);
              setProbe(m === 'one' ? { x: 3.2, y: 1.6 } : { x: 0.6, y: 2.6 });
            }}
            options={[
              { value: 'one', label: 'One planet' },
              { value: 'two', label: 'Planet and moon' },
            ]}
          />
          {mode === 'two' && (
            <Slider
              label="Mass of the moon"
              value={moonRatio}
              min={0.05}
              max={1}
              step={0.05}
              onChange={setMoonRatio}
              display={`${sig(moonRatio, 2)} × planet`}
            />
          )}
          <Slider label="Test mass m" value={mass} min={1} max={1000} step={1} onChange={setMass} display={`${mass} kg`} />
          <Switch label="Show field lines" checked={showLines} onChange={setShowLines} />
          <Switch label="Label equipotentials" checked={showLabels} onChange={setShowLabels} />
          <div className="row">
            <Button primary onClick={() => setWalking(true)} disabled={walking}>
              Walk along this equipotential
            </Button>
            <Button onClick={() => setTrip(null)} disabled={!trip || walking}>
              Clear route
            </Button>
          </div>
        </Controls>
      </Section>

      <Section title="At the test mass">
        <Readouts>
          <Readout label="Potential V" value={sig(Vp / 1e6, 3)} unit="MJ kg⁻¹" tone={COLORS.sage} />
          <Readout label="Field strength g" value={sig(g, 3)} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="Potential energy mV" value={sci(mass * Vp)} unit="J" tone={COLORS.pe} wide />
        </Readouts>
      </Section>

      <Section title="Work done along your route">
        <Eq block>
          Δ<V>W</V> = <V>m</V>Δ<V>V</V>
        </Eq>
        <Readouts>
          <Readout
            label="Work done on the mass"
            value={trip && trip.path.length > 1 ? sci(work) : '—'}
            unit={trip && trip.path.length > 1 ? 'J' : ''}
            tone={COLORS.coral}
            wide
          />
          <Readout
            label="ΔV from start to here"
            value={trip && trip.path.length > 1 ? sig(dV / 1e6, 3) : '—'}
            unit={trip && trip.path.length > 1 ? 'MJ kg⁻¹' : ''}
          />
          <Readout label="Distance travelled" value={trip ? `${sig(pathLength, 3)} R` : '—'} />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          Take two different routes between the same two equipotentials: the work done is the
          same. Only the start and end potentials matter.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          The gravitational potential <V>V</V> at a point is the work done per unit mass to
          bring a small mass there from infinity. It is zero at infinity and negative everywhere
          else.
        </li>
        <li>
          Moving a mass <V>m</V> through a potential difference Δ<V>V</V> takes work Δ<V>W</V> = <V>m</V>Δ<V>V</V>,
          whatever the route.
        </li>
        <li>
          An equipotential joins points of equal potential. No work is done moving along one.
          Around a single planet they are spheres.
        </li>
        <li>Field lines cross equipotentials at right angles.</li>
        <li>
          Drawn at equal steps of <V>V</V>, equipotentials are closest together where the field
          is strongest.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Walk along an equipotential. Why is the work done zero, even though gravity acts all the way round?</li>
        <li>Drag the mass from one equipotential to the next one out. How much work is that for 1 kg?</li>
        <li>With a moon, find the place between the bodies where the field lines pull in opposite directions.</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" panel={panel} />;
}

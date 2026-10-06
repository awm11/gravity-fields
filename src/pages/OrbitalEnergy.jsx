import { useEffect, useRef, useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, Nw, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { useCanvas } from '../lib/useCanvas.js';
import { COLORS, SANS, SERIF, arrow, body, label, stars } from '../lib/draw.js';
import { EARTH, G, prefersReducedMotion } from '../lib/physics.js';
import { sig } from '../lib/format.jsx';

/*
 * A satellite in a circular orbit around the Earth, and its energies:
 *   KE = GMm/2r,  PE = −GMm/r,  E = KE + PE = −GMm/2r.
 * "Move to the new orbit" spirals it gently from r₁ to r₂ (as a slow,
 * continuous engine burn would), always at the circular speed for its
 * current radius, so the energy bars change smoothly.
 *
 * Radii are in Earth radii; energies in GJ.
 */

const GM = G * EARTH.M;
const R_MIN = 1.05;
const R_MAX = 8;
const KE_COLOR = COLORS.ke;
const PE_COLOR = COLORS.pe;
const E_COLOR = COLORS.brass;

export default function OrbitalEnergy({ page }) {
  const [mass, setMass] = useState(1000);
  const [r1, setR1] = useState(1.5);
  const [r2, setR2] = useState(3);
  const [rNow, setRNow] = useState(1.5);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(3);
  const sim = useRef({ angle: 0.4, last: null });
  const rRef = useRef(rNow);
  rRef.current = rNow;

  const energies = (r) => {
    const pe = (-GM * mass) / (r * EARTH.R) / 1e9;
    return { ke: -pe / 2, pe, e: pe / 2 };
  };
  const now = energies(rNow);
  const at1 = energies(r1);
  const at2 = energies(r2);
  const speed = Math.sqrt(GM / (rNow * EARTH.R));

  // the spiral from wherever it is to the target orbit
  useEffect(() => {
    if (!moving) return undefined;
    const from = rRef.current;
    const to = target;
    const start = performance.now();
    const length = 3500;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / length);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setRNow(from + (to - from) * ease);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setMoving(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  const goTo = (to) => {
    if (prefersReducedMotion()) {
      setRNow(to);
      return;
    }
    setTarget(to);
    setMoving(true);
  };

  const { canvasRef } = useCanvas(
    (ctx, w, h, t) => {
      const s = sim.current;
      const dt = s.last == null ? 0 : Math.min(0.05, (t - s.last) / 1000);
      s.last = t;
      const r = rRef.current;
      // angular speed ∝ r^(−3/2); an orbit of r = 1.5 R takes about 3 s
      if (!prefersReducedMotion()) s.angle += dt * ((2 * Math.PI) / 3) * (1.5 / r) ** 1.5;

      // --- the orbit view, on the left ---
      const wide = w > 620;
      const split = wide ? w * 0.62 : w;
      const ox = split / 2;
      const oy = wide ? h / 2 : h * 0.34;
      const fit = Math.max(r1, r2, r) * 1.08;

      // the stars drift in a little as the view zooms out for bigger orbits
      stars(ctx, w, h, Math.round((w * h) / 6000), 9, ((R_MIN * 1.08) / fit) ** 0.25);
      const scale = (Math.min(split, wide ? h : h * 0.56) * 0.45) / fit; // px per R

      const ring = (radius, color, dash) => {
        ctx.save();
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(ox, oy, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      ring(r1, COLORS.text3, [4, 6]);
      ring(r2, 'rgba(227,178,91,0.7)', [4, 6]);
      label(ctx, 'r₁', ox + r1 * scale * 0.71 + 6, oy - r1 * scale * 0.71 - 6, { color: COLORS.text3, size: 13 });
      label(ctx, 'r₂', ox + r2 * scale * 0.71 + 6, oy - r2 * scale * 0.71 - 6, { color: COLORS.brass, size: 13 });

      body(ctx, ox, oy, scale, 'earth');

      const sx = ox + Math.cos(-s.angle) * r * scale;
      const sy = oy + Math.sin(-s.angle) * r * scale;
      const vLen = 26 + 22 * Math.sqrt(1.5 / r) * 1.4;
      const tx = Math.sin(-s.angle);
      const ty = -Math.cos(-s.angle);
      arrow(ctx, sx, sy, sx + tx * vLen, sy + ty * vLen, COLORS.text, { width: 2, head: 9 });
      label(ctx, 'v', sx + tx * (vLen + 11), sy + ty * (vLen + 11), {
        font: SERIF,
        italic: true,
        size: 16,
        color: COLORS.text,
        align: 'center',
      });
      body(ctx, sx, sy, 5, 'sat');

      // --- energy bars, on the right (or below on a narrow screen) ---
      const bx0 = wide ? split + 10 : 30;
      const bw = wide ? w - split - 30 : w - 60;
      const top = 50;
      const zero = wide ? h * 0.36 : h * 0.73;
      const unit = (wide ? h * 0.5 : h * 0.13) / Math.abs(energies(Math.min(r1, r2, r)).pe);
      const bars = [
        { key: 'ke', name: 'KE', v: now.ke, start: at1.ke, color: KE_COLOR },
        { key: 'pe', name: 'PE', v: now.pe, start: at1.pe, color: PE_COLOR },
        { key: 'e', name: 'Total', v: now.e, start: at1.e, color: E_COLOR },
      ];
      const slot = bw / 3;
      ctx.strokeStyle = COLORS.text3;
      ctx.beginPath();
      ctx.moveTo(bx0, zero);
      ctx.lineTo(bx0 + bw, zero);
      ctx.stroke();
      label(ctx, '0', bx0 - 4, zero, { align: 'right', size: 11, color: COLORS.text3 });
      bars.forEach((b, i) => {
        const x = bx0 + slot * i + slot * 0.22;
        const bwid = slot * 0.56;
        const hNow = -b.v * unit; // signed height in px (up is negative)
        const hStart = -b.start * unit;
        ctx.fillStyle = b.color;
        ctx.fillRect(x, zero, bwid, hNow);

        // The starting orbit's value (r₁), as a dashed outline. Where it
        // lies inside the bar now (the new orbit is smaller), it is drawn
        // dark so it shows against the bar.
        const sameSide = Math.sign(hNow) === Math.sign(hStart);
        const startInside = sameSide && Math.abs(hStart) <= Math.abs(hNow) + 0.5;
        // only once the satellite has left r₁ is there anything to compare
        const showStart = Math.abs(r - r1) > 1e-3;
        ctx.save();
        if (!showStart) ctx.globalAlpha = 0;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = startInside ? 1.6 : 1;
        ctx.strokeStyle = startInside ? 'rgba(9,13,25,0.85)' : b.color;
        if (showStart) ctx.globalAlpha = startInside ? 1 : 0.6;
        ctx.strokeRect(x + 1, zero, bwid - 2, hStart);
        ctx.restore();

        // Labels go inside the bar, in dark text, when it is big enough;
        // otherwise just beyond its end, in the bar's colour.
        const name = b.name;
        const value = `${sig(b.v, 3)} GJ`;
        ctx.font = `700 13px ${SANS}`;
        const nameW = ctx.measureText(name).width;
        ctx.font = `400 12px ${SANS}`;
        const textW = Math.max(nameW, ctx.measureText(value).width);
        const inside = Math.abs(hNow) >= 44 && textW <= bwid - 4;
        const end = zero + hNow;
        if (inside) {
          // name then value, reading down from the end of an upward bar,
          // or up from the end of a downward one
          const up = hNow < 0;
          const yName = up ? end + 16 : end - 32;
          const yValue = up ? end + 32 : end - 16;
          barLabel(ctx, name, x + bwid / 2, yName, b.color, 700);
          barLabel(ctx, value, x + bwid / 2, yValue, b.color, 400);
        } else {
          // beyond the bar, and beyond the dashed r₁ outline if that reaches further
          const reach = Math.abs(hStart) > Math.abs(hNow) && Math.sign(hStart) === Math.sign(hNow) ? hStart : hNow;
          const out = zero + reach;
          label(ctx, name, x + bwid / 2, b.v >= 0 ? out - 30 : out + 16, { align: 'center', size: 13, color: b.color, weight: 700 });
          label(ctx, value, x + bwid / 2, b.v >= 0 ? out - 14 : out + 32, { align: 'center', size: 12, color: COLORS.text2 });
        }
      });
      if (wide) label(ctx, `Energy of the ${mass} kg satellite`, bx0, top - 24, { size: 13, color: COLORS.text2 });
    },
    [r1, r2, mass, rNow],
    { animate: true },
  );

  const stage = (
    <>
      <canvas ref={canvasRef} role="img" aria-label={`A satellite orbiting at ${sig(rNow, 3)} Earth radii, with bars for its kinetic, potential and total energy`} />
      <p className="stage-note">Orbits to scale. Once the satellite moves, dashed outlines show its energies in the starting orbit, r₁.</p>
    </>
  );

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Energy against orbit radius</h3>
        <p>KE and total energy mirror each other; PE is twice as deep.</p>
      </div>
      <Plot
        x={[0, R_MAX]}
        y={[energies(1).pe * 1.05, -energies(1).pe * 0.6]}
        height={250}
        xTicks={[0, 1, 2, 3, 4, 5, 6, 7, 8]}
        xLabel="r / R"
        yLabel="energy / GJ"
        ariaLabel="Kinetic, potential and total energy of a satellite against orbit radius"
      >
        {({ sx, sy }) => {
          const ke = (r) => energies(r).ke;
          const pe = (r) => energies(r).pe;
          const e = (r) => energies(r).e;
          return (
            <>
              <rect x={sx(0)} y={sy(-energies(1).pe * 0.6)} width={sx(1) - sx(0)} height={sy(energies(1).pe * 1.05) - sy(-energies(1).pe * 0.6)} fill="rgba(47,127,184,0.12)" />
              {[r1, r2].map((r, i) => (
                <line key={i} x1={sx(r)} x2={sx(r)} y1={sy(pe(r))} y2={sy(ke(r))} stroke={i ? COLORS.brass : COLORS.text3} strokeDasharray="3 4" />
              ))}
              <path d={fnPath(ke, 1, R_MAX, sx, sy)} fill="none" stroke={KE_COLOR} strokeWidth="2.2" />
              <path d={fnPath(pe, 1, R_MAX, sx, sy)} fill="none" stroke={PE_COLOR} strokeWidth="2.2" />
              <path d={fnPath(e, 1, R_MAX, sx, sy)} fill="none" stroke={E_COLOR} strokeWidth="2.2" />
              {[ke, pe, e].map((f, i) => (
                <circle key={i} cx={sx(rNow)} cy={sy(f(rNow))} r="5.5" fill={[KE_COLOR, PE_COLOR, E_COLOR][i]} stroke={COLORS.deep} strokeWidth="2" />
              ))}
              <text className="plot-note" x={sx(r1)} y={sy(ke(r1)) - 8} textAnchor="middle">
                r₁
              </text>
              <text className="plot-note" x={sx(r2)} y={sy(ke(r2)) - 8} textAnchor="middle" style={{ fill: COLORS.brass }}>
                r₂
              </text>
            </>
          );
        }}
      </Plot>
      <div style={{ marginTop: 4 }}>
        <Legend
          items={[
            { label: 'Kinetic, GMm/2r', color: KE_COLOR },
            { label: 'Potential, −GMm/r', color: PE_COLOR },
            { label: 'Total, −GMm/2r', color: E_COLOR },
          ]}
        />
      </div>
    </div>
  );

  const dKE = at2.ke - at1.ke;
  const dPE = at2.pe - at1.pe;
  const dE = at2.e - at1.e;

  const panel = (
    <>
      <Section title="Choose the orbits">
        <Controls>
          <Slider
            label="Starting orbit r₁"
            value={r1}
            min={R_MIN}
            max={R_MAX}
            step={0.05}
            onChange={(v) => {
              setR1(v);
              setRNow(v);
            }}
            disabled={moving}
            display={`${sig(r1, 3)} R`}
          />
          <Slider
            label="New orbit r₂"
            value={r2}
            min={R_MIN}
            max={R_MAX}
            step={0.05}
            onChange={setR2}
            disabled={moving}
            display={`${sig(r2, 3)} R`}
          />
          <Slider
            label="Mass of the satellite m"
            value={mass}
            min={100}
            max={5000}
            step={100}
            onChange={setMass}
            disabled={moving}
            display={`${mass} kg`}
          />
          <div className="row">
            <Button primary onClick={() => goTo(r2)} disabled={moving || Math.abs(rNow - r2) < 1e-3}>
              Move to the new orbit
            </Button>
            <Button onClick={() => goTo(r1)} disabled={moving || Math.abs(rNow - r1) < 1e-3}>
              Back to r₁
            </Button>
          </div>
        </Controls>
      </Section>

      <Section title="In the orbit now">
        <Readouts>
          <Readout label="Radius" value={sig(rNow, 3)} unit="R" />
          <Readout label="Speed" value={sig(speed / 1000, 3)} unit="km s⁻¹" tone={COLORS.text} />
          <Readout label="Kinetic energy" value={sig(now.ke, 3)} unit="GJ" tone={KE_COLOR} />
          <Readout label="Potential energy" value={sig(now.pe, 3)} unit="GJ" tone={PE_COLOR} />
          <Readout label="Total energy" value={sig(now.e, 3)} unit="GJ" tone={E_COLOR} />
          <Readout label="Needed to escape from here" value={`+${sig(-now.e, 3)}`} unit="GJ" />
        </Readouts>
      </Section>

      <Section title="From r₁ to r₂">
        <Readouts>
          <Readout label="Change in KE" value={signed(dKE)} unit="GJ" tone={KE_COLOR} />
          <Readout label="Change in PE" value={signed(dPE)} unit="GJ" tone={PE_COLOR} />
          <Readout label="Change in total energy" value={signed(dE)} unit="GJ" tone={E_COLOR} wide />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          {Math.abs(dE) < 1e-9
            ? 'Choose a different new orbit to compare.'
            : dE > 0
              ? `Going up, the engines must supply ${sig(dE, 3)} GJ. The potential energy rises by twice that; the other half comes from kinetic energy, so the satellite ends up slower.`
              : `Going down, the satellite must lose ${sig(-dE, 3)} GJ, yet its kinetic energy rises: it ends up faster. This is what atmospheric drag does to a low satellite.`}
        </p>
      </Section>

      <Section title="The energies">
        <Eq block>
          <Nw>KE = ½<V>mv</V>² = <Frac n={<V>GMm</V>} d={<>2<V>r</V></>} /></Nw>
          &nbsp;&nbsp; <Nw>PE = −<Frac n={<V>GMm</V>} d={<V>r</V>} /></Nw>
        </Eq>
        <Eq block>
          <Nw><V>E</V> = KE + PE = −<Frac n={<V>GMm</V>} d={<>2<V>r</V></>} /></Nw>
        </Eq>
        <p>
          The kinetic energy comes from the orbit condition <Nw><V>v</V>² = <V>GM</V>/<V>r</V></Nw>.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          An orbiting satellite has kinetic energy and (negative) potential energy. Its total
          energy is negative: it is bound to the planet.
        </li>
        <li>
          In a circular orbit the kinetic energy is always half the size of the potential energy,
          and the total energy equals minus the kinetic energy.
        </li>
        <li>
          A higher orbit has more total energy (less negative) but less kinetic energy. Moving up
          takes energy, even though the satellite ends up slower.
        </li>
        <li>
          To escape from an orbit, a satellite needs enough extra energy to raise its total to zero:
          <Nw>+<V>GMm</V>/2<V>r</V></Nw>.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Double the radius. What happens to each of KE, PE and the total?</li>
        <li>Why does atmospheric drag make a low satellite speed up?</li>
        <li>
          Compare the energy needed to escape from an orbit at 1.05 R with the energy needed to
          escape from the ground.
        </li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} below={below} panel={panel} notesWide />;
}

/** Dark text inside a bar, with a halo in the bar's own colour. */
function barLabel(ctx, text, x, y, halo, weight) {
  ctx.save();
  ctx.font = `${weight} ${weight === 700 ? 13 : 12}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = COLORS.deep;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const signed = (v) => (Math.abs(v) < 1e-9 ? '0' : v > 0 ? `+${sig(v, 3)}` : sig(v, 3));

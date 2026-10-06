import { useState } from 'react';
import { PageLayout } from '../components/Shell.jsx';
import { Controls, KeyIdeas, Readout, Readouts, Section, Segmented, Switch, TryThis } from '../components/ui.jsx';
import { Eq, EqLine, Frac, Nw, V } from '../components/Eq.jsx';
import { Plot, areaPath, fnPath } from '../components/Plot.jsx';
import { COLORS } from '../lib/draw.js';
import { EARTH, clamp } from '../lib/physics.js';
import { sig } from '../lib/format.jsx';

/*
 * The Earth's V–r and g–r graphs, one above the other on the same r axis.
 * Gradient mode: the tangent to V at r has gradient GM/r², and g is minus
 * that gradient. Area mode: the area under g between r₁ and r₂ is the
 * change in potential between them.
 *
 * Distances are in Earth radii; V in MJ kg⁻¹; g in N kg⁻¹.
 */

const R_MAX = 6;
// The surface field is set to the familiar 9.81 N kg⁻¹ (G, M and R as
// quoted give 9.82), and V at the surface follows from it: V = −gR, since
// GM = gR². This keeps the two graphs exactly consistent.
const G_SURFACE = 9.81; // N kg⁻¹
const V_SURFACE = (G_SURFACE * EARTH.R) / 1e6; // 62.50 MJ kg⁻¹
const SQUARE = 1 * 2 * EARTH.R / 1e6; // one grid square on the g graph: 1 R × 2 N kg⁻¹, in MJ kg⁻¹

// potential (MJ kg⁻¹) and field strength (N kg⁻¹) at r, in Earth radii
const Vr = (r) => (r >= 1 ? -V_SURFACE / r : (-V_SURFACE * (3 - r * r)) / 2);
const gr = (r) => (r >= 1 ? G_SURFACE / (r * r) : G_SURFACE * r);
// g as plotted: negative, because the field points inwards
const gSigned = (r) => -gr(r);
// gradient of V, in MJ kg⁻¹ per R
const slope = (r) => (r >= 1 ? V_SURFACE / (r * r) : V_SURFACE * r);

export default function Gradient({ page }) {
  const [mode, setMode] = useState('gradient');
  const [inside, setInside] = useState(false);
  const [r, setR] = useState(2);
  const [span, setSpan] = useState([1.5, 3.5]);

  const rMin = inside ? 0 : 1;
  const vFloor = inside ? -100 : -70;

  const pick = (xv) => {
    // Dragging inside the planet switches that region on, so the line can
    // be taken right down to r = 0, where g and the gradient are zero.
    let x = clamp(Math.round(xv * 20) / 20, 0, R_MAX);
    if (x < 1 && !inside) {
      if (xv < 0.95) setInside(true);
      else x = 1;
    }
    if (mode === 'gradient') {
      setR(x);
    } else {
      // move whichever end is nearer
      const [a, b] = span;
      setSpan(Math.abs(x - a) <= Math.abs(x - b) ? [Math.max(0, Math.min(x, b - 0.1)), b] : [a, Math.max(x, a + 0.1)]);
    }
  };

  const toggleInside = (on) => {
    setInside(on);
    if (!on) {
      setR((v) => Math.max(1, v));
      setSpan(([a, b]) => [Math.max(1, a), Math.max(1.1, b)]);
    }
  };

  // gradient mode
  const s = slope(r); // MJ kg⁻¹ per R
  const sSI = (s * 1e6) / EARTH.R; // J kg⁻¹ m⁻¹ = N kg⁻¹
  const dr = s > 0 ? Math.min(1, 24 / s) : 1; // triangle base, in R
  // below about 1.6 R the base is less than 1 R: show it to 3 figures so the
  // sum in the panel works out with the numbers shown
  const drText = dr < 1 ? sig(dr, 3) : sig(dr, 2);
  // area mode
  const [r1, r2] = span;
  const dV = Vr(r2) - Vr(r1); // MJ kg⁻¹
  const area = dV; // area under g between r1 and r2, MJ kg⁻¹
  const squares = area / SQUARE;

  const xTicks = [0, 1, 2, 3, 4, 5, 6];
  const shadeInside = ({ sx, sy }, top, bottom) => (
    <>
      <rect x={sx(0)} y={sy(top)} width={sx(1) - sx(0)} height={sy(bottom) - sy(top)} fill="rgba(47,127,184,0.12)" />
      <text className="plot-note" x={sx(0.5)} y={sy(top) + 16} textAnchor="middle" style={{ fill: 'var(--text-3)' }}>
        planet
      </text>
    </>
  );

  const stage = (
    <>
      <div className="figure-head">
        <h3>Potential, <V>V</V></h3>
        <p>
          {mode === 'gradient'
            ? 'The tangent’s gradient is ΔV/Δr. Drag either graph to move it.'
            : 'The change in potential from r₁ to r₂. Drag either graph to move the nearer end.'}
        </p>
      </div>
      <Plot
        x={[0, R_MAX]}
        y={[vFloor, 0]}
        height={250}
        xTicks={xTicks}
        yTicks={inside ? [-100, -80, -60, -40, -20, 0] : [-70, -60, -50, -40, -30, -20, -10, 0]}
        xFormat={(v) => `${v}`}
        xLabel="r / R"
        yLabel="V / MJ kg⁻¹"
        onPointer={pick}
        ariaLabel="Graph of potential against distance: negative, rising towards zero"
      >
        {(sc) => {
          const { sx, sy } = sc;
          return (
            <>
              {shadeInside(sc, 0, vFloor)}
              <path d={fnPath(Vr, Math.max(rMin, 0.001), R_MAX, sx, sy, 300)} fill="none" stroke={COLORS.sage} strokeWidth="2.4" />

              {mode === 'gradient' && (
                <>
                  <line
                    x1={sx(r - 1.4)}
                    y1={sy(Vr(r) - 1.4 * s)}
                    x2={sx(r + 1.4)}
                    y2={sy(Vr(r) + 1.4 * s)}
                    stroke={COLORS.brass}
                    strokeWidth="1.6"
                  />
                  {/* gradient triangle (none at the centre, where the tangent is flat) */}
                  {s > 0 ? (
                  <>
                  <path
                    d={`M${sx(r)},${sy(Vr(r))} L${sx(r + dr)},${sy(Vr(r))} L${sx(r + dr)},${sy(Vr(r) + dr * s)}`}
                    fill="rgba(227,178,91,0.12)"
                    stroke={COLORS.brass}
                    strokeDasharray="4 3"
                  />
                  <text className="plot-note" x={sx(r + dr / 2)} y={sy(Vr(r)) + 16} textAnchor="middle">
                    Δr = {drText} R
                  </text>
                  <text className="plot-note" x={sx(r + dr) + 6} y={sy(Vr(r) + (dr * s) / 2)} dominantBaseline="middle">
                    ΔV = {sig(dr * s, 3)}
                  </text>
                  </>
                  ) : (
                    <text className="plot-note" x={sx(r) + 12} y={sy(Vr(r)) - 12}>
                      flat tangent: gradient = 0, so g = 0
                    </text>
                  )}
                  <line x1={sx(r)} x2={sx(r)} y1={sy(0)} y2={sy(vFloor)} stroke={COLORS.brass} strokeOpacity="0.35" />
                  <circle cx={sx(r)} cy={sy(Vr(r))} r="6" fill={COLORS.brass} />
                </>
              )}

              {mode === 'area' && (
                <>
                  {[r1, r2].map((x, i) => (
                    <g key={i}>
                      <line x1={sx(x)} x2={sx(x)} y1={sy(0)} y2={sy(vFloor)} stroke={COLORS.coral} strokeOpacity="0.35" />
                      <line x1={sx(x)} x2={sx(R_MAX) + 20} y1={sy(Vr(x))} y2={sy(Vr(x))} stroke={COLORS.coral} strokeDasharray="3 4" strokeOpacity="0.7" />
                      <circle cx={sx(x)} cy={sy(Vr(x))} r="6" fill={COLORS.coral} />
                    </g>
                  ))}
                  {/* the change in V, as a bracket on the right */}
                  <g>
                    <line x1={sx(R_MAX) - 14} x2={sx(R_MAX) - 14} y1={sy(Vr(r1))} y2={sy(Vr(r2))} stroke={COLORS.coral} strokeWidth="2.4" />
                    <text className="plot-note" x={sx(R_MAX) - 20} y={sy((Vr(r1) + Vr(r2)) / 2)} textAnchor="end" dominantBaseline="middle">
                      ΔV = {sig(dV, 3)}
                    </text>
                  </g>
                </>
              )}
            </>
          );
        }}
      </Plot>

      <div className="plot-gap" />

      <div className="figure-head">
        <h3>Field strength, <V>g</V></h3>
        <p>
          {mode === 'gradient'
            ? 'g is minus the gradient above: negative, because the field points in towards the planet.'
            : 'The size of the shaded area, between the curve and the r axis, equals the change in V above.'}
        </p>
      </div>
      <Plot
        x={[0, R_MAX]}
        y={[-10, 0]}
        height={230}
        xTicks={xTicks}
        yTicks={[-10, -8, -6, -4, -2, 0]}
        xLabel="r / R"
        yLabel="g / N kg⁻¹"
        onPointer={pick}
        ariaLabel="Graph of field strength against distance: negative, an inverse-square curve outside the planet rising towards zero"
      >
        {(sc) => {
          const { sx, sy } = sc;
          return (
            <>
              {shadeInside(sc, 0, -10)}
              {mode === 'area' && <path d={areaPath(gSigned, r1, r2, sx, sy, 0)} fill="rgba(242,115,94,0.28)" stroke="none" />}
              <path d={fnPath(gSigned, rMin, R_MAX, sx, sy, 300)} fill="none" stroke={COLORS.sky} strokeWidth="2.4" />
              {mode === 'gradient' && (
                <>
                  <line x1={sx(r)} x2={sx(r)} y1={sy(-10)} y2={sy(0)} stroke={COLORS.brass} strokeOpacity="0.35" />
                  <line x1={sx(0)} x2={sx(r)} y1={sy(gSigned(r))} y2={sy(gSigned(r))} stroke={COLORS.brass} strokeDasharray="3 4" />
                  <circle cx={sx(r)} cy={sy(gSigned(r))} r="6" fill={COLORS.brass} />
                </>
              )}
              {mode === 'area' &&
                [r1, r2].map((x, i) => (
                  <g key={i}>
                    <line x1={sx(x)} x2={sx(x)} y1={sy(-10)} y2={sy(0)} stroke={COLORS.coral} strokeOpacity="0.5" />
                    <text className="plot-note" x={sx(x) + 6} y={sy(-9.3)} textAnchor="start">
                      {i ? 'r₂' : 'r₁'}
                    </text>
                  </g>
                ))}
            </>
          );
        }}
      </Plot>
      {inside && (
        <p className="plot-caption">
          The shaded band is inside the planet, modelled as a uniform sphere: there the size of{' '}
          <V>g</V> grows in proportion to <V>r</V>, from zero at the centre to 9.81 N kg⁻¹ at the
          surface.
        </p>
      )}
    </>
  );

  const panel = (
    <>
      <Section title="Choose a view">
        <Controls>
          <Segmented
            label="What to show"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'gradient', label: 'g from the gradient' },
              { value: 'area', label: 'ΔV from the area' },
            ]}
          />
          <Switch label="Include inside the planet" checked={inside} onChange={toggleInside} />
        </Controls>
      </Section>

      {mode === 'gradient' ? (
        <Section title="Gradient of the potential">
          <Eq block>
            <Nw><V>g</V> = −<Frac n={<>Δ<V>V</V></>} d={<>Δ<V>r</V></>} /></Nw>
          </Eq>
          <Readouts>
            <Readout label="Distance r" value={sig(r, 3)} unit="R" />
            <Readout label="Potential V" value={sig(Vr(r), 3)} unit="MJ kg⁻¹" tone={COLORS.sage} />
            <Readout label="Gradient ΔV/Δr" value={sSI > 0 ? `+${sig(sSI, 3)}` : '0'} unit="J kg⁻¹ m⁻¹" tone={COLORS.brass} wide />
            <Readout label="Field strength g" value={sSI > 0 ? sig(-sSI, 3) : '0'} unit="N kg⁻¹" tone={COLORS.sky} wide />
          </Readouts>
          <p style={{ marginTop: 10 }}>
            {r === 0 ? (
              <>
                At the centre the tangent is flat: the gradient is zero, so <Nw><V>g</V> = 0</Nw>. Every part
                of the planet pulls equally in every direction.
              </>
            ) : (
              <>
                The gradient is positive: <V>V</V> rises as you move out. So <V>g</V>, minus the
                gradient, is negative: the field points the other way, down the potential hill,
                towards the planet. The <V>g</V> graph shows this value, <Nw>−{sig(sSI, 3)} N kg⁻¹</Nw>
                {r >= 1 ? (
                  <>
                    , and its size equals <Nw><V>GM</V>/<V>r</V>²</Nw>.
                  </>
                ) : (
                  '.'
                )}
              </>
            )}
          </p>
          <p>
            Using the triangle to find the gradient gives <EqLine><Nw>Δ<V>V</V>/Δ<V>r</V></Nw>{' '}
            <Nw>= {sig(dr * s, 3)} MJ kg⁻¹ ÷ ({drText} × 6371 km)</Nw>{' '}
            <Nw>= {sig(sSI, 3)} N kg⁻¹.</Nw></EqLine>
          </p>
        </Section>
      ) : (
        <Section title="Area under the field strength graph">
          <Eq block>
            <Nw>Δ<V>V</V> = −∫ <V>g</V> d<V>r</V></Nw> = the area between the <V>g</V>–<V>r</V> graph and the <V>r</V> axis
          </Eq>
          <p>
            <V>g</V> is the force per kilogram (negative here, because it points inwards). Moving out
            against it, the work done per kilogram is (force per kilogram) × (distance) added up over
            the whole distance: <Nw>−∫ <V>g</V> d<V>r</V></Nw>, the size of the area between the curve and the{' '}
            <V>r</V> axis. That is the change in potential.
          </p>
          <Readouts>
            <Readout label="From r₁" value={sig(r1, 3)} unit="R" />
            <Readout label="To r₂" value={sig(r2, 3)} unit="R" />
            <Readout label="Area between g and the r axis" value={sig(area, 3)} unit="MJ kg⁻¹" tone={COLORS.coral} />
            <Readout label="ΔV from the V graph" value={`+${sig(dV, 3)}`} unit="MJ kg⁻¹" tone={COLORS.sage} />
            <Readout label="Work to lift a 1000 kg probe" value={sig((dV * 1e6 * 1000) / 1e9, 3)} unit="GJ" tone={COLORS.brass} wide />
          </Readouts>
          <p style={{ marginTop: 10 }}>
            Counting squares: each grid square on the <V>g</V> graph is <Nw>1 R × 2 N kg⁻¹</Nw>{' '}
            <Nw>= {sig(SQUARE, 3)} MJ kg⁻¹</Nw>, and the shaded area covers about {sig(squares, 2)} squares.
          </p>
        </Section>
      )}

      <KeyIdeas>
        <li>
          <Nw><V>V</V> = −<V>GM</V>/<V>r</V></Nw>: negative everywhere, and rising towards zero as <V>r</V>{' '}
          grows. Its graph is a <Nw>1/<V>r</V></Nw> curve.
        </li>
        <li>
          The size of <V>g</V>, <Nw><V>GM</V>/<V>r</V>²</Nw>, falls faster, as <Nw>1/<V>r</V>²</Nw>. Double the distance
          and <V>V</V> halves, but <V>g</V> falls to a quarter.
        </li>
        <li>
          The field strength at a point is minus the gradient of the <V>V</V>–<V>r</V> graph
          there: <Nw><V>g</V> = −Δ<V>V</V>/Δ<V>r</V></Nw>. Steep potential, strong field.
        </li>
        <li>
          The area between the <V>g</V>–<V>r</V> graph and the <V>r</V> axis, between two distances,
          comes from the integral of the force per kilogram over that distance:{' '}
          <Nw>Δ<V>V</V> = −∫ <V>g</V> d<V>r</V></Nw>. Force × distance is work, so the area is the work done per kilogram to
          move between them: the potential difference Δ<V>V</V>.
        </li>
      </KeyIdeas>

      <Section title="Study tip">
        <p className="study-tip">
          You do not need to know the shape of the potential <em>inside</em> a planet. You do need
          to know how the field strength behaves there: for a uniform planet <V>g</V> rises in
          proportion to <V>r</V>, from zero at the centre to its surface value, then falls as
          <Nw>1/<V>r</V>²</Nw> outside.
        </p>
      </Section>

      <TryThis>
        <li>Find the gradient at 2 R and at 4 R. How do they compare?</li>
        <li>At what distance is the field strength 1 N kg⁻¹? Check it on both graphs.</li>
        <li>
          Shade from 1 R to 6 R. How much energy would it take to lift a 1000 kg probe that far?
        </li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} panel={panel} stageClass="is-auto" notesWide />;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { createStage, webglAvailable } from '../lib/threeStage.js';
import { COLORS } from '../lib/draw.js';
import { EARTH, G } from '../lib/physics.js';
import { sig } from '../lib/format.jsx';

/*
 * A planet of radius R = 1 (world units) with N radial field lines spread
 * evenly over its surface (a Fibonacci lattice). N is proportional to the
 * planet's mass. A square loop faces the planet at distance r; the lines
 * that pass through it are counted. All N lines cross every sphere around
 * the planet, whose area is 4πr², so the count through a fixed loop falls
 * as 1/r², just as g = GM/r² does.
 */

const R_OUTER = 6.5; // lines are drawn out to 6.5 R
const LINES_PER_EARTH_MASS = 600;

function fibonacciDirections(n) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  // A fixed tilt so no line runs exactly along the loop's axis.
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.37, 0.21, 0.11));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(1 - y * y);
    const a = i * golden;
    dirs.push(new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring).applyQuaternion(tilt));
  }
  return dirs;
}

/*
 * For the close-up: a dense row of directions within ±3° of the
 * pole. They are exactly radial, yet over so small a patch they look
 * parallel and evenly spaced.
 */
function patchDirections() {
  const dirs = [];
  const span = (3 * Math.PI) / 180;
  for (let a = -6; a <= 6; a++) {
    dirs.push(new THREE.Vector3(Math.tan((a / 6) * span), 1, 0).normalize());
  }
  return dirs;
}
const PATCH = patchDirections();

/** Which lines pierce the square loop centred on (r, 0, 0), facing the planet. */
function linesThroughLoop(dirs, r, side) {
  const half = side / 2;
  const hits = [];
  dirs.forEach((d, i) => {
    if (d.x <= 0) return;
    const t = r / d.x;
    if (t > R_OUTER) return;
    const y = d.y * t;
    const z = d.z * t;
    if (Math.abs(y) <= half && Math.abs(z) <= half) hits.push({ i, point: new THREE.Vector3(r, y, z) });
  });
  return hits;
}

/** Expected count: N × (solid angle of the square) / 4π. */
const expectedCount = (n, r, side) =>
  (n * 4 * Math.asin((side * side) / (side * side + 4 * r * r))) / (4 * Math.PI);

export default function FieldLines({ page }) {
  const [distance, setDistance] = useState(2); // loop distance, in R
  const [side, setSide] = useState(1.4); // loop side, in R
  const [mass, setMass] = useState(1); // planet mass, in Earth masses
  const [view, setView] = useState('wide');
  const [log, setLog] = useState([]); // measured {r, count}
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const objects = useRef({});
  const [noGL] = useState(() => !webglAvailable());

  const n = Math.round(LINES_PER_EARTH_MASS * mass);
  const dirs = useMemo(() => fibonacciDirections(n), [n]);
  const hits = useMemo(() => linesThroughLoop(dirs, distance, side), [dirs, distance, side]);
  const count = hits.length;
  const g = (G * EARTH.M * mass) / (distance * EARTH.R) ** 2;

  // record a measurement whenever the loop settles somewhere new
  useEffect(() => {
    setLog((prev) => {
      const others = prev.filter((p) => Math.abs(p.r - distance) > 0.04 || p.n !== n || p.side !== side);
      return [...others.filter((p) => p.n === n && p.side === side), { r: distance, count, n, side }];
    });
  }, [distance, count, n, side]);

  // --- build the scene once --------------------------------------------
  useEffect(() => {
    if (noGL) return undefined;
    const stage = createStage(hostRef.current, {
      theta: 1.2,
      phi: 1.18,
      radius: 15,
      target: new THREE.Vector3(1.8, 0, 0),
      minRadius: 0.12,
      maxRadius: 26,
    });
    stageRef.current = stage;
    const { scene } = stage;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 5, 6);
    scene.add(sun);

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x2f6f9e, roughness: 0.85, metalness: 0.05 }),
    );
    scene.add(planet);

    // Shell through the loop: every line crosses it.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x9ed68c, wireframe: true, transparent: true, opacity: 0.07 }),
    );
    scene.add(shell);

    const lines = {
      dim: new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x7cc6f2, transparent: true, opacity: 0.18 }),
      ),
      bright: new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xe3b25b }),
      ),
    };
    scene.add(lines.dim, lines.bright);

    const coneGeom = new THREE.ConeGeometry(0.035, 0.13, 10);
    coneGeom.translate(0, 0.065, 0);
    const conesHolder = new THREE.Group();
    scene.add(conesHolder);

    const pierce = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xe3b25b, size: 0.09, sizeAttenuation: true }),
    );
    scene.add(pierce);

    const loopGroup = new THREE.Group();
    const loopFrame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.5, -0.5),
        new THREE.Vector3(0, 0.5, -0.5),
        new THREE.Vector3(0, 0.5, 0.5),
        new THREE.Vector3(0, -0.5, 0.5),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf2735e }),
    );
    const loopFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xf2735e,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    loopFill.rotation.y = Math.PI / 2;
    loopGroup.add(loopFrame, loopFill);
    scene.add(loopGroup);

    const gArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, 0xf2735e, 0.16, 0.09);
    scene.add(gArrow);

    objects.current = { lines, conesHolder, coneGeom, pierce, loopGroup, shell, gArrow };

    return () => {
      stage.dispose();
      coneGeom.dispose();
      stageRef.current = null;
      objects.current = {};
    };
  }, [noGL]);

  // --- update lines, loop and arrow --------------------------------------
  useEffect(() => {
    const o = objects.current;
    if (!o.lines) return;
    const surface = view === 'surface';
    const through = new Set(surface ? [] : hits.map((h) => h.i));
    const lineDirs = surface ? PATCH : dirs;
    const outer = surface ? 1.16 : R_OUTER;

    const pos = { dim: [], bright: [] };
    lineDirs.forEach((d, i) => {
      const list = through.has(i) ? pos.bright : pos.dim;
      list.push(d.x, d.y, d.z, d.x * outer, d.y * outer, d.z * outer);
    });
    for (const key of ['dim', 'bright']) {
      o.lines[key].geometry.dispose();
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos[key], 3));
      o.lines[key].geometry = geom;
    }

    // arrowheads point inward: the direction a mass would be pulled
    o.conesHolder.children.forEach((c) => c.material.dispose());
    o.conesHolder.clear();
    const makeCones = (indices, color, opacity) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
      const mesh = new THREE.InstancedMesh(o.coneGeom, mat, Math.max(indices.length, 1));
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      indices.forEach((i, k) => {
        const d = lineDirs[i];
        q.setFromUnitVectors(up, d.clone().negate());
        const radius = surface ? 1.05 + (i % 2) * 0.05 : 2.6 + (i % 3) * 1.3;
        const size = surface ? 0.07 : 1;
        m.compose(d.clone().multiplyScalar(radius), q, new THREE.Vector3(size, size, size));
        mesh.setMatrixAt(k, m);
      });
      mesh.count = indices.length;
      o.conesHolder.add(mesh);
    };
    const all = lineDirs.map((_, i) => i);
    makeCones(all.filter((i) => !through.has(i)), 0x7cc6f2, 0.3);
    makeCones(all.filter((i) => through.has(i)), 0xe3b25b, 1);

    o.pierce.geometry.dispose();
    o.pierce.geometry = new THREE.BufferGeometry().setFromPoints(hits.map((h) => h.point));

    o.loopGroup.position.set(distance, 0, 0);
    o.loopGroup.scale.set(1, side, side);
    o.shell.scale.setScalar(distance);
    o.shell.visible = !surface;
    o.loopGroup.visible = !surface;
    o.pierce.visible = !surface;
    o.gArrow.visible = !surface;
    o.lines.dim.material.opacity = surface ? 0.75 : 0.18;

    // g at the loop centre, drawn relative to g at the surface
    const len = Math.max(0.18, Math.min(1.6, 1.4 * mass / (distance * distance) * 2));
    o.gArrow.position.set(distance + 0.02, 0, 0);
    o.gArrow.setLength(len, Math.min(0.2, len * 0.4), Math.min(0.11, len * 0.25));
  }, [dirs, hits, distance, side, mass, view]);

  // --- camera presets ------------------------------------------------------
  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    if (view === 'surface') {
      Object.assign(s.view, { theta: 0, phi: 1.52, radius: 0.2 });
      s.view.target.set(0, 1.07, 0);
    } else {
      Object.assign(s.view, { theta: 1.2, phi: 1.18, radius: 15 });
      s.view.target.set(1.8, 0, 0);
    }
  }, [view]);

  const measured = log.filter((p) => p.n === n && p.side === side);
  const xMax = 6.2;
  const yMax = Math.max(8, Math.ceil(expectedCount(n, 1.3, side) * 1.15));

  const legend = (
    <Legend
      items={[
        { label: 'Field lines', color: COLORS.sky },
        { label: 'Lines through the loop', color: COLORS.brass },
        { label: 'Loop', color: COLORS.coral },
        { label: 'Sphere of radius r', color: COLORS.sage },
      ]}
    />
  );

  const stage = (
    <>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      <p className="stage-note">
        {noGL
          ? 'This page needs WebGL, which this browser has turned off.'
          : view === 'surface'
            ? 'A small patch of the surface, with lines drawn more densely. They are still radial, but over a region this small they are parallel and evenly spaced.'
            : 'Drag to turn the view. Scroll or pinch to zoom.'}
      </p>
    </>
  );

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Lines through the loop against distance</h3>
        <p>Dots are your measurements; the curve is N × (loop area) ÷ 4πr².</p>
      </div>
      <Plot
        x={[1, xMax]}
        y={[0, yMax]}
        height={230}
        xLabel="r / R"
        yLabel="lines"
        onPointer={(xv) => setDistance(Math.min(6, Math.max(1.3, Math.round(xv * 10) / 10)))}
        ariaLabel="Number of field lines through the loop against distance: an inverse-square curve"
      >
        {({ sx, sy }) => (
          <>
            <path
              d={fnPath((r) => (r >= 1.3 ? expectedCount(n, r, side) : NaN), 1, xMax, sx, sy)}
              fill="none"
              stroke={COLORS.sky}
              strokeWidth="2"
            />
            {measured.map((p) => (
              <circle key={p.r} cx={sx(p.r)} cy={sy(p.count)} r="3.6" fill={COLORS.brass} />
            ))}
            <circle cx={sx(distance)} cy={sy(count)} r="7" fill="none" stroke={COLORS.brass} strokeWidth="2" />
          </>
        )}
      </Plot>
    </div>
  );

  const panel = (
    <>
      <Section title="Move the loop">
        <Controls>
          <Slider
            label="Distance of loop from centre, r"
            value={distance}
            min={1.3}
            max={6}
            step={0.1}
            onChange={setDistance}
            display={`${sig(distance, 2)} R`}
          />
          <Slider
            label="Size of loop"
            value={side}
            min={0.8}
            max={2}
            step={0.2}
            onChange={setSide}
            display={`${sig(side, 2)} R × ${sig(side, 2)} R`}
          />
          <Slider
            label="Mass of planet"
            value={mass}
            min={0.5}
            max={2}
            step={0.25}
            onChange={setMass}
            display={`${sig(mass, 3)} × Earth`}
            hint={`Drawn with ${n} field lines: twice the mass, twice the lines.`}
          />
          <div className="row">
            <Button onClick={() => setView(view === 'surface' ? 'wide' : 'surface')}>
              {view === 'surface' ? 'Back to the whole planet' : 'Zoom in to the surface'}
            </Button>
          </div>
        </Controls>
      </Section>

      <Section title="What the loop shows">
        <Readouts>
          <Readout label="Lines through the loop" value={count} tone={COLORS.brass} />
          <Readout label="Lines per R² of loop" value={sig(count / (side * side), 3)} tone={COLORS.brass} />
          <Readout label="Field strength there, g" value={sig(g, 3)} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="Force on a 1 kg mass" value={sig(g, 3)} unit="N" tone={COLORS.coral} />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          Values use Earth&rsquo;s radius for R, so at the surface <V>g</V> would be{' '}
          {sig((G * EARTH.M * mass) / EARTH.R ** 2, 3)} N kg⁻¹.
        </p>
      </Section>

      <Section title="Field strength">
        <Eq block>
          <V>g</V> = <Frac n={<V>F</V>} d={<V>m</V>} /> &nbsp;&nbsp; and in a radial field &nbsp;&nbsp;
          <V>g</V> = <Frac n={<><V>G</V><V>M</V></>} d={<><V>r</V><sup>2</sup></>} />
        </Eq>
      </Section>

      <KeyIdeas>
        <li>A field line shows the direction of the force on a mass placed there: always towards the planet.</li>
        <li>
          Field lines never cross, and they end on masses. Where they are closer together the
          field is stronger.
        </li>
        <li>
          Every line crosses each sphere around the planet. A sphere&rsquo;s area is 4π<V>r</V>²,
          so the density of lines falls as 1/<V>r</V>², exactly like <V>g</V> = <V>GM</V>/<V>r</V>².
        </li>
        <li>
          On a flat diagram lines only spread out as 1/<V>r</V>. The 3D picture is the one that
          matches the inverse-square law.
        </li>
        <li>
          Close to the surface the lines are almost parallel and evenly spaced: the field is
          nearly uniform, which is why <V>g</V> ≈ 9.81 N kg⁻¹ in the lab.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Move the loop from 2 R to 4 R. By what factor does the count fall?</li>
        <li>Double the planet&rsquo;s mass. What happens to the count, and to g?</li>
        <li>Zoom in to the surface. Why does a uniform field have parallel, equally spaced lines?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} />;
}

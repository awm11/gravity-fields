import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, InfoTip, KeyIdeas, Legend, Readout, Readouts, Section, Slider, TryThis } from '../components/ui.jsx';
import { Eq, Frac, Nw, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { createStage, webglAvailable } from '../lib/threeStage.js';
import { COLORS } from '../lib/draw.js';
import { EARTH } from '../lib/physics.js';
import { sig } from '../lib/format.jsx';

/*
 * A planet of radius R = 1 (world units) with N radial field lines spread
 * evenly over its surface (a Fibonacci lattice). N is proportional to the
 * planet's mass. The loop is drawn on the sphere of radius r and always
 * encloses a curved patch of that sphere with area 50 million km² (a
 * spherical cap), so the number of lines through it is the number of lines
 * per 50 million km² there. All N lines cross every sphere around the
 * planet, whose area is 4πr², so the count falls as 1/r², just as g = GM/r²
 * does.
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
 * For the close-up: a square grid of directions within ±2.1° of the pole,
 * 0.42° apart for one Earth mass. Lines per unit area go as the mass, so the
 * spacing goes as 1/√mass. They are exactly radial, yet over so small a
 * patch they look parallel and evenly spaced.
 *
 * The small loop is 3° wide, about 7 spacings for one Earth mass, so it
 * holds about 50 × mass lines. For each mass the grid is either centred on
 * the loop or shifted half a spacing, whichever puts the loop's edges
 * between lines, so the count is as close to 50 × mass as a square grid
 * allows (25, 36, 49, 64, 81, 81, 100) and does not change as the loop moves.
 */
const PATCH_STEP = (0.3 * Math.SQRT2 * Math.PI) / 180;
const PATCH_HALF = (2.1 * Math.PI) / 180;
const LOOP_WIDTH = (3 * Math.PI) / 180; // angle across the small loop
function patchDirections(mass) {
  const step = PATCH_STEP / Math.sqrt(mass);
  const across = LOOP_WIDTH / step; // spacings across the loop
  const odd = 2 * Math.floor(across / 2) + 1; // count if centred
  const even = 2 * Math.floor(across / 2 + 0.5); // count if shifted half a spacing
  const offset = Math.abs(odd - across) <= Math.abs(even - across) ? 0 : 0.5;
  const n = Math.floor(PATCH_HALF / step);
  const dirs = [];
  for (let a = -n; a <= n; a++) {
    for (let b = -n; b <= n; b++) {
      const u = (a + offset) * step;
      const v = (b + offset) * step;
      if (Math.abs(u) > PATCH_HALF || Math.abs(v) > PATCH_HALF) continue;
      dirs.push(new THREE.Vector3(Math.tan(u), 1, Math.tan(v)).normalize());
    }
  }
  return dirs;
}

// The loop's area: 50 million km², in units of R² (Earth's radius, 6371 km)
const LOOP_KM2 = 5e7;
// GM for the Earth, set so that g at the surface is exactly 9.81 N kg⁻¹
// (the quoted G, M and R give 9.82)
const GM_EARTH = 9.81 * EARTH.R ** 2;
const LOOP_AREA = LOOP_KM2 / (EARTH.R / 1000) ** 2;

/*
 * The small square loop in the close-up, parallel to the surface. It can be
 * moved up and down between SMALL_MIN and SMALL_MAX (in R); over so small a
 * range its edges never cross a line, so the count stays the same.
 */
const SMALL_HALF = 1.02 * Math.tan(LOOP_WIDTH / 2);
const SMALL_MIN = 1.005;
const SMALL_MAX = 1.035;
const PATCH_TOP = 1.06; // the close-up's lines run from the surface to here
const smallLoopCount = (patch, h) =>
  patch.filter((d) => Math.abs((d.x / d.y) * h) <= SMALL_HALF && Math.abs((d.z / d.y) * h) <= SMALL_HALF).length;

/** Half-angle of the loop's cap (area LOOP_AREA) on a sphere of radius r: A = 2πr²(1 − cos α). */
const capAngle = (r) => Math.acos(Math.max(-1, 1 - LOOP_AREA / (2 * Math.PI * r * r)));

/** Which lines pass through the loop's cap, centred on the +x axis at radius r. */
function linesThroughLoop(dirs, r) {
  const cosA = Math.cos(capAngle(r));
  const hits = [];
  dirs.forEach((d, i) => {
    if (d.x >= cosA && r <= R_OUTER) hits.push({ i, point: d.clone().multiplyScalar(r) });
  });
  return hits;
}

/** Expected count: N lines shared over 4πr², times the loop's area. */
const expectedCount = (n, r) => (n * LOOP_AREA) / (4 * Math.PI * r * r);

export default function FieldLines({ page }) {
  const [distance, setDistance] = useState(2); // loop distance, in R
  const [mass, setMass] = useState(1); // planet mass, in Earth masses
  const [view, setView] = useState('wide');
  const [smallH, setSmallH] = useState(1.015); // height of the small loop, in R
  const smallHRef = useRef(smallH);
  smallHRef.current = smallH;
  const zoomedOnce = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [log, setLog] = useState([]); // measured {r, count}
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const objects = useRef({});
  const [noGL] = useState(() => !webglAvailable());

  const n = Math.round(LINES_PER_EARTH_MASS * mass);
  const dirs = useMemo(() => fibonacciDirections(n), [n]);
  const hits = useMemo(() => linesThroughLoop(dirs, distance), [dirs, distance]);
  const patch = useMemo(() => patchDirections(mass), [mass]);
  const count = hits.length;
  const g = (GM_EARTH * mass) / (distance * EARTH.R) ** 2;

  // record a measurement whenever the loop settles somewhere new
  useEffect(() => {
    setLog((prev) => {
      const others = prev.filter((p) => Math.abs(p.r - distance) > 0.04 || p.n !== n);
      return [...others.filter((p) => p.n === n), { r: distance, count, n }];
    });
  }, [distance, count, n]);

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

    // The loop: a ring on the sphere of radius r, round a curved patch of
    // area R². Its geometry is rebuilt whenever r changes.
    const loopGroup = new THREE.Group();
    const loopFrame = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf2735e }),
    );
    const loopFill = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xf2735e,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    loopGroup.add(loopFrame, loopFill);
    scene.add(loopGroup);

    const gArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, 0xf2735e, 0.16, 0.09);
    scene.add(gArrow);

    // the close-up's small loop: a square parallel to the surface
    const small = new THREE.Group();
    const smallFrame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-SMALL_HALF, 0, -SMALL_HALF),
        new THREE.Vector3(SMALL_HALF, 0, -SMALL_HALF),
        new THREE.Vector3(SMALL_HALF, 0, SMALL_HALF),
        new THREE.Vector3(-SMALL_HALF, 0, SMALL_HALF),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf2735e }),
    );
    const smallFill = new THREE.Mesh(
      new THREE.PlaneGeometry(SMALL_HALF * 2, SMALL_HALF * 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf2735e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    small.add(smallFrame, smallFill);
    small.visible = false;
    scene.add(small);

    // drag the small loop up and down (it only moves along the vertical)
    const raycaster = new THREE.Raycaster();
    const el = stage.renderer.domElement;
    let draggingSmall = false;
    const rayAt = (e) => {
      const rect = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        stage.camera,
      );
    };
    const overSmall = (e) => {
      if (viewRef.current !== 'surface') return false;
      rayAt(e);
      return raycaster.intersectObject(smallFill).length > 0;
    };
    const onSmallDown = (e) => {
      if (!overSmall(e)) return;
      draggingSmall = true;
      stage.lock.on = true;
    };
    const onSmallMove = (e) => {
      if (!draggingSmall) {
        el.style.cursor = overSmall(e) ? 'ns-resize' : '';
        return;
      }
      rayAt(e);
      // a vertical plane through the loop, facing the camera
      const facing = new THREE.Vector3(stage.camera.position.x, 0, stage.camera.position.z).normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, new THREE.Vector3(0, smallHRef.current, 0));
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        setSmallH(Math.min(SMALL_MAX, Math.max(SMALL_MIN, hit.y)));
      }
    };
    const onSmallUp = () => {
      draggingSmall = false;
      stage.lock.on = false;
    };
    el.addEventListener('pointerdown', onSmallDown);
    el.addEventListener('pointermove', onSmallMove);
    el.addEventListener('pointerup', onSmallUp);
    el.addEventListener('pointercancel', onSmallUp);

    objects.current = { lines, conesHolder, coneGeom, pierce, loopGroup, loopFrame, loopFill, shell, gArrow, small };

    return () => {
      el.removeEventListener('pointerdown', onSmallDown);
      el.removeEventListener('pointermove', onSmallMove);
      el.removeEventListener('pointerup', onSmallUp);
      el.removeEventListener('pointercancel', onSmallUp);
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
    const through = new Set(
      surface
        ? patch.map((d, i) => (Math.abs((d.x / d.y) * smallH) <= SMALL_HALF && Math.abs((d.z / d.y) * smallH) <= SMALL_HALF ? i : -1)).filter((i) => i >= 0)
        : hits.map((h) => h.i),
    );
    const lineDirs = surface ? patch : dirs;
    const outer = surface ? PATCH_TOP : R_OUTER;

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
        const radius = surface ? 1.045 : 2.6 + (i % 3) * 1.3;
        const size = surface ? 0.03 / Math.sqrt(mass) : 1;
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

    // rebuild the curved loop for this radius
    const alpha = capAngle(distance);
    const rr = distance * 1.003;
    const cap = new THREE.SphereGeometry(rr, 48, 10, 0, Math.PI * 2, 0, alpha);
    cap.rotateZ(-Math.PI / 2); // the cap's axis, +y, turned onto +x
    o.loopFill.geometry.dispose();
    o.loopFill.geometry = cap;
    const ring = [];
    for (let k = 0; k < 96; k++) {
      const t = (k / 96) * Math.PI * 2;
      ring.push(new THREE.Vector3(rr * Math.cos(alpha), rr * Math.sin(alpha) * Math.cos(t), rr * Math.sin(alpha) * Math.sin(t)));
    }
    o.loopFrame.geometry.dispose();
    o.loopFrame.geometry = new THREE.BufferGeometry().setFromPoints(ring);
    o.shell.scale.setScalar(distance);
    o.shell.visible = !surface;
    o.loopGroup.visible = !surface;
    o.pierce.visible = !surface;
    o.gArrow.visible = !surface;
    o.lines.dim.material.opacity = surface ? 0.75 : 0.18;
    o.small.visible = surface;

    // g at the loop centre, drawn relative to g at the surface
    const len = Math.max(0.18, Math.min(1.6, 1.4 * mass / (distance * distance) * 2));
    o.gArrow.position.set(distance + 0.02, 0, 0);
    o.gArrow.setLength(len, Math.min(0.2, len * 0.4), Math.min(0.11, len * 0.25));
  }, [dirs, hits, distance, mass, view, smallH, patch]);

  useEffect(() => {
    const o = objects.current;
    if (o.small) o.small.position.set(0, smallH, 0);
  }, [smallH, noGL]);

  // --- camera presets ------------------------------------------------------
  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    // the automatic zoom in and out is a slow glide, so it is easy to follow
    // (not on first load, when the camera is already in place)
    let t = 0;
    if (zoomedOnce.current) {
      s.motion.ease = 1.8;
      t = setTimeout(() => {
        s.motion.ease = 10;
      }, 3500);
    }
    zoomedOnce.current = true;
    if (view === 'surface') {
      Object.assign(s.view, { theta: 0.5, phi: 1.2, radius: 0.16 });
      s.view.target.set(0, 1.025, 0);
    } else {
      Object.assign(s.view, { theta: 1.2, phi: 1.18, radius: 15 });
      s.view.target.set(1.8, 0, 0);
    }
    return () => clearTimeout(t);
  }, [view]);

  const measured = log.filter((p) => p.n === n);
  const xMax = 6.2;
  const yMax = Math.max(8, Math.ceil(expectedCount(n, 1) * 1.12));
  const surface = view === 'surface';

  const legend = (
    <Legend
      items={[
        { label: 'Field lines', color: COLORS.sky },
        { label: 'Lines through the loop', color: COLORS.brass },
        ...(surface
          ? [{ label: 'Small loop: drag it up and down', color: COLORS.coral }]
          : [
              { label: 'Loop round 50 million km² of the sphere', color: COLORS.coral },
              { label: 'Sphere of radius r', color: COLORS.sage },
            ]),
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
            ? 'A small patch of the surface, with lines drawn more densely. They are still radial, but over a region this small they are almost parallel and evenly spaced. Drag the small loop up and down.'
            : 'Drag to turn the view. Scroll or pinch to zoom.'}
      </p>
    </>
  );

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>Lines through the loop against distance</h3>
        <p>Dots are your counts; the curve is the expected number of lines through 50 million km² of a sphere of radius r: <Nw>N × 50 million km² ÷ 4πr²</Nw>, with r in km.</p>
      </div>
      <Plot
        x={[1, xMax]}
        y={[0, yMax]}
        height={230}
        xLabel="r / R"
        yLabel="lines"
        onPointer={(xv) => !surface && setDistance(Math.min(6, Math.max(1, Math.round(xv * 10) / 10)))}
        ariaLabel="Number of field lines through the loop against distance: an inverse-square curve"
      >
        {({ sx, sy }) => (
          <>
            <path
              d={fnPath((r) => expectedCount(n, r), 1, xMax, sx, sy)}
              fill="none"
              stroke={COLORS.sky}
              strokeWidth="2"
            />
            {/* the counts are hidden in the close-up, which has no loop at r */}
            {!surface &&
              measured.map((p) => (
                <circle key={p.r} cx={sx(p.r)} cy={sy(p.count)} r="3.6" fill={COLORS.brass} />
              ))}
            {!surface && (
              <circle cx={sx(distance)} cy={sy(count)} r="7" fill="none" stroke={COLORS.brass} strokeWidth="2" />
            )}
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
            min={1}
            max={6}
            step={0.1}
            onChange={setDistance}
            display={`${sig(distance, 2)} R`}
            disabled={surface}
            hint="The loop always surrounds a curved patch of 50 million km² on the sphere of radius r."
          />
          <Slider
            label="Mass of planet"
            value={mass}
            min={0.5}
            max={2}
            step={0.25}
            onChange={setMass}
            display={`${sig(mass, 3)} × Earth`}
            hint={
              surface
                ? 'Twice the mass, twice as many lines through each square kilometre (as near as a square grid allows).'
                : `Drawn with ${n} field lines: twice the mass, twice the lines.`
            }
          />
          {surface && (
            <>
              <p className="slider-hint">
                The distance slider is switched off in the close-up.
              </p>
              <Slider
                label="Height of the small loop above the surface"
                aside={
                  <InfoTip title="The ISS">
                    The International Space Station orbits about 400 km up: about 6% of the
                    Earth&rsquo;s radius. There <V>g</V> is about {sig(GM_EARTH / (EARTH.R + 4.08e5) ** 2, 2)} N kg⁻¹,
                    nearly 90% of its value at the surface. Astronauts float because they are falling
                    freely around the Earth, not because gravity has gone.
                  </InfoTip>
                }
                value={smallH}
                min={SMALL_MIN}
                max={SMALL_MAX}
                step={0.001}
                onChange={setSmallH}
                display={`${Math.round((smallH - 1) * EARTH.R / 1000)} km`}
              />
            </>
          )}
          <div className="row">
            <Button onClick={() => setView(view === 'surface' ? 'wide' : 'surface')}>
              {view === 'surface' ? 'Back to the whole planet' : 'Zoom in to the surface'}
            </Button>
          </div>
        </Controls>
      </Section>

      <Section title="What the loop shows">
        <Readouts>
          {surface ? (
            <>
              <Readout label="Lines through the small loop" value={smallLoopCount(patch, smallH)} tone={COLORS.brass} />
              <Readout label="Height above the surface" value={Math.round(((smallH - 1) * EARTH.R) / 1000)} unit="km" />
              <Readout label="Field strength there, g" value={sig((GM_EARTH * mass) / (smallH * EARTH.R) ** 2, 3)} unit="N kg⁻¹" tone={COLORS.sky} wide />
            </>
          ) : (
            <>
              <Readout label="Lines through 50 million km² of the sphere" value={count} tone={COLORS.brass} />
              <Readout label={<>Expected, <Nw>N × 50 million km² ÷ 4πr²</Nw> (r in km)</>} value={sig(expectedCount(n, distance), 3)} tone={COLORS.brass} wide />
              <Readout label="Field strength there, g" value={sig(g, 3)} unit="N kg⁻¹" tone={COLORS.sky} />
              <Readout label="Force on a 1 kg mass" value={sig(g, 3)} unit="N" tone={COLORS.coral} />
            </>
          )}
        </Readouts>
        <p style={{ marginTop: 10 }}>
          Values use Earth&rsquo;s radius for R, so at the surface <V>g</V> would be{' '}
          {sig((GM_EARTH * mass) / EARTH.R ** 2, 3)} N kg⁻¹.
        </p>
      </Section>

      <Section title="Field strength">
        <Eq block>
          <Nw><V>g</V> = <Frac n={<V>F</V>} d={<V>m</V>} /></Nw> &nbsp;&nbsp; and in a radial field &nbsp;&nbsp;
          <Nw><V>g</V> = <Frac n={<><V>G</V><V>M</V></>} d={<><V>r</V><sup>2</sup></>} /></Nw>
        </Eq>
      </Section>

      <KeyIdeas>
        <li>A field line shows the direction of the force on a mass placed there: always towards the planet.</li>
        <li>
          Field lines never cross, and they end on masses. Where they are closer together the
          field is stronger.
        </li>
        <li>
          Every line crosses each sphere around the planet. A sphere&rsquo;s area is <Nw>4π<V>r</V>²</Nw>,
          so the number of lines through each 50 million km² of it falls as <Nw>1/<V>r</V>²</Nw>, exactly
          like <Nw><V>g</V> = <V>GM</V>/<V>r</V>²</Nw>. Counting through a fixed area is what makes the
          count a measure of line density.
        </li>
        <li>
          On a flat diagram lines only spread out as <Nw>1/<V>r</V></Nw>. The 3D picture is the one that
          matches the inverse-square law.
        </li>
        <li>
          Close to the surface the lines are almost parallel and evenly spaced: the field is
          nearly uniform, which is why <Nw><V>g</V> ≈ 9.81 N kg⁻¹</Nw> in the lab.
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Move the loop from 1 R to 2 R. It keeps the same area, 50 million km², but fewer lines pass through it. By what factor does the count fall?</li>
        <li>Put the loop at <Nw>r = R</Nw>, on the surface. How many lines cross 50 million km² there?</li>
        <li>Double the planet&rsquo;s mass. What happens to the count, and to g?</li>
        <li>Zoom in to the surface and drag the small loop up and down. Why does the count hardly change?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} notesWide />;
}

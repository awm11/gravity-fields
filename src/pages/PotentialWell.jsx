import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, KeyIdeas, Legend, Readout, Readouts, Section, Slider, Switch, TryThis } from '../components/ui.jsx';
import { Eq, Nw, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { createStage, webglAvailable } from '../lib/threeStage.js';
import { COLORS } from '../lib/draw.js';
import { EARTH, G } from '../lib/physics.js';
import { sig } from '../lib/format.jsx';

/*
 * Potential drawn as height over a flat plane through the planet.
 *
 * Working units: lengths in Earth radii, potentials in units of GM/R for
 * the Earth, so V = −1 at the Earth's surface (−62.6 MJ kg⁻¹). Inside a
 * body the potential is that of a uniform sphere, so the well has a
 * rounded floor instead of an infinitely deep spike.
 *
 * The marble's motion is worked out from the true field g = −∇V, not by
 * rolling, so it follows the paths a real mass would.
 */

const HALF = 12; // the sheet is a disc of radius 12 R
const DEPTH = 5.5; // drawn depth of the Earth's surface, world units
const STEP_MJ = 5; // equipotential spacing, MJ kg⁻¹
const V_UNIT = (G * EARTH.M) / EARTH.R; // J kg⁻¹ per working unit
const V_UNIT_MJ = V_UNIT / 1e6; // 62.6
const SPEED_UNIT = Math.sqrt(V_UNIT); // m s⁻¹ per working unit (7.91 km s⁻¹)
const TIME_RATE = 8; // working time units per second of animation
const MARBLE = 0.27;

const DEFAULT_VIEW = { theta: 0.5, phi: 1.0, radius: 27, target: new THREE.Vector3(0.6, -3.2, 0) };

const EARTH_BODY = { x: 0, z: 0, mu: 1, R: 1 };
// The default start lies on the −15 MJ kg⁻¹ equipotential (r ≈ 4.17 R), so
// a launch into orbit runs along a drawn ring.
const DEFAULT_START = { x: -(V_UNIT_MJ / 15), z: 0 };
const MOON_BODY = { x: 6.5, z: 0, mu: 0.25, R: 0.6 };

function makeField(bodies) {
  const potential = (x, z) => {
    let v = 0;
    for (const b of bodies) {
      const d = Math.hypot(x - b.x, z - b.z);
      v -= d >= b.R ? b.mu / d : (b.mu * (3 * b.R * b.R - d * d)) / (2 * b.R ** 3);
    }
    return v;
  };
  // field strength (acceleration), pointing downhill
  const field = (x, z) => {
    let gx = 0;
    let gz = 0;
    for (const b of bodies) {
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.hypot(dx, dz) || 1e-9;
      const k = d >= b.R ? b.mu / (d * d * d) : b.mu / b.R ** 3;
      gx += dx * k;
      gz += dz * k;
    }
    return [gx, gz];
  };
  const height = (x, z) => DEPTH * potential(x, z);
  return { potential, field, height };
}

export default function PotentialWell({ page }) {
  const [withMoon, setWithMoon] = useState(false);
  const [showRings, setShowRings] = useState(true);
  const [showSlope, setShowSlope] = useState(true);
  const [cutaway, setCutaway] = useState(false);
  const [start, setStart] = useState(DEFAULT_START);
  const [status, setStatus] = useState('Resting on the sheet. Choose how to set it going.');
  const [probe, setProbe] = useState({ ...DEFAULT_START, speed: 0 });
  const [run, setRun] = useState('idle'); // idle | running | paused
  const launchEnergy = useRef(null); // ½v² + V at launch, working units
  const fig8 = useRef(false); // true while the figure-of-eight start is in use
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const objects = useRef({});
  const marble = useRef({ ...DEFAULT_START, vx: 0, vz: 0, moving: false });
  const fieldRef = useRef(makeField([EARTH_BODY]));
  const putRef = useRef(null);
  const [noGL] = useState(() => !webglAvailable());

  const bodies = withMoon ? [EARTH_BODY, MOON_BODY] : [EARTH_BODY];
  const startR = Math.hypot(start.x, start.z);

  // --- build the scene once --------------------------------------------
  useEffect(() => {
    if (noGL) return undefined;
    const stage = createStage(hostRef.current, {
      ...DEFAULT_VIEW,
      target: DEFAULT_VIEW.target.clone(),
      minRadius: 6,
      maxRadius: 45,
      maxPhi: 1.55,
    });
    stageRef.current = stage;
    const { scene } = stage;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(6, 10, 8);
    scene.add(sun);

    const sheetGeom = polarSheet(140, 360);
    const sheet = new THREE.Mesh(
      sheetGeom,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
    );
    scene.add(sheet);

    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x5a6d96, transparent: true, opacity: 0.35 }),
    );
    scene.add(grid);

    const rings = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x9ed68c, transparent: true, opacity: 0.95 }),
    );
    scene.add(rings);

    const surfaces = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xe8ecf5, transparent: true, opacity: 0.6 }),
    );
    scene.add(surfaces);

    // the cut edge when the front half is cut away: the graph of V
    const profile = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe3b25b }));
    profile.visible = false;
    scene.add(profile);
    stage.renderer.localClippingEnabled = true;
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(MARBLE, 32, 20),
      new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.35, emissive: 0x30343c }),
    );
    scene.add(ball);

    const TRAIL_MAX = 3000;
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    trailGeom.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color: 0xf2735e }));
    scene.add(trail);

    const slope = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x7cc6f2, 0.3, 0.16);
    scene.add(slope);

    const state = { trailCount: 0, lastReport: 0 };
    objects.current = { sheet, grid, rings, surfaces, profile, cutPlane, ball, trail, slope, state, TRAIL_MAX };

    const place = () => {
      const { height, field } = fieldRef.current;
      const m = marble.current;
      const y = height(m.x, m.z);
      ball.position.set(m.x, y + MARBLE * 0.9, m.z);
      // the slope arrow points downhill along the sheet, longer where it is steeper
      const [gx, gz] = field(m.x, m.z);
      const g = Math.hypot(gx, gz);
      if (g > 1e-6) {
        const dir = new THREE.Vector3(gx / g, -DEPTH * g, gz / g).normalize();
        const len = Math.max(0.5, Math.min(3.4, 3.2 * Math.sqrt(g)));
        slope.position.set(m.x, y + 0.04, m.z);
        slope.setDirection(dir);
        slope.setLength(len, Math.min(0.34, len * 0.3), Math.min(0.18, len * 0.16));
      }
    };
    objects.current.place = place;

    const pushTrail = () => {
      const m = marble.current;
      const { height } = fieldRef.current;
      const arr = trailGeom.attributes.position.array;
      let n = state.trailCount;
      if (n >= TRAIL_MAX) {
        arr.copyWithin(0, 3, TRAIL_MAX * 3);
        n = TRAIL_MAX - 1;
      }
      arr[n * 3] = m.x;
      arr[n * 3 + 1] = height(m.x, m.z) + 0.06;
      arr[n * 3 + 2] = m.z;
      state.trailCount = n + 1;
      trailGeom.setDrawRange(0, state.trailCount);
      trailGeom.attributes.position.needsUpdate = true;
    };
    objects.current.clearTrail = () => {
      state.trailCount = 0;
      trailGeom.setDrawRange(0, 0);
    };

    const off = stage.onFrame((dt) => {
      const m = marble.current;
      if (!m.moving) return;
      const { field, potential } = fieldRef.current;
      let remaining = dt * TIME_RATE;
      let ended = null;
      while (remaining > 0 && !ended) {
        const r = Math.hypot(m.x, m.z);
        const h = Math.min(remaining, 0.004 * Math.max(1, r) ** 1.5);
        // velocity Verlet
        const [ax, az] = field(m.x, m.z);
        m.x += m.vx * h + 0.5 * ax * h * h;
        m.z += m.vz * h + 0.5 * az * h * h;
        const [bx, bz] = field(m.x, m.z);
        m.vx += 0.5 * (ax + bx) * h;
        m.vz += 0.5 * (az + bz) * h;
        remaining -= h;
        for (const b of m.bodies) {
          const d = Math.hypot(m.x - b.x, m.z - b.z);
          if (d < b.R) {
            // stop on the surface
            m.x = b.x + ((m.x - b.x) / d) * b.R;
            m.z = b.z + ((m.z - b.z) / d) * b.R;
            ended = b === EARTH_BODY ? 'Landed on the planet.' : 'Landed on the moon.';
          }
        }
        if (!ended && Math.hypot(m.x, m.z) > HALF - 0.3) {
          // keep its speed: the readouts show it, and it matches ½v² + V
          const v2 = m.vx * m.vx + m.vz * m.vz;
          const Vedge = potential(m.x, m.z);
          const E = 0.5 * v2 + Vedge;
          // within the integration's tiny error, an escape-speed launch has E = 0
          const zero = Math.abs(E) < 2e-3 * Math.abs(Vedge);
          const kms = sig((Math.sqrt(v2) * SPEED_UNIT) / 1000, 3);
          ended = {
            text: zero
              ? `Reached the edge of the sheet at ${kms} km s⁻¹. Its total energy, ½v² + V, is zero: it would keep going for ever, slowing towards zero speed as it heads for infinity.`
              : E > 0
                ? `Reached the edge of the sheet at ${kms} km s⁻¹. Its total energy, ½v² + V, is positive, so it would never come back: it has escaped.`
                : `Reached the edge of the sheet at ${kms} km s⁻¹. Its total energy, ½v² + V, is still negative, so beyond the sheet it would slow, stop and fall back.`,
            keep: true,
          };
        }
      }
      pushTrail();
      place();
      if (ended) {
        m.moving = false;
        if (!ended.keep) {
          m.vx = 0;
          m.vz = 0;
        }
        setStatus(ended.text ?? ended);
        setRun('idle');
      }
      const now = performance.now();
      if (ended || now - state.lastReport > 90) {
        state.lastReport = now;
        setProbe({ x: m.x, z: m.z, speed: Math.hypot(m.vx, m.vz), V: potential(m.x, m.z) });
      }
    });

    // click (not drag) on the sheet to put the marble there
    const raycaster = new THREE.Raycaster();
    let down = null;
    const el = stage.renderer.domElement;
    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, stage.camera);
      const hit = raycaster.intersectObject(sheet)[0];
      if (!hit) return;
      const { x, z } = hit.point;
      if (Math.hypot(x, z) > HALF - 0.6) return;
      putRef.current?.(x, z);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);

    return () => {
      off();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      stage.dispose();
      stageRef.current = null;
      objects.current = {};
    };
  }, [noGL]);

  // --- reshape the sheet when the bodies change ---------------------------
  useEffect(() => {
    fieldRef.current = makeField(bodies);
    marble.current.bodies = bodies;
    const o = objects.current;
    if (!o.sheet) return;
    const { potential, height } = fieldRef.current;

    // sheet heights and colours: deeper is lighter blue; each body's own disc is tinted
    const pos = o.sheet.geometry.attributes.position;
    const col = o.sheet.geometry.attributes.color;
    const top = new THREE.Color(0x141d33);
    const deep = new THREE.Color(0x3b6aa6);
    const earthTint = new THREE.Color(0x2f7fb8);
    const moonTint = new THREE.Color(0x8d8a80);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const v = potential(x, z);
      pos.setY(i, height(x, z));
      c.copy(top).lerp(deep, Math.min(1, Math.pow(-v, 0.7)));
      const inBody = bodies.find((b) => Math.hypot(x - b.x, z - b.z) < b.R);
      if (inBody) c.copy(inBody === EARTH_BODY ? earthTint : moonTint);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    o.sheet.geometry.computeVertexNormals();
    o.sheet.geometry.computeBoundingSphere();

    // grid lines printed on the sheet, every 1 R
    const gridPts = [];
    const sample = 0.1;
    const onSheet = (a, b) => a * a + b * b <= HALF * HALF;
    for (let k = -HALF + 1; k < HALF; k += 1) {
      for (let s = -HALF; s < HALF - 1e-9; s += sample) {
        if (onSheet(k, s) && onSheet(k, s + sample)) {
          gridPts.push(k, height(k, s) + 0.02, s, k, height(k, s + sample) + 0.02, s + sample);
        }
        if (onSheet(s, k) && onSheet(s + sample, k)) {
          gridPts.push(s, height(s, k) + 0.02, k, s + sample, height(s + sample, k) + 0.02, k);
        }
      }
    }
    // the rim
    for (let k = 0; k < 240; k++) {
      const a1 = (k / 240) * Math.PI * 2;
      const a2 = ((k + 1) / 240) * Math.PI * 2;
      const p1 = [Math.cos(a1) * HALF, Math.sin(a1) * HALF];
      const p2 = [Math.cos(a2) * HALF, Math.sin(a2) * HALF];
      gridPts.push(p1[0], height(...p1), p1[1], p2[0], height(...p2), p2[1]);
    }
    o.grid.geometry.dispose();
    o.grid.geometry = new THREE.BufferGeometry();
    o.grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));

    // equipotentials at equal steps of V (equal steps of height)
    const n = 241;
    const cell = (HALF * 2) / (n - 1);
    const values = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) values[j * n + i] = potential(-HALF + i * cell, -HALF + j * cell);
    }
    const levels = [];
    for (let k = 1; k <= 11; k++) levels.push((-STEP_MJ * k) / V_UNIT_MJ);
    const segs = contourSegmentsFlat(values, n, levels);
    const ringPts = [];
    for (const [i1, j1, i2, j2] of segs) {
      const x1 = -HALF + i1 * cell;
      const z1 = -HALF + j1 * cell;
      const x2 = -HALF + i2 * cell;
      const z2 = -HALF + j2 * cell;
      // equipotentials are drawn on the sheet, outside the bodies
      if (!onSheet(x1, z1) || !onSheet(x2, z2)) continue;
      if (bodies.some((b) => Math.hypot((x1 + x2) / 2 - b.x, (z1 + z2) / 2 - b.z) < b.R)) continue;
      ringPts.push(x1, height(x1, z1) + 0.04, z1, x2, height(x2, z2) + 0.04, z2);
    }
    o.rings.geometry.dispose();
    o.rings.geometry = new THREE.BufferGeometry();
    o.rings.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));

    // each body's surface, as a ring on the sheet
    const surf = [];
    for (const b of bodies) {
      for (let k = 0; k < 96; k++) {
        const a1 = (k / 96) * Math.PI * 2;
        const a2 = ((k + 1) / 96) * Math.PI * 2;
        const p1 = [b.x + Math.cos(a1) * b.R, b.z + Math.sin(a1) * b.R];
        const p2 = [b.x + Math.cos(a2) * b.R, b.z + Math.sin(a2) * b.R];
        surf.push(p1[0], height(...p1) + 0.05, p1[1], p2[0], height(...p2) + 0.05, p2[1]);
      }
    }
    o.surfaces.geometry.dispose();
    o.surfaces.geometry = new THREE.BufferGeometry();
    o.surfaces.geometry.setAttribute('position', new THREE.Float32BufferAttribute(surf, 3));

    const edge = [];
    for (let k = 0; k <= 960; k++) {
      const x = -HALF + (k / 960) * HALF * 2;
      edge.push(x, height(x, 0) + 0.02, 0);
    }
    o.profile.geometry.dispose();
    o.profile.geometry = new THREE.BufferGeometry();
    o.profile.geometry.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));

    // start again from rest at the chosen point (or the default, if a body now covers it)
    const m = marble.current;
    let from = start;
    if (bodies.some((b) => Math.hypot(start.x - b.x, start.z - b.z) < b.R + 0.15)) {
      from = { ...DEFAULT_START };
      setStart(from);
    }
    Object.assign(m, { x: from.x, z: from.z, vx: 0, vz: 0, moving: false });
    launchEnergy.current = null;
    if (fig8.current) {
      fig8.current = false;
      from = { ...DEFAULT_START };
      Object.assign(m, { x: from.x, z: from.z });
      setStart(from);
    }
    setRun('idle');
    o.clearTrail();
    o.place();
    setProbe({ x: m.x, z: m.z, speed: 0, V: potential(m.x, m.z) });
    setStatus('Resting on the sheet. Choose how to set it going.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withMoon, noGL]);

  useEffect(() => {
    const o = objects.current;
    if (!o.rings) return;
    o.rings.visible = showRings;
    o.slope.visible = showSlope;
    o.profile.visible = cutaway;
    for (const obj of [o.sheet, o.grid, o.rings, o.surfaces]) {
      obj.material.clippingPlanes = cutaway ? [o.cutPlane] : [];
    }
  }, [showRings, showSlope, cutaway, withMoon, noGL]);

  // cutting away the front half turns the view side-on, so the cut edge is the graph below
  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    if (cutaway) {
      Object.assign(s.view, { theta: 0, phi: 1.5, radius: 27 });
      s.view.target.set(0, -3.6, 0);
    } else {
      Object.assign(s.view, { theta: DEFAULT_VIEW.theta, phi: DEFAULT_VIEW.phi, radius: DEFAULT_VIEW.radius });
      s.view.target.copy(DEFAULT_VIEW.target);
    }
  }, [cutaway]);

  // put the marble at rest somewhere new
  const putMarble = (x, z) => {
    const inBody = bodies.find((b) => Math.hypot(x - b.x, z - b.z) < b.R + 0.15);
    if (inBody) return;
    setStart({ x, z });
    const m = marble.current;
    Object.assign(m, { x, z, vx: 0, vz: 0, moving: false });
    launchEnergy.current = null;
    fig8.current = false;
    setRun('idle');
    const o = objects.current;
    o.clearTrail?.();
    o.place?.();
    setProbe({ x, z, speed: 0, V: fieldRef.current.potential(x, z) });
    setStatus('Resting on the sheet. Choose how to set it going.');
  };
  putRef.current = putMarble;

  const setDistance = (r) => {
    const r0 = Math.hypot(start.x, start.z) || 1;
    putMarble((start.x / r0) * r, (start.z / r0) * r);
  };

  /*
   * Launch sideways from the starting point.
   *   'rest'    from rest
   *   'orbit'   at the circular-orbit speed round whichever body pulls
   *             hardest there, using the full pull towards that body
   *             (the moon's included), at right angles to the line to it
   *   'faster'  1.2 × that speed
   *   'escape'  exactly escape speed, √(−2V), with V from every body
   */
  const launch = (kind, message) => {
    const m = marble.current;
    // After a figure-of-eight the marble starts from the neutral point, where
    // there is no pull to launch against: go back to the default start.
    let st = start;
    if (fig8.current) {
      fig8.current = false;
      st = { ...DEFAULT_START };
      setStart(st);
    }
    const { field, potential: pot } = fieldRef.current;
    const [gx, gz] = field(st.x, st.z);
    // the body whose own pull is strongest here is the one to circle
    const host = bodies.reduce((best, b) => {
      const pull = b.mu / Math.max(1e-6, (st.x - b.x) ** 2 + (st.z - b.z) ** 2);
      return pull > best.pull ? { b, pull } : best;
    }, { b: bodies[0], pull: -1 }).b;
    const dx = st.x - host.x;
    const dz = st.z - host.z;
    const d = Math.hypot(dx, dz);
    const inward = Math.max(1e-6, -(gx * dx + gz * dz) / d); // pull towards the host
    let vCirc = Math.sqrt(inward * d);
    // sideways: at right angles to the line to the host body
    let dir = [-dz / d, dx / d];
    let steady = true;
    if (bodies.length > 1 && (kind === 'orbit' || kind === 'faster')) {
      // With a second body no orbit is a perfect circle, so try a spread of
      // speeds and directions and keep the one whose distance from the host
      // varies least over a lap.
      const best = steadiestLaunch(field, bodies, st, host, vCirc, dir);
      steady = best.score < 0.5;
      if (steady) {
        vCirc = best.v;
        dir = best.dir;
      }
    }
    const v = kind === 'rest' ? 0
      : kind === 'orbit' ? vCirc
        : kind === 'faster' ? 1.2 * vCirc
          : Math.sqrt(-2 * pot(st.x, st.z));
    Object.assign(m, {
      x: st.x,
      z: st.z,
      vx: dir[0] * v,
      vz: dir[1] * v,
      moving: true,
    });
    launchEnergy.current = 0.5 * v * v + pot(st.x, st.z);
    objects.current.clearTrail?.();
    setRun('running');
    const round = host === MOON_BODY && (kind === 'orbit' || kind === 'faster') ? ' It is nearer the moon, so it circles the moon.' : '';
    if (!steady) {
      setStatus('Launched sideways, but no steady orbit is possible from here: the other body pulls too hard, so the path soon breaks up.');
    } else {
      const msg = withMoon && kind === 'orbit'
        ? 'Launched at the speed and direction that keep it closest to a circle (found by trying many).'
        : message;
      setStatus(withMoon && kind !== 'rest' ? `${msg}${round} The other body’s pull disturbs it, so it wanders across the equipotentials.` : msg);
    }
  };

  /*
   * A figure-of-eight round both bodies. It starts at the neutral point,
   * where the two pulls cancel, at a speed and angle found by searching
   * for a path that closes on itself. It loops round the planet one way and
   * the moon the other. Such paths are very sensitive: it holds its shape
   * for several laps here, but any small change and it soon breaks up.
   */
  const figureEight = () => {
    const xN = MOON_BODY.x / (1 + Math.sqrt(MOON_BODY.mu)); // the neutral point
    const v = 0.532;
    const a = (51.85 * Math.PI) / 180;
    setStart({ x: xN, z: 0 });
    fig8.current = true;
    const m = marble.current;
    Object.assign(m, { x: xN, z: 0, vx: -v * Math.cos(a), vz: v * Math.sin(a), moving: true });
    launchEnergy.current = 0.5 * v * v + fieldRef.current.potential(xN, 0);
    objects.current.clearTrail?.();
    objects.current.place?.();
    setRun('running');
    setStatus(
      <>
        A figure-of-eight round the planet and the moon. Apollo 8, 10 and 11 set off on a
        figure-of-eight path like this, a free-return trajectory: if the engines failed, it would
        swing the craft round the Moon and back to the Earth. Apollo 13 used one to get home. (The
        real Moon moves, so the figure-of-eight shows when the path is drawn turning with it.) Read
        more:{' '}
        <a href="https://www.astronomy.com/space-exploration/why-apollo-flew-in-a-figure-8" target="_blank" rel="noreferrer">
          Why Apollo flew in a figure 8
        </a>{' '}
        (Astronomy) and{' '}
        <a href="https://en.wikipedia.org/wiki/Free-return_trajectory" target="_blank" rel="noreferrer">
          Free-return trajectory
        </a>{' '}
        (Wikipedia).
      </>,
    );
  };

  const togglePause = () => {
    const m = marble.current;
    if (run === 'running') {
      m.moving = false;
      setRun('paused');
    } else if (run === 'paused') {
      m.moving = true;
      setRun('running');
    }
  };

  const r = Math.hypot(probe.x, probe.z);
  const Vp = (probe.V ?? fieldRef.current.potential(probe.x, probe.z)) * V_UNIT_MJ;
  const [gxu, gzu] = fieldRef.current.field(probe.x, probe.z);
  // field strength in N kg⁻¹, with the surface value set to exactly 9.81
  const gReal = Math.hypot(gxu, gzu) * 9.81;
  const potential = fieldRef.current.potential;

  const legend = (
    <Legend
      items={[
        { label: `Equipotentials, ${STEP_MJ} MJ kg⁻¹ apart`, color: COLORS.sage },
        { label: 'Downhill: the field', color: COLORS.sky, kind: 'arrow' },
        { label: 'Marble’s path', color: COLORS.coral },
        ...(cutaway ? [{ label: 'Cut edge: the graph of V', color: COLORS.brass }] : []),
      ]}
    />
  );

  const stage = (
    <>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      <p className="stage-note">
        {noGL
          ? 'This page needs WebGL, which this browser has turned off.'
          : 'Drag to turn the view. Click the sheet to place the marble.'}
      </p>
    </>
  );

  const below = (
    <div className="figure">
      <div className="figure-head">
        <h3>The sheet, cut through the middle</h3>
        <p>
          This is a graph of <V>V</V> against distance along the line through{' '}
          {withMoon
            ? 'the planet and the moon. With a moon the sheet no longer has rotational symmetry, so this is only one slice through it.'
            : 'the planet. With one planet the sheet has rotational symmetry: it is this curve, spun round.'}
        </p>
      </div>
      <Plot
        x={[-HALF, HALF]}
        y={[-100, 0]}
        height={230}
        xLabel="distance / R"
        yLabel="V / MJ kg⁻¹"
        yTicks={[-100, -80, -60, -40, -20, 0]}
        ariaLabel="Potential against distance along a line through the centre of the planet: a deep, rounded well"
      >
        {({ sx, sy }) => (
          <>
            {bodies.map((b) => (
              <rect
                key={b.x}
                x={sx(b.x - b.R)}
                y={sy(0)}
                width={sx(b.x + b.R) - sx(b.x - b.R)}
                height={sy(-100) - sy(0)}
                fill={b === EARTH_BODY ? 'rgba(47,127,184,0.16)' : 'rgba(141,138,128,0.18)'}
              />
            ))}
            {levels().map((L) => (
              <line key={L} x1={sx(-HALF)} x2={sx(HALF)} y1={sy(L)} y2={sy(L)} stroke={COLORS.sage} strokeOpacity="0.16" />
            ))}
            <path
              d={fnPath((x) => potential(x, 0) * V_UNIT_MJ, -HALF, HALF, sx, sy, 400)}
              fill="none"
              stroke={COLORS.sage}
              strokeWidth="2.2"
            />
            <line x1={sx(-HALF)} x2={sx(HALF)} y1={sy(Vp)} y2={sy(Vp)} stroke={COLORS.brass} strokeDasharray="4 4" />
            {Math.abs(probe.z) < 0.25 && (
              <circle cx={sx(probe.x)} cy={sy(Vp)} r="6" fill={COLORS.text} stroke={COLORS.deep} strokeWidth="2" />
            )}
            <text x={sx(HALF) - 6} y={sy(Vp) - 6} textAnchor="end" fill={COLORS.brass} fontSize="12">
              marble&rsquo;s level
            </text>
          </>
        )}
      </Plot>
    </div>
  );

  const panel = (
    <>
      <Section title="Set the marble going">
        <Controls>
          <Slider
            label="Starting distance from the planet’s centre"
            value={Math.round(startR * 10) / 10}
            min={1.5}
            max={9}
            step={0.1}
            onChange={setDistance}
            display={`${sig(startR, 2)} R`}
          />
          <div className="row">
            <Button primary onClick={() => launch('rest', 'Released from rest: it rolls straight down the slope.')}>
              Release from rest
            </Button>
            <Button onClick={() => launch('orbit', 'Launched sideways at just the right speed: it circles along one equipotential.')}>
              Launch into orbit
            </Button>
            <Button onClick={() => launch('faster', 'Launched faster: it climbs the slope, slows, and falls back. An ellipse.')}>
              Launch faster
            </Button>
            <Button onClick={() => launch('escape', 'Launched at escape speed: it climbs out of the well.')}>
              Launch at escape speed
            </Button>
          </div>
          {withMoon && (
            <div className="row">
              <Button onClick={figureEight}>Figure of eight</Button>
            </div>
          )}
          <div className="row">
            <Button onClick={togglePause} disabled={run === 'idle'}>
              {run === 'paused' ? 'Resume' : 'Pause'}
            </Button>
          </div>
          <p className="status-line" aria-live="polite">{status}</p>
        </Controls>
      </Section>

      <Section title="The sheet">
        <Controls>
          <Switch label="Add a moon" checked={withMoon} onChange={setWithMoon} />
          <Switch label="Show equipotentials" checked={showRings} onChange={setShowRings} />
          <Switch label="Show the downhill arrow" checked={showSlope} onChange={setShowSlope} />
          <Switch label="Cut away the front half" checked={cutaway} onChange={setCutaway} />
        </Controls>
      </Section>

      <Section title="At the marble">
        <Readouts>
          <Readout label="Distance r" value={sig(r, 3)} unit="R" />
          <Readout label="Depth: potential V" value={sig(Vp, 3)} unit="MJ kg⁻¹" tone={COLORS.sage} />
          <Readout label="Steepness: field g" value={sig(gReal, 3)} unit="N kg⁻¹" tone={COLORS.sky} />
          <Readout label="Speed" value={sig((probe.speed * SPEED_UNIT) / 1000, 3)} unit="km s⁻¹" tone={COLORS.coral} />
        </Readouts>
        <p style={{ marginTop: 10 }}>
          Values are for the Earth: <Nw>R = 6371 km</Nw>, and <Nw><V>V</V> = −62.6 MJ kg⁻¹</Nw> at the surface. The
          animation is a steady time-lapse: one
          second shows about {sig((TIME_RATE * EARTH.R) / SPEED_UNIT / 3600, 2)} hours.
        </p>
      </Section>

      <Section title="Reading the sheet">
        <Eq block>
          <Nw>height ∝ <V>V</V> = −<V>GM</V>/<V>r</V></Nw>
          <br />
          <Nw>steepness ∝ <V>g</V></Nw>
        </Eq>
        <p>
          A real stretched sheet only roughly takes this shape, and a real marble rolls because the
          Earth beneath the classroom pulls it down. Space is not a sheet: this is a graph of <V>V</V>{' '}
          drawn over a flat plane through the planet. The marble here is moved by the true field,
          so its paths are the real ones.
        </p>
      </Section>

      <KeyIdeas>
        <li>
          Potential is negative near a mass and rises towards zero far away, so every mass sits at
          the bottom of a potential well.
        </li>
        <li>
          The rings are equipotentials, drawn at equal steps of <V>V</V>. They are equal steps of
          height on the sheet, so they crowd together where the slope is steep.
        </li>
        <li>
          The steepness of the sheet is the field strength. The marble is pulled straight
          downhill, at right angles to the rings.
        </li>
        <li>
          Climbing out of the well takes energy. To escape completely, a mass needs enough kinetic
          energy to reach the flat sheet far away, where <Nw><V>V</V> = 0</Nw>.
        </li>
        <li>Inside the planet the slope eases off to zero at the centre, where <Nw><V>g</V> = 0</Nw>.</li>
      </KeyIdeas>

      <TryThis>
        <li>Launch into orbit. Why does the marble stay on one ring?</li>
        <li>Launch faster. Where on its path is it moving fastest, and why?</li>
        <li>Add a moon. Find the low ridge between the two wells. What is g on top of it?</li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} notesWide />;
}

/*
 * Search for the most nearly circular launch round `host` when another body
 * also pulls: speeds from 0.7 to 1.3 × the simple estimate and directions
 * up to ±0.4 rad from sideways, both ways round. Each is followed for one
 * lap; the score is the largest fractional change in distance from the
 * host (crashing or leaving the sheet scores 9).
 */
function steadiestLaunch(field, bodies, start, host, v0, dir0) {
  const d0 = Math.hypot(start.x - host.x, start.z - host.z);
  const lap = (2 * Math.PI * d0 ** 1.5) / Math.sqrt(host.mu);
  const h = Math.min(0.03, lap / 400);
  let best = { score: Infinity, v: v0, dir: dir0 };
  for (const sense of [1, -1]) {
    for (let a = -0.4; a <= 0.401; a += 0.1) {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const tx = dir0[0] * sense;
      const tz = dir0[1] * sense;
      const dir = [tx * c - tz * sn, tx * sn + tz * c];
      for (let k = 0.7; k <= 1.301; k += 0.02) {
        const v = v0 * k;
        let x = start.x;
        let z = start.z;
        let vx = dir[0] * v;
        let vz = dir[1] * v;
        let score = 0;
        for (let t = 0; t < lap && score < best.score; t += h) {
          const [ax, az] = field(x, z);
          x += vx * h + 0.5 * ax * h * h;
          z += vz * h + 0.5 * az * h * h;
          const [bx, bz] = field(x, z);
          vx += 0.5 * (ax + bx) * h;
          vz += 0.5 * (az + bz) * h;
          score = Math.max(score, Math.abs(Math.hypot(x - host.x, z - host.z) - d0) / d0);
          if (x * x + z * z > (HALF - 0.3) ** 2 || bodies.some((b) => Math.hypot(x - b.x, z - b.z) < b.R)) score = 9;
        }
        if (score < best.score) best = { score, v, dir };
      }
    }
  }
  return best;
}

/*
 * A flat disc of radius HALF in the x–z plane, with rings packed more
 * closely near the centre where the sheet curves most.
 */
function polarSheet(rings, spokes) {
  const positions = [0, 0, 0];
  for (let i = 1; i <= rings; i++) {
    const r = HALF * (i / rings) ** 1.6;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const index = [];
  const at = (i, k) => 1 + (i - 1) * spokes + (k % spokes);
  for (let k = 0; k < spokes; k++) index.push(0, at(1, k + 1), at(1, k));
  for (let i = 1; i < rings; i++) {
    for (let k = 0; k < spokes; k++) {
      index.push(at(i, k), at(i, k + 1), at(i + 1, k));
      index.push(at(i, k + 1), at(i + 1, k + 1), at(i + 1, k));
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geom.setIndex(index);
  return geom;
}

const levels = () => {
  const out = [];
  for (let k = 1; k <= 19; k++) out.push(-STEP_MJ * k);
  return out;
};

/*
 * Flattened marching squares for the sheet: segments [i1, j1, i2, j2] in
 * grid units, all levels together.
 */
function contourSegmentsFlat(values, n, levelList) {
  const out = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const v0 = values[j * n + i];
      const v1 = values[j * n + i + 1];
      const v2 = values[(j + 1) * n + i + 1];
      const v3 = values[(j + 1) * n + i];
      const lo = Math.min(v0, v1, v2, v3);
      const hi = Math.max(v0, v1, v2, v3);
      for (const L of levelList) {
        if (L <= lo || L > hi) continue;
        const pts = [];
        if (v0 > L !== v1 > L) pts.push([i + (L - v0) / (v1 - v0), j]);
        if (v1 > L !== v2 > L) pts.push([i + 1, j + (L - v1) / (v2 - v1)]);
        if (v3 > L !== v2 > L) pts.push([i + (L - v3) / (v2 - v3), j + 1]);
        if (v0 > L !== v3 > L) pts.push([i, j + (L - v0) / (v3 - v0)]);
        if (pts.length >= 2) out.push([...pts[0], ...pts[1]]);
        if (pts.length === 4) out.push([...pts[2], ...pts[3]]);
      }
    }
  }
  return out;
}

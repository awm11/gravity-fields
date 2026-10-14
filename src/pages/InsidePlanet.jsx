import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PageLayout } from '../components/Shell.jsx';
import { Button, Controls, InfoTip, KeyIdeas, Legend, Readout, Readouts, Section, Segmented, Slider, TryThis } from '../components/ui.jsx';
import { Eq, EqLine, Frac, Nw, V } from '../components/Eq.jsx';
import { Plot, fnPath } from '../components/Plot.jsx';
import { createStage, webglAvailable } from '../lib/threeStage.js';
import { COLORS } from '../lib/draw.js';
import { EARTH, clamp, prefersReducedMotion } from '../lib/physics.js';
import { grouped, sci, sig } from '../lib/format.jsx';

/*
 * The field inside a planet, by Newton's argument with pairs of cones.
 *
 * World units: the planet's radius R = 1, centre at the origin. Values use
 * the Earth's mass and radius, with GM = gR² so that g = 9.81 N kg⁻¹ at the
 * surface.
 *
 * Hollow shell: all the mass in a thin, uniform shell of radius R. A narrow
 * double cone from the probe P cuts two patches from the shell. Per unit
 * solid angle, a patch at distance t along a ray making angle α with the
 * shell's normal has area t²/cos α, so its pull is
 *   Gσ (t²/cos α) / t² = Gσ / cos α,
 * independent of t. A chord meets a sphere at the same angle at both ends,
 * so the two patches pull equally, in opposite directions.
 *
 * Solid planet: uniform density ρ, cut into LAYERS layers like an onion.
 * Each layer above the probe is a hollow shell with the probe inside it, so
 * it pulls nothing; each layer below pulls as if its mass were at the
 * centre. The computer checks this by adding up each layer as thin shells,
 * and each thin shell as rings centred on the line from the centre through
 * the probe (see thinShellPull).
 */

const G_S = 9.81; // N kg⁻¹ at the surface
const V_S = (G_S * EARTH.R) / 1e6; // 62.5 MJ kg⁻¹ at the surface
const R_KM = EARTH.R / 1000;
const FOUR_PI = 4 * Math.PI;

const LAYERS = 20; // onion layers in the solid planet
const PETALS = 8; // each layer peels back as eight segments
const MAX_R = { hollow: 0.9, solid: 1 };
const R_GRAPH = 3;
const BAR_MAX = 1.5; // N kg⁻¹, top of the layer-by-layer chart
const SLAB = 0.009; // half the thickness of a drawn patch, in R

const SWEEP_AXES = 48;
// 48 cones, each of half-angle 11.7°, just cover a hemisphere of directions
const SWEEP_BETA = 11.7;
const SWEEP_STEP = 0.17; // seconds per pair
const FINE = 2000; // directions in a hemisphere for the computer's sums
const SHELL_PIECES = 20000;

// ---------------------------------------------------------------------------
// small vector helpers on [x, y, z] arrays
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 1, 0];
};
const toV3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Distance from P along the unit vector u to the sphere of radius a (P inside it). */
const chord = (P, u, a = 1) => {
  const b = dot(P, u);
  return -b + Math.sqrt(Math.max(0, b * b + a * a - dot(P, P)));
};

/** Two unit vectors at right angles to d and to each other. */
function basisOf(d) {
  const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = unit(cross(d, helper));
  const e2 = cross(d, e1);
  return [e1, e2];
}
const coneDir = (axis, e1, e2, th, ph) =>
  add(scale(axis, Math.cos(th)), add(scale(e1, Math.cos(ph) * Math.sin(th)), scale(e2, Math.sin(ph) * Math.sin(th))));

/** n directions spread evenly over the upper hemisphere (a Fibonacci spiral). */
function hemisphere(n) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n;
    const s = Math.sqrt(1 - y * y);
    out.push([Math.cos(i * golden) * s, y, Math.sin(i * golden) * s]);
  }
  return out;
}

const FINE_DIRS = hemisphere(FINE);
const SWEEP_DIRS = hemisphere(SWEEP_AXES);
// each fine direction (and its opposite) belongs to the sweep pair nearest it
const CELL = FINE_DIRS.map((u) => {
  let best = 0;
  let bestDot = -1;
  SWEEP_DIRS.forEach((a, k) => {
    const c = Math.abs(dot(u, a));
    if (c > bestDot) {
      bestDot = c;
      best = k;
    }
  });
  return best;
});

// The shell cut into 20 000 equal small pieces (an even spread over the sphere).
const SHELL_XYZ = (() => {
  const xyz = new Float64Array(SHELL_PIECES * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SHELL_PIECES; i++) {
    const y = 1 - (2 * (i + 0.5)) / SHELL_PIECES;
    const s = Math.sqrt(1 - y * y);
    xyz[i * 3] = Math.cos(i * golden + 0.3) * s;
    xyz[i * 3 + 1] = y;
    xyz[i * 3 + 2] = Math.sin(i * golden + 0.3) * s;
  }
  return xyz;
})();

/** The computer's check for the hollow shell: add up Gm/d² from every piece, as vectors. */
function shellPiecesSum(P) {
  let gx = 0;
  let gy = 0;
  let gz = 0;
  for (let i = 0; i < SHELL_PIECES; i++) {
    const dx = SHELL_XYZ[i * 3] - P[0];
    const dy = SHELL_XYZ[i * 3 + 1] - P[1];
    const dz = SHELL_XYZ[i * 3 + 2] - P[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const f = 1 / (d2 * Math.sqrt(d2));
    gx += f * dx;
    gy += f * dy;
    gz += f * dz;
  }
  return (G_S * Math.hypot(gx, gy, gz)) / SHELL_PIECES;
}

/*
 * The computer's sums for the hollow shell over 4000 thin cones (2000
 * directions and their opposites), grouped into the 48 sweep pairs so the
 * sweep can add them up pair by pair. Returns the per-pair vectors (N kg⁻¹).
 */
function cellSums(P) {
  const w = (2 * Math.PI) / FINE; // solid angle of each fine cone
  const pair = Array.from({ length: SWEEP_AXES }, () => [0, 0, 0]);
  FINE_DIRS.forEach((u0, i) => {
    const k = CELL[i];
    for (const sgn of [1, -1]) {
      const u = scale(u0, sgn);
      const L = chord(P, u);
      const cosA = dot(u, add(P, scale(u, L)));
      pair[k] = add(pair[k], scale(u, ((G_S / FOUR_PI) * w) / cosA));
    }
  });
  return pair;
}

/*
 * One pair of cones of half-angle beta round the axis d, integrated
 * accurately (a fine polar grid of directions). The near cone is the one
 * that points away from the centre.
 */
function pairMeasures(P, d, beta) {
  const n = dot(P, d) >= 0 ? d : scale(d, -1);
  const [e1, e2] = basisOf(n);
  const NR = 14;
  const NS = 40;
  const out = {};
  for (const [key, sgn] of [['near', 1], ['far', -1]]) {
    const m = { vec: [0, 0, 0], area: 0 };
    for (let i = 0; i < NR; i++) {
      const th = (beta * (i + 0.5)) / NR;
      const dth = beta / NR;
      for (let j = 0; j < NS; j++) {
        const ph = (2 * Math.PI * (j + 0.5)) / NS;
        const w = Math.sin(th) * dth * ((2 * Math.PI) / NS);
        const u = scale(coneDir(n, e1, e2, th, ph), sgn);
        const L = chord(P, u);
        const cosA = dot(u, add(P, scale(u, L)));
        m.vec = add(m.vec, scale(u, ((G_S / FOUR_PI) * w) / cosA));
        m.area += (w * L * L) / cosA;
      }
    }
    m.axis = scale(n, sgn);
    m.dist = chord(P, m.axis) * R_KM;
    m.pull = len(m.vec);
    m.mass = m.area / FOUR_PI; // fraction of the shell's mass
    out[key] = m;
  }
  out.net = len(add(out.near.vec, out.far.vec));
  out.n = n;
  return out;
}

/*
 * The solid planet, layer by layer.
 *
 * The pull at distance r from the centre of a thin shell of radius s holding
 * a fraction f of the planet's mass, found by adding up rings. Cut the shell
 * into rings centred on the line from the centre through the probe. The
 * ring whose points are all a distance d from the probe has mass
 * fM·d dd/(2sr), and its pull points along that line. Writing s cos θ in
 * terms of d, the sum over all the rings is
 *   g = GfM/(4sr²) ∫ (1 − (s² − r²)/d²) dd,  d from |s − r| to s + r,
 * towards the centre. The computer does this sum numerically (Simpson's
 * rule, with d spaced evenly on a log scale so the rings nearest the probe
 * are cut finest).
 */
function thinShellPull(r, s, f) {
  if (r < 1e-9) return 0;
  const lo = Math.max(Math.abs(s - r), 1e-9);
  const hi = s + r;
  const N = 64; // even
  const span = Math.log(hi / lo);
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const d = lo * Math.exp((span * i) / N);
    // the integrand, times dd/dt (= d·span) for the log spacing
    const v = (1 - (s * s - r * r) / (d * d)) * d * span;
    sum += v * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
  }
  sum /= 3 * N;
  return (G_S * f * sum) / (4 * s * r * r);
}

/** The pull (N kg⁻¹, towards the centre) on a probe at r from the layer between radii a0 and a1. */
function layerPull(r, a0, a1) {
  // cut the layer into thin shells, with one cut exactly at the probe
  const cuts = [];
  const K = 12;
  for (let i = 0; i <= K; i++) cuts.push(a0 + ((a1 - a0) * i) / K);
  if (r > a0 && r < a1) {
    cuts.push(r);
    cuts.sort((x, y) => x - y);
  }
  let g = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const x = cuts[i];
    const y = cuts[i + 1];
    if (y - x < 1e-12) continue;
    g += thinShellPull(r, (x + y) / 2, y ** 3 - x ** 3);
  }
  return g;
}

/** Every layer's pull on a probe at r, from the core (index 0) to the surface. */
const layerPulls = (r) => Array.from({ length: LAYERS }, (_, k) => layerPull(r, k / LAYERS, (k + 1) / LAYERS));

// ---------------------------------------------------------------------------
// graphs (signed g, as on the other pages: negative means towards the centre)
const gOf = {
  hollow: (r) => (r < 1 ? 0 : -G_S / (r * r)),
  solid: (r) => (r < 1 ? -G_S * r : -G_S / (r * r)),
};
const vOf = {
  hollow: (r) => (r < 1 ? -V_S : -V_S / r),
  solid: (r) => (r < 1 ? (-V_S * (3 - r * r)) / 2 : -V_S / r),
};

// ---------------------------------------------------------------------------
// geometry for the cones and patches: vertices at P + t(u) u
function capGeometry(P, axis, beta, tOf, NR = 10, NS = 48) {
  const [e1, e2] = basisOf(axis);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= NR; i++) {
    const th = (beta * i) / NR;
    for (let j = 0; j < NS; j++) {
      const u = coneDir(axis, e1, e2, th, (2 * Math.PI * j) / NS);
      const p = add(P, scale(u, tOf(u)));
      pos.push(p[0], p[1], p[2]);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NS; j++) {
      const a = i * NS + j;
      const b = i * NS + ((j + 1) % NS);
      const c = (i + 1) * NS + j;
      const d = (i + 1) * NS + ((j + 1) % NS);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function sideGeometry(P, axis, beta, tA, tB, NS = 48) {
  const [e1, e2] = basisOf(axis);
  const pos = [];
  const idx = [];
  for (let j = 0; j < NS; j++) {
    const u = coneDir(axis, e1, e2, beta, (2 * Math.PI * j) / NS);
    const a = add(P, scale(u, tA(u)));
    const b = add(P, scale(u, tB(u)));
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  for (let j = 0; j < NS; j++) {
    const a = 2 * j;
    const b = 2 * ((j + 1) % NS);
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function ringGeometry(P, axis, beta, tOf, NS = 64) {
  const [e1, e2] = basisOf(axis);
  const pts = [];
  for (let j = 0; j < NS; j++) {
    const u = coneDir(axis, e1, e2, beta, (2 * Math.PI * j) / NS);
    pts.push(toV3(add(P, scale(u, tOf(u)))));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** Latitude and longitude lines on a unit sphere, for the see-through shells. */
function gridGeometry() {
  const pts = [];
  const N = 72;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = Math.sin((lat * Math.PI) / 180);
    const c = Math.cos((lat * Math.PI) / 180);
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2;
      const a1 = ((k + 1) / N) * Math.PI * 2;
      pts.push(new THREE.Vector3(c * Math.cos(a0), y, c * Math.sin(a0)), new THREE.Vector3(c * Math.cos(a1), y, c * Math.sin(a1)));
    }
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const a = (lon * Math.PI) / 180;
    for (let k = 0; k < N; k++) {
      const t0 = (k / N) * Math.PI * 2;
      const t1 = ((k + 1) / N) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(t0) * Math.cos(a), Math.sin(t0), Math.cos(t0) * Math.sin(a)),
        new THREE.Vector3(Math.cos(t1) * Math.cos(a), Math.sin(t1), Math.cos(t1) * Math.sin(a)),
      );
    }
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// colours of the onion layers, from the surface (blue) to the core (warm)
const layerColor = (k) => new THREE.Color('#3f7fb0').lerp(new THREE.Color('#c27a43'), (LAYERS - k) / (LAYERS - 1));

const smooth = (x) => x * x * (3 - 2 * x);

// A default view: the probe up and to the left, the pair off the axis.
const DEFAULT_P = [-0.33, 0.36, 0.1];
const offAxis = (P) => {
  const e = len(P) > 1e-6 ? unit(P) : [0, 1, 0];
  // tilt 55° away from the line to the centre, partly towards the viewer
  const q = unit(add(cross(e, [0, 0, 1]), scale(cross(e, cross(e, [0.5, 0, 1])), -0.9)));
  const tilt = (55 * Math.PI) / 180;
  return unit(add(scale(e, Math.cos(tilt)), scale(q, Math.sin(tilt))));
};

// ---------------------------------------------------------------------------
export default function InsidePlanet({ page }) {
  const [view, setView] = useState('hollow');
  const [P, setP] = useState(DEFAULT_P);
  const [axisMode, setAxisMode] = useState('off');
  const [dir, setDir] = useState(() => offAxis(DEFAULT_P));
  const [betaDeg, setBetaDeg] = useState(12);
  const [sweep, setSweep] = useState(null); // { k, done }
  const [trip, setTrip] = useState(null); // 'dig' | 'walk' while animating
  const [pick, setPick] = useState(15); // solid planet: the layer looked at, 1 (core) to LAYERS (surface)
  const [noGL] = useState(() => !webglAvailable());

  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const objects = useRef({});
  const tags = useRef({});
  const live = useRef({});

  const r = len(P);
  // the probe's direction from the centre, remembered so that it survives
  // the probe passing through the centre (r = 0)
  const lastDir = useRef(unit(DEFAULT_P));
  if (r > 1e-6) lastDir.current = unit(P);
  const solid = view === 'solid';
  const rMax = MAX_R[view];
  const sweeping = sweep !== null;
  const d = sweeping ? SWEEP_DIRS[sweep.k] : axisMode === 'axis' ? lastDir.current : dir;
  const beta = ((sweeping ? SWEEP_BETA : betaDeg) * Math.PI) / 180;

  const pair = useMemo(() => pairMeasures(P, d, beta), [P, d, beta]);
  const cells = useMemo(() => (solid ? null : cellSums(P)), [P, solid]);
  const brute = useMemo(() => (solid ? 0 : shellPiecesSum(P)), [P, solid]);

  // running total of the sweep so far (hollow shell)
  const tally = useMemo(() => {
    if (!sweeping || !cells) return null;
    let v = [0, 0, 0];
    for (let k = 0; k <= sweep.k; k++) v = add(v, cells[k]);
    return { pairs: sweep.k + 1, net: len(v) };
  }, [sweeping, sweep, cells]);

  // solid planet: every layer's pull on the probe, and the layer being looked at
  const pulls = useMemo(() => layerPulls(r), [r]);
  const pullsTotal = pulls.reduce((a, b) => a + b, 0);
  const isAbove = (k) => k / LAYERS >= r - 1e-9; // layer k (from 0) lies wholly above the probe
  const nAbove = pulls.filter((_, k) => isAbove(k)).length;
  const aboveSum = pulls.reduce((a, g, k) => a + (isAbove(k) ? g : 0), 0);
  const belowSum = pullsTotal - aboveSum;
  const pickLo = (pick - 1) / LAYERS;
  const pickHi = pick / LAYERS;
  const pickPull = pulls[pick - 1];
  const pickMass = pickHi ** 3 - pickLo ** 3; // fraction of M
  const pickWhere = isAbove(pick - 1) ? 'above' : r >= pickHi - 1e-9 ? 'below' : 'around';

  const gHere = -gOf[view](r); // size of g at the probe
  const massInside = solid ? r ** 3 : 0; // fraction of M inside radius r

  Object.assign(live.current, { P, view, rMax });

  // stop any animation when the view changes
  const stopAll = () => {
    setSweep(null);
    setTrip(null);
  };

  // --- build the scene once --------------------------------------------
  useEffect(() => {
    if (noGL) return undefined;
    const stage = createStage(hostRef.current, {
      theta: 0.5,
      phi: 1.15,
      radius: 3.3,
      minRadius: 1.8,
      maxRadius: 12,
    });
    stageRef.current = stage;
    const { scene, camera } = stage;
    // on a narrow screen, stand further back so the whole sphere fits across
    const hostBox = hostRef.current.getBoundingClientRect();
    const aspect = hostBox.width / Math.max(1, hostBox.height);
    if (aspect < 1.1) {
      const far = (3.3 * 1.1) / Math.max(aspect, 0.45);
      stage.view.radius = far;
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(3, 5, 6);
    scene.add(sun);

    const grid = gridGeometry();

    // The planet's surface, drawn like a globe: lines of latitude and longitude
    // every 15°, with the equator and every third meridian bolder. The near
    // side is tinted glass with the grid on it; the far side shows the same
    // grid more faintly from the inside, so it is easy to tell front from back
    // and to see which way the globe has been turned. Patches behind the
    // planet are seen through the tinted near side.
    const globe = (() => {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 1024;
      const g = c.getContext('2d');
      const line = (x0, y0, x1, y1, w, a) => {
        g.strokeStyle = `rgba(190,226,255,${a})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      };
      // longitudes (u across), every 15°; every 45° bolder
      for (let k = 0; k < 24; k++) {
        const x = (k / 24) * c.width;
        const bold = k % 3 === 0;
        line(x, 0, x, c.height, bold ? 5 : 2.5, bold ? 0.95 : 0.55);
      }
      // latitudes (v down), every 15°; the equator boldest
      for (let k = 1; k < 12; k++) {
        const y = (k / 12) * c.height;
        const eq = k === 6;
        line(0, y, c.width, y, eq ? 9 : k % 3 === 0 ? 5 : 2.5, eq ? 1 : k % 3 === 0 ? 0.9 : 0.55);
      }
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 8;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const veil = (tint, front, back) => {
      const group = new THREE.Group();
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshStandardMaterial({ color: 0x3f7fb0, transparent: true, opacity: tint, depthWrite: false, roughness: 0.45 }),
      );
      const near = new THREE.Mesh(
        new THREE.SphereGeometry(1.001, 96, 64),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: globe, transparent: true, opacity: front, depthWrite: false }),
      );
      const far = new THREE.Mesh(
        new THREE.SphereGeometry(0.999, 96, 64),
        new THREE.MeshBasicMaterial({ color: 0x8fb8d8, map: globe, transparent: true, opacity: back, depthWrite: false, side: THREE.BackSide }),
      );
      far.renderOrder = 1;
      glass.renderOrder = 5;
      near.renderOrder = 6;
      group.add(far, glass, near);
      return group;
    };

    // the hollow shell
    const shell = new THREE.Group();
    shell.add(
      veil(0.34, 0.75, 0.3),
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshBasicMaterial({ color: 0x23456a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.BackSide }),
      ),
    );
    scene.add(shell);
    const surfaceVeil = veil(0.14, 0.4, 0.12);
    scene.add(surfaceVeil);

    // The poles: a white spot at each, with a short stub of the axis poking
    // out, so it is easy to see which way the sphere has been turned.
    const poles = new THREE.Group();
    for (const y of [1, -1]) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      spot.position.set(0, y * 1.004, 0);
      poles.add(spot);
    }
    poles.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 1.16, 0),
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(0, -1.16, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      ),
    );
    // one brighter line from pole to pole, so a turn about the axis shows too
    const meridian = [];
    for (let k = 0; k <= 96; k++) {
      const t = -Math.PI / 2 + (k / 96) * Math.PI;
      meridian.push(new THREE.Vector3(Math.cos(t) * 1.002, Math.sin(t) * 1.002, 0));
    }
    poles.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(meridian),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
      ),
    );
    scene.add(poles);

    // the solid planet: onion layers that peel back as segments
    const layers = [];
    for (let k = 1; k <= LAYERS; k++) {
      const a = k / LAYERS;
      const mat = new THREE.MeshStandardMaterial({
        color: layerColor(k),
        roughness: 0.8,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      });
      const group = new THREE.Group();
      const petals = [];
      for (let j = 0; j < PETALS; j++) {
        const phiStart = (j / PETALS) * Math.PI * 2;
        const phiC = phiStart + Math.PI / PETALS;
        // SphereGeometry puts azimuth φ at (−cos φ, ·, sin φ)
        const h = new THREE.Vector3(-Math.cos(phiC), 0, Math.sin(phiC));
        const pivot = new THREE.Group();
        pivot.position.set(0, -a, 0);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(a, 12, 18, phiStart, (Math.PI * 2) / PETALS, 0, Math.PI), mat);
        mesh.position.set(0, a, 0);
        pivot.add(mesh);
        group.add(pivot);
        petals.push({ pivot, axis: new THREE.Vector3(h.z, 0, -h.x).normalize() });
      }
      const ghost = new THREE.LineSegments(
        grid,
        new THREE.LineBasicMaterial({ color: layerColor(k), transparent: true, opacity: 0, depthWrite: false }),
      );
      ghost.scale.setScalar(a);
      scene.add(group, ghost);
      layers.push({ a, group, petals, mat, ghost, p: 0, target: 0 });
    }

    // the ball of radius r: the mass that is closer to the centre than the probe
    const ball = new THREE.Group();
    ball.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshStandardMaterial({ color: 0xd9a650, emissive: 0x7a5420, transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.6 }),
      ),
      new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0xe3b25b, transparent: true, opacity: 0.3, depthWrite: false })),
    );
    ball.children.forEach((c) => {
      c.renderOrder = 4;
    });
    scene.add(ball);

    // The layer being looked at, drawn as a whole thick shell in coral, with
    // a wedge cut away on the side facing the camera so you can see into it.
    // The wedge is centred on the group's local +x; each frame the group is
    // turned so that +x points at the camera.
    const CUT = (110 * Math.PI) / 180; // width of the cut-away wedge
    const WEDGE_TURN = -0.45; // radians: the wedge's centre, to one side of the camera
    const pickShell = new THREE.Group();
    const coral = (color, opacity) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
      });
    const pickMats = { outer: coral(0xf2735e, 0.5), inner: coral(0xd85f4b, 0.4), face: coral(0xffa08c, 0.92) };
    const buildPick = (a0, a1) => {
      pickShell.children.forEach((c) => c.geometry.dispose());
      pickShell.clear();
      // SphereGeometry puts azimuth φ at (−cos φ, ·, sin φ), so +x is at φ = π
      const phi0 = Math.PI + CUT / 2;
      const span = 2 * Math.PI - CUT;
      const outer = new THREE.Mesh(new THREE.SphereGeometry(a1, 72, 36, phi0, span), pickMats.outer);
      outer.renderOrder = 2;
      pickShell.add(outer);
      if (a0 > 0.005) {
        const inner = new THREE.Mesh(new THREE.SphereGeometry(a0, 72, 36, phi0, span), pickMats.inner);
        inner.renderOrder = 2;
        pickShell.add(inner);
      }
      // the two cut faces: half-rings in the planes at the edges of the wedge
      for (const phi of [Math.PI - CUT / 2, Math.PI + CUT / 2]) {
        const face = new THREE.Mesh(new THREE.RingGeometry(Math.max(a0, 0), a1, 48, 1, -Math.PI / 2, Math.PI), pickMats.face);
        face.rotation.y = phi - Math.PI;
        face.renderOrder = 8;
        pickShell.add(face);
      }
    };
    scene.add(pickShell);

    // the cones and patches, rebuilt whenever anything moves
    const mat = (color, opacity) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const lit = (color, opacity) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
    const coneParts = new THREE.Group();
    scene.add(coneParts);
    const paint = new THREE.Group();
    scene.add(paint);
    const materials = {
      // the patches are thin slabs, lit so their faces and rims shade differently
      slabFace: lit(0xf2735e, 1),
      slabRim: lit(0x9c3f31, 1),
      coneFaint: mat(0xf2735e, 0.16),
      ring: new THREE.LineBasicMaterial({ color: 0xf2735e, transparent: true, opacity: 0.85, depthWrite: false }),
      paint: [mat(0x9ed68c, 0.4), mat(0x7cc6f2, 0.4), mat(0x8c9bff, 0.4)],
    };

    // the probe, with a larger invisible sphere that is easier to grab
    const probe = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const probeHit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(probe, probeHit);

    const arrow = (color) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.3, color, 0.08, 0.05);
      a.line.material.depthTest = false;
      a.cone.material.depthTest = false;
      a.renderOrder = 10;
      a.line.renderOrder = 10; // an ArrowHelper is not a Group, so its parts need their own order
      a.cone.renderOrder = 10;
      scene.add(a);
      return a;
    };
    const arrows = { near: arrow(0xf2735e), far: arrow(0xf2735e), g: arrow(0x7cc6f2) };

    // --- dragging the probe, or either patch --------------------------------
    const raycaster = new THREE.Raycaster();
    const el = stage.renderer.domElement;
    let drag = null;
    const rayAt = (e) => {
      const rect = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
    };
    const pickPatch = () => {
      const hits = raycaster.intersectObjects(coneParts.children.filter((c) => c.userData.patch), false);
      return hits.length ? hits[0].object.userData.patch : null;
    };
    const onDown = (e) => {
      rayAt(e);
      if (raycaster.intersectObject(probeHit).length) {
        const facing = camera.getWorldDirection(new THREE.Vector3());
        drag = { kind: 'probe', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(facing, probe.position.clone()) };
      } else {
        const which = pickPatch();
        if (!which) return;
        drag = { kind: 'patch', last: live.current.patchCentres?.[which] };
      }
      stage.lock.on = true;
      live.current.onDragStart?.();
    };
    const onMove = (e) => {
      rayAt(e);
      if (!drag) {
        el.style.cursor = raycaster.intersectObject(probeHit).length || pickPatch() ? 'grab' : '';
        return;
      }
      el.style.cursor = 'grabbing';
      const { P: Pnow, rMax: lim } = live.current;
      if (drag.kind === 'probe') {
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
        let p = [hit.x, hit.y, hit.z];
        const l = len(p);
        if (l > lim) p = scale(p, lim / l);
        live.current.onProbe?.(p);
      } else {
        // where the pointer's ray meets the outer sphere: of the two crossings,
        // take the one nearer the patch being dragged
        const o = raycaster.ray.origin;
        const v = raycaster.ray.direction;
        const b = o.dot(v);
        const disc = b * b - (o.lengthSq() - 1);
        if (disc < 0) return;
        const pts = [-b - Math.sqrt(disc), -b + Math.sqrt(disc)].map((t) => [o.x + v.x * t, o.y + v.y * t, o.z + v.z * t]);
        const cur = drag.last;
        const pick = cur && len(add(pts[1], scale(cur, -1))) < len(add(pts[0], scale(cur, -1))) ? pts[1] : pts[0];
        drag.last = pick;
        // the cones' axis runs from the probe through the patch being dragged
        live.current.onAxis?.(unit(add(pick, scale(Pnow, -1))));
      }
    };
    const onUp = () => {
      drag = null;
      stage.lock.on = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    // --- each frame: peel the layers, and place the labels -----------------
    const reduced = prefersReducedMotion();
    const offFrame = stage.onFrame((dt) => {
      const solidNow = live.current.view === 'solid';
      // keep the cut-away wedge of the chosen layer turned towards the camera,
      // following it round the vertical axis only (not up and down), and a
      // little to one side so its cut faces show
      if (pickShell.visible) {
        const az = Math.atan2(-camera.position.z, camera.position.x);
        pickShell.rotation.set(0, az + WEDGE_TURN, 0);
      }
      layers.forEach((L, i) => {
        // peel from the outside in: a layer starts once the one outside it is under way
        const outer = layers[i + 1];
        const mayStart = !outer || outer.p > 0.3 || outer.target === 0;
        let goal = L.target;
        if (goal > L.p && !mayStart) goal = L.p;
        const rate = reduced ? 100 : 2.4;
        L.p = goal > L.p ? Math.min(goal, L.p + rate * dt) : Math.max(goal, L.p - rate * dt);
        const s = smooth(L.p);
        L.petals.forEach(({ pivot, axis }) => pivot.quaternion.setFromAxisAngle(axis, s * 1.6));
        L.mat.opacity = 0.96 * (1 - s) ** 1.5;
        L.group.visible = solidNow && L.mat.opacity > 0.01 && L.a > live.current.rBall + 1e-6;
        L.ghost.material.opacity = solidNow && L.a > live.current.rBall + 1e-6 ? 0.07 * s : 0;
        L.ghost.visible = L.ghost.material.opacity > 0.005;
      });

      const rect = el.getBoundingClientRect();
      for (const [key, node] of Object.entries(tags.current)) {
        const pos = live.current.tagAt?.[key];
        if (!node) continue;
        if (!pos) {
          node.style.opacity = 0;
          continue;
        }
        const v = toV3(pos).project(camera);
        node.style.opacity = v.z < 1 ? 1 : 0;
        node.style.transform = `translate(${((v.x + 1) / 2) * rect.width}px, ${((1 - v.y) / 2) * rect.height}px) translate(-50%, -50%)`;
      }
    });

    objects.current = { shell, surfaceVeil, layers, ball, pickShell, buildPick, pickKey: '', coneParts, paint, materials, probe, probeHit, arrows };

    return () => {
      offFrame();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      coneParts.children.forEach((c) => c.geometry.dispose());
      paint.children.forEach((c) => c.geometry.dispose());
      Object.values(materials).flat().forEach((m) => m.dispose());
      stage.dispose();
      stageRef.current = null;
      objects.current = {};
    };
  }, [noGL]);

  // pointer callbacks for the scene, kept current
  live.current.onProbe = (p) => setP(p);
  live.current.onAxis = (axis) => {
    setAxisMode('off');
    setDir(axis);
  };
  live.current.onDragStart = () => stopAll();

  // --- rebuild cones, patches and arrows ---------------------------------
  useEffect(() => {
    const o = objects.current;
    if (!o.coneParts) return;
    o.coneParts.children.forEach((c) => c.geometry.dispose());
    o.coneParts.clear();

    const add3 = (geom, material, userData) => {
      const kind = geom.index ? THREE.Mesh : THREE.LineLoop;
      const m = new kind(geom, material);
      if (userData) m.userData = userData;
      o.coneParts.add(m);
      return m;
    };
    const L = (u) => chord(P, u);
    const zero = () => 0;
    // a patch of the shell as a thin slab: outer face, inner face and rim
    const slab = (axis, which) => {
      const outer = (u) => chord(P, u, 1 + SLAB);
      const inner = (u) => chord(P, u, 1 - SLAB);
      for (const geom of [capGeometry(P, axis, beta, outer), capGeometry(P, axis, beta, inner)]) {
        geom.computeVertexNormals();
        add3(geom, o.materials.slabFace, { patch: which });
      }
      const side = sideGeometry(P, axis, beta, inner, outer, 64);
      side.computeVertexNormals();
      add3(side, o.materials.slabRim, { patch: which });
      add3(ringGeometry(P, axis, beta, outer), o.materials.ring);
      add3(ringGeometry(P, axis, beta, inner), o.materials.ring);
    };
    const n = pair.n;
    const far = scale(n, -1);
    const at = toV3(P);
    o.probe.position.copy(at);
    o.probeHit.position.copy(at);

    o.shell.visible = !solid;
    o.surfaceVeil.visible = solid;
    o.ball.visible = solid && r > 0.01;
    o.ball.scale.setScalar(Math.max(r, 0.001));
    o.pickShell.visible = solid;
    // a layer inside the ball is drawn over it; otherwise the ball is drawn over the back of the layer
    // when the layer is wholly above the ball, the ball is drawn solid
    const ballSolid = pickLo >= r - 1e-9;
    o.ball.children.forEach((c) => {
      c.renderOrder = ballSolid ? 4 : 1;
    });
    const ballMat = o.ball.children[0].material;
    ballMat.opacity = ballSolid ? 1 : 0.42;
    ballMat.transparent = !ballSolid;
    ballMat.depthWrite = ballSolid;
    ballMat.needsUpdate = true;
    const key = `${pickLo},${pickHi}`;
    if (o.pickKey !== key) {
      o.buildPick(pickLo, pickHi);
      o.pickKey = key;
    }

    const place = (a, vec, scaleBy, min = 0.06) => {
      const l = len(vec) * scaleBy;
      a.visible = l > 1e-4;
      if (!a.visible) return;
      const lengthShown = Math.max(min, Math.min(0.75, l));
      a.position.copy(at);
      a.setDirection(toV3(unit(vec)));
      a.setLength(lengthShown, Math.min(0.08, lengthShown * 0.35), Math.min(0.05, lengthShown * 0.22));
    };
    // the field at the probe: towards the centre, size GMr/R³
    const towardsCentre = (a, size) => {
      a.visible = solid && r > 0.01 && size > 1e-6;
      if (!a.visible) return;
      const l = Math.max(0.05, 0.07 * size);
      a.position.copy(at);
      a.setDirection(toV3(unit(scale(P, -1))));
      a.setLength(l, Math.min(0.1, l * 0.4), Math.min(0.06, l * 0.25));
    };

    if (!solid) {
      for (const [axis, which] of [[n, 'near'], [far, 'far']]) {
        slab(axis, which);
        add3(sideGeometry(P, axis, beta, zero, L), o.materials.coneFaint);
      }
      place(o.arrows.near, pair.near.vec, 4);
      place(o.arrows.far, pair.far.vec, 4);
    } else {
      o.arrows.near.visible = false;
      o.arrows.far.visible = false;
    }
    towardsCentre(o.arrows.g, G_S * r);

    // what the layers should be doing: every layer above the probe peels back
    o.layers.forEach((layer) => {
      if (!solid) {
        layer.target = 0;
        layer.p = 0;
      } else if (layer.a > r + 1e-6) {
        layer.target = 1;
      } else {
        layer.target = 0;
        layer.p = 0;
      }
    });
    live.current.rBall = solid ? r : 2;

    // labels
    if (solid) {
      live.current.patchCentres = {};
      live.current.tagAt = { probe: add(P, [0.07, 0.07, 0]) };
    } else {
      const nearC = add(P, scale(n, L(n)));
      const farC = add(P, scale(far, L(far)));
      live.current.patchCentres = { near: nearC, far: farC };
      live.current.tagAt = {
        near: scale(nearC, 1.09),
        far: scale(farC, 1.09),
        probe: add(P, [0.07, 0.07, 0]),
      };
    }
  }, [P, pair, beta, solid, r, pickLo, pickHi]);

  // --- painting during the sweep ------------------------------------------
  useEffect(() => {
    const o = objects.current;
    if (!o.paint) return;
    if (!sweeping) {
      o.paint.children.forEach((c) => c.geometry.dispose());
      o.paint.clear();
      return;
    }
    const b = (SWEEP_BETA * Math.PI) / 180;
    while (o.paint.children.length < (sweep.k + 1) * 2) {
      const k = o.paint.children.length >> 1;
      const a = SWEEP_DIRS[k];
      const side = o.paint.children.length % 2 ? -1 : 1;
      const m = new THREE.Mesh(
        capGeometry(P, scale(a, side), b, (u) => chord(P, u) * 0.993, 5, 24),
        o.materials.paint[k % 3],
      );
      o.paint.add(m);
    }
  }, [sweeping, sweep, P]);

  // --- the sweep: one pair every SWEEP_STEP seconds ------------------------
  useEffect(() => {
    if (!sweep || sweep.done) return undefined;
    if (prefersReducedMotion()) {
      setSweep({ k: SWEEP_AXES - 1, done: true });
      return undefined;
    }
    const t = setTimeout(() => {
      setSweep(sweep.k + 1 >= SWEEP_AXES - 1 ? { k: SWEEP_AXES - 1, done: true } : { k: sweep.k + 1, done: false });
    }, SWEEP_STEP * 1000);
    return () => clearTimeout(t);
  }, [sweep]);

  // --- the probe's trips: dig to the centre, or a walk round the shell ------
  useEffect(() => {
    if (!trip) return undefined;
    const startDir = lastDir.current;
    const T = trip === 'dig' ? 9 : 12;
    const path = (f) => {
      if (trip === 'dig') {
        const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        return scale(startDir, 1 - e);
      }
      const a = f * Math.PI * 2;
      const p = [0.62 * Math.sin(a) - 0.1 * Math.sin(3 * a), 0.5 * Math.sin(2 * a) + 0.15 * Math.cos(a), 0.4 * Math.cos(a) - 0.35];
      const l = len(p);
      return l > 0.86 ? scale(p, 0.86 / l) : p;
    };
    if (prefersReducedMotion()) {
      setP(path(1));
      setTrip(null);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const f = Math.min(1, (now - t0) / 1000 / T);
      setP(path(f));
      if (f < 1) raf = requestAnimationFrame(step);
      else setTrip(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  // ------------------------------------------------------------------------
  const changeView = (v) => {
    stopAll();
    setView(v);
    if (v === 'hollow' && r > MAX_R.hollow) setP(scale(P, MAX_R.hollow / r));
    // entering the solid planet, every layer starts closed and then peels back
    const o = objects.current;
    o.layers?.forEach((layer) => {
      layer.p = 0;
    });
  };
  const setRadius = (v) => {
    stopAll();
    const e = lastDir.current;
    setP(scale(e, clamp(v, 0, rMax)));
  };
  const startSweep = () => {
    setTrip(null);
    setSweep({ k: 0, done: false });
  };
  const startTrip = (kind) => {
    setSweep(null);
    if (kind === 'walk' && axisMode === 'axis') setAxisMode('off');
    setTrip(kind);
  };

  const ratio = pair.far.dist / pair.near.dist;
  const legend = (
    <Legend
      items={
        solid
          ? [
              { label: 'The layer you are looking at', color: COLORS.coral },
              { label: 'The ball below the probe: all that pulls', color: COLORS.brass },
              { label: 'Field at the probe, g', color: COLORS.sky, kind: 'arrow' },
            ]
          : [
              { label: 'A pair of patches', color: COLORS.coral },
              { label: 'Pull of each patch', color: COLORS.coral, kind: 'arrow' },
            ]
      }
    />
  );

  const stage = (
    <>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="scene-tags" aria-hidden="true">
        <span ref={(n) => { tags.current.near = n; }} className="scene-tag">1</span>
        <span ref={(n) => { tags.current.far = n; }} className="scene-tag">2</span>
        <span ref={(n) => { tags.current.probe = n; }} className="scene-tag is-probe"><i>m</i></span>
      </div>
      <p className="stage-note">
        {noGL
          ? 'This page needs WebGL, which this browser has turned off.'
          : solid
            ? 'Every layer above the probe is peeled back. Each is a hollow shell round the probe, so it pulls nothing. Only the gold ball below pulls. Drag the probe; drag elsewhere to turn the view.'
            : 'Drag the probe, m, or either patch. Drag elsewhere to turn the view.'}
      </p>
    </>
  );

  const shade = ({ sx, sy }, top, bottom) => (
    <>
      <rect x={sx(0)} y={sy(top)} width={sx(1) - sx(0)} height={sy(bottom) - sy(top)} fill="rgba(47,127,184,0.12)" />
      <text className="plot-note" x={sx(0.5)} y={sy(top) + 16} textAnchor="middle" style={{ fill: 'var(--text-3)' }}>
        inside
      </text>
    </>
  );
  const other = solid ? 'hollow' : 'solid';
  const curve = (fns, key, { sx, sy }, color, dashed) => {
    const f = fns[key];
    const style = dashed ? { strokeDasharray: '5 5', opacity: 0.5 } : {};
    if (key === 'hollow' && fns === gOf) {
      // zero inside, then a jump at the shell
      return (
        <>
          <path d={`M${sx(0)},${sy(0)}L${sx(1)},${sy(0)}`} fill="none" stroke={color} strokeWidth={dashed ? 1.6 : 2.6} style={style} />
          <path d={`M${sx(1)},${sy(0)}L${sx(1)},${sy(-G_S)}`} fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="2 4" opacity={dashed ? 0.4 : 0.8} />
          <path d={fnPath(f, 1, R_GRAPH, sx, sy, 200)} fill="none" stroke={color} strokeWidth={dashed ? 1.6 : 2.6} style={style} />
        </>
      );
    }
    return <path d={fnPath(f, 0, R_GRAPH, sx, sy, 300)} fill="none" stroke={color} strokeWidth={dashed ? 1.6 : 2.6} style={style} />;
  };
  const pickR = (xv) => setRadius(Math.round(clamp(xv, 0, rMax) * 100) / 100);

  const below = (
    <div className="figures">
      <div className="figure">
        <div className="figure-head">
          <h3>Field strength, <V>g</V></h3>
          <p>Dashed: the {other === 'solid' ? 'solid planet' : 'hollow shell'}, for comparison.</p>
        </div>
        <Plot
          x={[0, R_GRAPH]}
          y={[-10, 0]}
          height={220}
          xTicks={[0, 0.5, 1, 1.5, 2, 2.5, 3]}
          yTicks={[-10, -8, -6, -4, -2, 0]}
          xLabel="r / R"
          yLabel="g / N kg⁻¹"
          onPointer={pickR}
          ariaLabel={solid ? 'Field strength against distance: inside the planet it rises in proportion to r; outside it falls as 1/r²' : 'Field strength against distance: zero everywhere inside the shell, then 1/r² outside'}
        >
          {(sc) => (
            <>
              {shade(sc, 0, -10)}
              {curve(gOf, other, sc, COLORS.sky, true)}
              {curve(gOf, view, sc, COLORS.sky, false)}
              <line x1={sc.sx(r)} x2={sc.sx(r)} y1={sc.sy(0)} y2={sc.sy(-10)} stroke={COLORS.brass} strokeOpacity="0.4" />
              <circle cx={sc.sx(r)} cy={sc.sy(gOf[view](r))} r="6" fill={COLORS.brass} />
            </>
          )}
        </Plot>
      </div>
      <div className="figure">
        <div className="figure-head">
          <h3>Potential, <V>V</V></h3>
          <p>
            {solid ? 'Still falling inside: the gradient is not zero.' : 'Flat inside: zero gradient, zero field.'}
          </p>
        </div>
        <Plot
          x={[0, R_GRAPH]}
          y={[-100, 0]}
          height={220}
          xTicks={[0, 0.5, 1, 1.5, 2, 2.5, 3]}
          yTicks={[-100, -80, -60, -40, -20, 0]}
          xLabel="r / R"
          yLabel="V / MJ kg⁻¹"
          onPointer={pickR}
          ariaLabel={solid ? 'Potential against distance: lowest at the centre of the planet' : 'Potential against distance: constant inside the shell'}
        >
          {(sc) => (
            <>
              {shade(sc, 0, -100)}
              {curve(vOf, other, sc, COLORS.sage, true)}
              {curve(vOf, view, sc, COLORS.sage, false)}
              <line x1={sc.sx(r)} x2={sc.sx(r)} y1={sc.sy(0)} y2={sc.sy(-100)} stroke={COLORS.brass} strokeOpacity="0.4" />
              <circle cx={sc.sx(r)} cy={sc.sy(vOf[view](r))} r="6" fill={COLORS.brass} />
            </>
          )}
        </Plot>
      </div>
    </div>
  );

  const fmt = (v, dp = 3) => (Math.abs(v) < 0.5 * 10 ** -dp ? (0).toFixed(dp) : v.toFixed(dp));

  const panel = (
    <>
      <Section title="Choose a planet">
        <Controls>
          <Segmented
            label="Planet"
            value={view}
            onChange={changeView}
            options={[
              { value: 'hollow', label: 'Hollow shell' },
              { value: 'solid', label: 'Solid planet' },
            ]}
          />
          <p className="slider-hint">
            {solid
              ? 'A uniform planet with the Earth’s mass and radius.'
              : 'All the Earth’s mass spread evenly over a thin shell the size of the Earth.'}
          </p>
        </Controls>
      </Section>

      {solid ? (
        <>
          <Section title="Move the probe">
            <Controls>
              <Slider
                label="Distance of the probe from the centre, r"
                value={r}
                min={0}
                max={rMax}
                step={0.01}
                onChange={setRadius}
                display={`${sig(r, 2)}\u00a0R`}
                aside={
                  <InfoTip title="The real Earth">
                    The real Earth is far denser in the middle, so going down a mine, <V>g</V> at first
                    rises a little. It peaks at about 10.7 N kg⁻¹ at the top of the iron core, about 2900 km
                    down, and only then falls to zero at the centre.
                  </InfoTip>
                }
              />
              <div className="row">
                <Button primary onClick={() => startTrip('dig')} disabled={trip !== null}>Dig to the centre</Button>
              </div>
            </Controls>
          </Section>

          <Section title="Layer by layer">
            <p style={{ marginBottom: 8 }}>
              The planet is cut into {LAYERS} layers, each {grouped(Math.round(R_KM / LAYERS))} km thick.
              This is the pull of every one of them on the probe.
            </p>
            <Plot
              x={[0, 1]}
              y={[0, BAR_MAX]}
              height={200}
              xTicks={[0, 0.25, 0.5, 0.75, 1]}
              yTicks={[0, 0.5, 1, 1.5]}
              xLabel="radius of the layer / R"
              yLabel="pull / N kg⁻¹"
              pad={{ l: 46 }}
              onPointer={(xv) => setPick(clamp(Math.floor(xv * LAYERS) + 1, 1, LAYERS))}
              ariaLabel={`The pull of each of the ${LAYERS} layers on the probe. The ${nAbove} layers above the probe each pull zero; the layers below it add up to ${sig(pullsTotal, 3)} N per kg.`}
            >
              {({ sx, sy }) => (
                <>
                  <rect x={sx(r)} y={sy(BAR_MAX)} width={Math.max(0, sx(1) - sx(r))} height={sy(0) - sy(BAR_MAX)} fill="rgba(242,115,94,0.07)" />
                  {1 - r > 0.3 && (
                    <text className="plot-note" x={sx((1 + r) / 2)} y={sy(BAR_MAX * 0.55)} textAnchor="middle" style={{ fill: 'var(--text-3)' }}>
                      each pulls 0
                    </text>
                  )}
                  {pulls.map((g, k) => {
                    const x0 = sx(k / LAYERS) + 1;
                    const x1 = sx((k + 1) / LAYERS) - 1;
                    const picked = k === pick - 1;
                    const bw = Math.max(0, x1 - x0);
                    const h = Math.max(0, sy(0) - sy(Math.min(g, BAR_MAX)));
                    return (
                      <g key={k}>
                        {h > 0.5 && <rect x={x0} y={sy(0) - h} width={bw} height={h} fill={COLORS.brass} opacity={picked ? 1 : 0.65} />}
                        {h <= 0.5 && <rect x={x0} y={sy(0) - 2.5} width={bw} height={2.5} fill={COLORS.coral} opacity={picked ? 1 : 0.6} />}
                        {picked && (
                          <rect x={x0 - 1.5} y={sy(BAR_MAX)} width={bw + 3} height={sy(0) - sy(BAR_MAX)} fill="none" stroke={COLORS.coral} strokeWidth="1.5" />
                        )}
                      </g>
                    );
                  })}
                  <line x1={sx(r)} x2={sx(r)} y1={sy(0)} y2={sy(BAR_MAX)} stroke="#ffffff" strokeOpacity="0.75" strokeDasharray="3 3" />
                  <text
                    className="plot-note"
                    x={sx(r) + (r > 0.8 ? -4 : 4)}
                    y={sy(BAR_MAX) + 12}
                    textAnchor={r > 0.8 ? 'end' : 'start'}
                    style={{ fill: 'var(--text-2)' }}
                  >
                    probe
                  </text>
                </>
              )}
            </Plot>
            <Controls>
              <Slider
                label="Layer to look at"
                value={pick}
                min={1}
                max={LAYERS}
                step={1}
                onChange={(v) => setPick(v)}
                display={`${pickLo.toFixed(2)}–${pickHi.toFixed(2)}\u00a0R`}
                hint="Or tap its bar on the chart."
              />
            </Controls>
            <Readouts>
              <Readout label="Mass of this layer" value={sci(pickMass * EARTH.M, 2)} unit="kg" />
              <Readout label="Its pull on the probe" value={fmt(pickPull)} unit="N kg⁻¹" tone={COLORS.coral} />
            </Readouts>
            <p style={{ marginTop: 10 }}>
              {pickWhere === 'above' ? (
                <>
                  This layer is above the probe. It is a hollow shell with the probe inside it, so it pulls
                  nothing at all.
                </>
              ) : pickWhere === 'below' ? (
                <>
                  This layer is below the probe. It pulls as if all its mass were at the centre,{' '}
                  <Nw><V>Gm</V>/<V>r</V>²</Nw>.
                </>
              ) : (
                <>
                  The probe is inside this layer. The part of the layer below the probe pulls; the part
                  above it does not.
                </>
              )}
            </p>
          </Section>

          <Section title="Adding up the layers">
            <Eq block>
              <Nw><V>g</V> = (the layers above the probe) + (the ball below it)</Nw>
            </Eq>
            <Readouts>
              <Readout label={`The ${nAbove} layer${nAbove === 1 ? '' : 's'} above the probe`} value={fmt(aboveSum)} unit="N kg⁻¹" tone={COLORS.coral} wide />
              <Readout label="The ball below the probe" value={sig(belowSum, 3)} unit="N kg⁻¹" tone={COLORS.brass} wide />
            </Readouts>
            <p style={{ marginTop: 10 }}>
              The ball has radius <V>r</V> and holds {sig(massInside, 3)} of the planet&rsquo;s mass,{' '}
              <Nw>(<V>r</V>/<V>R</V>)³</Nw>. From its surface it pulls as if all that mass were at its
              centre:
            </p>
            <Eq block>
              <EqLine>
                <Nw>
                  <V>g</V> = <Frac n={<><V>GM</V>(<V>r</V>/<V>R</V>)³</>} d={<><V>r</V>²</>} />
                </Nw>{' '}
                <Nw>
                  = <Frac n={<><V>GM</V><V>r</V></>} d={<><V>R</V>³</>} />
                </Nw>
              </EqLine>
            </Eq>
            <p>
              Making the layers ever thinner and adding them all up is what calculus calls an integral.
              You do not need it here: the layers above cancel, and the ball is left.{' '}
              <InfoTip title="How the computer adds up a layer">
                It cuts each layer into 12 thinner shells, and each of those into rings centred on the line
                from the centre through the probe. Every bit of a ring is the same distance from the probe,
                so a ring&rsquo;s pull is simple to work out. Adding up the rings shows that each layer above
                the probe pulls exactly nothing.
              </InfoTip>
            </p>
            <Readouts>
              <Readout label={`Computer: ${LAYERS} layers added, ring by ring`} value={sig(pullsTotal, 3)} unit="N kg⁻¹" tone={COLORS.sky} wide />
              <Readout label={<>Formula, <Nw><V>GMr</V>/<V>R</V>³</Nw></>} value={sig(gHere, 3)} unit="N kg⁻¹" tone={COLORS.sky} wide />
            </Readouts>
          </Section>
        </>
      ) : (
        <>
          <Section title="Move the probe and the cones">
            <Controls>
              <Slider
                label="Distance of the probe from the centre, r"
                value={r}
                min={0}
                max={rMax}
                step={0.01}
                onChange={setRadius}
                display={`${sig(r, 2)}\u00a0R`}
                aside={
                  <InfoTip title="Newton's argument">
                    Newton proved that a shell exerts no pull anywhere inside it with exactly these pairs of
                    cones, in his <em>Principia</em> of 1687.
                  </InfoTip>
                }
              />
              <Segmented
                label="The pair of cones"
                value={sweeping ? '' : axisMode}
                onChange={(m) => {
                  stopAll();
                  setAxisMode(m);
                  if (m === 'off') setDir(offAxis(lastDir.current));
                }}
                options={[
                  { value: 'axis', label: 'Along the line to the centre' },
                  { value: 'off', label: 'Off that line' },
                ]}
              />
              <Slider
                label="Width of the cones"
                value={betaDeg}
                min={4}
                max={20}
                step={1}
                onChange={(v) => {
                  setSweep(null);
                  setBetaDeg(v);
                }}
                display={`${sweeping ? SWEEP_BETA : betaDeg}°`}
                disabled={sweeping}
                hint="The half-angle of each cone."
              />
              <div className="row">
                <Button primary onClick={startSweep} disabled={sweeping && !sweep.done}>
                  Sweep round the whole shell
                </Button>
                <Button onClick={() => startTrip('walk')} disabled={trip !== null}>Take the probe for a walk</Button>
              </div>
            </Controls>
          </Section>

          <Section title="One pair of patches">
            <table className="pair-table">
              <thead>
                <tr>
                  <th />
                  <th><span className="pair-key">1</span> near</th>
                  <th><span className="pair-key">2</span> far</th>
                  <th>2 ÷ 1</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Distance / km</th>
                  <td>{grouped(pair.near.dist)}</td>
                  <td>{grouped(pair.far.dist)}</td>
                  <td>{sig(ratio, 3)}</td>
                </tr>
                <tr>
                  <th>Area / million km²</th>
                  <td>{sig((pair.near.area * R_KM ** 2) / 1e6, 3)}</td>
                  <td>{sig((pair.far.area * R_KM ** 2) / 1e6, 3)}</td>
                  <td>{sig(pair.far.area / pair.near.area, 3)}</td>
                </tr>
                <tr>
                  <th>Mass / kg</th>
                  <td>{sci(pair.near.mass * EARTH.M, 2)}</td>
                  <td>{sci(pair.far.mass * EARTH.M, 2)}</td>
                  <td>{sig(pair.far.mass / pair.near.mass, 3)}</td>
                </tr>
                <tr>
                  <th>Pull / N kg⁻¹</th>
                  <td>{sig(pair.near.pull, 3)}</td>
                  <td>{sig(pair.far.pull, 3)}</td>
                  <td>{sig(pair.far.pull / pair.near.pull, 3)}</td>
                </tr>
              </tbody>
            </table>
            <Readouts>
              <Readout label="Net pull of the pair" value={fmt(pair.net)} unit="N kg⁻¹" tone={COLORS.coral} wide />
            </Readouts>
            <p style={{ marginTop: 10 }}>
              Patch 2 is {sig(ratio, 3)} times as far away, so it is about{' '}
              <Nw>{sig(ratio, 3)}² = {sig(ratio * ratio, 3)}</Nw> times the area and the mass. Each
              kilogram of it pulls <Nw>1/{sig(ratio * ratio, 3)}</Nw> as hard. The pulls are equal and
              opposite.
            </p>
          </Section>

          <Section title="Adding up the whole shell">
            <Eq block>
              <Nw><V>g</V> = Σ (pull of 1 − pull of 2) = 0</Nw>
            </Eq>
            <p>Every bit of the shell belongs to one pair of patches. Sweep round to add up all the pairs, one at a time.</p>
            <Readouts>
              <Readout label="Pairs added" value={tally ? `${tally.pairs} of ${SWEEP_AXES}` : '—'} />
              <Readout label="Net pull so far" value={tally ? fmt(tally.net) : '—'} unit={tally ? 'N kg⁻¹' : ''} tone={COLORS.coral} />
            </Readouts>
            <p style={{ marginTop: 10 }}>
              Making the pairs ever thinner and adding up all of them is what calculus calls an integral. You
              do not need it here: every pair adds zero, so the whole shell does too.
            </p>
            <Readouts>
              <Readout label="Computer: 20 000 pieces of shell added" value={fmt(brute, 4)} unit="N kg⁻¹" tone={COLORS.sky} wide />
            </Readouts>
          </Section>
        </>
      )}

      <Section title={solid ? 'Why only the inside pulls' : 'Why each pair cancels'} below>
        {solid ? (
          <ol className="steps">
            <li>
              Cut the planet into thin layers, like an onion. Every layer above the probe is a hollow
              shell with the probe inside it.
            </li>
            <li>
              A hollow shell pulls nothing anywhere inside it (switch to the hollow shell to see why). So
              the layers above the probe pull nothing, however many there are.
            </li>
            <li>
              All that is left is the ball below the probe: radius <V>r</V>, mass{' '}
              <Nw><V>M</V>(<V>r</V>/<V>R</V>)³</Nw>. The probe is on its surface, and from there the ball
              pulls as if all its mass were at its centre.
            </li>
            <li>
              So <Nw><V>g</V> = <V>G</V> × <V>M</V>(<V>r</V>/<V>R</V>)³ / <V>r</V>²</Nw>{' '}
              <Nw>= <V>GMr</V>/<V>R</V>³</Nw>. The field strength is proportional to <V>r</V>, and is
              zero at the centre.
            </li>
          </ol>
        ) : (
          <ol className="steps">
            <li>
              The two cones have the same narrow angle. A patch twice as far away is twice as wide and
              twice as long: four times the area, so four times the mass. Area grows as the distance
              squared.
            </li>
            <li>
              Each kilogram twice as far away pulls a quarter as hard: the inverse-square law.
            </li>
            <li>
              Four times the mass × a quarter of the pull: the same pull. The two pulls point in opposite
              directions, so they cancel.
            </li>
            <li>
              Off the line to the centre, both patches are slanted to the cone. A straight line meets a
              sphere at the same angle at both ends, so the slant enlarges both patches by the same
              factor, and they still cancel.
            </li>
          </ol>
        )}
      </Section>

      <KeyIdeas>
        <li>
          Inside a uniform hollow shell the field is zero everywhere, not just at the centre. The
          shell&rsquo;s pulls cancel in pairs.
        </li>
        <li>
          Inside a uniform planet only the mass closer to the centre pulls:{' '}
          <Nw><V>g</V> = <V>GMr</V>/<V>R</V>³</Nw>, proportional to <V>r</V> and zero at the centre.
        </li>
        <li>
          Outside, both pull as if all their mass were at the centre: <Nw><V>g</V> = <V>GM</V>/<V>r</V>²</Nw>.
        </li>
        <li>
          Inside the shell the potential is constant, <Nw><V>V</V> = −<V>GM</V>/<V>R</V></Nw>: no gradient,
          no field. Inside the solid planet it keeps falling, to <Nw>1.5 × (−<V>GM</V>/<V>R</V>)</Nw> at
          the centre. (You need the shape of the <V>g</V> graph, not this one.)
        </li>
      </KeyIdeas>

      <TryThis>
        <li>Move the probe close to the shell. Patch 1 shrinks and patch 2 grows. Does the net pull change?</li>
        <li>Put the cones off the line to the centre, then drag patch 1 around the shell. Why do the two patches always cancel?</li>
        <li>In the solid planet, choose a layer, then move the probe down through it. What happens to its pull as the probe passes it?</li>
        <li>Halve <V>r</V>. By what factor does the mass inside fall? And <V>g</V>?</li>
        <li>How far down is <V>g</V> half its value at the surface?</li>
        <li>
          Dig to the centre. Which way would you be pulled there? Compare <V>V</V> at the centre of the two
          planets: which is lower, and why?
          <InfoTip title="A tunnel through the Earth">
            Drop a ball down a straight tunnel through a uniform Earth. As <V>g</V> is proportional to
            <V> r</V>, it moves in simple harmonic motion, and it reaches the far side after about 42 minutes, whatever route the tunnel takes.
          </InfoTip>
        </li>
      </TryThis>
    </>
  );

  return <PageLayout page={page} stage={stage} legend={legend} legendPlace="bottom" below={below} panel={panel} notesWide />;
}

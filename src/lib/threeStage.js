import * as THREE from 'three';

/*
 * A three.js renderer that fills `host`, with a minimal orbit camera:
 * drag to orbit, wheel or pinch to zoom. Written here rather than pulled
 * from three/addons so the app has no dependency beyond three's core.
 *
 * Returns { scene, camera, renderer, view, onFrame, dispose }.
 *   view       live { theta, phi, radius, target } — change and it follows
 *   onFrame(f) registers f(dt, t), called before each render
 */
export function createStage(host, {
  background = 0x090d19,
  fov = 40,
  theta = 0.6, // around the vertical axis
  phi = 1.1, // down from the vertical
  radius = 10,
  minRadius = 2,
  maxRadius = 60,
  target = new THREE.Vector3(),
  minPhi = 0.15,
  maxPhi = Math.PI - 0.15,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(background, 1);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 500);

  const view = { theta, phi, radius, target: target.clone() };
  // A smoothed copy the camera actually uses, so programmatic moves glide.
  const shown = { theta, phi, radius, target: target.clone() };

  const place = () => {
    const sp = Math.sin(shown.phi);
    camera.position.set(
      shown.target.x + shown.radius * sp * Math.sin(shown.theta),
      shown.target.y + shown.radius * Math.cos(shown.phi),
      shown.target.z + shown.radius * sp * Math.cos(shown.theta),
    );
    camera.lookAt(shown.target);
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // --- pointer orbit / pinch zoom -----------------------------------------
  const pointers = new Map();
  let pinchStart = null;

  const onDown = (e) => {
    renderer.domElement.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), radius: view.radius };
    }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      view.theta -= dx * 0.008;
      view.phi = Math.min(maxPhi, Math.max(minPhi, view.phi - dy * 0.008));
    } else if (pinchStart && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.radius = clampRadius(pinchStart.radius * (pinchStart.d / Math.max(d, 1)));
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    view.radius = clampRadius(view.radius * Math.exp(e.deltaY * 0.0012));
  };
  const clampRadius = (r) => Math.min(maxRadius, Math.max(minRadius, r));

  const el = renderer.domElement;
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  // --- frame loop ---------------------------------------------------------
  const callbacks = new Set();
  let raf = 0;
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    // ease the shown camera towards the requested view
    const k = 1 - Math.exp(-dt * 10);
    shown.theta += (view.theta - shown.theta) * k;
    shown.phi += (view.phi - shown.phi) * k;
    shown.radius += (view.radius - shown.radius) * k;
    shown.target.lerp(view.target, k);
    place();
    callbacks.forEach((f) => f(dt, t / 1000));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  place();
  raf = requestAnimationFrame(frame);

  return {
    scene,
    camera,
    renderer,
    view,
    onFrame(f) {
      callbacks.add(f);
      return () => callbacks.delete(f);
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      });
      renderer.dispose();
      el.remove();
    },
  };
}

/** True if this browser can create a WebGL context. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

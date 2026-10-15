import { useEffect, useRef, useState } from 'react';
import { Nw } from '../components/Eq.jsx';
import { PAGES, SECTIONS, SPEC_MAP, pageByPath } from './registry.js';
import { hrefFor } from '../lib/router.js';
import { useCanvas } from '../lib/useCanvas.js';
import { contourSegments } from '../lib/contours.js';
import { COLORS, arrow, body, chevron, stars } from '../lib/draw.js';
import { prefersReducedMotion } from '../lib/physics.js';
import Glyph from '../components/Glyph.jsx';

/*
 * Landing page. The hero is the subject itself: a planet and its moon,
 * with equipotentials, field lines, and the pull on whatever the pointer
 * is holding. Below it, a contents list and the specification map.
 */

// Hero masses in arbitrary units (the moon is exaggerated so its own
// equipotentials show).
const EARTH_MASS = 1;
const MOON_MASS = 0.2;

// The field drawing (equipotentials and field lines) is costly, and the moon
// moves only a pixel or so per tenth of a second, so it is redrawn into a
// cached layer about ten times a second, and not at all while the page is
// being scrolled. Every frame just copies that layer and adds the pointer's
// arrow.
const REFRESH_MS = 100;
const SCROLL_QUIET_MS = 200;

function HeroField() {
  const probe = useRef(null); // the pointer, in window (client) coordinates
  const layer = useRef(null); // { canvas, w, h, dpr, t, bodies, field, unit }
  const scrolledAt = useRef(-Infinity);
  const [hint, setHint] = useState(true);
  const still = prefersReducedMotion();

  const { canvasRef } = useCanvas(
    (screen, w, h, t) => {
      const dpr = screen.canvas.width / w;
      let L = layer.current;
      const stale =
        !L || L.w !== w || L.h !== h || L.dpr !== dpr || (t - L.t > REFRESH_MS && t - scrolledAt.current > SCROLL_QUIET_MS);
      if (stale) {
        if (!L || L.w !== w || L.h !== h || L.dpr !== dpr) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          L = { canvas, w, h, dpr };
          layer.current = L;
        }
        const ctx = L.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        Object.assign(L, drawScene(ctx, w, h, t), { t });
      }
      screen.drawImage(L.canvas, 0, 0, w, h);
      drawProbe(screen, L);
    },
    [],
    { animate: true },
  );

  // the field and the bodies, drawn into the cached layer
  function drawScene(ctx, w, h, t) {
      const unit = Math.min(w, h * 1.6);
      const earth = { x: w * 0.64, y: h * 0.44, m: EARTH_MASS, r: unit * 0.045 };
      const orbit = unit * 0.3;
      const angle = still ? -0.5 : -0.5 + (t / 1000) * 0.045;
      const moon = {
        x: earth.x + Math.cos(angle) * orbit,
        y: earth.y + Math.sin(angle) * orbit * 0.62,
        m: MOON_MASS,
        r: unit * 0.017,
      };
      const bodies = [earth, moon];

      ctx.fillStyle = COLORS.deep;
      ctx.fillRect(0, 0, w, h);
      stars(ctx, w, h, Math.round((w * h) / 9000));

      // potential on a coarse grid: V = −Σ m / d (display units)
      const step = 7;
      const nx = Math.ceil(w / step) + 1;
      const ny = Math.ceil(h / step) + 1;
      const values = new Float32Array(nx * ny);
      // No samples are skipped near the bodies: skipping whole grid cells cut
      // square notches out of the innermost rings. The bodies are drawn on top
      // and hide whatever lies inside them.
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = i * step;
          const y = j * step;
          let v = 0;
          for (const b of bodies) {
            const d = Math.hypot(x - b.x, y - b.y);
            v -= (b.m * unit) / Math.max(d, 1);
          }
          values[j * nx + i] = v;
        }
      }

      // equal steps of potential, so rings crowd where the field is strong
      const dV = 1.05;
      const levels = [];
      for (let k = 1; k <= 22; k++) levels.push(-dV * k);
      const segs = contourSegments(values, nx, ny, levels);
      ctx.lineWidth = 1;
      segs.forEach((list, k) => {
        ctx.strokeStyle = `rgba(158,214,140,${0.55 - k * 0.012})`;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of list) {
          ctx.moveTo(x1 * step, y1 * step);
          ctx.lineTo(x2 * step, y2 * step);
        }
        ctx.stroke();
      });

      // field lines: traced outward from each body, drawn pointing inward
      const field = (x, y) => {
        let gx = 0;
        let gy = 0;
        for (const b of bodies) {
          const dx = b.x - x;
          const dy = b.y - y;
          const d2 = Math.max(dx * dx + dy * dy, 1);
          const d = Math.sqrt(d2);
          gx += (b.m * dx) / (d2 * d);
          gy += (b.m * dy) / (d2 * d);
        }
        return [gx, gy];
      };

      ctx.strokeStyle = 'rgba(124,198,242,0.5)';
      ctx.lineWidth = 1.1;
      for (const b of bodies) {
        const count = Math.round(26 * b.m);
        for (let n = 0; n < count; n++) {
          const a = (n / count) * Math.PI * 2 + 0.13;
          let x = b.x + Math.cos(a) * b.r * 1.1;
          let y = b.y + Math.sin(a) * b.r * 1.1;
          const pts = [[x, y]];
          for (let s = 0; s < 500; s++) {
            const [gx, gy] = field(x, y);
            const g = Math.hypot(gx, gy);
            if (g < 1e-12) break;
            x -= (gx / g) * 4;
            y -= (gy / g) * 4;
            if (x < -20 || y < -20 || x > w + 20 || y > h + 20) break;
            const other = bodies.find((o) => o !== b && Math.hypot(x - o.x, y - o.y) < o.r);
            if (other) break;
            pts.push([x, y]);
          }
          if (pts.length < 3) continue;
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
          // one arrowhead per line, pointing along the field (inward)
          const k = Math.min(pts.length - 2, 22 + (n % 3) * 9);
          const [ax, ay] = pts[k];
          const [bx, by] = pts[k - 1];
          const len = Math.hypot(bx - ax, by - ay) || 1;
          chevron(ctx, ax, ay, (bx - ax) / len, (by - ay) / len, 7, 'rgba(124,198,242,0.8)');
        }
      }

      // keep the title corner calm
      const vg = ctx.createRadialGradient(0, h, 0, 0, h, Math.max(w, h) * 0.7);
      vg.addColorStop(0, 'rgba(9,13,25,0.92)');
      vg.addColorStop(0.55, 'rgba(9,13,25,0.55)');
      vg.addColorStop(1, 'rgba(9,13,25,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      body(ctx, earth.x, earth.y, earth.r, 'earth');
      body(ctx, moon.x, moon.y, moon.r, 'moon');

      return { bodies, field, unit };
  }

  // the pull on a test mass at the pointer, drawn fresh every frame
  function drawProbe(ctx, { bodies, field, unit }) {
      const c = probe.current;
      const rect = ctx.canvas.getBoundingClientRect();
      const p = c && [c[0] - rect.left, c[1] - rect.top];
      if (p && !bodies.some((b) => Math.hypot(p[0] - b.x, p[1] - b.y) < b.r + 6)) {
        const [gx, gy] = field(p[0], p[1]);
        const g = Math.hypot(gx, gy);
        const len = Math.min(110, 18 + Math.log10(1 + g * unit * unit * 0.08) * 46);
        arrow(ctx, p[0], p[1], p[0] + (gx / g) * len, p[1] + (gy / g) * len, COLORS.coral, {
          width: 2.4,
          head: 11,
        });
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.text;
        ctx.fill();
      }
  }

  useEffect(() => {
    const onScroll = () => {
      scrolledAt.current = performance.now();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const move = (e) => {
    probe.current = [e.clientX, e.clientY];
    if (hint) setHint(false);
  };

  return (
    <div
      className="hero-canvas"
      onPointerMove={move}
      onPointerDown={move}
      onPointerLeave={() => {
        probe.current = null;
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {hint && <p className="hero-probe">Move the pointer to feel the pull on a test mass</p>}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <section className="hero" aria-label="A planet and its moon, with their gravitational field">
        <HeroField />
        <div className="hero-text">
          <h1>Gravitational fields</h1>
          <p>
            Twelve interactive pages for AQA A-level Physics 3.7.2, from Newton&rsquo;s law to
            orbits, and the experiments that weighed the Earth.
          </p>
        </div>
      </section>

      <div className="home">
        <p className="home-intro">
          Each page shows one idea from the chapter, with controls to change it, the equations
          behind it, and a few things to try. Use them in order as a course, or open one alongside
          a lesson.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.id} className="toc-section" aria-labelledby={`toc-${section.id}`}>
            <div className="toc-section-head">
              <p className="toc-spec">{section.spec}</p>
              <h2 id={`toc-${section.id}`}>{section.title}</h2>
              <p>{section.blurb}</p>
            </div>
            <ul className="toc-list">
              {PAGES.filter((p) => p.section === section.id).map((p) => (
                <li key={p.path} className="toc-item">
                  <a href={hrefFor(p.path)}>
                    <Glyph name={p.glyph} />
                    <span>
                      <span className="toc-title">{p.title}</span>
                      <span className="toc-summary">{p.summary}</span>
                    </span>
                    <span className="toc-ref">{p.spec}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="spec-map" aria-labelledby="spec-map-title">
          <h2 id="spec-map-title">Specification map</h2>
          <p>Where each statement in AQA 7408 section 3.7.2 is shown.</p>
          <table className="spec-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Statement</th>
                <th scope="col">Pages</th>
              </tr>
            </thead>
            <tbody>
              {SPEC_MAP.map((row) => (
                <tr key={row.text}>
                  <td>{row.spec}</td>
                  <td>{row.text}</td>
                  <td>
                    {row.pages.map((path) => (
                      <a key={path} href={hrefFor(path)}>
                        {pageByPath(path)?.short}
                      </a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="home-foot">
          Values use <Nw>G = 6.674 × 10⁻¹¹ N m² kg⁻²</Nw>. Diagrams are not to scale unless they say so.
        </p>
      </div>
    </>
  );
}

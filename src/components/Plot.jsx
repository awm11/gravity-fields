import { useEffect, useRef, useState } from 'react';

/*
 * A small SVG graph. The children function receives scale helpers and
 * returns the marks to draw:
 *
 *   <Plot x={[0, 10]} y={[-5, 0]} xLabel="r / R" yLabel="V">
 *     {({ sx, sy }) => <path d={fnPath(f, 0, 10, sx, sy)} />}
 *   </Plot>
 *
 * onPointer(xValue, yValue, phase) reports drags across the plot area.
 */
export function Plot({
  x: [x0, x1],
  y: [y0, y1],
  height = 220,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  xFormat = (v) => String(v),
  yFormat = (v) => String(v),
  pad = {},
  onPointer,
  ariaLabel,
  children,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    const observer = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const p = { l: 58, r: 14, t: yLabel ? 30 : 14, b: 40, ...pad };
  const w = Math.max(width, 10);
  const h = height;
  const iw = Math.max(1, w - p.l - p.r);
  const ih = Math.max(1, h - p.t - p.b);

  const sx = (v) => p.l + ((v - x0) / (x1 - x0)) * iw;
  const sy = (v) => p.t + ((y1 - v) / (y1 - y0)) * ih;
  const ix = (px) => x0 + ((px - p.l) / iw) * (x1 - x0);
  const iy = (py) => y1 - ((py - p.t) / ih) * (y1 - y0);

  const xt = xTicks ?? niceTicks(x0, x1, Math.max(3, Math.round(iw / 80)));
  const yt = yTicks ?? niceTicks(y0, y1, Math.max(3, Math.round(ih / 45)));

  // The x axis line sits at y = 0 when zero is in range.
  const axisY = y0 <= 0 && y1 >= 0 ? sy(0) : sy(y0);
  const axisX = x0 <= 0 && x1 >= 0 ? sx(0) : sx(x0);

  const report = (e, phase) => {
    if (!onPointer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    onPointer(ix(px), iy(py), phase);
  };

  const clipId = useRef(`plot-clip-${Math.random().toString(36).slice(2)}`).current;

  return (
    <div className="plot" ref={wrapRef}>
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={ariaLabel}
        style={{ touchAction: onPointer ? 'none' : 'auto', cursor: onPointer ? 'crosshair' : 'default' }}
        onPointerDown={(e) => {
          if (!onPointer) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          report(e, 'down');
        }}
        onPointerMove={(e) => dragging.current && report(e, 'move')}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          report(e, 'up');
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={p.l} y={p.t} width={iw} height={ih} />
          </clipPath>
        </defs>

        {yt.map((v) => (
          <g key={`y${v}`}>
            <line className="plot-grid" x1={p.l} x2={p.l + iw} y1={sy(v)} y2={sy(v)} />
            <text className="plot-tick" x={p.l - 7} y={sy(v)} textAnchor="end" dominantBaseline="middle">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line className="plot-grid" x1={sx(v)} x2={sx(v)} y1={p.t} y2={p.t + ih} />
            <text className="plot-tick" x={sx(v)} y={p.t + ih + 15} textAnchor="middle">
              {xFormat(v)}
            </text>
          </g>
        ))}

        <line className="plot-axis" x1={p.l} x2={p.l + iw} y1={axisY} y2={axisY} />
        <line className="plot-axis" x1={axisX} x2={axisX} y1={p.t} y2={p.t + ih} />

        <g clipPath={`url(#${clipId})`}>
          {children?.({ sx, sy, ix, iy, w, h, p, iw, ih })}
        </g>

        {xLabel && (
          <text className="plot-label" x={p.l + iw} y={h - 6} textAnchor="end">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text className="plot-label" x={Math.max(4, p.l - 40)} y={p.t - 12} textAnchor="start">
            {yLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

/** Path of y = f(x) sampled across [a, b], broken where f is not finite. */
export function fnPath(f, a, b, sx, sy, n = 220) {
  let d = '';
  let pen = false;
  for (let k = 0; k <= n; k++) {
    const x = a + ((b - a) * k) / n;
    const y = f(x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    const py = Math.max(-1e4, Math.min(1e4, sy(y)));
    d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${py.toFixed(2)}`;
    pen = true;
  }
  return d;
}

/** Closed area under y = f(x) between a and b, down to y = base. */
export function areaPath(f, a, b, sx, sy, base = 0, n = 120) {
  let d = `M${sx(a)},${sy(base)}`;
  for (let k = 0; k <= n; k++) {
    const x = a + ((b - a) * k) / n;
    d += `L${sx(x).toFixed(2)},${sy(f(x)).toFixed(2)}`;
  }
  d += `L${sx(b)},${sy(base)}Z`;
  return d;
}

/** Round tick values spanning [a, b]. */
export function niceTicks(a, b, count = 5) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

// Shared canvas drawing: bodies, arrows and labels look the same everywhere.

export const COLORS = {
  ink: '#0e1424',
  deep: '#090d19',
  rule: '#26324d',
  ruleSoft: '#1b253b',
  text: '#e8ecf5',
  text2: '#aeb8cb',
  text3: '#7a869d',
  brass: '#e3b25b',
  sky: '#7cc6f2',
  sage: '#9ed68c',
  coral: '#f2735e',
  ke: '#5fd3b0',
  pe: '#8c9bff',
};

export const SERIF = "'Newsreader', 'Iowan Old Style', Georgia, serif";
export const SANS = "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif";

/** An arrow from (x1, y1) to (x2, y2) with a filled isosceles head. */
export function arrow(ctx, x1, y1, x2, y2, color, { width = 2, head = 9 } = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const h = Math.min(head, len * 0.6);
  const shaft = len - h * 0.85;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * shaft, y1 + uy * shaft);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * h - uy * h * 0.5, y2 - uy * h + ux * h * 0.5);
  ctx.lineTo(x2 - ux * h + uy * h * 0.5, y2 - uy * h - ux * h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A small filled arrowhead centred on (x, y) pointing along (ux, uy). */
export function chevron(ctx, x, y, ux, uy, size, color) {
  const half = size * 0.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + ux * size * 0.6, y + uy * size * 0.6);
  ctx.lineTo(x - ux * size * 0.5 - uy * half, y - uy * size * 0.5 + ux * half);
  ctx.lineTo(x - ux * size * 0.5 + uy * half, y - uy * size * 0.5 - ux * half);
  ctx.closePath();
  ctx.fill();
}

const BODY_STYLES = {
  earth: { inner: '#7fc1e8', mid: '#2f6f9e', outer: '#143552', rim: 'rgba(124,198,242,0.55)' },
  moon: { inner: '#e6e2d8', mid: '#9b978e', outer: '#55524c', rim: 'rgba(230,226,216,0.35)' },
  mars: { inner: '#f3b98f', mid: '#c0643d', outer: '#5c2715', rim: 'rgba(243,185,143,0.4)' },
  mass: { inner: '#ffe2a3', mid: '#e3b25b', outer: '#8a6223', rim: 'rgba(227,178,91,0.5)' },
  lead: { inner: '#c9ced8', mid: '#7d8594', outer: '#3d434f', rim: 'rgba(201,206,216,0.35)' },
  sat: { inner: '#ffffff', mid: '#cfd8e6', outer: '#7a869d', rim: 'rgba(255,255,255,0.4)' },
};

/** A shaded sphere. kind: earth | moon | mars | mass | lead | sat */
export function body(ctx, x, y, r, kind = 'mass') {
  const s = BODY_STYLES[kind] ?? BODY_STYLES.mass;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, s.inner);
  g.addColorStop(0.55, s.mid);
  g.addColorStop(1, s.outer);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = s.rim;
  ctx.stroke();
  ctx.restore();
}

/** Text with a dark halo so it stays legible over lines. */
export function label(ctx, text, x, y, {
  color = COLORS.text2,
  size = 13,
  align = 'left',
  baseline = 'middle',
  font = SANS,
  italic = false,
  weight = 400,
} = {}) {
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(9,13,25,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Faint star field, seeded so it doesn't flicker between frames. */
export function stars(ctx, w, h, count = 120, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rand() * 0.9 + 0.2;
    ctx.globalAlpha = 0.15 + rand() * 0.45;
    ctx.fillStyle = '#dfe7f5';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dashed line helper. */
export function dashed(ctx, x1, y1, x2, y2, color, dash = [5, 5], width = 1) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/*
 * Marching squares: contour segments of a scalar field sampled on a grid.
 *
 *   values  Float32Array of nx × ny samples, row-major
 *   levels  the values to contour
 *   skip    optional Uint8Array marking samples to ignore (e.g. inside a body)
 *
 * Returns, per level, an array of segments [x1, y1, x2, y2] in grid units.
 */
export function contourSegments(values, nx, ny, levels, skip) {
  const out = levels.map(() => []);

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const i0 = j * nx + i;
      const i1 = i0 + 1;
      const i3 = i0 + nx;
      const i2 = i3 + 1;
      if (skip && (skip[i0] | skip[i1] | skip[i2] | skip[i3])) continue;

      const v0 = values[i0];
      const v1 = values[i1];
      const v2 = values[i2];
      const v3 = values[i3];
      const lo = Math.min(v0, v1, v2, v3);
      const hi = Math.max(v0, v1, v2, v3);

      for (let k = 0; k < levels.length; k++) {
        const L = levels[k];
        if (L <= lo || L > hi) continue;

        const a0 = v0 > L;
        const a1 = v1 > L;
        const a2 = v2 > L;
        const a3 = v3 > L;
        const pts = [];
        if (a0 !== a1) pts.push(i + (L - v0) / (v1 - v0), j);
        if (a1 !== a2) pts.push(i + 1, j + (L - v1) / (v2 - v1));
        if (a3 !== a2) pts.push(i + (L - v3) / (v2 - v3), j + 1);
        if (a0 !== a3) pts.push(i, j + (L - v0) / (v3 - v0));

        if (pts.length === 4) {
          out[k].push(pts);
        } else if (pts.length === 8) {
          // saddle: join the edges around the corners unlike the centre
          const c = (v0 + v1 + v2 + v3) / 4;
          if (c > L === a0) {
            out[k].push([pts[0], pts[1], pts[2], pts[3]]);
            out[k].push([pts[4], pts[5], pts[6], pts[7]]);
          } else {
            out[k].push([pts[0], pts[1], pts[6], pts[7]]);
            out[k].push([pts[2], pts[3], pts[4], pts[5]]);
          }
        }
      }
    }
  }

  return out;
}

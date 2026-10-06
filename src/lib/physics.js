// Constants and small helpers used across the pages. SI units throughout.

export const G = 6.674e-11; // N m² kg⁻²

export const EARTH = {
  M: 5.972e24, // kg
  R: 6.371e6, // m
  day: 86164, // sidereal day, s — what a geostationary orbit must match
};

export const MOON = {
  M: 7.342e22, // kg
  R: 1.737e6, // m
  distance: 3.844e8, // centre to centre from Earth, m
};

export const SECONDS_PER_DAY = 86400;

/** Field strength magnitude a distance r from the centre of a uniform sphere. */
export function gSphere(M, R, r) {
  if (r >= R) return (G * M) / (r * r);
  return (G * M * r) / (R * R * R); // inside: only the mass within r pulls
}

/** Potential a distance r from the centre of a uniform sphere (zero at infinity). */
export function vSphere(M, R, r) {
  if (r >= R) return (-G * M) / r;
  return (-G * M * (3 * R * R - r * r)) / (2 * R * R * R);
}

/** Speed of a circular orbit of radius r. */
export const orbitalSpeed = (M, r) => Math.sqrt((G * M) / r);

/** Period of a circular orbit of radius r. */
export const orbitalPeriod = (M, r) => 2 * Math.PI * Math.sqrt((r * r * r) / (G * M));

/** Radius of the circular orbit with period T. */
export const radiusForPeriod = (M, T) => Math.cbrt((G * M * T * T) / (4 * Math.PI * Math.PI));

export const escapeSpeed = (M, R) => Math.sqrt((2 * G * M) / R);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Prefers-reduced-motion, read once per call (cheap). */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

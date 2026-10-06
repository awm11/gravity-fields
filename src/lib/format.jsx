// Number formatting for readouts. Physics values span 10⁻¹¹ to 10²⁴, so
// anything outside a comfortable range is shown in standard form.

const SUPERSCRIPT = {
  '-': '⁻',
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
};

export const superscript = (n) =>
  String(n)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');

/** Plain-string standard form, e.g. "6.67 × 10⁻¹¹". */
export function sci(value, sig = 3) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 0.01 && abs < 10000) {
    return trim(value.toPrecision(sig));
  }
  const exp = Math.floor(Math.log10(abs));
  let mant = value / 10 ** exp;
  // toPrecision can round 9.996 up to 10.0
  let mantStr = trim(mant.toPrecision(sig));
  if (Math.abs(Number(mantStr)) >= 10) {
    mant /= 10;
    mantStr = trim(mant.toPrecision(sig));
    return `${mantStr} × 10${superscript(exp + 1)}`;
  }
  return `${mantStr} × 10${superscript(exp)}`;
}

/** Fixed decimals, with a proper minus sign. */
export function fixed(value, dp = 2) {
  if (!Number.isFinite(value)) return '—';
  return minus(value.toFixed(dp));
}

/** Significant figures without standard form (for mid-range values). */
export function sig(value, s = 3) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs < 1e-4 || abs >= 1e9) return sci(value, s);
  return minus(trim(Number(value.toPrecision(s)).toString()));
}

/** Thousands-separated integer-ish values, e.g. 42 164 km. */
export function grouped(value, dp = 0) {
  if (!Number.isFinite(value)) return '—';
  // thin spaces between groups of three, as in printed science
  return minus(
    value
      .toLocaleString('en-GB', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      })
      .replace(/,/g, '\u202f'),
  );
}

/** Durations: seconds → "92.6 min", "23.9 h", "27.3 days". */
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 120) return `${sig(seconds, 3)} s`;
  if (seconds < 7200) return `${sig(seconds / 60, 3)} min`;
  if (seconds < 3 * 86400) return `${sig(seconds / 3600, 3)} h`;
  if (seconds < 2 * 365.25 * 86400) return `${sig(seconds / 86400, 3)} days`;
  return `${sig(seconds / (365.25 * 86400), 3)} years`;
}

function trim(str) {
  // drop trailing zeros after a decimal point, keep a proper minus sign
  let s = str;
  if (s.includes('e')) {
    const n = Number(s);
    s = n.toString();
  }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return minus(s);
}

const minus = (s) => s.replace(/^-/, '−');

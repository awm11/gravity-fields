/*
 * Small line drawings for the contents list, one per page. Each shows the
 * page's central picture in miniature, using the app's quantity colours.
 */

const S = {
  brass: 'var(--brass)',
  sky: 'var(--sky)',
  sage: 'var(--sage)',
  coral: 'var(--coral)',
  text: 'var(--text-3)',
  ke: 'var(--ke)',
  pe: 'var(--pe)',
};

const Head = ({ x, y, dir = 'r', color }) => {
  const d = {
    r: `M${x} ${y}l-6 -3.5v7z`,
    l: `M${x} ${y}l6 -3.5v7z`,
    d: `M${x} ${y}l-3.5 -6h7z`,
    u: `M${x} ${y}l-3.5 6h7z`,
  }[dir];
  return <path d={d} fill={color} />;
};

const DRAWINGS = {
  newton: (
    <>
      <circle cx="20" cy="32" r="10" fill={S.brass} />
      <circle cx="47" cy="32" r="6" fill={S.brass} opacity="0.8" />
      <path d="M30 32h7M41 32h-5" stroke={S.coral} strokeWidth="2" />
      <Head x={37} y={32} dir="r" color={S.coral} />
      <Head x={30} y={32} dir="l" color={S.coral} />
    </>
  ),
  lines: (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={32 + Math.cos(a) * 11}
            y1={32 + Math.sin(a) * 11}
            x2={32 + Math.cos(a) * 28}
            y2={32 + Math.sin(a) * 28}
            stroke={S.sky}
            strokeWidth="1.4"
          />
        );
      })}
      <circle cx="32" cy="32" r="9" fill={S.brass} />
      <rect x="43" y="22" width="12" height="12" fill="none" stroke={S.coral} strokeWidth="1.6" />
    </>
  ),
  equipotentials: (
    <>
      {[12, 18, 26].map((r, i) => (
        <circle key={r} cx="32" cy="32" r={r} fill="none" stroke={S.sage} strokeWidth="1.5" opacity={1 - i * 0.22} />
      ))}
      <circle cx="32" cy="32" r="7" fill={S.brass} />
      <path d="M50 14a26 26 0 0 1 7 10" fill="none" stroke={S.coral} strokeWidth="2" strokeDasharray="3 3" />
    </>
  ),
  well: (
    <>
      {[16, 24, 32, 40, 48].map((x) => (
        <line key={x} x1={x} y1="14" x2={x} y2="44" stroke={S.text} strokeWidth="0.8" opacity="0.4" />
      ))}
      <path d="M6 18C20 18 24 20 27 34c2 9 8 9 10 0 3-14 7-16 21-16" fill="none" stroke={S.sage} strokeWidth="2" />
      <circle cx="32" cy="44" r="4" fill={S.brass} />
      <path d="M8 18h48" stroke={S.text} strokeWidth="0.8" strokeDasharray="2 3" />
    </>
  ),
  gradient: (
    <>
      <path d="M8 54V8M8 54h50" stroke={S.text} strokeWidth="1" />
      <path d="M12 52C16 30 26 20 56 14" fill="none" stroke={S.sage} strokeWidth="2" />
      <path d="M10 46L44 12" stroke={S.coral} strokeWidth="1.6" />
      <circle cx="21" cy="35" r="2.6" fill={S.coral} />
    </>
  ),
  twobody: (
    <>
      <circle cx="16" cy="32" r="10" fill="#2f6f9e" stroke={S.sky} strokeWidth="1" />
      <circle cx="54" cy="32" r="4.5" fill="#9b978e" />
      <path d="M8 46C20 50 30 22 44 36s10 4 14 2" fill="none" stroke={S.sage} strokeWidth="1.6" />
      <circle cx="45" cy="32" r="2.2" fill={S.coral} />
    </>
  ),
  infinity: (
    <>
      <circle cx="14" cy="38" r="9" fill="#2f6f9e" stroke={S.sky} strokeWidth="1" />
      <path d="M44 22c-3-5-10-5-10 0s7 5 10 0 10-5 10 0-7 5-10 0z" fill="none" stroke={S.text} strokeWidth="1.6" />
      <path d="M44 38H27" stroke={S.coral} strokeWidth="1.8" />
      <Head x={26} y={38} dir="l" color={S.coral} />
    </>
  ),
  orbits: (
    <>
      <circle cx="32" cy="32" r="22" fill="none" stroke={S.text} strokeWidth="1" strokeDasharray="2 3" />
      <circle cx="32" cy="32" r="13" fill="none" stroke={S.text} strokeWidth="1" opacity="0.6" />
      <circle cx="32" cy="32" r="7" fill="#2f6f9e" stroke={S.sky} strokeWidth="1" />
      <circle cx="54" cy="32" r="2.8" fill={S.brass} />
      <circle cx="41" cy="23" r="2.2" fill={S.brass} />
    </>
  ),
  energy: (
    <>
      <path d="M8 32h50" stroke={S.text} strokeWidth="1" />
      <rect x="14" y="16" width="9" height="16" fill={S.ke} />
      <rect x="28" y="32" width="9" height="22" fill={S.pe} />
      <rect x="42" y="32" width="9" height="11" fill={S.brass} />
    </>
  ),
  cavendish: (
    <>
      <path d="M32 6v24" stroke={S.text} strokeWidth="1" />
      <path d="M14 34L50 30" stroke={S.text} strokeWidth="1.6" />
      <circle cx="14" cy="34" r="3.5" fill="#c9ced8" />
      <circle cx="50" cy="30" r="3.5" fill="#c9ced8" />
      <circle cx="14" cy="48" r="8" fill="#7d8594" />
      <circle cx="50" cy="16" r="8" fill="#7d8594" />
    </>
  ),
  mountain: (
    <>
      <path d="M4 52L30 18l8 9 22 25z" fill="rgba(158,214,140,0.12)" stroke={S.sage} strokeWidth="1.4" />
      <path d="M14 14l3 28M50 14l-3 28" stroke={S.text} strokeWidth="1.2" />
      <circle cx="17" cy="43" r="2.2" fill={S.brass} />
      <circle cx="47" cy="43" r="2.2" fill={S.brass} />
    </>
  ),
};

export default function Glyph({ name }) {
  return (
    <svg className="toc-glyph" viewBox="0 0 64 64" aria-hidden="true">
      {DRAWINGS[name]}
    </svg>
  );
}

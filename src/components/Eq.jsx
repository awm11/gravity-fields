/*
 * Light equation typesetting, in the style of a printed textbook: symbols
 * for quantities in italic serif, numbers and operators upright.
 *
 *   <Eq>g = <Frac n={<><V>G</V><V>M</V></>} d={<><V>r</V><sup>2</sup></>} /></Eq>
 */

export const V = ({ children }) => <i className="q">{children}</i>;

/** Keeps an equation (or a number with its unit) together on one line. */
export const Nw = ({ children }) => <span className="nw">{children}</span>;

/**
 * A longer equation made of <Nw> pieces: it moves to a new line as a whole
 * when that lets it fit, and only splits between pieces on narrow screens.
 */
export const EqLine = ({ children }) => <span className="eq-line">{children}</span>;

export const Frac = ({ n, d }) => (
  <span className="frac">
    <span className="frac-n">{n}</span>
    <span className="frac-d">{d}</span>
  </span>
);

/**
 * A square root whose sign stretches to the height of its contents, with a
 * bar over everything inside, so it is clear what is under the root.
 */
export const Sqrt = ({ children }) => (
  <span className="sqrt">
    <svg className="sqrt-sign" viewBox="0 0 10 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0.5 14 L3 12.5 L6 23 L9.6 0.5 L10 0.5" fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
    <span className="sqrt-body">{children}</span>
  </span>
);

export const Eq = ({ children, block = false }) =>
  block ? <div className="eq eq-block">{children}</div> : <span className="eq">{children}</span>;

/** Common quantities, so every page spells them the same way. */
export const Q = {
  F: <V>F</V>,
  G: <V>G</V>,
  M: <V>M</V>,
  m: <V>m</V>,
  r: <V>r</V>,
  g: <V>g</V>,
  Vp: <V>V</V>,
  W: <V>W</V>,
  T: <V>T</V>,
  v: <V>v</V>,
  E: <V>E</V>,
};

/** Units with proper superscripts. */
export const unit = {
  Nkg: 'N kg⁻¹',
  Jkg: 'J kg⁻¹',
  MJkg: 'MJ kg⁻¹',
  N: 'N',
  J: 'J',
  m: 'm',
  km: 'km',
  ms: 'm s⁻¹',
  kms: 'km s⁻¹',
};

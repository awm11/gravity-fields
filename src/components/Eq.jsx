/*
 * Light equation typesetting, in the style of a printed textbook: symbols
 * for quantities in italic serif, numbers and operators upright.
 *
 *   <Eq>g = <Frac n={<><V>G</V><V>M</V></>} d={<><V>r</V><sup>2</sup></>} /></Eq>
 */

export const V = ({ children }) => <i className="q">{children}</i>;

export const Frac = ({ n, d }) => (
  <span className="frac">
    <span className="frac-n">{n}</span>
    <span className="frac-d">{d}</span>
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
  Nkg: 'N kg⁻¹',
  Jkg: 'J kg⁻¹',
  MJkg: 'MJ kg⁻¹',
  N: 'N',
  J: 'J',
  m: 'm',
  km: 'km',
  ms: 'm s⁻¹',
  kms: 'km s⁻¹',
};

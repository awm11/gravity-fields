import { useId } from 'react';

/*
 * Small, consistent controls. Every page uses the same few, so a student
 * learns them once.
 */

export function Slider({
  label,
  value,
  min,
  max,
  step = 'any',
  onChange,
  display,
  marks = [],
  disabled = false,
  hint,
}) {
  const id = useId();
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));

  return (
    <div className={`slider${disabled ? ' is-disabled' : ''}`}>
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <div className="slider-track-wrap">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--fill': fraction }}
        />
        {marks.map((m) => (
          <span
            key={m.label}
            className="slider-mark"
            style={{ left: `calc(8px + (100% - 16px) * ${(m.value - min) / (max - min)})` }}
            title={m.label}
          >
            <span>{m.label}</span>
          </span>
        ))}
      </div>
      {hint && <p className="slider-hint">{hint}</p>}
    </div>
  );
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'is-on' : ''}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, primary, disabled, title }) {
  return (
    <button
      type="button"
      className={`btn${primary ? ' btn-primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Switch({ label, checked, onChange }) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/** A labelled value with its unit, e.g. g = 9.81 N kg⁻¹. */
export function Readout({ label, value, unit, tone, wide }) {
  return (
    <div className={`readout${wide ? ' is-wide' : ''}`} style={tone ? { '--tone': tone } : undefined}>
      <span className="readout-label">{label}</span>
      <span className="readout-value">
        {value}
        {unit && <span className="readout-unit"> {unit}</span>}
      </span>
    </div>
  );
}

export function Readouts({ children }) {
  return <div className="readouts">{children}</div>;
}

/** A titled block in the side panel. */
export function Section({ title, children }) {
  return (
    <section className="panel-section">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Controls({ children }) {
  return <div className="controls">{children}</div>;
}

/** Short statements of the physics on the page. */
export function KeyIdeas({ children }) {
  return (
    <Section title="Key ideas">
      <ul className="key-ideas">{children}</ul>
    </Section>
  );
}

/** Things to try with the simulation, phrased as questions. */
export function TryThis({ children }) {
  return (
    <Section title="Try this">
      <ul className="try-this">{children}</ul>
    </Section>
  );
}

/** Small legend chips shown over a stage. */
export function Legend({ items }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={`legend-swatch legend-${item.kind || 'line'}`}
            style={{ '--swatch': item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

import { useEffect, useRef, useState } from 'react';
import { PAGES, SECTIONS } from '../pages/registry.js';
import { hrefFor } from '../lib/router.js';

/** Brand mark: a mass with two equipotentials and four field lines. */
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="23" fill="none" stroke="var(--sage)" strokeWidth="2" opacity="0.5" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="var(--sage)" strokeWidth="2" opacity="0.85" />
      <circle cx="32" cy="32" r="8" fill="var(--brass)" />
      <path
        d="M32 2v10M32 52v10M2 32h10M52 32h10"
        stroke="var(--sky)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ContentsMenu({ currentPath }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [currentPath]);

  return (
    <div className="contents" ref={wrapRef}>
      <button
        type="button"
        className="contents-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Contents
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4.5l4 3.5 4-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {open && (
        <nav className="contents-panel" aria-label="All pages">
          {SECTIONS.map((s) => (
            <div key={s.id} className="contents-group">
              <p className="contents-group-title">
                {s.title} <span>{s.spec}</span>
              </p>
              <ul>
                {PAGES.filter((p) => p.section === s.id).map((p) => (
                  <li key={p.path}>
                    <a
                      href={hrefFor(p.path)}
                      aria-current={p.path === currentPath ? 'page' : undefined}
                    >
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

export function TopBar({ currentPath }) {
  const index = PAGES.findIndex((p) => p.path === currentPath);
  const prev = index > 0 ? PAGES[index - 1] : null;
  const next = index >= 0 && index < PAGES.length - 1 ? PAGES[index + 1] : null;

  return (
    <header className="topbar">
      <a className="brand" href={hrefFor('/')}>
        <Mark />
        <span>Gravitational fields</span>
      </a>

      <div className="topbar-nav">
        <ContentsMenu currentPath={currentPath} />
        {index >= 0 && (
          <div className="stepper" aria-label="Page order">
            <a
              className={`step${prev ? '' : ' is-disabled'}`}
              href={prev ? hrefFor(prev.path) : undefined}
              aria-label={prev ? `Previous: ${prev.title}` : 'No previous page'}
              title={prev?.title}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </a>
            <span className="step-count">
              {index + 1} / {PAGES.length}
            </span>
            <a
              className={`step${next ? '' : ' is-disabled'}`}
              href={next ? hrefFor(next.path) : undefined}
              aria-label={next ? `Next: ${next.title}` : 'No next page'}
              title={next?.title}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

/*
 * The frame every simulation page uses: a header, the stage (with any
 * graphs beneath it) and a side panel of controls and explanation.
 *
 * A legend for the stage sits over it on larger screens (at its top-right
 * or bottom-right corner) and just below it on phones, where there is no
 * room to spare over the drawing.
 */
export function PageLayout({ page, stage, legend, legendPlace = 'bottom', below, panel, stageClass = '' }) {
  const index = PAGES.findIndex((p) => p.path === page.path);
  const prev = index > 0 ? PAGES[index - 1] : null;
  const next = index < PAGES.length - 1 ? PAGES[index + 1] : null;

  return (
    <article className="page">
      <header className="page-head">
        <p className="page-spec">
          <span>{page.spec}</span> {page.specTitle}
        </p>
        <h1>{page.title}</h1>
        <p className="page-summary">{page.summary}</p>
      </header>

      <div className="page-body">
        <div className="page-main">
          <div className={`stage ${stageClass}`}>
            {stage}
            {legend && <div className={`stage-legend is-${legendPlace}`}>{legend}</div>}
          </div>
          {legend && (
            <div className="stage-legend-below">{legend}</div>
          )}
          {below}
        </div>
        <aside className="panel">{panel}</aside>
      </div>

      <nav className="page-foot" aria-label="Continue">
        {prev ? (
          <a className="foot-link" href={hrefFor(prev.path)}>
            <span>Previous</span>
            {prev.title}
          </a>
        ) : (
          <a className="foot-link" href={hrefFor('/')}>
            <span>Back to</span>
            Contents
          </a>
        )}
        {next ? (
          <a className="foot-link is-next" href={hrefFor(next.path)}>
            <span>Next</span>
            {next.title}
          </a>
        ) : (
          <a className="foot-link is-next" href={hrefFor('/')}>
            <span>Finished</span>
            Back to contents
          </a>
        )}
      </nav>
    </article>
  );
}

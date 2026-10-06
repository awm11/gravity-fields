import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react';
import { KeyIdeas, TryThis } from './ui.jsx';
import { PAGES, SECTIONS } from '../pages/registry.js';
import { hrefFor } from '../lib/router.js';

const SITE_URL = 'https://awm11.github.io/';
const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.svg`;

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

  // Pointing at "Contents" (with a mouse) opens the menu; moving away closes
  // it after a short pause, so the pointer can travel down into it.
  const closeTimer = useRef(0);
  const onEnter = (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const onLeave = (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <div className="contents" ref={wrapRef} onPointerEnter={onEnter} onPointerLeave={onLeave}>
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

const HIDE_AFTER = 2000; // ms of stillness before the bar slides away
const REVEAL_ZONE = 72; // px from the top of the window that brings it back
const SHORT_SCREEN = 860; // px: only windows shorter than this hide the bar

/*
 * On shorter windows (under SHORT_SCREEN px tall), where every line of
 * height counts, the bar slides away once the page has been still for a couple of
 * seconds, and comes back when the reader scrolls up, moves the pointer to
 * the top of the window, or tabs into it. It stays while the pointer is
 * over it, while it has keyboard focus, and while the contents menu is open.
 */
function useAutoHide(ref, resetKey) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let timer = 0;
    let lastY = window.scrollY;
    let pointerY = Infinity; // last known pointer height in the window
    const pinned = () => {
      const el = ref.current;
      if (!el) return false;
      return (
        pointerY <= el.getBoundingClientRect().height ||
        Boolean(el.querySelector(':focus-visible')) ||
        Boolean(el.querySelector('[aria-expanded="true"]'))
      );
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.innerHeight >= SHORT_SCREEN) return; // tall window: always shown
        if (pinned()) arm();
        else setHidden(true);
      }, HIDE_AFTER);
    };
    const show = () => {
      setHidden(false);
      arm();
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (y < lastY - 2) show();
      else arm(); // still moving: restart the countdown
      lastY = y;
    };
    const onPointer = (e) => {
      pointerY = e.pointerType === 'mouse' ? e.clientY : Infinity;
      if (e.clientY <= REVEAL_ZONE) show();
    };
    const onFocus = (e) => {
      if (ref.current?.contains(e.target)) show();
    };

    const onResize = () => {
      if (window.innerHeight >= SHORT_SCREEN) setHidden(false);
      else arm();
    };

    show();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('focusin', onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [ref, resetKey]);

  return hidden;
}

export function TopBar({ currentPath }) {
  const index = PAGES.findIndex((p) => p.path === currentPath);
  const prev = index > 0 ? PAGES[index - 1] : null;
  const next = index >= 0 && index < PAGES.length - 1 ? PAGES[index + 1] : null;
  const barRef = useRef(null);
  const hidden = useAutoHide(barRef, currentPath);

  return (
    <header className={`topbar${hidden ? ' is-hidden' : ''}`} ref={barRef}>
      <div className="brand">
        {/* the site logo: links to the awm physics home page, and tips a
            little to the right when pointed at */}
        <a className="brand-mark" href={SITE_URL} title="awm physics" aria-label="awm physics home page">
          <img src={LOGO_SRC} alt="" width="34" height="34" />
        </a>
        <a className="brand-title" href={hrefFor('/')}>
          Gravitational fields
        </a>
      </div>

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
/*
 * Split the side panel's sections: controls and readouts stay at the side;
 * explanation (Key ideas, Try this, and any <Section below>) goes under the
 * stage, where there is more room. Fragments are looked inside.
 */
function splitPanel(panel) {
  const side = [];
  const notes = [];
  const walk = (node) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === Fragment) {
        walk(child.props.children);
      } else if (child.type === KeyIdeas || child.type === TryThis || child.props.below) {
        notes.push(child);
      } else {
        side.push(child);
      }
    });
  };
  walk(panel);
  return { side, notes };
}

/*
 * The side panel stays in view as the page scrolls when it fits in the
 * window. If it is only a little taller (up to 15%), it is shown in full and
 * scrolls with the page. Taller than that, it stays in view and gets a
 * scroll bar of its own.
 */
const PANEL_TOP = 72; // px: where the sticky panel sits below the top bar
function SidePanel({ children }) {
  const innerRef = useRef(null);
  const [mode, setMode] = useState('sticky'); // sticky | long | scroll

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return undefined;
    const check = () => {
      const room = window.innerHeight - PANEL_TOP - 12;
      const need = inner.getBoundingClientRect().height;
      setMode(need <= room ? 'sticky' : need <= room * 1.15 ? 'long' : 'scroll');
    };
    const observer = new ResizeObserver(check);
    observer.observe(inner);
    window.addEventListener('resize', check);
    check();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <aside className={`panel is-${mode}`}>
      <div className="panel-inner" ref={innerRef}>
        {children}
      </div>
    </aside>
  );
}

/** A large previous/next button with an arrow. */
export function FootLink({ href, kicker, title, next = false }) {
  return (
    <a className={`foot-link${next ? ' is-next' : ''}`} href={href}>
      <span className="foot-arrow" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16">
          <path d={next ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <span className="foot-text">
        <span className="foot-kicker">{kicker}</span>
        <span className="foot-title">{title}</span>
      </span>
    </a>
  );
}

export function PageLayout({ page, stage, legend, legendPlace = 'bottom', below, panel, stageClass = '', notesWide = false }) {
  const { side, notes } = splitPanel(panel);

  return (
    <article className="page">
      <header className="page-head">
        <p className="page-spec">
          <span>{page.spec}</span> {page.specTitle}
        </p>
        <h1>{page.title}</h1>
        <p className="page-summary">{page.summary}</p>
      </header>

      <div className={`page-body${notesWide ? ' has-wide-notes' : ''}`}>
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
        <SidePanel>{side}</SidePanel>
        {notes.length > 0 && <div className="page-notes">{notes}</div>}
      </div>

    </article>
  );
}

// Shared app modal: a centred dialog box over a dimmed backdrop, with a
// title + maximize + close header, Esc/F keys, backdrop-click-to-close, body
// scroll-lock, and focus management. One implementation for every tsmap modal
// that has header chrome — the chart expand modal, the wafer drilldown modal,
// and the user-guide modal were three near-identical hand-rolled copies of this
// before it existed.
//
// Stacking: the backdrop sits at --z-modal (see the scale in index.html :root),
// which clears wmap's map-toolbar overlay band (--wmap-z, default 6000) so a
// modal opened over a rendered wafer map is never shown through by the map's
// own toolbar. See WMAP_ISSUES.md #22/#23.
//
// "Maximize" is a CSS grow-to-viewport, NOT the real Fullscreen API: WKWebView
// (macOS Tauri) disables element fullscreen unless Apple private API is enabled.
// CSS maximize behaves identically on every target (see CLAUDE.md issue #17).

import { cssVar } from './theme';
import { ICONS } from './icons';
import { attachTooltip } from './tooltip';

export interface ModalHandle {
  /** The dialog box element (role="dialog"). */
  box: HTMLElement;
  /** The scrollable content region the caller fills via `mount`. */
  body: HTMLElement;
  /** Close the modal (also invoked by Esc / close button / backdrop click). */
  close: () => void;
}

export interface OpenModalOptions {
  title: string;
  /**
   * Fill the modal body. Runs after the box is in the DOM and focused, so
   * measurements (canvas sizing, wmap render) are valid. Return value is ignored;
   * use `onClose` for teardown.
   */
  mount: (body: HTMLElement) => void;
  /**
   * Teardown run on close, before the DOM is detached — e.g. destroy a wmap
   * controller or restore a reparented element. Always runs exactly once.
   */
  onClose?: () => void;
  /**
   * Box sizing. 'resizable' (default) is the large resizable box used by the
   * expand/drilldown map modals; 'content' is a smaller fixed box that hugs its
   * content up to a cap, used by the user guide.
   */
  sizing?: 'resizable' | 'content';
  /**
   * Override the fixed 'content' box's width/height cap (default CONTENT
   * below). Ignored for 'resizable'. Lets a wide-content modal (e.g. the user
   * guide, which needs room for readable screenshot images) size up without
   * widening every other 'content' modal (e.g. the Splits dialog).
   */
  contentSize?: { width: string; height: string };
  /**
   * Extra icon buttons for the header, inserted before the maximize/close pair.
   * Each gets the shared button styling, hover treatment, and a themed tooltip.
   */
  headerActions?: HeaderAction[];
  /**
   * Body overflow. Default 'hidden' — a single embedded wmap render manages its
   * own internal layout/scrolling, so the body must not scroll independently.
   * Pass 'auto' for content that can outgrow the box (e.g. a wafer gallery,
   * which packs cards to fit rather than scrolling itself).
   */
  bodyOverflow?: 'hidden' | 'auto';
}

export interface HeaderAction {
  /** Inline SVG markup (e.g. from ICONS). */
  icon: string;
  /** Tooltip + accessible label. */
  label: string;
  onClick: () => void;
}

const RESIZABLE = { width: 'min(92vw, 1100px)', height: 'min(88vh, 800px)' };
// 'content' needs an explicit height (not just maxHeight): the body is a
// flex:1/min-height:0 child, so without a resolved box height it can't grow
// vertically and collapses to content height. A generous starting size so the
// guide opens as a comfortable reading window rather than a small box.
const CONTENT = { width: 'min(90vw, 860px)', height: 'min(88vh, 900px)' };

// Live `var(...)` strings, NOT cssVar() — this object is module-level, so
// cssVar() would freeze the colours at the startup theme and never follow a
// theme switch. var() lets the browser re-resolve on every theme change.
const btnStyle: Partial<CSSStyleDeclaration> = {
  border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-control)',
  background: 'var(--bg-input)', cursor: 'pointer',
  color: 'var(--text-muted)', padding: '0', lineHeight: '1',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '24px', height: '24px',
};


/**
 * Open a modal dialog. Returns a handle so the caller can close it
 * programmatically or reach the box/body. The modal owns all backdrop, header,
 * keyboard, and lifecycle behaviour; callers supply only content and teardown.
 */
export function openModal(options: OpenModalOptions): ModalHandle {
  const { title, mount, onClose, sizing = 'resizable', bodyOverflow = 'hidden', contentSize } = options;
  const resizable = sizing === 'resizable';
  const contentBox = contentSize ?? CONTENT;

  const savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const backdrop = document.createElement('div');
  // Styling stays inline (below) — the class is a stable hook for anything that
  // needs to find an open app modal from outside: the guide's screenshot
  // captures drive the UI by selector, and this is the one dialog surface that
  // had none. Shares the name with index.html's hand-rolled backdrops so
  // "is an app modal open?" is a single query.
  backdrop.className = 'tsmap-modal-backdrop';
  Object.assign(backdrop.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: cssVar('--z-modal'),
    backdropFilter: 'blur(3px)',
  } as Partial<CSSStyleDeclaration>);

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', titleId);
  box.tabIndex = -1;
  // `wmap-modal-box`: wmap's toolbar reparents its plot-mode dropdown into the
  // nearest `.wmap-modal-box` ancestor, so a map rendered into this body lands
  // its menus inside the box. Harmless for non-map modals. See WMAP_ISSUES #22.
  // `tsmap-modal-box`: tsmap's own stable handle on the dialog box (used by the
  // guide screenshot captures, which need to frame the box including its title
  // bar rather than just the content the caller mounted).
  box.className = 'wmap-modal-box tsmap-modal-box';
  Object.assign(box.style, {
    background: cssVar('--bg-overlay'),
    border: `1px solid ${cssVar('--border-subtle')}`,
    borderRadius: 'var(--radius-container)',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: 'var(--shadow-modal)',
    maxWidth: '100vw', maxHeight: '100vh',
    ...(resizable
      ? { ...RESIZABLE, resize: 'both', minWidth: '400px', minHeight: '300px' }
      : contentBox),
  } as Partial<CSSStyleDeclaration>);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '10px 14px', flexShrink: '0',
    borderBottom: `1px solid ${cssVar('--border-subtle')}`,
  } as Partial<CSSStyleDeclaration>);

  const titleEl = document.createElement('span');
  titleEl.id = titleId;
  titleEl.textContent = title;
  Object.assign(titleEl.style, {
    flex: '1', fontWeight: '600', fontSize: '15px', color: cssVar('--text-primary'),
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  } as Partial<CSSStyleDeclaration>);

  const hoverIn = (b: HTMLElement) => { b.style.borderColor = 'var(--accent)'; b.style.color = 'var(--accent)'; };
  const hoverOut = (b: HTMLElement) => { b.style.borderColor = 'var(--border-mid)'; b.style.color = 'var(--text-muted)'; };

  // One header icon button: shared style, hover treatment, and themed tooltip.
  // `tip` may be a getter so state-varying hints (maximize↔restore) stay in step.
  const makeHeaderBtn = (icon: string, tip: string | (() => string), label: string) => {
    const b = document.createElement('button');
    b.innerHTML = icon;
    b.setAttribute('aria-label', label);
    Object.assign(b.style, btnStyle);
    attachTooltip(b, tip);
    b.addEventListener('mouseenter', () => hoverIn(b));
    b.addEventListener('mouseleave', () => hoverOut(b));
    return b;
  };

  // Declared before the maximize button so its tooltip getter can read it.
  let maximized = false;

  const actionBtns = (options.headerActions ?? []).map(a => {
    const b = makeHeaderBtn(a.icon, a.label, a.label);
    b.addEventListener('click', a.onClick);
    return b;
  });
  const maxBtn = makeHeaderBtn(ICONS.maximize, () => (maximized ? 'Restore (F)' : 'Maximize (F)'), 'Maximize');
  const closeBtn = makeHeaderBtn(ICONS.close, 'Close (Esc)', 'Close');

  header.append(titleEl, ...actionBtns, maxBtn, closeBtn);

  // Body: position:relative anchors any absolute child (e.g. map banner);
  // flex:1/min-height:0 (never height:100%) sizes correctly in WebView2 — see
  // CLAUDE.md cross-platform CSS rules.
  //
  // display is 'flex' (column) for the single-map case, whose content (the
  // wmap canvas wrap) is itself a flex:1 child that needs to fill the body.
  // For 'auto' overflow (the wafer gallery) it must be plain 'block' instead:
  // a flex-column ancestor whose height is bounded gives EVERY flex child that
  // sets its own `overflow` an automatic minimum size of 0 (CSS flexbox spec),
  // so wmap's toolbar bar (which sets `overflow-x: auto` for horizontal
  // scrolling on narrow widths) collapses to near-zero height under flex-shrink
  // pressure from the much taller gallery grid sibling — the toolbar visually
  // vanishes leaving only the bin-legend row beneath it. `display: block` takes
  // the body out of flex layout entirely, so wmap's children lay out and
  // scroll as normal block content instead of competing for flex space.
  const body = document.createElement('div');
  Object.assign(body.style, {
    flex: '1', minHeight: '0', position: 'relative',
    display: bodyOverflow === 'auto' ? 'block' : 'flex', flexDirection: 'column', overflow: bodyOverflow,
  } as Partial<CSSStyleDeclaration>);

  box.append(header, body);
  backdrop.appendChild(box);

  // Captured BEFORE the modal takes focus, so close() can hand it back to
  // whatever opened the dialog (the Splits toolbar button, a chart's expand
  // icon). Without this, closing dropped focus to <body> and a keyboard user
  // had to Tab in from the top of the page to get back to where they were.
  const previouslyFocused = document.activeElement as HTMLElement | null;

  document.body.appendChild(backdrop);
  box.focus();

  let closed = false;
  function close() {
    if (closed) return; // guard: Esc + close-click could both fire
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = savedOverflow;
    onClose?.();
    backdrop.remove();
    // Only restore if focus is still somewhere inside the (now-removed) modal;
    // if something else has legitimately taken focus in the meantime, stealing
    // it back would be the more surprising behaviour.
    if (previouslyFocused?.isConnected && !document.activeElement?.isConnected) {
      previouslyFocused.focus();
    }
  }

  /**
   * Keep Tab inside the dialog. `aria-modal="true"` tells assistive tech the
   * rest of the page is inert, but it does nothing to the tab ring — without
   * this, Tab walked straight out into the still-interactive page behind the
   * backdrop, which is the WAI-ARIA APG dialog pattern's central requirement
   * (and UI_STANDARDS.md's, which this repo treats as binding).
   *
   * Queried live on each Tab rather than cached at open: modal bodies here are
   * filled by `mount` and then keep changing — the Splits dialog rebuilds its
   * wafer rows on every filter keystroke, so a snapshot taken at open would go
   * stale immediately.
   */
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trapTab(e: KeyboardEvent): void {
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) { e.preventDefault(); box.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const applyMaximize = () => {
    maxBtn.innerHTML = maximized ? ICONS.shrink : ICONS.maximize;
    if (maximized) {
      box.style.borderRadius = '0'; box.style.resize = 'none';
      box.style.width = '100vw'; box.style.height = '100vh';
    } else {
      const size = resizable ? RESIZABLE : contentBox;
      box.style.borderRadius = 'var(--radius-container)';   // must match openModal's own value
      box.style.resize = resizable ? 'both' : 'none';
      box.style.width = size.width;
      box.style.height = size.height;
    }
  };
  const toggleMaximize = () => { maximized = !maximized; applyMaximize(); };
  maxBtn.addEventListener('click', toggleMaximize);

  function onKeyDown(e: KeyboardEvent) {
    const active = document.activeElement;
    const inInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
    if (e.key === 'Tab') { trapTab(e); return; }
    if (e.key === 'Escape') {
      // Escape gets the same in-input guard 'F' already had. Inside a text
      // field Escape conventionally means "abandon what I'm typing", not
      // "close the window" — in the Splits dialog, hitting it while typing a
      // split name used to tear the whole dialog down. Blur instead, which
      // reverts to the field's committed state and leaves a second Escape to
      // close the dialog as before.
      if (inInput) { (active as HTMLElement).blur(); return; }
      close();
      return;
    }
    if ((e.key === 'f' || e.key === 'F') && !inInput) toggleMaximize();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKeyDown);

  mount(body);

  return { box, body, close };
}

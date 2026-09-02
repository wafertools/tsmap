// Shared anchored popup menu — the small dropdown that hangs off a toolbar
// button (Recent, Help, Lot). Extracted because all three had grown a
// byte-identical shell: the same fixed-position box styling, the same
// "position under the anchor then nudge left if it would overflow the
// viewport" pass, and the same four-listener teardown (outside pointerdown,
// Escape, window blur, window resize). Three copies of one rule is exactly
// what CLAUDE.md warns about — a fix to the dismissal behaviour had to be
// made three times, or (more likely) once, leaving two menus subtly different.
//
// Only the CONTENT differs between callers, so that's all `fill` supplies.
// Deliberately NOT built on modal.ts: these are transient, non-modal,
// anchored popups with no backdrop, no focus trap and no scroll lock — the
// opposite contract to a dialog box.

import { attachTooltip } from './tooltip';

export interface AnchoredMenuOptions {
  /** Box padding. Default '6px'. */
  padding?: string;
  /** Box min-width. Default '200px'. */
  minWidth?: string;
  /** Box max-width, when the content should be allowed to cap. */
  maxWidth?: string;
  /** Base font size for the box. Default '13px'. */
  fontSize?: string;
  /** Lay the box out as a vertical stack of rows. Default false (plain block flow). */
  stack?: boolean;
  /** Called after the menu is torn down — used by callers to clear their own "is open" handle. */
  onClose?: () => void;
}

/**
 * Mount an anchored popup under `anchor` and wire its dismissal. `fill`
 * populates the box and is handed the `close` function so a row can dismiss
 * the menu before running its action. Returns `close` so the caller can hold
 * it as a toggle handle (click the trigger again to dismiss).
 */
export function openAnchoredMenu(
  anchor: HTMLElement,
  options: AnchoredMenuOptions,
  fill: (popup: HTMLDivElement, close: () => void) => void,
): () => void {
  const popup = document.createElement('div');
  popup.style.cssText = [
    'position:fixed', 'z-index:var(--z-tooltip)',
    'background:var(--bg-overlay)', 'color:var(--text-secondary)',
    'border:1px solid var(--border-mid)', 'border-radius:var(--radius-container)',
    'box-shadow:var(--shadow-menu)',
    `padding:${options.padding ?? '6px'}`,
    `min-width:${options.minWidth ?? '200px'}`,
    ...(options.maxWidth ? [`max-width:${options.maxWidth}`] : []),
    `font-size:${options.fontSize ?? '13px'}`,
    ...(options.stack ? ['display:flex', 'flex-direction:column', 'gap:2px'] : []),
  ].join(';');

  // A pointerdown that dismisses the menu is about to produce a `click` on
  // whatever was under it. Usually that's wanted — clicking a different
  // toolbar button should dismiss this menu AND activate that button. The
  // exception is a modal backdrop: modal.ts closes its dialog on backdrop
  // `click`, so one click would dismiss the popup *and* the dialog hosting
  // it. Swallow just that case, keyed off modal.ts's own documented
  // `.tsmap-modal-backdrop` hook. pointerdown and click are separate events,
  // so stopping the pointerdown isn't enough on its own.
  function swallowNextClick(e: MouseEvent) {
    document.removeEventListener('click', swallowNextClick, true);
    e.stopPropagation();
  }

  function onOutside(e: PointerEvent) {
    const t = e.target as Node;
    if (popup.contains(t) || anchor.contains(t)) return;
    const onBackdrop = t instanceof Element && !!t.closest('.tsmap-modal-backdrop');
    // close() clears any pending swallow as cleanup, so arm it afterwards.
    close();
    if (onBackdrop) document.addEventListener('click', swallowNextClick, true);
  }

  // Escape must not travel past this menu. It can be opened from inside a
  // modal.ts dialog (the file-filter table's per-column filter popup), whose
  // own bubble-phase Escape handler would otherwise close the whole dialog in
  // the same keystroke — this listener is capture-phase, so it always runs
  // first. Fixed here, in the widget that consumes the key, rather than at
  // each call site; menuSelect.ts already had to learn the same lesson.
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    close();
  }

  function close() {
    popup.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', swallowNextClick, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    options.onClose?.();
  }

  fill(popup, close);

  document.body.appendChild(popup);
  const r = anchor.getBoundingClientRect();
  const margin = 8;
  popup.style.top = `${r.bottom + 4}px`;
  popup.style.left = `${r.left}px`;
  // offsetWidth is only meaningful once the box has been laid out, so the
  // overflow nudge waits a frame rather than reading a zero width.
  requestAnimationFrame(() => {
    const pw = popup.offsetWidth;
    let left = r.left;
    if (left + pw + margin > window.innerWidth) left = window.innerWidth - pw - margin;
    popup.style.left = `${Math.max(margin, left)}px`;
  });

  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);

  return close;
}

export interface MenuRowOptions {
  label: string;
  /** Themed hover tooltip. For a disabled row this is where the "why" belongs. */
  hint?: string;
  /** Default true. A disabled row stays visible (and still explains itself via `hint`) rather than vanishing. */
  enabled?: boolean;
  onClick: () => void;
  /** Trailing icon markup, e.g. to mark a row that behaves unusually. */
  icon?: string;
  /**
   * Present = this row is a toggle, and the value is its current state. Renders
   * a leading ☑/☐ and switches the row to `role="menuitemcheckbox"` with
   * `aria-checked`, so it announces as a toggle rather than a plain command.
   * Omit for an ordinary action row.
   */
  checked?: boolean;
}

/**
 * One clickable row in an anchored menu. Dismisses the menu before running
 * `onClick`, so an action that opens a modal doesn't leave the popup stranded
 * behind it.
 */
export function makeMenuRow(close: () => void, opts: MenuRowOptions): HTMLButtonElement {
  const enabled = opts.enabled ?? true;
  const row = document.createElement('button');
  row.type = 'button';
  row.disabled = !enabled;
  row.className = 'menu-row';

  if (opts.checked !== undefined) {
    row.setAttribute('role', 'menuitemcheckbox');
    row.setAttribute('aria-checked', String(opts.checked));
    const box = document.createElement('span');
    // Same ☑/☐ glyphs the toolbar's own switch used, so the control keeps its
    // appearance when it moves into a menu.
    box.textContent = opts.checked ? '☑' : '☐';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'flex-shrink:0;font-size:14px;line-height:1;';
    row.appendChild(box);
  }

  const text = document.createElement('span');
  text.textContent = opts.label;
  text.style.flex = '1';
  row.appendChild(text);

  if (opts.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = opts.icon;
    iconSpan.style.cssText = 'display:inline-flex;opacity:0.6;flex-shrink:0;';
    row.appendChild(iconSpan);
  }

  if (enabled) {
    row.addEventListener('click', () => { close(); opts.onClick(); });
  }
  if (opts.hint) attachTooltip(row, opts.hint);
  return row;
}

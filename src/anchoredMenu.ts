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
    'border:1px solid var(--border-mid)', 'border-radius:6px',
    'box-shadow:0 6px 20px rgba(0,0,0,0.35)',
    `padding:${options.padding ?? '6px'}`,
    `min-width:${options.minWidth ?? '200px'}`,
    ...(options.maxWidth ? [`max-width:${options.maxWidth}`] : []),
    `font-size:${options.fontSize ?? '13px'}`,
    'font-family:system-ui,sans-serif',
    ...(options.stack ? ['display:flex', 'flex-direction:column', 'gap:2px'] : []),
  ].join(';');

  function onOutside(e: PointerEvent) {
    const t = e.target as Node;
    if (!popup.contains(t) && !anchor.contains(t)) close();
  }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }

  function close() {
    popup.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
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
  /** Trailing icon markup, e.g. ICONS.externalLink to mark a row that leaves the app. */
  icon?: string;
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
  row.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:none;border:none;border-radius:4px;' +
    `padding:6px 10px;font-size:13px;color:${enabled ? 'var(--text-secondary)' : 'var(--text-veryfaint)'};` +
    `cursor:${enabled ? 'pointer' : 'default'};`;

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
    row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-hover-row)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'none'; });
    row.addEventListener('click', () => { close(); opts.onClick(); });
  }
  if (opts.hint) attachTooltip(row, opts.hint);
  return row;
}

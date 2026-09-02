// A themed, drop-in replacement for a grouped native <select>. tsmap uses this
// where a native select misbehaves in the Linux WebView (WebKitGTK): the open
// popup ignores CSS `color-scheme` (renders in the desktop GTK theme) and, near
// a viewport edge with many items, clips off-screen instead of scrolling/flipping.
// A DOM-based menu is fully themeable and identical on every target (Tauri
// Linux/Windows/macOS + web), because there's no native popup chrome involved.
//
// Same call shape as `makeSelect` but grouped: `makeMenuSelect(groups, current,
// onChange)` returns a trigger button. Migrate other selects to it opportunistically.
//
// Accessibility: the trigger is a `combobox`/`listbox` opener; the popup is a
// `listbox` with `option` rows, navigated by roving tabindex (rows take real
// DOM focus, so the browser draws the focus ring — see setActive()). Full
// keyboard support — ArrowUp/Down move the active option, Home/End jump,
// Enter/Space select, Esc closes, printable keys type-ahead. Focus returns to
// the trigger on close. Matches what the native <select> provided.

import { cssVar } from './theme';

export interface MenuOption { value: string; label: string }
export interface MenuGroup { group: string; options: ReadonlyArray<MenuOption> }

const OPEN_MENUS = new Set<() => void>(); // close-fns of currently open menus (only ever 0 or 1)

/**
 * Build a grouped dropdown as a trigger button + on-demand popup listbox.
 * @param groups   option groups, in display order
 * @param current  initially-selected value
 * @param onChange called with the chosen value on selection
 * @param opts.ariaLabel accessible name for the control (e.g. "Colour theme")
 * @param opts.className class applied to the trigger — pass the host's own
 *        button class (`tb-btn` in tsmap's toolbar) so the control matches the
 *        buttons around it. The widget sets no colours itself.
 */
export function makeMenuSelect(
  groups: ReadonlyArray<MenuGroup>,
  current: string,
  onChange: (value: string) => void,
  opts: { ariaLabel?: string; className?: string } = {},
): HTMLButtonElement {
  const flat: MenuOption[] = groups.flatMap(g => g.options);
  let selected = current;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (opts.ariaLabel) trigger.setAttribute('aria-label', opts.ariaLabel);
  // Colour, border, padding and hover come from the caller's class — for the
  // toolbar that's `tb-btn`, the same class every other toolbar button uses.
  // This widget deliberately sets NO colours of its own: it used to hand-roll
  // `background: var(--bg-input)` + `--border-mid`, which rendered a filled
  // input-style pill in a row of transparent outlined buttons — the one control
  // in the toolbar that didn't look like the others. Only layout is set here,
  // and only what the caret arrangement actually needs.
  trigger.className = opts.className ?? '';
  trigger.style.cssText = [
    'display:inline-flex', 'align-items:center', 'gap:6px',
    'cursor:pointer', 'white-space:nowrap',
  ].join(';');

  const labelSpan = document.createElement('span');
  const caret = document.createElement('span');
  caret.textContent = '▾';
  // `inherit`, not `--text-muted`: the caret has to follow the button's own
  // colour through hover/focus, or it stays grey while the label goes accent.
  caret.style.cssText = 'font-size:12px;color:inherit;flex-shrink:0;';
  trigger.append(labelSpan, caret);

  const syncLabel = () => {
    labelSpan.textContent = flat.find(o => o.value === selected)?.label ?? selected;
  };
  syncLabel();

  // ── Popup (built lazily on open, torn down on close) ─────────────────────
  let popup: HTMLElement | null = null;
  let activeIdx = -1;               // index into `flat` of the keyboard-active option
  let rowEls: HTMLElement[] = [];   // parallel to `flat`
  let typeahead = '';
  let typeaheadTimer: number | undefined;

  function isOpen(): boolean { return popup !== null; }

  /**
   * Move the keyboard-active option by giving it real DOM focus.
   *
   * Rows carry `tabIndex = -1` (roving tabindex) rather than being pointed at
   * with `aria-activedescendant`, so the browser's own `:focus-visible` ring is
   * the focus indicator — the same ring, from the same global `--accent` rule in
   * index.html, that every other control in the app gets. This widget draws no
   * focus styling of its own.
   *
   * It used to. The rows never took DOM focus, so a hand-drawn accent
   * left-marker stood in for the missing ring (a background swap alone measured
   * ~1.2:1 on the Dark theme, below WCAG 1.4.11's 3:1). That marker was unique
   * to this one widget — wmap's toolbar dropdowns and tsmap's own anchoredMenu
   * rows both use roving tabindex and get the ring for free — so the theme
   * picker was the only list in either app whose rows grew a left bar. See
   * "Option lists and menus: one visual contract" in UI_STANDARDS.md.
   *
   * `preventScroll` plus an explicit `scrollIntoView({ block: 'nearest' })`
   * keeps the gentler scrolling; a bare `focus()` jumps the popup.
   */
  function setActive(idx: number): void {
    if (idx < 0 || idx >= rowEls.length) return;
    activeIdx = idx;
    const el = rowEls[idx];
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }

  function choose(value: string): void {
    if (value !== selected) { selected = value; syncLabel(); onChange(value); }
    close();
  }

  function open(): void {
    if (isOpen()) return;
    // Only one menu open at a time.
    for (const c of OPEN_MENUS) c();

    popup = document.createElement('div');
    popup.setAttribute('role', 'listbox');
    if (opts.ariaLabel) popup.setAttribute('aria-label', opts.ariaLabel);
    popup.style.cssText = [
      'position:fixed', 'z-index:var(--z-tooltip)',
      'background:var(--bg-overlay)', 'color:var(--text-secondary)',
      'border:1px solid var(--border-mid)', 'border-radius:var(--radius-container)',
      'box-shadow:var(--shadow-menu)',
      'padding:4px', 'overflow-y:auto', 'min-width:160px',
      'font-size:12px', 'font-family:system-ui,sans-serif',
    ].join(';');

    rowEls = [];
    let flatIdx = 0;
    const uid = Math.random().toString(36).slice(2, 8);
    for (const g of groups) {
      const header = document.createElement('div');
      header.setAttribute('role', 'presentation');
      header.textContent = g.group;
      header.style.cssText = `padding:4px 8px 2px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:var(--tracking);color:${cssVar('--text-muted')};`;
      popup.appendChild(header);

      for (const o of g.options) {
        const idx = flatIdx++;
        const row = document.createElement('div');
        row.id = `menuopt-${uid}-${idx}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(o.value === selected));
        row.tabIndex = -1;   // roving tabindex — see setActive()
        row.textContent = o.label;
        row.style.cssText = 'padding:5px 10px;border-radius:var(--radius-control);cursor:pointer;white-space:nowrap;';
        // The three states of the shared contract (UI_STANDARDS.md): SELECTED is
        // a persistent accent tint, HOVER is a transient neutral background,
        // FOCUS is the browser ring — drawn by the engine, not here.
        // `--bg-selected` is the dedicated selection role (distinct from
        // `--bg-accent-hover`, which is a button-hover ground), shared with
        // filterTable.ts and with wmap via `--wmap-menu-active`, so every list
        // in either app marks selection the same way.
        const isSelected = o.value === selected;
        if (isSelected) {
          // The tint carries the selection; the text stays primary. Accent text
          // ON the accent tint is both redundant and low-contrast — measured
          // across all 16 themes it failed WCAG AA (4.5:1) in fourteen of them,
          // as low as 2.54:1 on Solarized. With --text-primary the weakest theme
          // measures 5.4:1.
          row.style.background = cssVar('--bg-selected');
          row.style.color = cssVar('--text-primary');
          row.style.fontWeight = '600';
        }
        // Hover deliberately does NOT move focus. Hovering is not focusing, and
        // routing both through setActive() is exactly what used to drag the
        // accent marker around under the mouse. Enter therefore acts on the
        // keyboard row, the way a native <select> behaves.
        row.addEventListener('mouseenter', () => {
          if (!isSelected) row.style.background = cssVar('--bg-hover-row');
        });
        row.addEventListener('mouseleave', () => {
          if (!isSelected) row.style.background = '';
        });
        row.addEventListener('click', () => choose(o.value));
        popup.appendChild(row);
        rowEls.push(row);
      }
    }

    document.body.appendChild(popup);
    positionPopup();
    trigger.setAttribute('aria-expanded', 'true');
    OPEN_MENUS.add(close);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('blur', close); // alt-tab in a WebView won't fire outside-pointer
    window.addEventListener('resize', close);

    // Activate the selected option (or first) for keyboard start point.
    const sel = flat.findIndex(o => o.value === selected);
    setActive(sel >= 0 ? sel : 0);
  }

  function positionPopup(): void {
    if (!popup) return;
    const r = trigger.getBoundingClientRect();
    const margin = 8;
    // Cap height to whichever side has more room, so it scrolls instead of clipping.
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const openUp = below < 200 && above > below;
    popup.style.maxHeight = `${Math.max(120, (openUp ? above : below))}px`;

    // Measure after max-height is set.
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = r.left;
    if (left + pw + margin > window.innerWidth) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    popup.style.left = `${left}px`;
    if (openUp) popup.style.top = `${Math.max(margin, r.top - ph - 4)}px`;
    else        popup.style.top = `${r.bottom + 4}px`;
  }

  function close(): void {
    if (!popup) return;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    OPEN_MENUS.delete(close);
    popup.remove();
    popup = null;
    activeIdx = -1;
    rowEls = [];
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  function onOutsidePointer(e: PointerEvent): void {
    const t = e.target as Node;
    if (popup && !popup.contains(t) && !trigger.contains(t)) close();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!isOpen()) return;
    switch (e.key) {
      // stopPropagation, not just preventDefault: this listener is on document
      // in the CAPTURE phase, so without it the event carries on to whatever is
      // listening in the bubble phase underneath — and modal.ts listens for
      // Escape on document. Put one of these menus inside a modal (which the
      // column-mapping migration does) and a single Escape would close both the
      // dropdown and the dialog. mappingUI and testSelectorUI each already
      // solved this at their own call sites; fixing it here means the rule
      // lives once, in the widget that owns the key.
      case 'Escape':    e.preventDefault(); e.stopPropagation(); close(); break;
      case 'ArrowDown': e.preventDefault(); setActive(Math.min(activeIdx + 1, rowEls.length - 1)); break;
      case 'ArrowUp':   e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); break;
      case 'Home':      e.preventDefault(); setActive(0); break;
      case 'End':       e.preventDefault(); setActive(rowEls.length - 1); break;
      // Also stopped: an Enter that picks an option must not additionally reach
      // a host form/dialog and be read as "confirm and continue".
      case 'Enter':
      case ' ':         e.preventDefault(); e.stopPropagation(); if (activeIdx >= 0) choose(flat[activeIdx].value); break;
      // Close and return focus to the trigger; the next Tab then moves on from
      // there normally. Letting the default run instead moved focus onward from
      // a row in a popup that is `document.body`'s LAST child — i.e. straight
      // out of the page, with the listbox left open and Escape no longer
      // reaching it. Inside a modal it is worse: the focus trap cannot see an
      // active element outside its own box.
      case 'Tab':       e.preventDefault(); e.stopPropagation(); close(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          typeahead += e.key.toLowerCase();
          window.clearTimeout(typeaheadTimer);
          typeaheadTimer = window.setTimeout(() => { typeahead = ''; }, 600);
          const hit = flat.findIndex(o => o.label.toLowerCase().startsWith(typeahead));
          if (hit >= 0) setActive(hit);
        }
    }
  }

  trigger.addEventListener('click', () => { if (isOpen()) close(); else open(); });
  trigger.addEventListener('keydown', e => {
    if (!isOpen() && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open();
    }
  });

  return trigger;
}

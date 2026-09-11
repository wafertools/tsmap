// The "Load definitions ▾" split button — a verb plus a caret listing recently
// used definitions files.
//
// Shared rather than written twice: it is needed by the test selector overlay
// and by the Save/Load dialogs behind Setup ▾ (test definitions, bin definitions),
// which are separate call sites with separate button rows. Two copies of a
// popup-plus-rows control is exactly the duplication `check-clones` exists to
// catch, and the second copy is where the keyboard wiring quietly diverges.
//
// It knows nothing about storage or platforms: the caller supplies a `pick`
// (the ordinary file dialog) and ready-to-run `recents` rows. Resolving a row
// may need to re-read from disk and report that the file changed — platform work
// that belongs in main.ts, not in a button.

import { openAnchoredMenu, makeMenuRow } from './anchoredMenu';

export interface RecentLoadRow {
  label: string;
  hint?: string;
  /** Resolve to the file's text, or null if nothing should be applied. */
  run: () => Promise<string | null>;
}

export interface LoadDefinitionsButtonOptions {
  /** Button text. Default 'Load definitions'. */
  label?: string;
  /**
   * Shown once, above the rows, as a disabled header — for stating a caveat that
   * applies to every entry rather than repeating it on each. The browser build
   * uses it to say these are saved copies that cannot be re-read, which is a
   * property of the platform, not of any one file.
   *
   * Deliberately a visible row and not a hover hint: this is the sentence a
   * reader needs *before* choosing, and nobody hovers a menu to check for
   * caveats.
   */
  note?: string;
  /** The ordinary "choose a file" path. Null means the user cancelled. */
  pick: () => Promise<string | null>;
  /** Omit entirely to render a plain button with no caret. */
  recents?: () => RecentLoadRow[];
  /** Applied for any successfully obtained text, whatever its source. */
  onText: (text: string) => void;
  onError: (message: string) => void;
}

export function makeLoadDefinitionsButton(opts: LoadDefinitionsButtonOptions): HTMLElement {
  const label = opts.label ?? 'Load definitions';

  const run = async (get: () => Promise<string | null>) => {
    try {
      const text = await get();
      if (text === null) return;
      opts.onText(text);
    } catch (e) {
      opts.onError(e instanceof Error ? e.message : String(e));
    }
  };

  // Two real <button>s joined visually: a click target nested inside a button is
  // invalid HTML and unreachable by keyboard. Same construction as the toolbar's
  // Open files ▾ (.tb-split), at dialog weight (.btn-split).
  const group = document.createElement('span');
  group.className = 'btn-split';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'btn-secondary';
  main.textContent = label;
  main.addEventListener('click', () => { void run(opts.pick); });
  group.appendChild(main);

  if (!opts.recents) return group;

  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = 'btn-secondary';
  caret.setAttribute('aria-haspopup', 'menu');
  caret.setAttribute('aria-expanded', 'false');
  caret.setAttribute('aria-label', 'Load a recently used definitions file');
  caret.innerHTML = '<span class="tb-caret">▾</span>';

  let close: (() => void) | null = null;
  caret.addEventListener('click', () => {
    // Second click on the trigger dismisses, rather than reopening underneath.
    if (close) { close(); return; }
    const rows = opts.recents!();
    caret.setAttribute('aria-expanded', 'true');
    close = openAnchoredMenu(
      caret,
      {
        stack: true, minWidth: '280px', maxWidth: '460px',
        onClose: () => { close = null; caret.setAttribute('aria-expanded', 'false'); },
      },
      (popup, dismiss) => {
        popup.appendChild(makeMenuRow(dismiss, {
          label: 'Choose a file…',
          hint: 'Pick a definitions file in the usual dialog',
          onClick: () => { void run(opts.pick); },
        }));
        if (opts.note && rows.length > 0) {
          popup.appendChild(makeMenuRow(dismiss, {
            label: opts.note,
            enabled: false,
            onClick: () => {},
          }));
        }
        if (rows.length === 0) {
          // Disabled row rather than an empty popup: an empty box reads as a
          // rendering fault, and this states what will fill it.
          popup.appendChild(makeMenuRow(dismiss, {
            label: 'No recent files yet',
            hint: 'Definitions files you load or save are remembered here, so you can reapply one in a click next time',
            enabled: false,
            onClick: () => {},
          }));
          return;
        }
        for (const r of rows) {
          popup.appendChild(makeMenuRow(dismiss, {
            label: r.label,
            hint: r.hint,
            onClick: () => { void run(r.run); },
          }));
        }
      },
    );
  });
  group.appendChild(caret);

  return group;
}

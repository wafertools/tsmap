// Help ▸ Keyboard shortcuts… (and the ? key): the keys tsmap and its maps answer to, in one place.
//
// Until this existed the shortcuts were written down only in the guide's prose. The map's keys are
// wafermap's (its guide has the same table, which this must agree with); the others are tsmap's own
// windows and menus.

import { openModal } from './modal';

interface ShortcutGroup {
  title: string;
  rows: ReadonlyArray<readonly [keys: string, action: string]>;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'On a map',
    rows: [
      ['E', 'Open the map in an enlarged window'],
      ['Esc', 'Close the enlarged window, or clear the die selection'],
      ['Ctrl / Cmd + click', 'Add a die to the selection'],
      ['Right-click, Menu key or Shift + F10', 'Charts and tables of the selected dies, or the whole wafer'],
      ['Mouse wheel', 'Zoom in and out at the cursor'],
      ['Ctrl / Cmd + +  /  −', 'Zoom in / out (on a map with focus; otherwise the whole interface)'],
      ['Ctrl / Cmd + 0', 'Reset the zoom (same condition as + and −)'],
      ['Arrow keys', 'Pan the map'],
      ['Space (hold) + drag', 'Pan without leaving the current tool'],
    ],
  },
  {
    title: 'On a gallery and the Insights tab',
    rows: [
      ['1 – 5', 'Set that many columns of cards (over a plot of panels: that plot\'s columns)'],
      ['0', 'Set the columns back to Auto'],
    ],
  },
  {
    title: 'In windows and menus',
    rows: [
      ['F', 'Maximise or restore an enlarged window'],
      ['Esc', 'Close the window or menu'],
      ['Tab / Shift + Tab', 'Move between controls (focus stays inside an open window)'],
      ['↑  ↓  Home  End', 'Move through the rows of a menu or list'],
      ['Enter or Space', 'Choose the highlighted row'],
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      ['?', 'Show this list'],
    ],
  },
];

/** Whether a key press is the "?" shortcut and should open the list: not while typing, not over another window. */
export function isShortcutsKey(e: KeyboardEvent): boolean {
  if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return false;
  // The target can be the document or window (a synthetic event, or no focused element), which has no `closest`.
  const target = e.target as { closest?: (selector: string) => Element | null } | null;
  if (typeof target?.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"]')) return false;
  return !document.querySelector('[role="dialog"]');
}

export function showShortcutsDialog(): void {
  openModal({
    title: 'Keyboard shortcuts',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 560px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:16px;font-size:13px;color:var(--text-light)';
      for (const group of SHORTCUT_GROUPS) {
        const section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = group.title;
        heading.style.cssText = 'margin:0 0 6px;font-size:13px;font-weight:700;color:var(--text-secondary)';
        section.appendChild(heading);
        const table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse;width:100%';
        for (const [keys, action] of group.rows) {
          const tr = table.insertRow();
          tr.style.cssText = 'border-top:1px solid var(--border-mid)';
          const k = tr.insertCell();
          k.style.cssText = 'padding:6px 12px 6px 0;white-space:nowrap;font-weight:600;vertical-align:top';
          k.textContent = keys;
          const a = tr.insertCell();
          a.style.cssText = 'padding:6px 0;color:var(--text-secondary)';
          a.textContent = action;
        }
        section.appendChild(table);
        body.appendChild(section);
      }
    },
  });
}

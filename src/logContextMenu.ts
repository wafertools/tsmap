// Right-click menu for the log panel: Select all and Copy all. The panel is a short scrolling box, so dragging a
// selection over a long load log is awkward, and the log is what a bug report needs pasted whole.

import { openAnchoredMenu, makeMenuRow } from './anchoredMenu';

/** Select every entry in the log, so the reader can copy it with the keyboard or a native shortcut. */
function selectAllEntries(list: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(list);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The log as plain text, one entry a line. */
function logText(list: HTMLElement): string {
  return Array.from(list.children, entry => entry.textContent ?? '').join('\n');
}

async function copyAllEntries(list: HTMLElement): Promise<void> {
  const text = logText(list);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No async clipboard in this webview: select the entries and let the browser's own copy command do it.
    selectAllEntries(list);
    document.execCommand('copy');
  }
}

/**
 * Open the menu at the pointer on a right-click anywhere in `panel`. The anchored menu hangs off an element, so a
 * zero-size one is placed at the pointer and removed when the menu closes.
 */
export function wireLogContextMenu(panel: HTMLElement, list: HTMLElement): void {
  let close: (() => void) | null = null;
  panel.addEventListener('contextmenu', e => {
    e.preventDefault();
    close?.();
    const at = document.createElement('div');
    at.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;pointer-events:none;`;
    document.body.appendChild(at);
    const empty = list.childElementCount === 0;
    close = openAnchoredMenu(at, { stack: true, minWidth: '160px', onClose: () => { close = null; at.remove(); } }, (popup, dismiss) => {
      popup.setAttribute('role', 'menu');
      popup.appendChild(makeMenuRow(dismiss, {
        label: 'Select all', enabled: !empty,
        hint: empty ? 'The log is empty' : 'Select every entry in the log, ready to copy',
        onClick: () => selectAllEntries(list),
      }));
      popup.appendChild(makeMenuRow(dismiss, {
        label: 'Copy all', enabled: !empty,
        hint: empty ? 'The log is empty' : 'Copy every entry in the log to the clipboard, one per line',
        onClick: () => { void copyAllEntries(list); },
      }));
    });
  });
}

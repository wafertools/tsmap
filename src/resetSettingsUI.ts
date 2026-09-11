// "Reset saved settings" — the way out of a bad remembered state.
//
// tsmap accumulates preferences silently and helpfully: a column mapping per
// layout, splits per lot, a diameter override, a theme. That is the point of
// them, but until now there was no way to undo one. A user who saved a wrong
// column mapping got it reapplied on every load of that layout, with devtools as
// the only remedy — and on a shared or locked-down machine, not even that.
//
// Two deliberate choices:
//
//   * It lists what is ACTUALLY stored, not everything tsmap could store. A list
//     of eight items where six are empty invites the reader to conclude the app
//     is holding far more about them than it is.
//   * Each row says what is lost in the user's terms, and nothing is cleared
//     without an explicit tick. Reset-all is one click but not the default,
//     because "forget my splits" and "forget everything" are different asks.

import { openModal, type ModalHandle } from './modal';
import { STORED_ITEMS, hasStoredValue, clearStoredItems, type StoredItem } from './storageKeys';

export interface ResetSettingsOptions {
  /** Desktop-only items are hidden in the browser, where they never exist. */
  isDesktop: boolean;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Called after something was cleared, so the caller can re-read what it caches. */
  onCleared?: () => void;
}

export function showResetSettingsDialog(opts: ResetSettingsOptions): void {
  const applicable = STORED_ITEMS.filter(i => opts.isDesktop || i.scope !== 'desktop');
  const present = applicable.filter(hasStoredValue);
  const checked = new Set<StoredItem>();

  // `mount` runs synchronously inside openModal, so the closures it creates
  // capture `handle` before it is assigned — they only read it on a later
  // click, by which time the call has returned.
  const handle: ModalHandle = openModal({
    title: 'Reset saved settings',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 520px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent = present.length === 0
        ? 'tsmap is not currently remembering any settings on this machine.'
        : 'tsmap remembers these on this machine only — nothing is sent anywhere. '
          + 'Tick what you want to forget. Loaded wafer data is not affected.';
      body.appendChild(intro);

      if (present.length === 0) {
        addButtons(body, []);
        return;
      }

      for (const item of present) {
        const row = document.createElement('label');
        row.className = 'click-row';
        row.style.cssText =
          'display:flex;align-items:flex-start;gap:10px;padding:10px 6px;'
          + 'border-top:1px solid var(--border-mid);cursor:pointer';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.style.cssText = 'margin-top:2px;flex-shrink:0';
        box.addEventListener('change', () => {
          if (box.checked) checked.add(item); else checked.delete(item);
          syncConfirm();
        });

        const text = document.createElement('div');
        const title = document.createElement('div');
        title.style.cssText = 'color:var(--text-primary);font-weight:600';
        title.textContent = item.label;
        const desc = document.createElement('div');
        desc.style.cssText = 'color:var(--text-muted);margin-top:2px';
        desc.textContent = item.description;
        text.append(title, desc);

        row.append(box, text);
        body.appendChild(row);
      }

      let syncConfirm = () => {};
      const buttons = addButtons(body, present);
      syncConfirm = buttons.sync;
      syncConfirm();
    },
  });

  function addButtons(body: HTMLElement, present: readonly StoredItem[]) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:4px';

    let confirm: HTMLButtonElement | null = null;

    if (present.length > 0) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'btn-secondary';
      all.textContent = 'Select all';
      all.addEventListener('click', () => {
        for (const cb of body.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
          if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
        }
      });
      btnRow.appendChild(all);

      confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'btn-primary';
      confirm.textContent = 'Forget selected';
      confirm.addEventListener('click', () => {
        const items = [...checked];
        if (items.length === 0) return;
        const n = clearStoredItems(items);
        opts.onLog('info',
          `Forgot ${n} saved setting${n === 1 ? '' : 's'}: ${items.map(i => i.label).join(', ')}. `
          + 'Anything already on screen is unchanged until the next load.');
        opts.onCleared?.();
        handle.close();
      });
      btnRow.appendChild(confirm);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-secondary';
    close.textContent = present.length > 0 ? 'Cancel' : 'Close';
    close.addEventListener('click', () => handle.close());
    btnRow.appendChild(close);

    body.appendChild(btnRow);

    return {
      sync: () => {
        if (!confirm) return;
        const n = checked.size;
        confirm.disabled = n === 0;
        confirm.style.opacity = confirm.disabled ? '0.5' : '';
        confirm.textContent = n === 0 ? 'Forget selected' : `Forget ${n} selected`;
      },
    };
  }
}

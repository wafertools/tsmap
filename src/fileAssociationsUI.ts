// Modal UI for the "File associations…" Help menu row (main.ts, Tauri only)
// — lets the user opt in/out of tsmap being the default handler for
// STDF/ATDF/Parquet files, so double-clicking one in a file manager opens it
// in tsmap. Backed by file_associations.rs (Windows registry / Linux
// mimeapps.list + shared-mime-info), reached via
// platform.getFileAssociationStatus/setFileAssociation.
//
// Deliberately excludes CSV/JSON — see file_associations.rs's module doc for
// why (those extensions are already claimed by dozens of unrelated apps).
//
// This is an in-app setting, not an installer option, so it can be changed
// any time rather than locked in once at install — see file_associations.rs's
// module doc for the fuller reasoning (Windows installer UIs can support
// per-item checkboxes; there's no equivalent for a Linux package install).

import { openModal } from './modal';
import type { FileAssociationStatus } from './platform';
import { errMsg } from './lib';

export interface FileAssociationsUIOptions {
  getStatus: () => Promise<FileAssociationStatus[]>;
  setAssociation: (extension: string, associate: boolean) => Promise<void>;
}

const EXTENSION_LABELS: Record<string, string> = {
  stdf: 'STDF (.stdf)',
  atdf: 'ATDF (.atdf)',
  parquet: 'Parquet (.parquet)',
};

export function showFileAssociationsModal(options: FileAssociationsUIOptions): void {
  openModal({
    title: 'File associations',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 420px)', height: 'min(80vh, 360px)' },
    bodyOverflow: 'auto',
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.textContent = 'Open these file types in tsmap automatically when double-clicked in a file manager. Changing your mind later is fine — this can be toggled anytime.';
      intro.style.cssText = 'margin:0;color:var(--text-secondary);line-height:var(--leading-base);';
      body.appendChild(intro);

      const errorBanner = document.createElement('div');
      errorBanner.style.cssText = [
        'display:none;padding:8px 10px;border-radius:var(--radius-control);font-size:12px;line-height:var(--leading-base)',
        'background:var(--bg-input);border:1px solid var(--error-text);color:var(--error-text)',
      ].join(';');
      body.appendChild(errorBanner);
      function showError(message: string) {
        errorBanner.textContent = message;
        errorBanner.style.display = 'block';
      }
      function clearError() {
        errorBanner.style.display = 'none';
        errorBanner.textContent = '';
      }

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
      body.appendChild(list);

      const loading = document.createElement('div');
      loading.textContent = 'Checking current status…';
      loading.style.cssText = 'color:var(--text-muted);font-size:12px;';
      list.appendChild(loading);

      options
        .getStatus()
        .then(statuses => {
          loading.remove();
          for (const status of statuses) {
            list.appendChild(makeRow(status));
          }
        })
        .catch(e => {
          loading.remove();
          showError(`Couldn't check current status: ${errMsg(e)}`);
        });

      function makeRow(initial: FileAssociationStatus): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = initial.associated;

        const text = document.createElement('span');
        text.textContent = EXTENSION_LABELS[initial.extension] ?? initial.extension;
        text.style.flex = '1';

        // Toggling has no separate Apply/Save step — every change applies
        // immediately, matching the Splits dialog's convention (CLAUDE.md).
        // But with no Apply button at all, a bare checkbox gives no feedback
        // that the click actually *did* anything (the failure path already
        // has one — the shared error banner above — the success path needs
        // its own, or a silently-successful toggle reads the same as a
        // silently-ignored one).
        const status = document.createElement('span');
        status.style.cssText = 'font-size:12px;color:var(--text-muted);min-width:56px;text-align:right;';
        let statusFadeTimer: ReturnType<typeof setTimeout> | undefined;

        row.appendChild(checkbox);
        row.appendChild(text);
        row.appendChild(status);
        container.appendChild(row);

        // Shows which binary is actually registered to launch on a cold
        // double-click, so a stale registration (e.g. left pointing at a
        // debug build after switching back to release) is visible instead of
        // silently failing the next time the user opens a file this way.
        // Always rendered, checked or not — an *unchecked* box with a blank
        // line under it reads the same as "associated, path just didn't
        // load," so the unchecked case gets its own explicit "would
        // register…" line instead of being left empty.
        const pathLine = document.createElement('div');
        pathLine.style.cssText =
          'font-size:12px;font-family:ui-monospace,"Cascadia Code","Segoe UI Mono",monospace;' +
          'padding-left:24px;word-break:break-all;';
        container.appendChild(pathLine);

        function renderPathLine(current: FileAssociationStatus) {
          if (!current.associated) {
            pathLine.style.color = 'var(--text-muted)';
            pathLine.textContent = current.currentExePath
              ? `would register: ${current.currentExePath}`
              : '';
            pathLine.style.display = current.currentExePath ? '' : 'none';
            return;
          }
          if (!current.registeredExePath) {
            pathLine.style.color = 'var(--text-muted)';
            pathLine.textContent = 'associated, but the registered path could not be read';
            pathLine.style.display = '';
            return;
          }
          pathLine.style.display = '';
          const mismatch = !!current.currentExePath && current.registeredExePath !== current.currentExePath;
          pathLine.textContent = mismatch
            ? `⚠ registered to ${current.registeredExePath} — different from the running app`
            : `registered to: ${current.registeredExePath}`;
          pathLine.style.color = mismatch ? 'var(--warn-text)' : 'var(--text-muted)';
        }
        renderPathLine(initial);

        checkbox.addEventListener('change', () => {
          clearError();
          clearTimeout(statusFadeTimer);
          const desired = checkbox.checked;
          checkbox.disabled = true;
          status.textContent = 'Saving…';
          options
            .setAssociation(initial.extension, desired)
            .then(() => {
              status.textContent = 'Saved';
              statusFadeTimer = setTimeout(() => { status.textContent = ''; }, 1500);
              // Re-fetch rather than guessing the new registered path locally
              // — on Windows/Linux it's derived from the running binary at
              // the moment of the OS-level write, which this module doesn't
              // otherwise know.
              return options.getStatus().then(statuses => {
                const updated = statuses.find(s => s.extension === initial.extension);
                if (updated) renderPathLine(updated);
              });
            })
            .catch(e => {
              checkbox.checked = !desired; // revert — the change didn't actually take effect
              status.textContent = '';
              showError(errMsg(e));
            })
            .finally(() => {
              checkbox.disabled = false;
            });
        });

        return container;
      }
    },
  });
}

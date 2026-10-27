// **Setup ▾ → Setup file…**: save the lot-independent settings (wafer diameter, edge exclusion, reticle, retest
// policy, value filter) as one file, or load one. The dialog says what is set now so there is something to check a
// loaded file against; a load applies at once, as each setting's own dialog does, and the log lists what it set.
// The format is `setupFile.ts`.

import { openModal } from './modal';
import { makeLoadDefinitionsButton, type RecentLoadRow } from './recentDefinitionsUI';
import { parseSetupFile, formatSetupFile, describeSetup, type SetupSettings } from './setupFile';
import { errMsg } from './lib';

export interface SetupFileOptions {
  current: () => SetupSettings;
  /** Applies a loaded setup and re-renders; returns whether anything changed. */
  apply: (s: SetupSettings) => boolean;
  pick: () => Promise<string | null>;
  recents: () => RecentLoadRow[];
  recentNote?: string;
  save: (text: string) => Promise<void>;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export function showSetupFileDialog(opts: SetupFileOptions): void {
  const modalHandle = openModal({
    title: 'Setup file',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 480px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent = 'The settings that belong to a product or a site rather than to one lot, in one file: wafer diameter, edge exclusion, '
        + 'reticle, which result counts for a retested die, and which limits exclude a test value. Loading changes only the settings the file states.';

      const now = document.createElement('div');
      now.style.cssText = 'border:1px solid var(--border-mid);border-radius:var(--radius-control);padding:8px 10px;color:var(--text-secondary)';
      const set = describeSetup(opts.current());
      now.textContent = `Set now: ${set.length ? set.join(' · ') : 'nothing'}.`;

      const status = document.createElement('div');
      status.setAttribute('role', 'status');
      status.style.cssText = 'min-height:1.2em;color:var(--warn-text)';

      const save = document.createElement('button');
      save.className = 'btn-secondary';
      save.textContent = 'Save…';
      save.addEventListener('click', async () => {
        try {
          await opts.save(formatSetupFile(opts.current()));
          opts.onLog('info', 'Setup saved');
        } catch (e) {
          opts.onLog('error', `Failed to save setup: ${errMsg(e)}`);
        }
      });

      const load = makeLoadDefinitionsButton({
        label: 'Load…',
        pick: opts.pick,
        recents: opts.recents,
        note: opts.recentNote,
        onText: text => {
          const s = parseSetupFile(text, (line, msg) => opts.onLog('warn', `Setup line ${line}: ${msg}`));
          const stated = describeSetup(s);
          if (stated.length === 0) { status.textContent = 'That file states no settings tsmap could read.'; opts.onLog('warn', 'Setup file contained no valid settings'); return; }
          const changed = opts.apply(s);
          opts.onLog('info', `Setup loaded: ${stated.join(', ')}${changed ? '' : ' (already set)'}`);
          modalHandle.close();
        },
        onError: msg => opts.onLog('error', `Failed to load setup: ${msg}`),
      });

      const close = document.createElement('button');
      close.className = 'btn-secondary';
      close.textContent = 'Close';
      close.addEventListener('click', () => modalHandle.close());

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
      row.append(save, load, close);
      body.append(intro, now, status, row);
    },
  });
}

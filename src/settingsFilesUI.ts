// **Preferences → Export or import settings…** — the two settings files in one dialog.
//
//   * Column mappings: export every saved layout, or import a file's. An import merges and is safe at any moment.
//   * Other saved settings: export what is stored, or import chosen items from a file. An import writes storage and then
//     reloads tsmap, which closes an open lot — plots, pins and map preferences are held in memory and would write their
//     old copy over an import — so it names what it replaces and asks first.
//
// What each file may contain, and what is left out and why, is `settingsFile.ts`; the dialog states the exclusions rather
// than leaving a person to wonder what they just emailed.

import { openModal } from './modal';
import { savedMappingCount, exportMappings, parseMappingsFile, importMappings } from './savedMappings';
import { portableSettings, writeSettingsFile, parseSettingsFile, applySettings, EXCLUDED, type SettingItem } from './settingsFile';
import { STORED_ITEMS } from './storageKeys';
import { errMsg } from './lib';

export interface SettingsFilesOptions {
  pick: (title: string) => Promise<string | null>;
  save: (text: string, fileName: string, title: string) => Promise<void>;
  /** An import of settings closes the open lot; the dialog says so when one is open. */
  lotOpen: boolean;
  /** Reload tsmap so every module reads what was imported. */
  reload: () => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** What is never exported, each reason once with the settings it covers; the column mappings are not listed, as they have their own file. */
function notIncluded(): string {
  const byReason = new Map<string, string[]>();
  for (const [key, why] of Object.entries(EXCLUDED)) {
    if (key === 'tsmap:csv-mappings') continue;
    const label = STORED_ITEMS.find(i => i.key === key)?.label ?? key;
    byReason.set(why, [...(byReason.get(why) ?? []), label]);
  }
  return [...byReason].map(([why, labels]) => `${labels.join(', ')} (${why})`).join('; ');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function showSettingsFilesDialog(opts: SettingsFilesOptions): void {
  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

  const handle = openModal({
    title: 'Export or import settings',
    sizing: 'content',
    contentSize: { width: 'min(92vw, 560px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:14px;font-size:12px;color:var(--text-light)';

      const button = (text: string, primary = false) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = primary ? 'btn-primary' : 'btn-secondary';
        b.textContent = text;
        return b;
      };
      const section = (title: string, text: string) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'border:1px solid var(--border-mid);border-radius:var(--radius-control);padding:10px 12px;display:flex;flex-direction:column;gap:8px';
        const h = document.createElement('div');
        h.style.cssText = 'color:var(--text-primary);font-weight:600';
        h.textContent = title;
        const p = document.createElement('div');
        p.style.cssText = 'color:var(--text-secondary)';
        p.textContent = text;
        wrap.append(h, p);
        return { wrap, p };
      };
      const status = document.createElement('div');
      status.setAttribute('role', 'status');
      status.style.cssText = 'min-height:1.2em;color:var(--warn-text)';
      const say = (m: string) => { status.textContent = m; };

      // ── Column mappings ──────────────────────────────────────────────────
      const maps = section('Column mappings',
        'The roles you confirmed for CSV, JSON and Parquet layouts, one per set of column headers. Importing adds the file’s layouts and replaces any you already have for the same headers; nothing else changes.');
      const mapCount = document.createElement('div');
      mapCount.style.cssText = 'color:var(--text-dim)';
      const mapExport = button('Export…');
      const mapImport = button('Import…');
      const refreshMaps = () => {
        const n = savedMappingCount();
        mapCount.textContent = n === 0 ? 'No layouts saved yet.' : `${plural(n, 'layout')} saved.`;
        mapExport.disabled = n === 0;
        mapExport.style.opacity = n === 0 ? '0.5' : '';
      };
      mapExport.addEventListener('click', async () => {
        try {
          const { text, skipped } = exportMappings();
          await opts.save(text, 'tsmap-column-mappings.json', 'Save the column mappings to a file');
          opts.onLog('info', `Column mappings saved: ${plural(savedMappingCount() - skipped, 'layout')}`);
          if (skipped > 0) {
            const m = `${plural(skipped, 'saved layout')} could not be written (its mapping no longer fits its headers) and ${skipped === 1 ? 'was' : 'were'} left out.`;
            say(m);
            opts.onLog('warn', m);
          }
        } catch (e) { opts.onLog('error', `Failed to save column mappings: ${errMsg(e)}`); }
      });
      mapImport.addEventListener('click', async () => {
        try {
          const text = await opts.pick('Select a column-mappings file to import');
          if (text === null) return;
          const entries = parseMappingsFile(text, m => { say(m); opts.onLog('warn', m); });
          if (entries.length === 0) { if (!status.textContent) say('That file holds no usable layouts.'); return; }
          const r = importMappings(entries);
          if (!r.saved) { say('tsmap could not store them: this browser is not letting it keep settings.'); opts.onLog('error', 'Column mappings could not be stored'); return; }
          const msg = `Column mappings imported: ${r.added} added, ${r.replaced} replaced.`;
          say(msg);
          opts.onLog('info', msg);
          refreshMaps();
        } catch (e) { opts.onLog('error', `Failed to import column mappings: ${errMsg(e)}`); }
      });
      const mapRow = document.createElement('div');
      mapRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      mapRow.append(mapExport, mapImport, mapCount);
      maps.wrap.append(mapRow);
      refreshMaps();

      // ── Other settings ───────────────────────────────────────────────────
      const settings = section('Other saved settings',
        'Theme, wafer-map preferences, pinned tests, saved plots and filters, and remembered test selections. '
        + `Not included: ${notIncluded()}. `
        + 'Importing replaces the settings you choose and reloads tsmap.');
      const setBody = document.createElement('div');
      setBody.style.cssText = 'display:flex;flex-direction:column;gap:8px';
      settings.wrap.append(setBody);

      const showStart = () => {
        setBody.innerHTML = '';
        const present = portableSettings(read);
        const exp = button('Export…');
        exp.disabled = present.length === 0;
        exp.style.opacity = present.length === 0 ? '0.5' : '';
        exp.addEventListener('click', async () => {
          try {
            const items = portableSettings(read);
            await opts.save(writeSettingsFile(items), 'tsmap-settings.json', 'Save the settings to a file');
            opts.onLog('info', `Settings saved: ${plural(items.length, 'setting')} (${items.map(i => i.label).join(', ')})`);
          } catch (e) { opts.onLog('error', `Failed to save settings: ${errMsg(e)}`); }
        });
        const imp = button('Import…');
        imp.addEventListener('click', async () => {
          try {
            const text = await opts.pick('Select a settings file to import');
            if (text === null) return;
            const warns: string[] = [];
            const { items } = parseSettingsFile(text, m => { warns.push(m); opts.onLog('warn', m); });
            if (items.length === 0) { say(warns[0] ?? 'That file holds no settings tsmap can import.'); return; }
            say(warns.length ? `${plural(warns.length, 'item')} in the file ${warns.length === 1 ? 'was' : 'were'} left out; see the log.` : '');
            showChoose(items);
          } catch (e) { opts.onLog('error', `Failed to import settings: ${errMsg(e)}`); }
        });
        const info = document.createElement('div');
        info.style.cssText = 'color:var(--text-dim)';
        info.textContent = present.length === 0 ? 'Nothing saved yet.' : `${plural(present.length, 'setting')} saved: ${present.map(i => i.label).join(', ')}.`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        row.append(exp, imp);
        setBody.append(row, info);
      };

      const showChoose = (items: SettingItem[]) => {
        setBody.innerHTML = '';
        const chosen = new Set(items.map(i => i.key));
        const had = new Set(portableSettings(read).map(i => i.key));
        const list = document.createElement('div');
        for (const item of items) {
          const row = document.createElement('label');
          row.className = 'click-row';
          row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:6px 4px;border-top:1px solid var(--border-mid);cursor:pointer';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = true;
          box.style.cssText = 'margin-top:2px;flex-shrink:0';
          const text = document.createElement('div');
          const t = document.createElement('div');
          t.style.cssText = 'color:var(--text-primary);font-weight:600';
          t.textContent = item.label;
          const d = document.createElement('div');
          d.style.cssText = 'color:var(--text-muted)';
          d.textContent = had.has(item.key) ? `Replaces what you have now. ${item.description}` : item.description;
          text.append(t, d);
          box.addEventListener('change', () => { if (box.checked) chosen.add(item.key); else chosen.delete(item.key); sync(); });
          row.append(box, text);
          list.append(row);
        }
        const warn = document.createElement('div');
        warn.style.cssText = 'color:var(--warn-text)';
        warn.textContent = opts.lotOpen
          ? 'tsmap reloads after the import, which closes the lot that is open. Loaded wafer data is not saved by this.'
          : 'tsmap reloads after the import.';
        const cancel = button('Cancel');
        cancel.addEventListener('click', () => { say(''); showStart(); });
        const go = button('Import', true);
        const sync = () => {
          go.textContent = chosen.size === 0 ? 'Import' : `Import ${chosen.size} and reload`;
          go.disabled = chosen.size === 0;
          go.style.opacity = chosen.size === 0 ? '0.5' : '';
        };
        go.addEventListener('click', () => {
          const picked = items.filter(i => chosen.has(i.key));
          const n = applySettings(picked, (k, v) => localStorage.setItem(k, v));
          if (n === 0) {
            // Nothing reached storage (denied or full): reloading would close the lot for no change.
            say('tsmap could not store the settings: this browser is not letting it keep them. Nothing was changed.');
            opts.onLog('error', 'Settings could not be stored; nothing was imported');
            return;
          }
          const short = n < picked.length ? ` ${picked.length - n} could not be stored.` : '';
          opts.onLog(n < picked.length ? 'warn' : 'info', `Settings imported: ${plural(n, 'setting')} (${picked.map(i => i.label).join(', ')}).${short} Reloading.`);
          say(`Imported.${short} Reloading tsmap…`);
          go.disabled = true;
          setTimeout(opts.reload, 400);
        });
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
        row.append(cancel, go);
        sync();
        setBody.append(list, warn, row);
      };
      showStart();

      const close = button('Close');
      close.addEventListener('click', () => handle.close());
      const foot = document.createElement('div');
      foot.style.cssText = 'display:flex;justify-content:flex-end';
      foot.append(close);
      body.append(maps.wrap, settings.wrap, status, foot);
    },
  });
}

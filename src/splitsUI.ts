// Modal UI for assigning wafers to user-defined splits (process corners like
// TT/FF/FS, or any ad-hoc experiment group). Bulk-select rows (checkbox +
// shift-click, mirroring the test selector's UX) then assign/clear a split
// name; save/load round-trips the assignment as CSV via the platform adapter.
// Splits themselves are just a per-wafer metadata field (see splits.ts) — this
// module only owns the assignment UI.

import type { WaferData } from './types';
import { createRangeSelection } from './listSelection';
import { attachTooltip } from './tooltip';
import { openModal } from './modal';
import { getSplitLabel, setSplitLabel, clearAllSplits, listSplitValues, parseSplitsCsv, formatSplitsCsv, applySplitRows, waferLabels } from './splits';

export interface SplitsUIOptions {
  onSave: (csv: string) => Promise<void>;
  onLoad: () => Promise<string | null>;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Called after every assignment change (assign, clear, or CSV load), so the
   * caller can re-render the Group-by-driven charts and persist to localStorage. */
  onChange: () => void;
  /** Whether assignments will survive the session — false when the data carries
   *  no lot ID, in which case the footer says so rather than promising it. */
  persistable: boolean;
  /** Whether wafer map/gallery labels currently show the " · <split>" suffix. */
  showSplitSuffix: boolean;
  /** Called when the "Show split in wafer map labels" checkbox is toggled. */
  onToggleSuffix: (show: boolean) => void;
  /** Confirmation prompt for the destructive "Clear all" action. Defaults to
   * `window.confirm`, matching the test selector's `onAsk` fallback. */
  onAsk?: (message: string) => Promise<boolean>;
}

export function showSplitsModal(wafers: WaferData[], options: SplitsUIOptions): void {
  const selected = new Set<number>(); // indices into `wafers`
  let searchQuery = '';
  // Unique per row: two lots' W01 read "LOT-A · W01" / "LOT-B · W01" here too,
  // so the rows being assigned are the rows the user thinks they are.
  const rowLabels = waferLabels(wafers, false);

  const modalHandle = openModal({
    title: `Wafer splits (${wafers.length} wafer${wafers.length !== 1 ? 's' : ''})`,
    sizing: 'content',
    bodyOverflow: 'hidden',
    mount(body) {
      body.style.cssText += 'padding:16px;gap:10px;font-size:12px;color:var(--text-light)';

      // Status banner. Empty state (no wafer has a split yet): guidance + a
      // Load shortcut — the moment a first-time user (fresh off the test
      // selector's "select all to proceed" flow) is most likely to assume they
      // must select everything. Assigned state: a summary ("2 splits assigned
      // to 6 of 13 wafers"), so e.g. the auto-restored sample-data splits read
      // as "already done" rather than a task waiting to be repeated.
      const statusBanner = document.createElement('div');
      statusBanner.style.cssText = [
        'display:flex;align-items:center;gap:10px;flex-wrap:wrap',
        'border:1px solid var(--border-mid);border-radius:var(--radius-control);padding:8px 10px',
        'font-size:12px;color:var(--text-secondary)',
      ].join(';');
      const statusBannerText = document.createElement('span');
      statusBannerText.style.cssText = 'flex:1;min-width:200px';
      const statusBannerLoadBtn = document.createElement('button');
      statusBannerLoadBtn.textContent = 'Load splits…';
      statusBannerLoadBtn.className = 'btn-secondary';
      statusBannerLoadBtn.addEventListener('click', () => { void loadSplits(); });
      statusBanner.append(statusBannerText, statusBannerLoadBtn);

      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Filter by wafer ID or source file…';
      searchInput.style.cssText = [
        'padding:6px 8px;border:1px solid var(--border-mid);border-radius:var(--radius-control)',
        'background:var(--bg-input);color:var(--text-secondary);font-size:12px',
      ].join(';');
      searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); renderList(); });

      const suffixLabel = document.createElement('label');
      suffixLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-secondary)';
      suffixLabel.className = 'click-row';
      const suffixCb = document.createElement('input');
      suffixCb.type = 'checkbox';
      suffixCb.checked = options.showSplitSuffix;
      suffixCb.style.cssText = 'cursor:pointer';
      suffixCb.addEventListener('change', () => {
        options.onToggleSuffix(suffixCb.checked);
        options.onChange();
      });
      suffixLabel.append(suffixCb, document.createTextNode('Show split in wafer map labels'));

      const bulkRow = document.createElement('div');
      bulkRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = 'Select all';
      selectAllBtn.className = 'btn-secondary';
      selectAllBtn.addEventListener('click', () => { for (const [i] of getVisible()) selected.add(i); renderList(); });
      const selectNoneBtn = document.createElement('button');
      selectNoneBtn.textContent = 'Select none';
      selectNoneBtn.className = 'btn-secondary';
      selectNoneBtn.addEventListener('click', () => { for (const [i] of getVisible()) selected.delete(i); renderList(); });
      bulkRow.append(selectAllBtn, selectNoneBtn);

      const listContainer = document.createElement('div');
      listContainer.style.cssText = [
        'overflow-y:auto;flex:1;min-height:0',
        'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
        'font-family:ui-monospace,"Cascadia Code","Segoe UI Mono",monospace;font-size:12px',
      ].join(';');

      /** Range selection — shared with the file filter table and test selector
       *  (listSelection.ts). Replaces a local `lastClickedVisibleIndex`, which
       *  anchored on a POSITION in the visible array and so pointed at the wrong
       *  wafer once the search box narrowed the list. */
      const rangeSel = createRangeSelection<number>({
        visibleIds: () => getVisible().map(([i]) => i),
        isSelected: (i) => selected.has(i),
        setSelected: (i, on) => { if (on) selected.add(i); else selected.delete(i); },
        onChanged: () => { renderList(); updateUi(); },
        focusRow: (n) => {
          const boxes = listContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
          boxes[n]?.focus();
        },
      });

      function getVisible(): Array<[number, WaferData]> {
        return wafers
          .map((w, i): [number, WaferData] => [i, w])
          .filter(([i, w]) => {
            if (!searchQuery) return true;
            const hay = `${rowLabels[i]} ${w.source?.sourceFile ?? ''} ${getSplitLabel(w) ?? ''}`.toLowerCase();
            return hay.includes(searchQuery);
          });
      }

      function renderList(): void {
        listContainer.innerHTML = '';
        const visible = getVisible();
        for (let vi = 0; vi < visible.length; vi++) {
          const [i, w] = visible[vi];
          const row = document.createElement('label');
          row.style.cssText = [
            'display:flex;align-items:center;gap:8px',
            'padding:4px 8px;cursor:pointer',
            'border-bottom:1px solid var(--border-mid)',
          ].join(';');
          row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-hover-row)'; });
          row.addEventListener('mouseleave', () => { row.style.background = ''; });

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selected.has(i);
          cb.style.cssText = 'flex-shrink:0;cursor:pointer';
          cb.addEventListener('change', () => {
            if (cb.checked) selected.add(i); else selected.delete(i);
            rangeSel.setAnchor(i);   // only a plain toggle moves the anchor
            updateUi();
          });
          cb.addEventListener('click', (evt) => {
            if (rangeSel.handleClick(i, evt)) evt.preventDefault();
          });
          cb.addEventListener('keydown', (evt) => {
            if (rangeSel.handleKeydown(i, evt)) evt.preventDefault();
          });

          const idSpan = document.createElement('span');
          idSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          idSpan.textContent = rowLabels[i];

          const srcSpan = document.createElement('span');
          srcSpan.style.cssText = 'color:var(--text-dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          srcSpan.textContent = w.source?.sourceFile ?? '';

          const splitSpan = document.createElement('span');
          splitSpan.style.cssText = 'min-width:80px;flex-shrink:0;text-align:right;color:var(--accent)';
          splitSpan.textContent = getSplitLabel(w) ?? '—';

          row.append(cb, idSpan, srcSpan, splitSpan);
          listContainer.appendChild(row);
        }
        updateUi();
      }

      // ── Assign row ────────────────────────────────────────────────────────
      const assignRow = document.createElement('div');
      assignRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';

      const splitInput = document.createElement('input');
      splitInput.type = 'text';
      splitInput.placeholder = 'Split name (e.g. TT, FF, FS)…';
      splitInput.style.cssText = [
        'flex:1;min-width:140px;padding:6px 8px',
        'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
        'background:var(--bg-input);color:var(--text-secondary);font-size:12px',
      ].join(';');

      // Quick-fill chips for split names already in use. Sits directly under the
      // name field it fills — it used to be appended after the selection hint,
      // several rows below, which read as an unrelated list rather than as
      // suggestions for the input.
      const existingRow = document.createElement('div');
      existingRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center';

      /** (Re)build the chip row from the wafers' current split values. Single
       *  implementation — the initial build and the post-change rebuild were
       *  two verbatim copies of this loop, so a change to chip styling or
       *  behaviour had to be made twice to take effect everywhere. */
      function rebuildChips(): void {
        existingRow.innerHTML = '';
        const values = listSplitValues(wafers);
        if (values.length === 0) { existingRow.style.display = 'none'; return; }
        existingRow.style.display = '';

        const caption = document.createElement('span');
        caption.textContent = 'In use:';
        caption.style.cssText = 'font-size:12px;color:var(--text-dim)';
        existingRow.appendChild(caption);

        for (const v of values) {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.textContent = v;
          attachTooltip(chip, `Use “${v}” as the split name`);
          chip.className = 'btn-chip';
          chip.addEventListener('click', () => { splitInput.value = v; splitInput.focus(); });
          existingRow.appendChild(chip);
        }
      }

      // Both action buttons are disabled while nothing is selected (see
      // updateUi) — selection here is transient scope for the next action,
      // unlike the test selector where checked = imported. A disabled button
      // plus the hint line below makes that legible instead of a silent no-op.
      const assignBtn = document.createElement('button');
      assignBtn.textContent = 'Assign to selected';
      assignBtn.className = 'btn-secondary';
      const doAssign = () => {
        const label = splitInput.value.trim();
        if (!label || selected.size === 0) return;
        for (const i of selected) setSplitLabel(wafers[i], label);
        options.onLog('info', `Assigned ${selected.size} wafer${selected.size !== 1 ? 's' : ''} to split "${label}"`);
        selected.clear();
        renderList();
        rebuildChips();
        options.onChange();
      };
      assignBtn.addEventListener('click', doAssign);
      // Enter in the name field commits, the ordinary gesture after typing a
      // label. Without it the field silently swallowed Enter and the only way
      // to apply was to reach for the mouse.
      splitInput.addEventListener('keydown', (evt) => {
        if (evt.key !== 'Enter') return;
        evt.preventDefault();
        doAssign();
      });

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear split';
      clearBtn.className = 'btn-secondary';
      clearBtn.addEventListener('click', () => {
        if (selected.size === 0) return;
        // Logged like every other mutating action here (assign, clear all,
        // load) — this was the one that changed data silently, so the log gave
        // an incomplete account of what had happened to the lot.
        const n = selected.size;
        for (const i of selected) setSplitLabel(wafers[i], undefined);
        options.onLog('info', `Cleared the split from ${n} wafer${n !== 1 ? 's' : ''}`);
        selected.clear();
        renderList();
        rebuildChips();
        options.onChange();
      });

      // Distinct from "Clear split" (selected rows only) — this wipes every
      // wafer's assignment regardless of the current filter/selection, so it
      // gets its own confirm step and a "danger" hover treatment (matches the
      // main toolbar's Clear/reset button) rather than living in the bulk row.
      const clearAllBtn = document.createElement('button');
      clearAllBtn.textContent = 'Clear all';
      clearAllBtn.className = 'btn-secondary';
      clearAllBtn.addEventListener('mouseenter', () => { clearAllBtn.style.borderColor = 'var(--error-text)'; clearAllBtn.style.color = 'var(--error-text)'; });
      clearAllBtn.addEventListener('mouseleave', () => { clearAllBtn.style.borderColor = 'var(--border-mid)'; clearAllBtn.style.color = 'var(--text-secondary)'; });
      clearAllBtn.addEventListener('click', async () => {
        const assignedCount = wafers.filter(w => getSplitLabel(w) !== undefined).length;
        if (assignedCount === 0) return;
        const ask = options.onAsk ?? ((msg) => Promise.resolve(window.confirm(msg)));
        const ok = await ask(`Clear the split assignment from all ${assignedCount} assigned wafer${assignedCount !== 1 ? 's' : ''}?`);
        if (!ok) return;
        clearAllSplits(wafers);
        selected.clear();
        renderList();
        rebuildChips();
        options.onLog('info', `Cleared split assignment from ${assignedCount} wafer${assignedCount !== 1 ? 's' : ''}`);
        options.onChange();
      });

      assignRow.append(splitInput, assignBtn, clearBtn, clearAllBtn);

      const selectionHint = document.createElement('div');
      selectionHint.style.cssText = 'font-size:12px;color:var(--text-dim);opacity:0.8';
      selectionHint.textContent = 'Tick wafers above to enable Assign / Clear split.';

      function updateUi(): void {
        const n = selected.size;
        assignBtn.textContent = n > 0 ? `Assign to ${n} selected` : 'Assign to selected';
        for (const btn of [assignBtn, clearBtn]) {
          btn.disabled = n === 0;
          btn.style.opacity = n === 0 ? '0.5' : '';
          btn.style.cursor = n === 0 ? 'default' : 'pointer';
        }
        selectionHint.style.display = n === 0 ? '' : 'none';
        const assignedCount = wafers.filter(w => getSplitLabel(w) !== undefined).length;
        if (assignedCount === 0) {
          statusBannerText.textContent = 'No splits assigned yet — tick wafers and assign a split name below, or load a saved assignment from CSV.';
          statusBannerLoadBtn.style.display = '';
        } else {
          const splitCount = listSplitValues(wafers).length;
          statusBannerText.textContent = `${splitCount} split${splitCount !== 1 ? 's' : ''} assigned to ${assignedCount} of ${wafers.length} wafers.`;
          statusBannerLoadBtn.style.display = 'none';
        }
      }

      // ── Save / load ───────────────────────────────────────────────────────
      const ioRow = document.createElement('div');
      ioRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save splits…';
      saveBtn.className = 'btn-secondary';
      saveBtn.addEventListener('click', async () => {
        try {
          await options.onSave(formatSplitsCsv(wafers));
          options.onLog('info', 'Splits saved');
        } catch (e) {
          options.onLog('error', `Failed to save splits: ${e instanceof Error ? e.message : String(e)}`);
        }
      });

      // Shared by the footer "Load splits…" button and the empty-state banner's.
      async function loadSplits(): Promise<void> {
        let text: string | null;
        try {
          text = await options.onLoad();
        } catch (e) {
          options.onLog('error', `Failed to load splits: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        if (text === null) return;
        const parsedRows = parseSplitsCsv(text);
        if (parsedRows.length === 0) { options.onLog('warn', 'Splits file contained no valid rows'); return; }
        const { matched, unmatched, ambiguous } = applySplitRows(wafers, parsedRows);
        options.onLog('info', `Splits loaded: ${matched} wafer${matched !== 1 ? 's' : ''} matched${unmatched > 0 ? `, ${unmatched} row${unmatched !== 1 ? 's' : ''} unmatched` : ''}`);
        // Never applied to every wafer sharing the ID — say so, and how to fix it.
        if (ambiguous > 0) {
          options.onLog('warn', `${ambiguous} splits row${ambiguous !== 1 ? 's' : ''} skipped: `
            + 'the wafer ID is shared by several loaded wafers (different lots, or a retest), and the row does not say which. '
            + 'Add a lot (and, for a retest, occurrence) column — Save splits… writes one.');
        }
        renderList();
        rebuildChips();
        options.onChange();
      }

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load splits…';
      loadBtn.className = 'btn-secondary';
      loadBtn.addEventListener('click', () => { void loadSplits(); });

      ioRow.append(saveBtn, loadBtn);

      // Footer: assignments/clears/CSV-loads above all apply immediately (no
      // separate "save" step) — Done just closes the window. Say so explicitly
      // and put a clear primary action there instead of relying on the header
      // close (X), which reads as "cancel" rather than "I'm finished".
      const footerRow = document.createElement('div');
      footerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

      const footerNote = document.createElement('span');
      // Must reflect reality: without a lot ID tsmap deliberately does not
      // remember splits (see splitsFingerprint), and a footer promising it would
      // be a plain falsehood on exactly the loads where it matters.
      footerNote.textContent = options.persistable
        ? 'Changes apply immediately, and are remembered for this lot on this machine — including clearing them.'
        : 'Changes apply immediately. They are NOT remembered between sessions: this data carries no lot ID, '
          + 'so tsmap cannot tell it apart from another file with the same wafer IDs. Use Save splits… to keep them.';
      footerNote.style.cssText = 'font-size:12px;color:var(--text-dim);opacity:0.8';

      const doneBtn = document.createElement('button');
      doneBtn.textContent = 'Done';
      doneBtn.className = 'btn-primary';
      doneBtn.addEventListener('click', () => modalHandle.close());

      footerRow.append(footerNote, doneBtn);

      // Order matters: the quick-fill chips go immediately under the assign row
      // whose input they populate, before the selection hint — they were
      // previously after it, which detached them from the field they serve.
      body.append(statusBanner, searchInput, suffixLabel, bulkRow, listContainer, assignRow, existingRow, selectionHint, ioRow, footerRow);
      rebuildChips();
      renderList();
    },
  });
}

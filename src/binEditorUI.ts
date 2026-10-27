// The **Bin definitions…** dialog: an editable table of every hard and soft bin (name, pass,
// colour), with the lot's yield before and after. Names and colours are cosmetic; a changed pass
// flag moves every yield figure in the session, so it is shown, confirmed and logged. The model is
// `binEditor.ts`; the table is `definitionsTable.ts`.

import { openModal } from './modal';
import { makeLoadDefinitionsButton, type RecentLoadRow } from './recentDefinitionsUI';
import { mountDefinitionsTable, TableModel, type ColumnSpec, type TableRow } from './definitionsTable';
import { parseBinDefsFile, formatBinDefsCsv, parseHexColor, type BinDefEntry } from './binDefs';
import {
  applyEntriesToModel, rowsToEntries, rowsToState, passEdited, yieldPercent, binRowId, compareBinRows, unresolvedMixed,
  type BinApplyResult, type YieldCount,
} from './binEditor';
import { errMsg } from './lib';

export interface BinEditorOptions {
  rows: TableRow[];
  /** Hard bins the loaded files disagree about (see `mixedPassBins`). */
  mixed: ReadonlySet<number>;
  /** The lot's yield as each file counts it now. Absent before a file is loaded (the column mapping), when there is none. */
  yieldNow?: YieldCount;
  /** The lot's yield if every file counted exactly these hard bins as pass. */
  yieldWith?: (pass: ReadonlySet<number>) => YieldCount;
  /** Before a file is loaded there is no yield to move, so a pass edit needs no confirmation and bins are added by number. */
  preload?: boolean;
  /** Replaces the introduction. */
  intro?: string;
  /** Heading of the die-count column; `Dies` for a loaded lot. */
  countsHeader?: string;
  pick: () => Promise<string | null>;
  recents: () => RecentLoadRow[];
  recentNote?: string;
  save: (csv: string) => Promise<void>;
  onApply: (result: BinApplyResult, entries: BinDefEntry[]) => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

const fmtPct = (v: number | undefined): string => (v === undefined ? 'no dies' : `${v.toFixed(2)}%`);

export function showBinEditor(opts: BinEditorOptions): void {
  const model = new TableModel(opts.rows);
  const hasDies = !!opts.yieldNow && !!opts.yieldWith && opts.yieldNow.total > 0;

  const modalHandle = openModal({
    title: 'Bin definitions',
    sizing: 'content',
    contentSize: { width: 'min(94vw, 760px)', height: 'min(88vh, 640px)' },
    bodyOverflow: 'hidden',
    mount(body) {
      body.style.cssText += 'padding:16px;gap:10px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent = opts.intro ?? 'Name bins, choose their colours and say which hard bins count as pass. Nothing changes in the lot '
        + 'until Apply. A loaded file lands here as edits, so you can check it first.';

      const note = document.createElement('div');
      note.setAttribute('role', 'status');
      note.style.cssText = 'min-height:1.2em;color:var(--warn-text)';
      const setNote = (m: string) => { note.textContent = m; };

      const columns: ColumnSpec[] = [
        { id: 'type', header: 'Type', kind: 'readonly', width: '56px' },
        { id: 'bin', header: 'Bin', kind: 'readonly', width: '56px' },
        { id: 'count', header: opts.countsHeader ?? 'Dies', kind: 'readonly', width: '72px', show: c => Number(c ?? 0).toLocaleString() },
        { id: 'name', header: 'Name', kind: 'text', placeholder: 'unnamed' },
        {
          id: 'pass', header: 'Pass', kind: 'toggle', width: '86px', toggleLabels: ['Fail', 'Pass'],
          tooltip: 'Whether a die in this hard bin counts as pass. Soft bins have no pass flag.',
          disabled: r => r.cells.type === 'soft',
          mixed: r => r.cells.type === 'hard' && r.cells.pass === undefined,
        },
        {
          id: 'color', header: 'Colour', kind: 'colour', width: '130px', placeholder: '#rrggbb',
          normalise: t => (t === '' ? undefined : (parseHexColor(t) ?? null)),
          invalidNote: 'A colour is a hex value such as #1f77b4.',
        },
      ];

      const table = mountDefinitionsTable(model, {
        columns, label: 'bin definitions', searchColumns: ['name', 'bin', 'type'], onNote: setNote,
        bulk: [
          { label: 'Mark pass', apply: (ids, m) => { for (const id of ids) if (m.get(id, 'type') === 'hard') m.set(id, 'pass', true); } },
          { label: 'Mark fail', apply: (ids, m) => { for (const id of ids) if (m.get(id, 'type') === 'hard') m.set(id, 'pass', false); } },
        ],
      });

      // Yield: shown whenever a pass flag is edited, so the cost is visible before Apply.
      const yieldLine = document.createElement('div');
      yieldLine.setAttribute('role', 'status');
      yieldLine.style.cssText = 'color:var(--text-secondary)';

      const confirmBar = document.createElement('div');
      confirmBar.style.cssText = [
        'display:none;align-items:center;gap:10px;flex-wrap:wrap',
        'border:1px solid var(--warn-text);border-radius:var(--radius-control);padding:8px 10px',
      ].join(';');
      const confirmText = document.createElement('span');
      confirmText.style.cssText = 'flex:1;min-width:220px';
      const confirmBack = document.createElement('button');
      confirmBack.className = 'btn-secondary';
      confirmBack.textContent = 'Back';
      const confirmGo = document.createElement('button');
      confirmGo.className = 'btn-primary';
      confirmGo.textContent = 'Change pass bins';
      confirmBar.append(confirmText, confirmBack, confirmGo);

      const proposedYield = (): { now: number | undefined; next: number | undefined } | null => {
        if (!hasDies || !passEdited(model)) return null;
        const pass = new Set(model.rows().filter(r => r.cells.type === 'hard' && r.cells.pass === true).map(r => Number(r.cells.bin)));
        return { now: yieldPercent(opts.yieldNow!), next: yieldPercent(opts.yieldWith!(pass)) };
      };

      const apply = document.createElement('button');
      const refreshChrome = () => {
        const y = proposedYield();
        if (opts.preload) {
          yieldLine.textContent = '';
        } else if (passEdited(model)) {
          yieldLine.textContent = y
            ? `Yield for the lot: ${fmtPct(y.now)} now, ${fmtPct(y.next)} with these pass bins.`
            : 'Pass bins changed.';
          if (opts.mixed.size > 0) yieldLine.textContent += ' Files that counted different bins as pass will all use this set.';
        } else {
          yieldLine.textContent = hasDies ? `Yield for the lot: ${fmtPct(yieldPercent(opts.yieldNow!))}.` : '';
        }
        const n = model.editedIds().length;
        apply.textContent = n > 0 ? `Apply (${n} edited)` : 'Apply';
        apply.disabled = n === 0;
        apply.style.opacity = n === 0 ? '0.5' : '';
        revertAll.disabled = n === 0;
        revertAll.style.opacity = n === 0 ? '0.5' : '';
        if (n === 0) confirmBar.style.display = 'none';
      };

      const doApply = () => {
        const result = rowsToState(model);
        const open = result.passChanged ? unresolvedMixed(model) : [];
        if (open.length > 0) {
          // Applying now would count each of these as fail for every file, which the files never said.
          confirmBar.style.display = 'none';
          setNote(`Choose Pass or Fail for the Mixed bin${open.length > 1 ? 's' : ''} ${open.join(', ')} first: the files disagree about ${open.length > 1 ? 'them' : 'it'}, and a pass change applies to every file.`);
          return;
        }
        if (result.passChanged && !result.passHbins) {
          // Nothing ticked cannot be stored: no pass bins reads as "unstated", which wmap answers with bin 1.
          confirmBar.style.display = 'none';
          setNote('At least one hard bin must count as pass.');
          return;
        }
        opts.onApply(result, rowsToEntries(model.rows()));
        const n = model.editedIds().length;
        opts.onLog('info', `Bin definitions ${opts.preload ? 'set' : 'applied'}: ${n} bin${n !== 1 ? 's' : ''} edited.`);
        if (result.passChanged && !opts.preload) {
          const y = proposedYield();
          opts.onLog('warn', `Pass bins changed to ${result.passHbins?.join(', ') ?? 'none'}`
            + (y ? `: lot yield ${fmtPct(y.now)} → ${fmtPct(y.next)}.` : '.'));
        }
        modalHandle.close();
      };

      apply.className = 'btn-primary';
      apply.addEventListener('click', () => {
        if (!passEdited(model) || opts.preload) { doApply(); return; }
        if (unresolvedMixed(model).length > 0) { doApply(); return; }   // doApply names them
        const y = proposedYield();
        confirmText.textContent = y
          ? `This changes which hard bins count as pass. Lot yield goes from ${fmtPct(y.now)} to ${fmtPct(y.next)}, and every finding, summary and report follows.`
          : 'This changes which hard bins count as pass, and every finding, summary and report follows.';
        confirmBar.style.display = 'flex';
        confirmGo.focus();
      });
      confirmBack.addEventListener('click', () => { confirmBar.style.display = 'none'; });
      confirmGo.addEventListener('click', doApply);

      const revertAll = document.createElement('button');
      revertAll.className = 'btn-secondary';
      revertAll.textContent = 'Revert all';
      revertAll.addEventListener('click', () => { model.revertAll(); setNote(''); });

      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => modalHandle.close());

      const save = document.createElement('button');
      save.className = 'btn-secondary';
      save.textContent = 'Save…';
      save.addEventListener('click', async () => {
        try {
          await opts.save(formatBinDefsCsv(rowsToEntries(model.rows())));
          opts.onLog('info', 'Bin definitions saved');
        } catch (e) {
          opts.onLog('error', `Failed to save bin definitions: ${errMsg(e)}`);
        }
      });

      const load = makeLoadDefinitionsButton({
        label: 'Load…',
        pick: opts.pick,
        recents: opts.recents,
        note: opts.recentNote,
        onText: text => {
          const entries = parseBinDefsFile(text, (line, msg) => opts.onLog('warn', `Bin definitions line ${line}: ${msg}`));
          if (entries.length === 0) { opts.onLog('warn', 'Bin definitions file contained no valid rows'); return; }
          const { changed, added } = applyEntriesToModel(model, entries);
          setNote(`Loaded ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}: ${changed} changed, ${added} added. Apply to keep them.`);
        },
        onError: msg => opts.onLog('error', `Failed to load bin definitions: ${msg}`),
      });

      // Before a file is loaded the sample may miss a rare bin, so a bin can be added by its number.
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:none;align-items:center;gap:8px;flex-wrap:wrap';
      if (opts.preload) {
        addRow.style.display = 'flex';
        const num = document.createElement('input');
        num.type = 'text';
        num.inputMode = 'numeric';
        num.placeholder = 'Bin number';
        num.setAttribute('aria-label', 'Number of the bin to add');
        num.style.cssText = 'width:110px;padding:4px 6px;font-size:12px;border:1px solid var(--border-mid);border-radius:var(--radius-control);background:var(--bg-input);color:var(--text-secondary)';
        const addBin = (type: 'hard' | 'soft') => {
          const raw = num.value.trim();
          if (!/^\d+$/.test(raw) || Number(raw) > 65534) { setNote('A bin number is a whole number from 0 to 65534.'); return; }
          const id = binRowId(type, Number(raw));
          if (model.row(id)) { setNote(`${type === 'hard' ? 'Hard' : 'Soft'} bin ${raw} is already listed.`); return; }
          model.add({ id, cells: { type, bin: raw, count: '0', name: undefined, pass: type === 'hard' ? false : undefined, color: undefined } }, compareBinRows);
          num.value = '';
          setNote('');
        };
        num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBin('hard'); } });
        const hard = document.createElement('button');
        hard.className = 'btn-secondary';
        hard.textContent = 'Add hard bin';
        hard.addEventListener('click', () => addBin('hard'));
        const soft = document.createElement('button');
        soft.className = 'btn-secondary';
        soft.textContent = 'Add soft bin';
        soft.addEventListener('click', () => addBin('soft'));
        addRow.append(num, hard, soft);
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      footer.append(revertAll, save, load, spacer, cancel, apply);

      body.append(intro, table.el, addRow, note, yieldLine, confirmBar, footer);
      model.subscribe(refreshChrome);
      refreshChrome();
    },
  });
}


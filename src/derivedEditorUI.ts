// The derived-test editor: add, edit and delete the tests wmap computes per die from other tests. Opened from
// the test selector's **Derived tests…** button. Each row's expression is checked by wmap as it is typed (the
// model is `derivedEditor.ts`); Apply is refused while any row would be dropped, so what is applied is what
// gets computed. Like every change in the selector it takes effect when the tests are imported.

import { openModal } from './modal';
import { mountDefinitionsTable, TableModel, type ColumnSpec } from './definitionsTable';
import { parseLimitText } from './testEditor';
import {
  buildDerivedRows, newDerivedRow, checkRow, rowsToEntries, editProblems, type DerivedContext, type RowCheck,
} from './derivedEditor';
import type { TableRow } from './definitionsTable';
import type { TestListEntry } from './testSelectorUI';

export interface DerivedEditorOptions {
  entries: TestListEntry[];
  ctx: DerivedContext;
  /** The derived tests as the table stands; the caller replaces its list with these. */
  onApply: (entries: TestListEntry[]) => void;
  onClosed: () => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export function showDerivedEditor(opts: DerivedEditorOptions): void {
  const model = new TableModel(buildDerivedRows(opts.entries));
  const usedNumbers = () => new Set<number>([
    ...opts.ctx.measured.map(d => d.testNumber),
    ...model.rows().map(r => Number(r.cells.num)).filter(n => Number.isFinite(n)),
  ]);

  const modalHandle = openModal({
    title: 'Derived tests',
    sizing: 'content',
    contentSize: { width: 'min(96vw, 1180px)', height: 'min(88vh, 680px)' },
    bodyOverflow: 'hidden',
    onClose: opts.onClosed,
    mount(body) {
      body.style.cssText += 'padding:16px;gap:10px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent = 'A derived test is computed for every die from other tests: t[1002] / t[1001], mean(t[1010..1015]), '
        + 'all(testPass[2001..2004]). Each expression is checked as you type, by the same rules the map is built with. '
        + 'Apply is refused while a test would be dropped; changes take effect when the tests are imported.';

      const note = document.createElement('div');
      note.setAttribute('role', 'status');
      note.style.cssText = 'min-height:1.2em;color:var(--warn-text)';
      const setNote = (m: string) => { note.textContent = m; };

      const others = (row: { id: string }) => model.rows().filter(r => r.id !== row.id);
      // A row is checked once per change, not once per column that shows the answer: the Check and Reads columns both read
      // it, and every change redraws every row (a test's number or expression can change what another reads). The version
      // is bumped before the table is mounted, so it is current when the table redraws.
      let version = 0;
      model.subscribe(() => { version++; });
      const memo = new Map<string, { version: number; check: RowCheck }>();
      const checked = (row: TableRow): RowCheck => {
        const hit = memo.get(row.id);
        if (hit && hit.version === version) return hit.check;
        const check = checkRow(row, others(row), opts.ctx);
        memo.set(row.id, { version, check });
        return check;
      };
      const limit = (id: string, header: string): ColumnSpec => ({
        id, header, kind: 'text', width: '72px', placeholder: '—',
        normalise: t => parseLimitText(t), invalidNote: `${header} must be a number.`,
      });
      const columns: ColumnSpec[] = [
        { id: 'num', header: 'Test', kind: 'text', width: '84px', tooltip: 'The test number. It must be unused: a derived test never replaces a measured one.',
          normalise: t => (/^\d+$/.test(t) ? t : null), invalidNote: 'A test number is a whole number.' },
        { id: 'name', header: 'Name', kind: 'text', width: '140px', placeholder: 'Derived' },
        { id: 'expression', header: 'Expression', kind: 'text', placeholder: 't[1002] / t[1001]',
          tooltip: 'Reads t[n] (a value), testPass[n] (the tester’s verdict), specPass[n] (a spec-limit verdict) and diePass(); a range such as t[1010..1015] is reduced with mean, min, max, sum, all, any and the like.' },
        { id: 'units', header: 'Units', kind: 'text', width: '64px', placeholder: '—' },
        limit('loLimit', 'Low limit'),
        limit('hiLimit', 'High limit'),
        { id: 'parametric', header: 'Type', kind: 'toggle', width: '104px', toggleLabels: ['Functional', 'Parametric'],
          tooltip: 'An expression that gives a number is parametric; one that gives true/false is a functional verdict.' },
        {
          id: 'check', header: 'Check', kind: 'readonly', width: '230px',
          show: (_c, row) => {
            const c = checked(row);
            return `${c.ok ? '✓' : '✗'} ${c.summary}${c.warnings.length ? ` — ${c.warnings.join(' ')}` : ''}`;
          },
        },
        {
          id: 'reads', header: 'Reads', kind: 'readonly', width: '190px', tooltip: 'The tests this one depends on.',
          show: (_c, row) => checked(row).reads || '—',
        },
      ];

      const table = mountDefinitionsTable(model, {
        columns, label: 'derived tests', searchColumns: ['name', 'expression', 'num'], removable: true, dependent: true, onNote: setNote,
      });

      const add = document.createElement('button');
      add.className = 'btn-secondary';
      add.textContent = 'Add derived test';
      add.addEventListener('click', () => {
        const row = newDerivedRow(usedNumbers());
        model.add(row);
        // Straight into the expression, which is what a new test needs first.
        requestAnimationFrame(() => table.el.querySelector<HTMLInputElement>(`input[data-focus-key="${row.id}\u0000expression"]`)?.focus());
      });

      const apply = document.createElement('button');
      const revertAll = document.createElement('button');
      const refresh = () => {
        const edits = model.editedIds().length + model.removedIds().length;
        apply.textContent = 'Apply';
        apply.disabled = edits === 0;
        apply.style.opacity = edits === 0 ? '0.5' : '';
        revertAll.disabled = edits === 0;
        revertAll.style.opacity = edits === 0 ? '0.5' : '';
        const removed = model.removedIds().length;
        const problems = editProblems(model, opts.ctx);
        setNote(problems.length > 0
          ? `${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`
          : (removed > 0 ? `${removed} test${removed !== 1 ? 's' : ''} will be removed.` : ''));
      };
      model.subscribe(refresh);

      apply.className = 'btn-primary';
      apply.addEventListener('click', () => {
        const problems = editProblems(model, opts.ctx);
        if (problems.length > 0) { setNote(problems[0]); return; }
        const entries = rowsToEntries(model);
        opts.onApply(entries);
        opts.onLog('info', `Derived tests set: ${entries.length} test${entries.length !== 1 ? 's' : ''} — they are computed when the tests are imported.`);
        modalHandle.close();
      });

      revertAll.className = 'btn-secondary';
      revertAll.textContent = 'Revert all';
      revertAll.addEventListener('click', () => { model.revertAll(); });

      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => modalHandle.close());

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      footer.append(add, revertAll, spacer, cancel, apply);

      body.append(intro, table.el, note, footer);
      refresh();
    },
  });
}

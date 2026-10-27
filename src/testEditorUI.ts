// The test editor: a table of the measured tests with their name, test, spec and validity limits, units
// and type, opened from the test selector. Nothing is changed in the selector until Apply, and then only
// the fields that differ from the data become overrides (the model is `testEditor.ts`). Like every change
// in the selector, they take effect when the tests are imported.

import { openModal } from './modal';
import { mountDefinitionsTable, TableModel, type ColumnSpec } from './definitionsTable';
import {
  buildTestRows, parseLimitText, differsFromData, restoreBlanks, useDataValues, rowsToOverrides, editProblems,
  type TestEditorEntry,
} from './testEditor';
import type { TestOverride } from './types';

export interface TestEditorOptions {
  entries: TestEditorEntry[];
  /** Per test number, the override to keep, or `undefined` to drop the one it has. */
  onApply: (overrides: Map<number, TestOverride | undefined>) => void;
  /** Called once when the editor is gone, whichever way it closed. */
  onClosed: () => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export function showTestEditor(opts: TestEditorOptions): void {
  const model = new TableModel(buildTestRows(opts.entries));

  const modalHandle = openModal({
    title: `Edit tests (${opts.entries.length})`,
    sizing: 'content',
    contentSize: { width: 'min(96vw, 1120px)', height: 'min(88vh, 680px)' },
    bodyOverflow: 'hidden',
    onClose: opts.onClosed,
    mount(body) {
      body.style.cssText += 'padding:16px;gap:10px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent = 'Rename tests and set the limits they are judged against. A blank cell means the data’s own value, '
        + 'and typing the data’s value back removes the change. Nothing changes until Apply, and then not until the tests are imported.';

      const note = document.createElement('div');
      note.setAttribute('role', 'status');
      note.style.cssText = 'min-height:1.2em;color:var(--warn-text)';
      const setNote = (m: string) => { note.textContent = m; };

      const limit = (id: string, header: string, tooltip: string): ColumnSpec => ({
        id, header, kind: 'text', width: '76px', placeholder: '—', tooltip,
        normalise: t => parseLimitText(t), invalidNote: `${header} must be a number.`,
      });
      const columns: ColumnSpec[] = [
        { id: 'num', header: 'Test', kind: 'readonly', width: '64px' },
        { id: 'name', header: 'Name', kind: 'text', width: '170px' },
        {
          id: 'from', header: 'Data', kind: 'readonly', width: '66px',
          tooltip: '“data” when the row is as the file states it, “changed” when a loaded file or an edit differs.',
          show: (_c, row) => (differsFromData(row) ? 'changed' : 'data'),
        },
        limit('loLimit', 'Low limit', 'The test limit a value must reach to pass (STDF LO_LIMIT).'),
        limit('hiLimit', 'High limit', 'The test limit a value must not exceed (STDF HI_LIMIT).'),
        limit('loSpec', 'Low spec', 'The process specification, used by process capability. Separate from the test limits.'),
        limit('hiSpec', 'High spec', 'The process specification, used by process capability. Separate from the test limits.'),
        limit('loValid', 'Low valid', 'Validity limit: a value below it is a tester clamp and is treated as no value.'),
        limit('hiValid', 'High valid', 'Validity limit: a value above it is a tester clamp and is treated as no value.'),
        {
          id: 'units', header: 'Units', kind: 'text', width: '70px', placeholder: '—',
          tooltip: 'A unit that differs from the data’s only by an SI prefix (mV for V) converts the limits you give to the data’s unit.',
        },
        {
          id: 'parametric', header: 'Type', kind: 'toggle', width: '110px', toggleLabels: ['Functional', 'Parametric'],
          tooltip: 'Functional tests are pass/fail only: limits do not apply to them.',
        },
      ];

      const table = mountDefinitionsTable(model, {
        columns, label: 'tests', searchColumns: ['name', 'num'], onNote: setNote,
        bulk: [{ label: 'Use the data’s values', apply: (ids, m) => useDataValues(m, ids) }],
      });

      const apply = document.createElement('button');
      const revertAll = document.createElement('button');
      const refresh = () => {
        const n = model.editedIds().length;
        apply.textContent = n > 0 ? `Apply (${n} edited)` : 'Apply';
        apply.disabled = n === 0;
        apply.style.opacity = n === 0 ? '0.5' : '';
        revertAll.disabled = n === 0;
        revertAll.style.opacity = n === 0 ? '0.5' : '';
        const problems = editProblems(model);
        if (problems.length > 0) setNote(problems[0] + (problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''));
      };
      model.subscribe(() => {
        const restored = restoreBlanks(model);
        if (restored > 0) setNote(`A blank cell means the data’s own value: ${restored} put back.`);
        refresh();
      });

      apply.className = 'btn-primary';
      apply.addEventListener('click', () => {
        const problems = editProblems(model);
        if (problems.length > 0) { setNote(problems[0]); return; }
        const overrides = rowsToOverrides(model);
        opts.onApply(overrides);
        const n = overrides.size;
        opts.onLog('info', `Test edits applied: ${n} test${n !== 1 ? 's' : ''} — they take effect when the tests are imported.`);
        modalHandle.close();
      });

      revertAll.className = 'btn-secondary';
      revertAll.textContent = 'Revert all';
      revertAll.addEventListener('click', () => { model.revertAll(); setNote(''); });

      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => modalHandle.close());

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      footer.append(revertAll, spacer, cancel, apply);

      body.append(intro, table.el, note, footer);
      refresh();
    },
  });
}

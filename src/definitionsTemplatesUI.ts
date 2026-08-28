// "Definitions file formats…" — reachable from the Help menu regardless of
// whether anything is loaded, unlike every Lot ▾ dialog (Splits…, Test
// definitions…, Bin definitions…), which all require a loaded lot. Each row
// here saves a realistic filled-in example of one definitions file type via
// the SAME formatter its real Save button uses, so a user can see the exact
// column layout tsmap reads — without reading docs, and without having
// loaded any data first.

import { openModal, SECONDARY_BTN_CSS } from './modal';
import { formatTestListCsv } from './testSelectorUI';
import { formatSplitsCsv, setSplitLabel } from './splits';
import { formatBinDefsCsv } from './binDefs';
import type { WaferData } from './types';

interface TemplateRow {
  label: string;
  description: string;
  fileName: string;
  content: () => string;
}

function exampleWafers(): WaferData[] {
  const wafer = (waferId: string, split: string): WaferData => {
    const w: WaferData = { waferId, results: [] };
    setSplitLabel(w, split);
    return w;
  };
  return [wafer('W01', 'TT'), wafer('W02', 'FF'), wafer('W03', 'SS')];
}

const ROWS: TemplateRow[] = [
  {
    label: 'Test definitions',
    description: 'Test names, spec limits, units, and parametric/functional type — see Lot ▾ → Test definitions… and the test selector\'s Save/Load list.',
    fileName: 'test-list-template.csv',
    content: () => formatTestListCsv([
      { num: 1001, name: 'Vdd', loLimit: 1.6, hiLimit: 2.0, units: 'V', testType: 'P' },
      { num: 1002, name: 'Idsat', units: 'mA', testType: 'P' },
      { num: 2001, name: 'Scan Test', testType: 'F' },
    ]),
  },
  {
    label: 'Splits',
    description: 'Wafer-to-split assignment (process corners, experiment groups, etc.) — see Lot ▾ → Splits….',
    fileName: 'splits-template.csv',
    content: () => formatSplitsCsv(exampleWafers()),
  },
  {
    label: 'Bin definitions',
    description: 'Hard/soft bin names and pass/fail flags — see Lot ▾ → Bin definitions…, or the mapping overlay\'s "Load bin definitions…" for CSV/JSON/Parquet.',
    fileName: 'bin-definitions-template.csv',
    content: () => formatBinDefsCsv([
      { bin: 1, type: 'hard', name: 'Pass', pass: true },
      { bin: 2, type: 'hard', name: 'Contact Open', pass: false },
      { bin: 10, type: 'soft', name: 'Leakage Fail', pass: false },
    ]),
  },
];

export function showDefinitionsTemplatesDialog(
  onSave: (content: string, fileName: string) => Promise<void>,
  onLog: (level: 'info' | 'error', message: string) => void,
): void {
  // flex-shrink:0 on top of the shared base — this dialog's rows are flex
  // rows where the button must never shrink to fit the label/description.
  const secondaryBtnCss = SECONDARY_BTN_CSS + ';flex-shrink:0';

  openModal({
    title: 'Definitions file formats',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 480px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:14px;font-size:13px;color:var(--text-light)';

      const intro = document.createElement('p');
      intro.style.cssText = 'margin:0;color:var(--text-secondary)';
      intro.textContent =
        'Save a filled-in example of any of these files — the exact column layout tsmap reads, '
        + 'ready to edit — without needing to load anything first.';
      body.appendChild(intro);

      for (const row of ROWS) {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border-mid)';

        const textCol = document.createElement('div');
        textCol.style.cssText = 'flex:1;min-width:0';
        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-weight:600';
        labelEl.textContent = row.label;
        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size:12px;color:var(--text-dim);margin-top:2px';
        descEl.textContent = row.description;
        textCol.append(labelEl, descEl);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save template…';
        saveBtn.style.cssText = secondaryBtnCss;
        saveBtn.addEventListener('click', async () => {
          try {
            await onSave(row.content(), row.fileName);
            onLog('info', `${row.label} template saved`);
          } catch (e) {
            onLog('error', `Failed to save ${row.label.toLowerCase()} template: ${e instanceof Error ? e.message : String(e)}`);
          }
        });

        rowEl.append(textCol, saveBtn);
        body.appendChild(rowEl);
      }
    },
  });
}

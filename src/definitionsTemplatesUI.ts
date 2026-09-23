// "Definitions file formats…" — reachable from the Help menu regardless of
// whether anything is loaded, unlike every Setup ▾ dialog (Tests…, Bin
// definitions…, Splits…), which all require a loaded lot: the Setup button is
// hidden entirely until something is open. That is why this lives under Help
// and not alongside the dialogs it describes. Each row
// here saves a realistic filled-in example of one definitions file type via
// the SAME formatter its real Save button uses, so a user can see the exact
// column layout tsmap reads — without reading docs, and without having
// loaded any data first.

import { openModal } from './modal';
import { formatTestListCsv } from './testSelectorUI';
import { formatSplitsCsv, setSplitLabel } from './splits';
import { formatBinDefsCsv } from './binDefs';
import { formatSweepsFile, SWEEPS_TEMPLATE } from './sweeps';
import type { WaferData } from './types';
import { errMsg } from './lib';

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
    description: 'Test names, spec limits, units, and parametric/functional type, plus derived tests computed from other tests by an expression — read and written by Save/Load definitions in Setup ▾ → Tests….',
    fileName: 'test-definitions-template.csv',
    content: () => formatTestListCsv([
      { num: 1001, name: 'Vdd', loLimit: 1.6, hiLimit: 2.0, units: 'V', testType: 'P' },
      { num: 1002, name: 'Idsat', units: 'mA', testType: 'P' },
      { num: 2001, name: 'Scan Test', testType: 'F' },
      { num: 900001, name: 'Idsat per Volt', units: 'mA/V', testType: 'P', expression: 't[1002] / t[1001]' },
      { num: 900002, name: 'Vdd Margin', units: 'V', testType: 'P', loLimit: 0.05, expression: 'min(t[1001] - 1.6, 2.0 - t[1001])' },
    ]),
  },
  {
    label: 'Sweeps',
    description: 'Runs of tests read as response curves, with where two curves cross and how far apart they are — see Setup ▾ → Sweeps…. JSON, not CSV: a sweep has series inside it.',
    fileName: 'sweeps-template.json',
    content: () => formatSweepsFile(SWEEPS_TEMPLATE),
  },
  {
    label: 'Splits',
    description: 'Wafer-to-split assignment (process corners, experiment groups, etc.) — see Setup ▾ → Splits….',
    fileName: 'splits-template.csv',
    content: () => formatSplitsCsv(exampleWafers()),
  },
  {
    label: 'Bin definitions',
    description: 'Hard/soft bin names, pass/fail flags and optional map colours — see Setup ▾ → Bin definitions…, or the mapping overlay\'s "Load bin definitions…" for CSV/JSON/Parquet.',
    fileName: 'bin-definitions-template.csv',
    content: () => formatBinDefsCsv([
      { bin: 1, type: 'hard', name: 'Pass', pass: true, color: '#2ca02c' },
      { bin: 2, type: 'hard', name: 'Contact Open', pass: false, color: '#d62728' },
      { bin: 10, type: 'soft', name: 'Leakage Fail', pass: false },
    ]),
  },
];

export function showDefinitionsTemplatesDialog(
  onSave: (content: string, fileName: string, label: string) => Promise<void>,
  onLog: (level: 'info' | 'error', message: string) => void,
): void {
  // flex-shrink:0 on top of the shared base — this dialog's rows are flex
  // rows where the button must never shrink to fit the label/description.

  openModal({
    title: 'Definitions file formats',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 480px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

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
        saveBtn.className = 'btn-secondary';
        saveBtn.addEventListener('click', async () => {
          try {
            await onSave(row.content(), row.fileName, row.label);
            onLog('info', `${row.label} template saved`);
          } catch (e) {
            onLog('error', `Failed to save ${row.label.toLowerCase()} template: ${errMsg(e)}`);
          }
        });

        rowEl.append(textCol, saveBtn);
        body.appendChild(rowEl);
      }
    },
  });
}

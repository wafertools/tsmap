// Small modal for the reticle (stepper field) grid: how many dies one exposure
// covers, across and down, and optionally which die sits at a field's corner.
// One value for every wafer loaded. Persistence and validation live in
// reticle.ts; this module only owns the dialog.

import { openModal, clearCancelApplyRow } from './modal';
import { normalizeReticle, type ReticleSettings } from './reticle';

export function showReticleDialog(
  current: ReticleSettings | undefined,
  onApply: (reticle: ReticleSettings | undefined) => void,
): void {
  const fieldInputCss = [
    'padding:6px 8px;border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'background:var(--bg-input);color:var(--text-secondary);font-size:12px;width:100%;box-sizing:border-box',
  ].join(';');
  const hintCss = 'font-size:12px;color:var(--text-dim);min-height:16px';

  const modalHandle = openModal({
    title: 'Reticle',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 440px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('div');
      intro.style.cssText = hintCss;
      intro.textContent =
        'A reticle is the group of dies the stepper exposes in one step. Give its size in dies to draw the field grid, ' +
        'show each die’s position within its field, and look for failures that repeat at the same place in every field.';

      const makeField = (labelText: string, placeholder: string, value: number | undefined, step: string, min?: string) => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:0';
        const text = document.createElement('span');
        text.textContent = labelText;
        text.style.cssText = 'font-size:12px;color:var(--text-dim)';
        const input = document.createElement('input');
        input.type = 'number';
        input.step = step;
        if (min !== undefined) input.min = min;
        input.placeholder = placeholder;
        if (value !== undefined) input.value = String(value);
        input.style.cssText = fieldInputCss;
        label.append(text, input);
        return { label, input };
      };

      const width = makeField('Field width (dies)', 'e.g. 4', current?.width, '1', '1');
      const height = makeField('Field height (dies)', 'e.g. 6', current?.height, '1', '1');
      const sizeRow = document.createElement('div');
      sizeRow.style.cssText = 'display:flex;gap:12px';
      sizeRow.append(width.label, height.label);

      const anchorX = makeField('Corner die X', '0', current?.anchorDie?.x, '1');
      const anchorY = makeField('Corner die Y', '0', current?.anchorDie?.y, '1');
      const anchorRow = document.createElement('div');
      anchorRow.style.cssText = 'display:flex;gap:12px';
      anchorRow.append(anchorX.label, anchorY.label);

      const anchorHint = document.createElement('div');
      anchorHint.style.cssText = hintCss;
      anchorHint.textContent =
        'Optional. The die at the bottom-left corner of a field, in the die coordinates in the file. Leave blank when die (0, 0) is at a corner.';

      const errorText = document.createElement('div');
      errorText.style.cssText = 'font-size:12px;color:var(--error-text);min-height:16px';
      // Announced, like the geometry dialog's: otherwise Apply appears to do nothing to a screen reader.
      errorText.setAttribute('role', 'alert');

      /** A blank field, a whole number, or `null` for anything else. */
      const wholeNumber = (input: HTMLInputElement): number | undefined | null => {
        const raw = input.value.trim();
        if (raw === '') return undefined;
        const n = Number(raw);
        return Number.isInteger(n) ? n : null;
      };

      const readValidated = (): { ok: true; reticle: ReticleSettings | undefined } | { ok: false } => {
        const w = wholeNumber(width.input);
        const h = wholeNumber(height.input);
        if (w === undefined && h === undefined) { errorText.textContent = ''; return { ok: true, reticle: undefined }; }
        if (!w || !h || w < 1 || h < 1) {
          errorText.textContent = 'Enter the field width and height as whole numbers of dies, or use Clear to remove the reticle.';
          return { ok: false };
        }
        const x = wholeNumber(anchorX.input);
        const y = wholeNumber(anchorY.input);
        if (x === null || y === null) {
          errorText.textContent = 'The corner die is a die position: whole numbers, or leave both blank.';
          return { ok: false };
        }
        if ((x === undefined) !== (y === undefined)) {
          errorText.textContent = 'Give both corner coordinates, or leave both blank.';
          return { ok: false };
        }
        errorText.textContent = '';
        return { ok: true, reticle: normalizeReticle({ width: w, height: h, anchorDie: x === undefined || y === undefined ? undefined : { x, y } }) };
      };

      const doApply = () => {
        const result = readValidated();
        if (!result.ok) return;
        onApply(result.reticle);
        modalHandle.close();
      };
      for (const input of [width.input, height.input, anchorX.input, anchorY.input]) {
        input.addEventListener('keydown', (evt) => {
          if (evt.key !== 'Enter') return;
          evt.preventDefault();
          doApply();
        });
      }

      const buttonRow = clearCancelApplyRow({
        onClear: () => { onApply(undefined); modalHandle.close(); },
        onCancel: () => modalHandle.close(),
        onApply: doApply,
      });

      body.append(intro, sizeRow, anchorRow, anchorHint, errorText, buttonRow);
      width.input.focus();
      width.input.select();
    },
  });
}

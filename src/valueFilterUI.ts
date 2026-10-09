// Small modal for the value filter: which limit set a test value must lie inside to be
// used. Persistence lives in valueFilter.ts; this module only owns the dialog.

import { openModal, clearCancelApplyRow } from './modal';
import { DEFAULT_VALUE_FILTER, VALUE_FILTER_LABEL, type ValueFilterMode } from './valueFilter';

const OPTIONS: ReadonlyArray<{ mode: ValueFilterMode; hint: string }> = [
  { mode: 'validity', hint: 'Values outside a test’s validity limits (usually tester clamps) are treated as missing. Tests without validity limits are unaffected.' },
  { mode: 'spec', hint: 'Keep only values inside each test’s spec limits.' },
  { mode: 'test', hint: 'Keep only values inside each test’s test (pass/fail) limits.' },
  { mode: 'none', hint: 'Use every value as recorded.' },
];

export function showValueFilterDialog(current: ValueFilterMode, onApply: (mode: ValueFilterMode) => void): void {
  const modalHandle = openModal({
    title: 'Exclude values outside limits',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 480px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const intro = document.createElement('div');
      intro.style.cssText = 'font-size:12px;color:var(--text-dim)';
      intro.textContent =
        'Excluded values are treated as missing in the map, statistics and charts, and counted wherever a population is shown. ' +
        'Bins and the tester’s recorded pass/fail are unchanged.';

      const group = document.createElement('div');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', 'Limit set a value must lie inside');
      group.style.cssText = 'display:flex;flex-direction:column;gap:8px';
      const radios = new Map<ValueFilterMode, HTMLInputElement>();
      for (const { mode, hint } of OPTIONS) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;gap:8px;align-items:flex-start;cursor:pointer';
        label.className = 'click-row';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'value-filter';
        input.checked = mode === current;
        radios.set(mode, input);
        const text = document.createElement('span');
        const name = document.createElement('div');
        name.textContent = VALUE_FILTER_LABEL[mode];
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:12px;color:var(--text-dim)';
        sub.textContent = hint;
        text.append(name, sub);
        label.append(input, text);
        group.append(label);
      }

      const selected = (): ValueFilterMode =>
        OPTIONS.find(o => radios.get(o.mode)!.checked)?.mode ?? DEFAULT_VALUE_FILTER;

      const buttonRow = clearCancelApplyRow({
        onClear: () => { onApply(DEFAULT_VALUE_FILTER); modalHandle.close(); },
        onCancel: () => modalHandle.close(),
        onApply: () => { onApply(selected()); modalHandle.close(); },
      });

      body.append(intro, group, buttonRow);
      radios.get(current)?.focus();
    },
  });
}

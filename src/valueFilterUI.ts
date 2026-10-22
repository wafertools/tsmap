// The Exclude values outside limits… dialog: which limit set a test value must lie inside to
// be used. Persistence lives in valueFilter.ts; the dialog shell is modal.ts's showChoiceDialog.

import { showChoiceDialog } from './modal';
import { DEFAULT_VALUE_FILTER, VALUE_FILTER_LABEL, type ValueFilterMode } from './valueFilter';

const HINTS: Readonly<Record<ValueFilterMode, string>> = {
  validity: 'Values outside a test’s validity limits (usually tester clamps) are treated as missing. Tests without validity limits are unaffected.',
  spec: 'Keep only values inside each test’s spec limits.',
  test: 'Keep only values inside each test’s test (pass/fail) limits.',
  none: 'Use every value as recorded.',
};

export function showValueFilterDialog(current: ValueFilterMode, onApply: (mode: ValueFilterMode) => void): void {
  showChoiceDialog({
    title: 'Exclude values outside limits',
    intro: 'Excluded values are treated as missing in the map, statistics and charts, and counted wherever a population is shown. ' +
      'Bins and the tester’s recorded pass/fail are unchanged.',
    groupLabel: 'Limit set a value must lie inside',
    choices: (Object.keys(HINTS) as ValueFilterMode[]).map(mode => ({ value: mode, label: VALUE_FILTER_LABEL[mode], hint: HINTS[mode] })),
    current,
    fallback: DEFAULT_VALUE_FILTER,
    onApply,
  });
}

// The Retests… dialog: which result counts when a die was probed more than once.
// Persistence lives in retestPolicy.ts; the dialog shell is modal.ts's showChoiceDialog.

import { showChoiceDialog } from './modal';
import { DEFAULT_RETEST_POLICY, RETEST_POLICY_LABEL, type RetestPolicy } from './retestPolicy';

const HINTS: Readonly<Record<RetestPolicy, string>> = {
  last: 'The most recent probe, in the order the file records them.',
  first: 'The earliest probe.',
  best: 'A pass over a fail; between two passes or two fails, the lower hard bin.',
  worst: 'A fail over a pass; between two passes or two fails, the higher hard bin.',
};

export function showRetestPolicyDialog(current: RetestPolicy, onApply: (policy: RetestPolicy) => void): void {
  showChoiceDialog({
    title: 'Retests',
    intro: 'When a die position was probed more than once, one result stands for it in the map, yield, statistics and exports. ' +
      'A result the tester marked as replacing an earlier one always counts. Each retested die’s tooltip shows how often it was probed.',
    groupLabel: 'Result that counts for a retested die',
    choices: (Object.keys(HINTS) as RetestPolicy[]).map(policy => ({ value: policy, label: RETEST_POLICY_LABEL[policy], hint: HINTS[policy] })),
    current,
    fallback: DEFAULT_RETEST_POLICY,
    onApply,
  });
}

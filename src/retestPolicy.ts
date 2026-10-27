// Which result counts when a die position was probed more than once. One value for every
// wafer loaded, kept in localStorage like the value filter and the reticle. wmap applies it
// (`WaferMapInput.retestPolicy`) and counts every die's probes either way; this module only
// owns the setting.
import { storageKey, storedChoice } from './storageKeys';

export type RetestPolicy = 'last' | 'first' | 'best' | 'worst';

export const DEFAULT_RETEST_POLICY: RetestPolicy = 'last';

/** Every policy, in the order the dialog lists them; also what a setup file's value is checked against. */
export const RETEST_POLICIES: readonly RetestPolicy[] = ['last', 'first', 'best', 'worst'];
const POLICIES = RETEST_POLICIES;

export const RETEST_POLICY_LABEL: Readonly<Record<RetestPolicy, string>> = {
  last: 'Last result',
  first: 'First result',
  best: 'Best result',
  worst: 'Worst result',
};

const stored = storedChoice(storageKey('tsmap:retest-policy'), POLICIES, DEFAULT_RETEST_POLICY);
export const normalizeRetestPolicy = stored.normalize;
export const getRetestPolicy = stored.get;
export const setRetestPolicy = stored.set;

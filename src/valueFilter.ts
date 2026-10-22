// Which limit set a test value must lie inside to be used. One value for every wafer
// loaded, kept in localStorage like the reticle and wafer geometry. wmap applies it
// (`WaferMapInput.valueFilter`) and states what it excluded; this module only owns
// the setting.
import { storageKey, storedChoice } from './storageKeys';

export type ValueFilterMode = 'validity' | 'spec' | 'test' | 'none';

export const DEFAULT_VALUE_FILTER: ValueFilterMode = 'validity';

const MODES: readonly ValueFilterMode[] = ['validity', 'spec', 'test', 'none'];

export const VALUE_FILTER_LABEL: Readonly<Record<ValueFilterMode, string>> = {
  validity: 'Validity limits',
  spec: 'Spec limits',
  test: 'Test limits',
  none: 'Off',
};

const stored = storedChoice(storageKey('tsmap:value-filter'), MODES, DEFAULT_VALUE_FILTER);
export const normalizeValueFilter = stored.normalize;
export const getValueFilter = stored.get;
export const setValueFilter = stored.set;

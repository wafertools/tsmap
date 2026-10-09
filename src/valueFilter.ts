// Which limit set a test value must lie inside to be used. One value for every wafer
// loaded, kept in localStorage like the reticle and wafer geometry. wmap applies it
// (`WaferMapInput.valueFilter`) and states what it excluded; this module only owns
// the setting.
import { storageKey } from './storageKeys';

export type ValueFilterMode = 'validity' | 'spec' | 'test' | 'none';

export const DEFAULT_VALUE_FILTER: ValueFilterMode = 'validity';

const KEY = storageKey('tsmap:value-filter');

const MODES: readonly ValueFilterMode[] = ['validity', 'spec', 'test', 'none'];

export const VALUE_FILTER_LABEL: Readonly<Record<ValueFilterMode, string>> = {
  validity: 'Validity limits',
  spec: 'Spec limits',
  test: 'Test limits',
  none: 'Off',
};

export function normalizeValueFilter(raw: unknown): ValueFilterMode {
  return MODES.includes(raw as ValueFilterMode) ? (raw as ValueFilterMode) : DEFAULT_VALUE_FILTER;
}

/** The persisted mode, or the default when unset or unreadable. */
export function getValueFilter(): ValueFilterMode {
  try {
    return normalizeValueFilter(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_VALUE_FILTER;
  }
}

/** Persists `mode` (the default clears the stored value). Returns what was kept. */
export function setValueFilter(mode: ValueFilterMode): ValueFilterMode {
  const kept = normalizeValueFilter(mode);
  try {
    if (kept === DEFAULT_VALUE_FILTER) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, kept);
  } catch {
    // ignore — a session where storage is denied just doesn't remember it, like reticle.ts
  }
  return kept;
}

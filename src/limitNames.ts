/**
 * The one table of limit column names, read by both the test-definitions file
 * reader (testSelectorUI.ts) and the column-mapping detection (mappingUI.ts).
 *
 * Every name belongs to exactly one kind, and a low limit only ever pairs with
 * a high limit of its own kind. TEST limits are what the tester judged pass/fail
 * by (STDF LO_LIMIT/HI_LIMIT); SPEC limits are the process specification
 * (LO_SPEC/HI_SPEC), which capability is measured against. LSL and USL are
 * "lower/upper spec limit" by definition, so they are spec limits.
 *
 * Names are written here in their documented snake_case spelling and matched
 * after `normalizeHeaderKey`, so `Lo Limit`, `lo-limit` and `LoLimit` all match
 * `lo_limit`. scripts/check-mapping-docs.mjs checks docs/user-guide.md against
 * these lists.
 */

import { normalizeHeaderKey } from './headerKey';

export type LimitField = 'loLimit' | 'hiLimit' | 'loSpec' | 'hiSpec';

export const LIMIT_NAMES: Readonly<Record<LimitField, readonly string[]>> = {
  loLimit: ['lo_limit', 'low_limit', 'lower_limit', 'lo_lim', 'low_lim', 'lower_lim', 'l_limit', 'l_lim',
    'min_limit', 'min_lim', 'll', 'test_lo', 'test_low'],
  hiLimit: ['hi_limit', 'high_limit', 'higher_limit', 'upper_limit', 'hi_lim', 'high_lim', 'upper_lim',
    'h_limit', 'h_lim', 'max_limit', 'max_lim', 'ul', 'test_hi', 'test_high'],
  loSpec: ['lo_spec', 'low_spec', 'lower_spec', 'lo_spec_limit', 'low_spec_limit', 'lower_spec_limit',
    'spec_lo', 'spec_low', 'min_spec', 'lsl'],
  hiSpec: ['hi_spec', 'high_spec', 'higher_spec', 'upper_spec', 'hi_spec_limit', 'high_spec_limit',
    'upper_spec_limit', 'spec_hi', 'spec_high', 'max_spec', 'usl'],
};

/** Bare names read as test limits only where every column describes a test —
 *  a test-definitions file. In a data file `lo`/`high` are too loose to claim. */
export const BARE_LIMIT_NAMES: Readonly<Partial<Record<LimitField, readonly string[]>>> = {
  loLimit: ['lo', 'low'],
  hiLimit: ['hi', 'high'],
};

/** Names that say "a limit" but not which kind — read as neither. */
export const AMBIGUOUS_LIMIT_NAMES: readonly string[] = [
  'min', 'max', 'lower', 'upper', 'limit', 'limits', 'spec',
  'lower_bound', 'upper_bound', 'lo_bound', 'hi_bound', 'low_bound', 'high_bound',
  'lo_threshold', 'hi_threshold', 'low_threshold', 'high_threshold',
];

export const LIMIT_FIELD_LABEL: Readonly<Record<LimitField, string>> = {
  loLimit: 'low test limit', hiLimit: 'high test limit', loSpec: 'low spec limit', hiSpec: 'high spec limit',
};

function byKey(table: Partial<Record<LimitField, readonly string[]>>): Map<string, LimitField> {
  const m = new Map<string, LimitField>();
  for (const [field, names] of Object.entries(table) as [LimitField, readonly string[]][]) {
    for (const n of names) m.set(normalizeHeaderKey(n), field);
  }
  return m;
}
const NAMED = byKey(LIMIT_NAMES);
const BARE = byKey(BARE_LIMIT_NAMES);
const AMBIGUOUS = new Set(AMBIGUOUS_LIMIT_NAMES.map(normalizeHeaderKey));

/** Which limit a column header names, or undefined. `bare` also accepts
 *  `lo`/`hi`/`low`/`high` (test-definitions files only). */
export function limitFieldForHeader(header: string, opts: { bare: boolean }): LimitField | undefined {
  const key = normalizeHeaderKey(header);
  return NAMED.get(key) ?? (opts.bare ? BARE.get(key) : undefined);
}

export function isAmbiguousLimitHeader(header: string): boolean {
  return AMBIGUOUS.has(normalizeHeaderKey(header));
}

/** Whether a header is LSL or USL — read as spec limits, and worth a note,
 *  since files have used them for test limits. */
export function isLslUslHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'lsl' || key === 'usl';
}

import { describe, it, expect } from 'vitest';
import {
  AMBIGUOUS_LIMIT_NAMES, BARE_LIMIT_NAMES, LIMIT_NAMES,
  isAmbiguousLimitHeader, isLslUslHeader, limitFieldForHeader,
} from './limitNames';
import { normalizeHeaderKey } from './headerKey';

describe('limit names', () => {
  it('gives every name exactly one kind, and none is also ambiguous', () => {
    const seen = new Map<string, string>();
    for (const table of [LIMIT_NAMES, BARE_LIMIT_NAMES]) {
      for (const [field, names] of Object.entries(table)) {
        for (const n of names ?? []) {
          const key = normalizeHeaderKey(n);
          expect(seen.get(key), `${n} is listed under ${seen.get(key)} and ${field}`).toBeUndefined();
          seen.set(key, field);
        }
      }
    }
    for (const n of AMBIGUOUS_LIMIT_NAMES) expect(seen.has(normalizeHeaderKey(n)), n).toBe(false);
  });

  it('reads LSL/USL as spec limits, never test limits', () => {
    expect(limitFieldForHeader('LSL', { bare: true })).toBe('loSpec');
    expect(limitFieldForHeader('usl', { bare: false })).toBe('hiSpec');
    expect(isLslUslHeader(' Usl ')).toBe(true);
    expect(isLslUslHeader('spec_hi')).toBe(false);
  });

  it('ignores case, spaces, _ and -', () => {
    for (const h of ['lo_limit', 'Lo Limit', 'LoLimit', 'lo-limit']) {
      expect(limitFieldForHeader(h, { bare: false })).toBe('loLimit');
    }
    expect(limitFieldForHeader('Upper Spec Limit', { bare: false })).toBe('hiSpec');
  });

  it('accepts bare lo/hi/low/high only when asked', () => {
    expect(limitFieldForHeader('lo', { bare: true })).toBe('loLimit');
    expect(limitFieldForHeader('High', { bare: true })).toBe('hiLimit');
    expect(limitFieldForHeader('lo', { bare: false })).toBeUndefined();
  });

  it('assigns no kind to names that do not say which', () => {
    for (const h of ['min', 'Max', 'lower bound', 'hi_threshold', 'limit']) {
      expect(limitFieldForHeader(h, { bare: true })).toBeUndefined();
      expect(isAmbiguousLimitHeader(h)).toBe(true);
    }
  });
});

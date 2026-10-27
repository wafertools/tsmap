import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

import {
  fingerprintHeaders, loadSavedMapping, saveMapping, forgetMapping, savedMappingCount, normalizeMapping,
  exportMappings, parseMappingsFile, importMappings,
} from './savedMappings';
import type { CsvMapping } from './mappingUI';

const KEY = 'tsmap:csv-mappings';
const HEADERS = ['wafer', 'x', 'y', 'hbin', 'vdd'];
const mapping = (o: Partial<CsvMapping> = {}): CsvMapping => ({
  x: 'x', y: 'y', hbin: 'hbin', sbin: null, wafer: 'wafer', lot: null, site: null,
  tests: [{ col: 'vdd', testNumber: 1001, name: 'Vdd' }], meta: [], splitBy: [],
  testnameCol: null, testnumberCol: null, testvalueCol: null, loLimitCol: null, hiLimitCol: null, unitsCol: null, passBins: [1], ...o,
});

beforeEach(() => store.clear());

describe('the store', () => {
  it('keys a layout by its headers in any order', () => {
    expect(fingerprintHeaders(['b', 'a'])).toBe(fingerprintHeaders(['a', 'b']));
    saveMapping(HEADERS, mapping());
    expect(loadSavedMapping([...HEADERS].reverse())?.hbin).toBe('hbin');
  });
  it('forgets one layout and removes the item when none remain', () => {
    saveMapping(HEADERS, mapping());
    forgetMapping(HEADERS);
    expect(loadSavedMapping(HEADERS)).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });
  it('reads a corrupt store as empty', () => {
    store.set(KEY, '{nope');
    expect(savedMappingCount()).toBe(0);
    store.set(KEY, '[1,2]');
    expect(savedMappingCount()).toBe(0);
  });
});

describe('normalizeMapping', () => {
  it('accepts a real mapping', () => {
    expect(normalizeMapping(mapping(), HEADERS)).toMatchObject({ x: 'x', hbin: 'hbin', passBins: [1] });
  });
  it('fills optional columns with null', () => {
    expect(normalizeMapping(mapping(), HEADERS)).toMatchObject({ loSpecCol: null, hiValidCol: null });
  });
  it('refuses a role pointing at a column the layout lacks', () => {
    expect(normalizeMapping(mapping({ x: 'nope' }), HEADERS)).toBeUndefined();
    expect(normalizeMapping(mapping({ tests: [{ col: 'nope', testNumber: 1, name: 'n' }] }), HEADERS)).toBeUndefined();
  });
  it.each([
    ['a number where a column goes', { x: 5 }],
    ['a bad test number', { tests: [{ col: 'vdd', testNumber: -1, name: 'n' }] }],
    ['a non-list meta', { meta: 'x' }],
    ['a pass bin out of range', { passBins: [70000] }],
    ['a pass bin that is not whole', { passBins: [1.5] }],
  ])('refuses %s', (_why, patch) => {
    expect(normalizeMapping({ ...mapping(), ...patch }, HEADERS)).toBeUndefined();
  });
  it('refuses a non-object', () => {
    expect(normalizeMapping(null, HEADERS)).toBeUndefined();
    expect(normalizeMapping('x', HEADERS)).toBeUndefined();
  });
});

describe('export and import', () => {
  it('round-trips every saved layout through the file', () => {
    saveMapping(HEADERS, mapping());
    saveMapping(['a', 'b'], mapping({ x: 'a', y: 'b', hbin: null, wafer: null, tests: [], passBins: [1, 2] }));
    const { text, skipped } = exportMappings();
    expect(skipped).toBe(0);
    store.clear();
    const entries = parseMappingsFile(text);
    expect(entries).toHaveLength(2);
    expect(importMappings(entries)).toEqual({ added: 2, replaced: 0, saved: true });
    expect(loadSavedMapping(HEADERS)?.tests).toEqual([{ col: 'vdd', testNumber: 1001, name: 'Vdd' }]);
    expect(loadSavedMapping(['b', 'a'])?.passBins).toEqual([1, 2]);
  });

  it('replaces a layout it already holds and leaves the others', () => {
    saveMapping(HEADERS, mapping({ passBins: [1] }));
    saveMapping(['p', 'q'], mapping({ x: 'p', y: 'q', hbin: null, wafer: null, tests: [] }));
    const entries = parseMappingsFile(JSON.stringify({
      format: 'tsmap-column-mappings', version: 1, mappings: [{ headers: HEADERS, mapping: mapping({ passBins: [1, 3] }) }],
    }));
    expect(importMappings(entries)).toEqual({ added: 0, replaced: 1, saved: true });
    expect(loadSavedMapping(HEADERS)?.passBins).toEqual([1, 3]);
    expect(savedMappingCount()).toBe(2);
  });

  it('leaves out a layout that does not fit and says so, keeping the rest', () => {
    const warns: string[] = [];
    const entries = parseMappingsFile(JSON.stringify({
      format: 'tsmap-column-mappings', version: 1,
      mappings: [{ headers: HEADERS, mapping: mapping() }, { headers: HEADERS, mapping: { x: 1 } }, { headers: [], mapping: mapping() }, 7],
    }), m => warns.push(m));
    expect(entries).toHaveLength(1);
    expect(warns).toHaveLength(3);
  });

  it.each([
    ['not JSON', '{nope'],
    ['another kind of file', JSON.stringify({ format: 'something-else', version: 1, mappings: [] })],
    ['a newer version', JSON.stringify({ format: 'tsmap-column-mappings', version: 99, mappings: [] })],
    ['no list', JSON.stringify({ format: 'tsmap-column-mappings', version: 1 })],
  ])('reads %s as nothing, with a message', (_why, text) => {
    const warns: string[] = [];
    expect(parseMappingsFile(text, m => warns.push(m))).toEqual([]);
    expect(warns).toHaveLength(1);
  });

  it('does not export a stored mapping that no longer validates', () => {
    store.set(KEY, JSON.stringify({ [fingerprintHeaders(HEADERS)]: { x: 'gone' } }));
    const { text, skipped } = exportMappings();
    expect(JSON.parse(text).mappings).toEqual([]);
    expect(skipped).toBe(1);   // counted, so the dialog can say so
  });

  it('round-trips a layout with an unnamed column, as a CSV written with its row index has', () => {
    const headers = ['', 'wafer', 'x', 'y', 'hbin', 'vdd'];
    saveMapping(headers, mapping({ meta: [''] }));
    const { text, skipped } = exportMappings();
    expect(skipped).toBe(0);
    store.clear();
    const entries = parseMappingsFile(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].headers).toContain('');
    importMappings(entries);
    expect(loadSavedMapping(headers)?.meta).toEqual(['']);
  });

  it('reads an empty column name in a role as no column, as the overlay does', () => {
    expect(normalizeMapping({ ...mapping(), sbin: '' }, HEADERS)?.sbin).toBeNull();
  });
});

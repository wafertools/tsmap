// recentFiles.ts was the only non-trivial pure module in src/ without tests.
// The two things most likely to break quietly are the order-insensitive dedupe
// key (a re-open must move an entry to the top, not add a second copy) and
// formatRecentTime's Today/Yesterday boundary, which is date-arithmetic that
// looks right until it crosses a month or year.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getRecentFiles, addRecentFiles, removeRecentFile, formatRecentTime } from './recentFiles';

// Must track recentFiles.ts's real key (see storageKeys.ts). Pointing this at
// the pre-registry name left the corrupt-storage cases below writing to a key
// nothing reads — they passed against an empty store rather than against the
// guard they exist to test.
const KEY = 'tsmap:recent-files';

// The suite runs on vitest's `node` environment (vite.config.ts) — every other
// test file here is pure logic and needs no DOM. Rather than pull in jsdom or
// switch the whole suite's environment for one module, stand up the two
// localStorage methods recentFiles actually calls. It also lets the
// corrupt-storage cases below write raw strings directly, which is the point
// of those tests.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => store.clear());

describe('addRecentFiles', () => {
  it('records a single file with its basename as the label', () => {
    addRecentFiles(['/home/paul/lots/WT1234.stdf']);
    const [entry] = getRecentFiles();
    expect(entry.paths).toEqual(['/home/paul/lots/WT1234.stdf']);
    expect(entry.label).toBe('WT1234.stdf');
  });

  it('labels a multi-file set by its first file plus a count', () => {
    addRecentFiles(['/a/one.stdf', '/a/two.stdf', '/a/three.stdf']);
    expect(getRecentFiles()[0].label).toBe('one.stdf + 2 more');
  });

  it('handles Windows separators', () => {
    addRecentFiles(['C:\\lots\\WT1234.stdf']);
    expect(getRecentFiles()[0].label).toBe('WT1234.stdf');
  });

  it('puts the newest entry first', () => {
    addRecentFiles(['/a/first.stdf']);
    addRecentFiles(['/a/second.stdf']);
    expect(getRecentFiles().map(e => e.label)).toEqual(['second.stdf', 'first.stdf']);
  });

  it('dedupes a re-opened set rather than adding a second copy', () => {
    addRecentFiles(['/a/one.stdf']);
    addRecentFiles(['/a/two.stdf']);
    addRecentFiles(['/a/one.stdf']);
    expect(getRecentFiles().map(e => e.label)).toEqual(['one.stdf', 'two.stdf']);
  });

  it('treats the same files in a different order as the same set', () => {
    addRecentFiles(['/a/one.stdf', '/a/two.stdf']);
    addRecentFiles(['/a/two.stdf', '/a/one.stdf']);
    expect(getRecentFiles()).toHaveLength(1);
  });

  it('caps the list at 8 entries, dropping the oldest', () => {
    for (let i = 1; i <= 10; i++) addRecentFiles([`/a/lot${i}.stdf`]);
    const entries = getRecentFiles();
    expect(entries).toHaveLength(8);
    expect(entries[0].label).toBe('lot10.stdf');
    expect(entries[entries.length - 1].label).toBe('lot3.stdf');
  });

  it('ignores an empty path list', () => {
    addRecentFiles([]);
    expect(getRecentFiles()).toEqual([]);
  });
});

describe('removeRecentFile', () => {
  it('removes the matching set regardless of path order', () => {
    addRecentFiles(['/a/one.stdf', '/a/two.stdf']);
    addRecentFiles(['/a/three.stdf']);
    removeRecentFile(['/a/two.stdf', '/a/one.stdf']);
    expect(getRecentFiles().map(e => e.label)).toEqual(['three.stdf']);
  });

  it('is a no-op for a set that isn\'t stored', () => {
    addRecentFiles(['/a/one.stdf']);
    removeRecentFile(['/a/nope.stdf']);
    expect(getRecentFiles()).toHaveLength(1);
  });
});

describe('getRecentFiles', () => {
  it('returns an empty list when storage holds malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getRecentFiles()).toEqual([]);
  });

  it('returns an empty list when storage holds a non-array', () => {
    localStorage.setItem(KEY, '{"paths":[]}');
    expect(getRecentFiles()).toEqual([]);
  });
});

describe('formatRecentTime', () => {
  // Fixed clock: a date late enough in the month that "yesterday" doesn't cross
  // a boundary, plus explicit month- and year-crossing cases below.
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => new Date(iso).getTime();

  it('labels today by time only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T14:30:00'));
    expect(formatRecentTime(at('2026-08-09T09:05:00'))).toMatch(/^Today /);
  });

  it('labels yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T14:30:00'));
    expect(formatRecentTime(at('2026-08-08T09:05:00'))).toMatch(/^Yesterday /);
  });

  it('labels anything older with a date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T14:30:00'));
    const out = formatRecentTime(at('2026-07-03T09:05:00'));
    expect(out).not.toMatch(/Today|Yesterday/);
    expect(out).toMatch(/Jul/);
  });

  it('gets "yesterday" right across a month boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T10:00:00'));
    expect(formatRecentTime(at('2026-07-31T18:00:00'))).toMatch(/^Yesterday /);
  });

  it('gets "yesterday" right across a year boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00'));
    expect(formatRecentTime(at('2025-12-31T23:00:00'))).toMatch(/^Yesterday /);
  });

  it('does not call two days ago "yesterday"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T14:30:00'));
    expect(formatRecentTime(at('2026-08-07T14:30:00'))).not.toMatch(/Yesterday/);
  });
});

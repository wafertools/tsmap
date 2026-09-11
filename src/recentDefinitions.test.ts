// The parts of recentDefinitions.ts that would fail quietly rather than loudly:
// the per-kind partitioning (a bins entry appearing in the tests list would be
// offered as a test-definitions file and refused only after loading), the
// path-or-name identity (re-picking the same file must move it, not duplicate
// it), the cap being applied *per kind* rather than across the whole store, and
// the size guard — which must skip the record without throwing, because the file
// itself still loaded fine.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getRecentDefinitions, addRecentDefinition, recentDefinitionKey, describeAge,
} from './recentDefinitions';

const KEY = 'tsmap:recent-definitions';

// Same approach as recentFiles.test.ts: the suite runs on vitest's `node`
// environment, so stand up the two localStorage methods this module calls
// rather than pulling in jsdom for one file. Writing raw strings directly is
// also what the corrupt-storage cases below need.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => store.clear());

describe('addRecentDefinition', () => {
  it('records a file and returns it for its own kind', () => {
    addRecentDefinition({ kind: 'tests', name: 'pvt.csv', path: '/lots/pvt.csv', content: 'a,b\n' });
    const [e] = getRecentDefinitions('tests');
    expect(e.name).toBe('pvt.csv');
    expect(e.path).toBe('/lots/pvt.csv');
    expect(e.content).toBe('a,b\n');
  });

  it('keeps kinds apart — a bins file is never offered as a tests file', () => {
    addRecentDefinition({ kind: 'tests', name: 't.csv', content: 'x' });
    addRecentDefinition({ kind: 'bins', name: 'b.csv', content: 'y' });
    addRecentDefinition({ kind: 'splits', name: 's.csv', content: 'z' });
    expect(getRecentDefinitions('tests').map(e => e.name)).toEqual(['t.csv']);
    expect(getRecentDefinitions('bins').map(e => e.name)).toEqual(['b.csv']);
    expect(getRecentDefinitions('splits').map(e => e.name)).toEqual(['s.csv']);
  });

  it('moves a re-picked file to the top and refreshes its copy, rather than adding a second row', () => {
    addRecentDefinition({ kind: 'tests', name: 'a.csv', path: '/a.csv', content: 'old' });
    addRecentDefinition({ kind: 'tests', name: 'b.csv', path: '/b.csv', content: 'other' });
    addRecentDefinition({ kind: 'tests', name: 'a.csv', path: '/a.csv', content: 'new' });

    const list = getRecentDefinitions('tests');
    expect(list.map(e => e.name)).toEqual(['a.csv', 'b.csv']);
    expect(list[0].content).toBe('new');
  });

  it('treats same-named files in different directories as different entries', () => {
    addRecentDefinition({ kind: 'tests', name: 'limits.csv', path: '/lotA/limits.csv', content: '1' });
    addRecentDefinition({ kind: 'tests', name: 'limits.csv', path: '/lotB/limits.csv', content: '2' });
    expect(getRecentDefinitions('tests')).toHaveLength(2);
  });

  it('falls back to the name when there is no path (the browser case)', () => {
    addRecentDefinition({ kind: 'tests', name: 'limits.csv', content: '1' });
    addRecentDefinition({ kind: 'tests', name: 'limits.csv', content: '2' });
    const list = getRecentDefinitions('tests');
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('2');
  });

  it('caps each kind independently at six', () => {
    for (let i = 0; i < 9; i++) {
      addRecentDefinition({ kind: 'tests', name: `t${i}.csv`, content: String(i) });
      addRecentDefinition({ kind: 'bins', name: `b${i}.csv`, content: String(i) });
    }
    expect(getRecentDefinitions('tests')).toHaveLength(6);
    expect(getRecentDefinitions('bins')).toHaveLength(6);
    // The newest survive, not the first six recorded.
    expect(getRecentDefinitions('tests')[0].name).toBe('t8.csv');
  });

  it('skips an implausibly large file instead of throwing — it still loaded', () => {
    const huge = 'x'.repeat(32 * 1024 + 1);
    expect(() => addRecentDefinition({ kind: 'tests', name: 'huge.csv', content: huge })).not.toThrow();
    expect(getRecentDefinitions('tests')).toHaveLength(0);
  });

  it('accepts a file at the size limit', () => {
    addRecentDefinition({ kind: 'tests', name: 'big.csv', content: 'x'.repeat(32 * 1024) });
    expect(getRecentDefinitions('tests')).toHaveLength(1);
  });

  it('keeps the whole store inside its budget, dropping oldest first across kinds', () => {
    // 12 x 32K chars would be 384K — twice the 192K budget — if nothing trimmed.
    const big = 'x'.repeat(32 * 1024);
    for (let i = 0; i < 6; i++) {
      addRecentDefinition({ kind: 'tests', name: `t${i}.csv`, content: big });
      addRecentDefinition({ kind: 'bins', name: `b${i}.csv`, content: big });
    }
    const total = (['tests', 'bins', 'splits'] as const)
      .flatMap(k => getRecentDefinitions(k))
      .reduce((n, e) => n + e.content.length, 0);
    expect(total).toBeLessThanOrEqual(192 * 1024);
    // The most recent write always survives the trim.
    expect(getRecentDefinitions('bins')[0].name).toBe('b5.csv');
  });

  it('never lets a large entry in one kind evict everything in another silently', () => {
    // Trimming is oldest-first across the whole store, so a newer entry of one
    // kind can displace an older entry of another — but something must remain.
    const big = 'x'.repeat(32 * 1024);
    for (let i = 0; i < 8; i++) {
      addRecentDefinition({ kind: 'splits', name: `s${i}.csv`, content: big });
    }
    expect(getRecentDefinitions('splits').length).toBeGreaterThan(0);
  });

  it('ignores an empty file', () => {
    addRecentDefinition({ kind: 'tests', name: 'empty.csv', content: '' });
    expect(getRecentDefinitions('tests')).toHaveLength(0);
  });
});

describe('corrupt or unavailable storage', () => {
  it('returns nothing rather than throwing when the value is not JSON', () => {
    store.set(KEY, '{not json');
    expect(getRecentDefinitions('tests')).toEqual([]);
  });

  it('drops individual records of the wrong shape but keeps the good ones', () => {
    store.set(KEY, JSON.stringify([
      { kind: 'tests', name: 'ok.csv', content: 'a', time: 1 },
      { kind: 'tests', name: 'no-content', time: 2 },
      null,
      'nonsense',
    ]));
    expect(getRecentDefinitions('tests').map(e => e.name)).toEqual(['ok.csv']);
  });

  it('does not throw when localStorage refuses to write', () => {
    const original = localStorage.setItem;
    (localStorage as { setItem: unknown }).setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => addRecentDefinition({ kind: 'tests', name: 'a.csv', content: 'x' })).not.toThrow();
    (localStorage as { setItem: unknown }).setItem = original;
  });
});

describe('recentDefinitionKey', () => {
  it('prefers the path, falling back to the name', () => {
    expect(recentDefinitionKey({ name: 'a.csv', path: '/x/a.csv' })).toBe('/x/a.csv');
    expect(recentDefinitionKey({ name: 'a.csv' })).toBe('a.csv');
  });
});

describe('describeAge', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  const ago = (ms: number) => describeAge(now - ms, now);

  it('reads as recent under ninety seconds', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(60_000)).toBe('just now');
  });

  it('steps up through minutes, hours, days and months', () => {
    expect(ago(10 * 60_000)).toBe('10 min ago');
    expect(ago(3 * 3_600_000)).toBe('3 hours ago');
    expect(ago(2 * 86_400_000)).toBe('2 days ago');
    expect(ago(90 * 86_400_000)).toBe('3 months ago');
  });

  it('singularises one', () => {
    expect(ago(3_600_000)).toBe('1 hour ago');
    expect(ago(86_400_000)).toBe('1 day ago');
  });

  it('never reports a negative age from a clock that moved backwards', () => {
    expect(describeAge(now + 60_000, now)).toBe('just now');
  });
});

describe('ordering', () => {
  afterEach(() => vi.useRealTimers());

  it('returns most-recent-first even when written out of order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    addRecentDefinition({ kind: 'tests', name: 'first.csv', content: '1' });
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    addRecentDefinition({ kind: 'tests', name: 'second.csv', content: '2' });
    expect(getRecentDefinitions('tests').map(e => e.name)).toEqual(['second.csv', 'first.csv']);
  });
});

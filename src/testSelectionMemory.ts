import { storageKey } from './storageKeys';
// The test selection last confirmed for a test program, offered again the next time that program's data is opened.
//
// "The same test program" is judged by what the selector is about to show: the set of test numbers the first-pass scan
// found. Two lots run on one program list the same tests; a different program, or the same one after a revision that
// adds or drops a test, lists a different set and starts from scratch rather than inheriting a selection that no longer
// means the same thing. A name change does not matter (renaming is an override of its own), so only numbers count.
//
// What is stored is the selection, not the test list, so it stays a few hundred bytes and cannot go stale in the way a
// cached limit can: a remembered number that the data no longer has is simply dropped when the selection is applied.

const STORAGE_KEY = storageKey('tsmap:test-selections');
const MAX_PROGRAMS = 20;

interface Remembered {
  /** {@link programKey}. */
  key: string;
  /** The test numbers that were selected. */
  selected: number[];
  time: number;
}

/** A short key for a set of test numbers, independent of their order: FNV-1a over the sorted numbers, with the count. */
export function programKey(testNumbers: Iterable<number>): string {
  const sorted = [...testNumbers].sort((a, b) => a - b);
  let h = 0x811c9dc5;
  for (const n of sorted) {
    h ^= n >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${sorted.length}:${h.toString(16)}`;
}

function load(): Remembered[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Remembered =>
      !!e && typeof e.key === 'string' && typeof e.time === 'number'
      && Array.isArray(e.selected) && e.selected.every((n: unknown) => typeof n === 'number'));
  } catch {
    return [];
  }
}

/** The selection last confirmed for this set of tests, limited to the tests that are in it; `undefined` if none was kept. */
export function rememberedSelection(testNumbers: Iterable<number>): number[] | undefined {
  const present = new Set(testNumbers);
  const found = load().find(e => e.key === programKey(present));
  return found ? found.selected.filter(n => present.has(n)) : undefined;
}

/** Keep `selected` as the selection for this set of tests, most recent first, forgetting the oldest beyond a short list. */
export function rememberSelection(testNumbers: Iterable<number>, selected: readonly number[]): void {
  const key = programKey(testNumbers);
  const rest = load().filter(e => e.key !== key);
  const next: Remembered[] = [{ key, selected: [...selected], time: Date.now() }, ...rest].slice(0, MAX_PROGRAMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the selection simply is not remembered. Nothing else depends on it.
  }
}

// The tests the reader pinned to the top of the test pickers, remembered across loads and restarts.
//
// wmap holds the set (one for the whole page) and reports the reader's own pins; this keeps it. The saved numbers are
// adopted once at startup, before any picker is built, and every pin or unpin after that is saved as it happens.

import { onPinnedTestsChange, setPinnedTests } from '@wafertools/wafermap/render';
import { storageKey } from './storageKeys';

const KEY = storageKey('tsmap:pinned-tests');

/** The saved pinned test numbers; empty when nothing is saved, the value is malformed, or storage is unavailable. */
export function loadPinnedTests(): number[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

/** Save the set, or forget the item when it is empty so Reset saved settings has nothing to list. */
export function savePinnedTests(testNumbers: readonly number[]): void {
  try {
    if (testNumbers.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(testNumbers));
  } catch {
    // Storage full or blocked: the pins last for this session only.
  }
}

/** Adopt what is saved: at startup, and again after Reset saved settings, so a cleared pin is not written back. */
export function adoptSavedPinnedTests(): void {
  setPinnedTests(loadPinnedTests());
}

/** Adopt the saved pins and keep saving the reader's changes. Call once at startup. */
export function restoreAndWatchPinnedTests(): void {
  adoptSavedPinnedTests();
  onPinnedTestsChange(savePinnedTests);
}


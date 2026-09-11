// The one place every persisted preference is named.
//
// These accumulated one feature at a time and drifted into three separators —
// `tsmap-theme`, `tsmap.fileFilter.lastCriteria`, `tsmap:csv-mappings` — with no
// list of them anywhere. That is not only untidy: with nothing enumerating the
// set, there was no way to offer "reset my settings", no way to tell a user what
// tsmap remembers about them, and no way to grep the whole surface before
// changing it. A user stuck with a bad saved mapping had devtools as the only
// route out.
//
// So: one registry, one naming scheme (`tsmap:<name>`), and enough description
// per item for the reset dialog to say what it is about to delete. Renaming the
// three odd ones would have silently discarded live user data, so each keeps its
// old name in `legacyKeys` and is migrated on startup instead.
//
// Everything here is localStorage, which the Tauri WebView provides just as a
// browser does — so the same store serves both builds. The one preference NOT
// here is the desktop's last-used directory, which the Rust side keeps in its
// own state file (`src-tauri/src/commands/last_dir.rs`) because the file dialog
// is native and never reaches JavaScript.

export type StorageScope = 'both' | 'desktop';

export interface StoredItem {
  /** Current localStorage key. */
  key: string;
  /** Earlier names, migrated to `key` on startup and then removed. */
  legacyKeys?: string[];
  /** Shown in the reset dialog. */
  label: string;
  /** What is lost by clearing it, in the user's terms — not the code's. */
  description: string;
  scope: StorageScope;
}

export const STORED_ITEMS: readonly StoredItem[] = [
  {
    key: 'tsmap:theme',
    legacyKeys: ['tsmap-theme'],
    label: 'Colour theme',
    description: 'The theme you picked, or Auto to follow your system.',
    scope: 'both',
  },
  {
    key: 'tsmap:recent-files',
    legacyKeys: ['tsmap-recent-files'],
    label: 'Recently opened files',
    description: 'The file sets listed under Recent and on the start screen.',
    scope: 'desktop',
  },
  {
    key: 'tsmap:recent-definitions',
    label: 'Recently used definitions files',
    description: 'The test, bin and splits definitions files offered behind "Load definitions ▾".',
    scope: 'both',
  },
  {
    key: 'tsmap:csv-mappings',
    label: 'Saved column mappings',
    description: 'Which CSV/JSON/Parquet column means what, remembered per column layout.',
    scope: 'both',
  },
  {
    key: 'tsmap:wafer-splits',
    label: 'Wafer split assignments',
    description: 'Split labels you assigned to wafers, remembered per lot.',
    scope: 'both',
  },
  {
    key: 'tsmap:wafer-diameter-mm',
    label: 'Wafer diameter',
    description: 'The diameter override set in Diameter & edge exclusion.',
    scope: 'both',
  },
  {
    key: 'tsmap:edge-exclusion-mm',
    label: 'Edge exclusion',
    description: 'The edge-exclusion band set in Diameter & edge exclusion.',
    scope: 'both',
  },
  {
    key: 'tsmap:map-colors',
    label: 'Wafer map colours',
    description: 'The bin and value colour schemes you picked on a wafer map, and whether colours from a bin definitions file are used.',
    scope: 'both',
  },
  {
    key: 'tsmap:file-filter',
    legacyKeys: ['tsmap.fileFilter.lastCriteria'],
    label: 'Last file filter',
    description: 'The filter criteria reapplied when you next scan a folder.',
    scope: 'both',
  },
];

/**
 * Look up an item's current key — a typo-proof accessor for modules that would
 * otherwise repeat the string literal, and the trigger for legacy migration.
 *
 * Migration has to happen before the first *read*, and every consumer reads by
 * resolving its key through here — at module-init time, since they all do
 * `const KEY = storageKey(...)`. Running it lazily on first resolve therefore
 * guarantees the ordering without main.ts having to remember to call it early,
 * and without this module taking a side effect merely on import.
 */
export function storageKey(key: string): string {
  const item = STORED_ITEMS.find(i => i.key === key);
  if (!item) throw new Error(`storageKey: '${key}' is not in STORED_ITEMS`);
  ensureMigrated();
  return item.key;
}

let migrated = false;

function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  migrateLegacyStorageKeys();
}

/** Test seam: forget that migration has run, so a suite can drive it again. */
export function resetMigrationForTests(): void {
  migrated = false;
}

/**
 * Move any value still stored under an old key to its current one.
 *
 * Called once at startup, before anything reads a preference. Renaming a key
 * without this would look exactly like the user's settings being wiped: the new
 * key reads empty, the old value sits there unreachable, and nothing reports it.
 *
 * Only fills an *absent* destination — if both exist, the current key wins,
 * since it was written by a newer build than the legacy one.
 */
export function migrateLegacyStorageKeys(): void {
  for (const item of STORED_ITEMS) {
    for (const old of item.legacyKeys ?? []) {
      try {
        const value = localStorage.getItem(old);
        if (value === null) continue;
        if (localStorage.getItem(item.key) === null) localStorage.setItem(item.key, value);
        localStorage.removeItem(old);
      } catch {
        // Unavailable or full — nothing to migrate into, and failing here would
        // take the whole startup with it.
      }
    }
  }
}

/** Whether anything is stored for an item — so the reset dialog can show what
 *  actually exists rather than a list of everything tsmap could remember. */
export function hasStoredValue(item: StoredItem): boolean {
  try {
    return localStorage.getItem(item.key) !== null;
  } catch {
    return false;
  }
}

/** Clear the given items. Returns how many actually held a value. */
export function clearStoredItems(items: readonly StoredItem[]): number {
  let cleared = 0;
  for (const item of items) {
    try {
      if (localStorage.getItem(item.key) !== null) cleared++;
      localStorage.removeItem(item.key);
      for (const old of item.legacyKeys ?? []) localStorage.removeItem(old);
    } catch {
      // Nothing to do — an unavailable store has nothing to clear either.
    }
  }
  return cleared;
}

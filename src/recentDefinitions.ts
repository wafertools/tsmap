import { storageKey } from './storageKeys';
// Recently used definitions files (tests, bins, splits), for one-click reload.
//
// Separate from recentFiles.ts, and deliberately NOT modelled on it. That one
// stores paths and is desktop-only, because a wafer data file can be hundreds of
// megabytes and a web `File` object carries no path to reopen it by. Neither
// constraint holds here: a definitions CSV is kilobytes, and `pickTextFile`
// already returns its *content* on both platforms. So this stores the content
// and works in the browser build too — which matters, since that is what RHEL
// users and anyone self-hosting on an intranet actually run.
//
// The path is kept as well, when there is one. Content alone would go stale the
// moment someone edits the file, and a stale spec limit is not a cosmetic
// problem in this application — it is a wrong limit line drawn across a real
// measurement. So on desktop the path is the source of truth when it still
// resolves, and the stored content is the fallback for when it does not (moved,
// renamed, unmounted share). See `loadRecentDefinition` in main.ts, which owns
// that resolution because it needs the platform; this module stays pure.
//
// Keyed by kind so tests/bins/splits each keep their own short list rather than
// one mixed list where the entry you want is buried under another type's.

export type DefinitionKind = 'tests' | 'bins' | 'splits';

const STORAGE_KEY = storageKey('tsmap:recent-definitions');
const MAX_PER_KIND = 6;

/**
 * Size limits, deliberately tight.
 *
 * A real definitions file is a few KB — the bundled test-definitions template is
 * under 1 KB — so 32 KB is already ~50x any genuine case.
 *
 * The first version allowed 256 KB per file, which looked harmless and was not:
 * 256 K chars x 6 entries x 3 kinds is 4.5 M chars, and localStorage stores
 * UTF-16, so the *permitted* worst case was ~9 MB against a budget of about 5.
 * localStorage does not evict, it throws — so the victim would not have been
 * this list, it would have been whatever tried to save next. A user's wafer
 * splits or column mapping would have silently stopped persisting, with the
 * write guards swallowing it exactly as designed. A convenience store crowding
 * out the features it sits beside is the wrong failure.
 *
 * TOTAL_BUDGET_CHARS bounds the whole store regardless of how the per-kind
 * counts change later: entries are dropped oldest-first until it fits.
 */
const MAX_CONTENT_CHARS = 32 * 1024;
const TOTAL_BUDGET_CHARS = 192 * 1024;

export interface RecentDefinition {
  kind: DefinitionKind;
  /** Basename, for display. */
  name: string;
  /** Desktop only — absent in the browser, where the picker exposes no path. */
  path?: string;
  /** The file text as captured. The fallback when `path` no longer resolves. */
  content: string;
  time: number;
}

/** Identity within a kind: the path when there is one (two files can share a
 *  basename), else the name, which is all the browser ever gives us. */
function entryKey(e: { path?: string; name: string }): string {
  return e.path ?? e.name;
}

function load(): RecentDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Tolerate anything shaped wrong rather than throwing: this is a
    // convenience store, and one bad record must not break the dialog.
    return parsed.filter((e): e is RecentDefinition =>
      !!e && typeof e.kind === 'string' && typeof e.name === 'string'
      && typeof e.content === 'string' && typeof e.time === 'number');
  } catch {
    return [];
  }
}

function save(entries: RecentDefinition[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Unavailable or full — recents just don't persist. Never fatal.
  }
}

/** Most-recent-first, for one kind. */
export function getRecentDefinitions(kind: DefinitionKind): RecentDefinition[] {
  return load().filter(e => e.kind === kind).sort((a, b) => b.time - a.time);
}

/**
 * Record a definitions file that was just loaded or saved, as the most recent
 * entry of its kind. Re-picking a file already listed moves it to the top and
 * refreshes the remembered copy rather than adding a second row.
 */
export function addRecentDefinition(entry: {
  kind: DefinitionKind;
  name: string;
  path?: string;
  content: string;
}): void {
  if (!entry.name || !entry.content) return;
  if (entry.content.length > MAX_CONTENT_CHARS) return;

  const key = entryKey(entry);
  const others = load().filter(e => !(e.kind === entry.kind && entryKey(e) === key));
  const mine = others.filter(e => e.kind === entry.kind);
  const rest = others.filter(e => e.kind !== entry.kind);

  const updated: RecentDefinition[] = [{ ...entry, time: Date.now() }, ...mine]
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_PER_KIND);

  save(withinBudget([...rest, ...updated]));
}

/** The stable id for a row — path when there is one, else the display name. */
export function recentDefinitionKey(e: { path?: string; name: string }): string {
  return entryKey(e);
}

/** "just now" / "3 days ago" — enough for the reader to judge whether a
 *  remembered copy is likely to still match the file it came from. */
export function describeAge(time: number, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - time) / 1000));
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/**
 * Drop the oldest entries, across every kind, until the store fits the budget.
 * The newest is always kept: an entry that alone exceeds the budget is refused
 * earlier by MAX_CONTENT_CHARS, so this only ever trims accumulation.
 */
function withinBudget(entries: RecentDefinition[]): RecentDefinition[] {
  const newestFirst = [...entries].sort((a, b) => b.time - a.time);
  const kept: RecentDefinition[] = [];
  let used = 0;
  for (const e of newestFirst) {
    const cost = e.content.length;
    if (kept.length > 0 && used + cost > TOTAL_BUDGET_CHARS) continue;
    kept.push(e);
    used += cost;
  }
  return kept;
}

/** Whether this entry can be checked against the file it came from. False in
 *  the browser, where the picker exposes no path — see the guide's framing. */
export function isVerifiable(e: RecentDefinition): boolean {
  return !!e.path;
}

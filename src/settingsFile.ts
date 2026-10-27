// The saved settings as a file: what tsmap remembers about how a person likes to work — theme, map preferences, pinned
// tests, saved plots and filters, the test selections — carried to another machine or kept as a backup. What a product or
// a site needs (wafer diameter, edge exclusion, reticle, retest policy, value filter) is the setup file's, not this one's:
// two files carrying the same values would leave a person asking which to use.
//
// What goes in is an allow-list, not "everything stored". Each stored setting is either portable or deliberately left out
// with the reason, and a test fails for a setting that is neither, so a new one has to be decided on rather than leaking
// into a file someone emails. Left out: recent files and recent definitions (they hold file paths and file contents), wafer
// split assignments (they belong to a lot — Splits… saves them), the saved column mappings (their own file, which merges),
// the five setup values (the setup file), and two transient items (the last file filter and the timing switch).
//
// A value is the text tsmap itself stored, checked before it is written back: a theme must be a theme, a number a number,
// stored JSON must parse. Import only writes storage; the caller reloads, because plots, pins and map preferences are held
// in memory and would write their old copy over an import on the next change.

import { STORED_ITEMS, type StoredItem } from './storageKeys';
import { THEME_GROUPS } from './theme';

export const SETTINGS_FORMAT = 'tsmap-settings';
const VERSION = 1;

type Kind = 'theme' | 'json';

/** Portable settings, and how each value is checked. */
const PORTABLE: Readonly<Record<string, Kind>> = {
  'tsmap:theme': 'theme',
  'tsmap:pinned-tests': 'json',
  'tsmap:test-selections': 'json',
  'tsmap:map-colors': 'json',
  'tsmap:plots': 'json',
  'tsmap:insights-filter': 'json',
  'tsmap:saved-filters': 'json',
};

/** Left out on purpose, with the reason the dialog gives — a phrase that reads after the setting's name in brackets. */
export const EXCLUDED: Readonly<Record<string, string>> = {
  'tsmap:recent-files': 'paths on this machine',
  'tsmap:recent-definitions': 'file paths and file contents',
  'tsmap:wafer-splits': 'they belong to a lot; Setup ▾ → Splits… saves them',
  'tsmap:csv-mappings': 'it has its own file, which merges',
  'tsmap:wafer-diameter-mm': 'they travel in the setup file',
  'tsmap:edge-exclusion-mm': 'they travel in the setup file',
  'tsmap:reticle': 'they travel in the setup file',
  'tsmap:value-filter': 'they travel in the setup file',
  'tsmap:retest-policy': 'they travel in the setup file',
  'tsmap:file-filter': 'the last folder scan, not a setting',
  'tsmap:log-timings': 'a debugging switch',
};

const MAX_VALUE_CHARS = 2 * 1024 * 1024;
const MAX_FILE_CHARS = 8 * 1024 * 1024;

const THEMES = new Set<string>(THEME_GROUPS.flatMap(g => g.themes.map(t => t.value)));

/** Whether `value` is acceptable for the setting stored under `key`. */
export function valueFits(key: string, value: unknown): value is string {
  const kind = PORTABLE[key];
  if (!kind || typeof value !== 'string' || value.length === 0 || value.length > MAX_VALUE_CHARS) return false;
  switch (kind) {
    case 'theme': return THEMES.has(value);
    case 'json':
      try { JSON.parse(value); return true; } catch { return false; }
  }
}

export interface SettingItem {
  key: string;
  label: string;
  /** What is lost by importing over it, in the user's words. */
  description: string;
  value: string;
}

const byKey = (key: string): StoredItem | undefined => STORED_ITEMS.find(i => i.key === key);

/** The portable settings stored now. `read` is `localStorage.getItem`, injected so this stays testable. */
export function portableSettings(read: (key: string) => string | null): SettingItem[] {
  const out: SettingItem[] = [];
  for (const key of Object.keys(PORTABLE)) {
    const item = byKey(key);
    let value: string | null;
    try { value = read(key); } catch { value = null; }
    if (item && value !== null && valueFits(key, value)) out.push({ key, label: item.label, description: item.description, value });
  }
  return out;
}

export function writeSettingsFile(items: readonly SettingItem[]): string {
  return JSON.stringify({
    format: SETTINGS_FORMAT, version: VERSION, saved: new Date().toISOString(),
    settings: items.map(i => ({ key: i.key, value: i.value })),
  }, null, 2);
}

export interface SettingsFile {
  items: SettingItem[];
}

/** Reads a settings file. Never throws: an item that is not allowed or does not fit is reported and left out. */
export function parseSettingsFile(text: string, onWarn?: (message: string) => void): SettingsFile {
  const none: SettingsFile = { items: [] };
  if (text.length > MAX_FILE_CHARS) { onWarn?.('That file is too large to be a settings file.'); return none; }
  let data: unknown;
  try { data = JSON.parse(text); } catch { onWarn?.('That is not a settings file (it is not valid JSON).'); return none; }
  const d = data as { format?: unknown; version?: unknown; settings?: unknown };
  if (!d || d.format !== SETTINGS_FORMAT) { onWarn?.('That is not a tsmap settings file.'); return none; }
  if (typeof d.version !== 'number' || d.version > VERSION) { onWarn?.('That file was written by a newer tsmap; update tsmap to read it.'); return none; }
  if (!Array.isArray(d.settings)) { onWarn?.('That settings file lists no settings.'); return none; }
  const seen = new Set<string>();
  const items: SettingItem[] = [];
  for (const raw of d.settings as Array<{ key?: unknown; value?: unknown }>) {
    const key = typeof raw?.key === 'string' ? raw.key : '';
    const item = byKey(key);
    if (!(key in PORTABLE) || !item) {
      onWarn?.(key in EXCLUDED
        ? `“${item?.label ?? key}” was left out of the import (${EXCLUDED[key]}).`
        : `A setting named “${key.slice(0, 60)}” is not one tsmap imports and was left out.`);
      continue;
    }
    if (!valueFits(key, raw.value)) { onWarn?.(`“${item.label}” was left out: its value is not one tsmap can read.`); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, label: item.label, description: item.description, value: raw.value });
  }
  return { items };
}

/** Write the chosen items. `write` is `localStorage.setItem`. Returns how many were stored. */
export function applySettings(items: readonly SettingItem[], write: (key: string, value: string) => void): number {
  let n = 0;
  for (const i of items) {
    if (!valueFits(i.key, i.value)) continue;
    try { write(i.key, i.value); n++; } catch { /* storage full or unavailable */ }
  }
  return n;
}

export const portableKeys = (): string[] => Object.keys(PORTABLE);

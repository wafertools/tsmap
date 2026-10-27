// The saved column mappings — the roles confirmed for a CSV/JSON/Parquet layout, remembered for the next file with the
// same column headers — and their export and import as a file. The overlay (`mappingUI.ts`) reads and writes one layout
// at a time; this module owns the store, so there is exactly one reader of it, and the file a site can share.
//
// An import merges layout by layout and replaces a layout it already holds, so it is safe at any moment: the store is
// read on demand and nothing is cached. Every mapping in a file is rebuilt field by field, never stored as found: the
// overlay trusts what it reads back, and a mapping from outside must not be able to put a non-string where a column
// name goes.

import { storageKey } from './storageKeys';
import type { CsvMapping, CsvTestCol } from './mappingUI';

const LS_KEY = storageKey('tsmap:csv-mappings');

export const MAPPINGS_FORMAT = 'tsmap-column-mappings';
const VERSION = 1;
/** A file is a few KB; this only stops a wrong file being read as one. */
const MAX_FILE_CHARS = 2 * 1024 * 1024;

export type MappingStore = Record<string, Partial<CsvMapping>>;

/** The identity of a layout: its headers, in any order. */
export function fingerprintHeaders(headers: readonly string[]): string {
  return [...headers].sort().join('\x00');
}

const readStore = (): MappingStore => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as MappingStore : {};
  } catch { return {}; }
};

const writeStore = (store: MappingStore): boolean => {
  try {
    if (Object.keys(store).length === 0) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(store));
    return true;
  } catch { return false; /* quota exceeded or unavailable — not remembered */ }
};

export function loadSavedMapping(headers: string[]): Partial<CsvMapping> | null {
  return readStore()[fingerprintHeaders(headers)] ?? null;
}

export function saveMapping(headers: string[], mapping: CsvMapping): void {
  const store = readStore();
  store[fingerprintHeaders(headers)] = mapping;
  writeStore(store);
}

/** Drop the remembered mapping for this header set, so the next load of the same file auto-detects again (the overlay's
 *  "Reset to auto-detected"). */
export function forgetMapping(headers: string[]): void {
  const store = readStore();
  delete store[fingerprintHeaders(headers)];
  writeStore(store);
}

export function savedMappingCount(): number {
  return Object.keys(readStore()).length;
}

// ── Validation: a mapping from outside, rebuilt field by field ───────────────

/** A column header. Empty is a real header: a CSV written with its row index has an unnamed first column. */
const isHeader = (v: unknown): v is string => typeof v === 'string' && v.length <= 1024;
/** A mapped role's column. An empty name cannot be mapped (the overlay reads an empty name as no column), so it reads as none. */
const strOrNull = (v: unknown): string | null | undefined => (v === null || v === '' ? null : isHeader(v) ? v : undefined);
const headerList = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isHeader) ? [...v] : undefined);

const SINGLE_COLUMNS = [
  'x', 'y', 'hbin', 'sbin', 'wafer', 'lot', 'site', 'testnameCol', 'testnumberCol', 'testvalueCol',
  'loLimitCol', 'hiLimitCol', 'loSpecCol', 'hiSpecCol', 'loValidCol', 'hiValidCol', 'unitsCol',
] as const;

function testCol(v: unknown): CsvTestCol | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const t = v as Record<string, unknown>;
  if (!isHeader(t.col) || typeof t.name !== 'string' || t.name.length > 1024) return undefined;
  if (typeof t.testNumber !== 'number' || !Number.isInteger(t.testNumber) || t.testNumber < 0) return undefined;
  return { col: t.col, testNumber: t.testNumber, name: t.name, ...(t.functional === true ? { functional: true } : {}) };
}

/**
 * A mapping as the overlay reads it, or `undefined` when it is not one. Needs the mapped columns to be columns of the
 * layout it is saved for, since a role pointing at a column the file lacks would be silently dropped by the overlay
 * and look like a saved mapping that does nothing.
 */
export function normalizeMapping(raw: unknown, headers: readonly string[]): CsvMapping | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const known = new Set(headers);
  const out: Record<string, unknown> = {};
  for (const k of SINGLE_COLUMNS) {
    const v = strOrNull(r[k]);
    if (v === undefined && r[k] !== undefined) return undefined;
    if (typeof v === 'string' && !known.has(v)) return undefined;
    out[k] = v ?? null;
  }
  const tests = Array.isArray(r.tests) ? r.tests.map(testCol) : undefined;
  if (!tests || tests.some(t => t === undefined || !known.has(t.col))) return undefined;
  const meta = headerList(r.meta), splitBy = headerList(r.splitBy);
  if (!meta || !splitBy || [...meta, ...splitBy].some(c => !known.has(c))) return undefined;
  const passBins = Array.isArray(r.passBins) && r.passBins.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 65534)
    ? [...r.passBins as number[]] : undefined;
  if (!passBins) return undefined;
  return { ...out, tests: tests as CsvTestCol[], meta, splitBy, passBins } as unknown as CsvMapping;
}

// ── The file ─────────────────────────────────────────────────────────────────

export interface MappingFileEntry {
  headers: string[];
  mapping: CsvMapping;
}

/**
 * The saved layouts as a file. Each carries its headers, so the file can be read without knowing how tsmap keys them.
 * `skipped` counts stored layouts that no longer validate and so are not written — the caller says so.
 */
export function exportMappings(): { text: string; skipped: number } {
  const entries: MappingFileEntry[] = [];
  let skipped = 0;
  for (const [fp, saved] of Object.entries(readStore())) {
    const headers = fp.split('\x00');
    const mapping = normalizeMapping(saved, headers);
    if (mapping) entries.push({ headers, mapping }); else skipped++;
  }
  return { text: JSON.stringify({ format: MAPPINGS_FORMAT, version: VERSION, saved: new Date().toISOString(), mappings: entries }, null, 2), skipped };
}

/** Reads a mappings file. Never throws: a layout that does not fit is reported and left out, the rest still apply. */
export function parseMappingsFile(text: string, onWarn?: (message: string) => void): MappingFileEntry[] {
  if (text.length > MAX_FILE_CHARS) { onWarn?.('That file is too large to be a column-mappings file.'); return []; }
  let data: unknown;
  try { data = JSON.parse(text); } catch { onWarn?.('That is not a column-mappings file (it is not valid JSON).'); return []; }
  const d = data as { format?: unknown; version?: unknown; mappings?: unknown };
  if (!d || d.format !== MAPPINGS_FORMAT) { onWarn?.('That is not a tsmap column-mappings file.'); return []; }
  if (typeof d.version !== 'number' || d.version > VERSION) { onWarn?.('That file was written by a newer tsmap; update tsmap to read it.'); return []; }
  if (!Array.isArray(d.mappings)) { onWarn?.('That column-mappings file lists no layouts.'); return []; }
  const out: MappingFileEntry[] = [];
  d.mappings.forEach((e: unknown, i: number) => {
    const entry = e as { headers?: unknown; mapping?: unknown };
    const headers = headerList(entry?.headers);
    const mapping = headers && headers.length > 0 ? normalizeMapping(entry.mapping, headers) : undefined;
    if (!headers || !mapping) onWarn?.(`Layout ${i + 1} was left out: its headers or its mapping are not usable.`);
    else out.push({ headers, mapping });
  });
  return out;
}

/** Merge into the store: a layout already saved is replaced by the file's. Returns what happened. */
export function importMappings(entries: readonly MappingFileEntry[]): { added: number; replaced: number; saved: boolean } {
  const store = readStore();
  let added = 0, replaced = 0;
  for (const { headers, mapping } of entries) {
    const fp = fingerprintHeaders(headers);
    if (fp in store) replaced++; else added++;
    store[fp] = mapping;
  }
  return { added, replaced, saved: writeStore(store) };
}

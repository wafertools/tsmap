// Faceting metadata: the distinct-values table over wafer provenance — the
// honest, full-dataset answer to "what can I group / compare / split by?".
// Pure and DOM-free for testability.
//
// The parser (`@wafertools/testdata-parser`) emits ALL non-empty metadata
// fields generically as { key, value } (raw STDF/ATDF keys + CSV/JSON column
// names). This module owns the *curation*: friendly labels, which fields to
// surface as facets, and which are dates (grouped by day). Adding, relabelling,
// or hiding a field is a change here only — never a parser republish.

import type { WaferData } from './types';
import { WCR_FLAT_SIDE, WCR_POS_X, WCR_POS_Y, WCR_UNITS, wcrCode } from './wcr';

/**
 * Bucket label for wafers that have no value for the active facet field. Loading
 * a mix where some files set a field (e.g. test program) and others don't must
 * not silently drop the value-less wafers from a grouped chart — they form this
 * explicit group instead, so the data stays visible and accountable. Used both
 * as a facet-table value and as the `groupBy` key for missing values.
 */
export const NONE_VALUE = '(none)';

/** Curation entry for a known metadata key. */
interface FieldMeta {
  label: string;
  /**
   * Whether this is a Group by (and Compare by, and commonality) choice. **Every field is one unless it says `false`**: what a
   * code, a revision or an equipment field means is a site's own convention, so nothing is hidden for being "low value". Only
   * fields that cannot group anything (the declared wafer geometry) are listed as `false`.
   */
  facet?: boolean;
  /** Value is an ISO datetime; facet by its date portion only. */
  date?: boolean;
  /**
   * The value as shown to the user, when the raw one is a code or a bare
   * number. `get` reads another field of the same record — a WCR size needs
   * WF_UNITS to say what it is measured in.
   */
  display?: (raw: string, get: FieldGetter) => string;
  /** Never shown as a field of its own — its meaning is carried in other fields' display values. */
  hidden?: boolean;
}

/** Reads another metadata field of the same wafer/file by key. */
export type FieldGetter = (key: string) => string | undefined;

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A WCR size, with the units WF_UNITS gives it — "300 mm", never a bare "300". */
function wcrSize(raw: string, get: FieldGetter): string {
  const code = get('wfUnits');
  const units = wcrCode(WCR_UNITS, code);
  if (units) return `${raw} ${units.symbol}`;
  if (units === null || code === undefined) return `${raw} (units not recorded)`;
  return `${raw} (invalid units code ${code})`;
}

/** A WCR letter code (flat side, axis direction) as a word; an undefined letter is named as such. */
const wcrLetter = (table: Readonly<Record<string, string>>) => (raw: string): string => {
  const word = wcrCode(table, raw);
  return word ? capitalise(word) : `unrecognised code ${raw}`;
};

// Known fields: a friendly label, date and display handling, and (rarely) `facet: false`. Order here is the display order in the
// Group by list; keys not listed still appear, labelled by their raw key, unless marked `hidden`. Codes (mode, retest, protection,
// command mode) are shown as the file has them: their meaning differs by company and site. Edit this table freely — no parser
// change needed.
const FIELD_META: Record<string, FieldMeta> = {
  // The usual grouping axes, first.
  splitLabel: { label: 'Split' },
  lotId:      { label: 'Lot' },
  sublotId:   { label: 'Sublot' },
  partType:   { label: 'Part type' },
  jobName:    { label: 'Program' },
  testTemp:   { label: 'Temperature' },
  startT:     { label: 'Test date', date: true },
  // Equipment and station.
  testerType: { label: 'Tester' },
  nodeName:   { label: 'Node' },
  stationNum: { label: 'Test station' },
  serialNum:  { label: 'Tester serial' },
  execType:   { label: 'Exec type' },
  execVer:    { label: 'Exec version' },
  facilityId: { label: 'Facility' },
  floorId:    { label: 'Floor' },
  // Who and how the lot was run.
  operName:       { label: 'Operator' },
  supervisorName: { label: 'Supervisor' },
  engId:          { label: 'Engineer' },
  modeCode:   { label: 'Test mode' },
  retestCode: { label: 'Retest code' },
  protCode:   { label: 'Protection code' },
  cmodCode:   { label: 'Command mode' },
  burnTime:   { label: 'Burn-in time' },
  testCode:   { label: 'Test code' },
  flowId:     { label: 'Flow' },
  setupId:    { label: 'Setup' },
  setupT:     { label: 'Setup date', date: true },
  // Program and product.
  jobRev:     { label: 'Program rev' },
  specName:   { label: 'Spec' },
  specVer:    { label: 'Spec version' },
  designRev:  { label: 'Design rev' },
  familyId:   { label: 'Family' },
  packageType: { label: 'Package' },
  processId:  { label: 'Process' },
  dateCode:   { label: 'Date code' },
  operFreq:   { label: 'Operating frequency' },
  romCode:    { label: 'ROM code' },
  auxFile:    { label: 'Aux file' },
  userText:   { label: 'User text' },
  // Wafer-level (WIR/WRR).
  frameId:    { label: 'Frame' },
  maskId:     { label: 'Mask' },
  fabWaferId: { label: 'Fab wafer ID' },
  waferStartT:  { label: 'Wafer start date',  date: true },
  waferFinishT: { label: 'Wafer finish date', date: true },
  waferDescUser: { label: 'Wafer description' },
  waferDescExec: { label: 'Wafer description (tester)' },
  // STDF V4-2007 Version Update Record — present only in files that declare
  // that revision (e.g. "V4-2007"); a plain V4 file has no such field.
  updNam:     { label: 'STDF revision' },
  // Wafer Configuration Record (WCR) — the geometry the tester declared, not a grouping axis (the maps are drawn from it).
  // Codes and bare sizes are decoded through wcr.ts, the same tables `wcrGeometryFrom` builds the map from.
  wafrSiz:    { label: 'Wafer diameter', facet: false, display: wcrSize },
  dieWid:     { label: 'Die width',      facet: false, display: wcrSize },
  dieHt:      { label: 'Die height',     facet: false, display: wcrSize },
  wfUnits:    { label: 'Wafer units',    facet: false, hidden: true }, // shown inside the sizes
  wfFlat:     { label: 'Wafer flat',     facet: false, display: wcrLetter(WCR_FLAT_SIDE) },
  centerX:    { label: 'Centre die X',   facet: false },
  centerY:    { label: 'Centre die Y',   facet: false },
  posX:       { label: 'X increases',    facet: false, display: wcrLetter(WCR_POS_X) },
  posY:       { label: 'Y increases',    facet: false, display: wcrLetter(WCR_POS_Y) },
};

const DISPLAY_ORDER = Object.keys(FIELD_META).filter(k => !FIELD_META[k].hidden);

/** Metadata keys in display order: curated fields in FIELD_META's order (most
 *  useful first), then unknown ones in the order given — for a CSV that is its
 *  header order. Hidden fields are left out. One rule for the facet table and
 *  the file-filter columns. */
export function orderFieldKeys(keys: Iterable<string>): string[] {
  const present = new Set(keys);
  return [
    ...DISPLAY_ORDER.filter(k => present.has(k)),
    ...[...present].filter(k => !(k in FIELD_META)),
  ];
}

/** A metadata key's display label — curated where known, the raw key otherwise. */
export function labelFor(key: string): string {
  return FIELD_META[key]?.label ?? key;
}

/** True for a field never shown on its own (see `FieldMeta.hidden`). */
export function isHiddenField(key: string): boolean {
  return FIELD_META[key]?.hidden === true;
}

/**
 * A field's value as shown to the user — decoded where the raw value is a code
 * (WCR "D" → "Bottom", a size with its units), verbatim otherwise. The one
 * decoder for every surface: wmap's panels (via `toWmapWaferMeta`), the facet
 * table, and the file filter.
 */
export function displayValue(key: string, raw: string, get: FieldGetter): string {
  const decode = FIELD_META[key]?.display;
  return decode ? decode(raw, get) : raw;
}

/** Truncate an ISO datetime (or any string) to its date portion `YYYY-MM-DD`. */
function dateOnly(value: string): string {
  const t = value.indexOf('T');
  return t > 0 ? value.slice(0, t) : value;
}

/**
 * Look up a field's value across a wafer's lot-level (source) and per-wafer fields.
 * Lot-level (`source.fields`) wins by design: keys are disjoint in practice
 * (lot/MIR vs wafer/WIR-WRR), so the order only matters in the rare overlap, where
 * the lot value is the more authoritative one. Per-wafer fields are the fallback.
 */
function rawValueOf(wafer: WaferData, key: string): string | undefined {
  const fromSource = wafer.source?.fields.find(f => f.key === key)?.value;
  if (fromSource !== undefined) return fromSource;
  return wafer.fields?.find(f => f.key === key)?.value;
}

/**
 * The faceting value of a field for a wafer: the raw value, except date-typed
 * fields are truncated to date-only so grouping is by day, not timestamp.
 */
export function facetValueOf(wafer: WaferData, key: string): string | undefined {
  const raw = rawValueOf(wafer, key);
  if (raw === undefined || raw === '') return undefined;
  return FIELD_META[key]?.date ? dateOnly(raw) : displayValue(key, raw, k => rawValueOf(wafer, k));
}

/** One curated field as a host option needs it: tsmap's raw key, its label, whether it is a Group by choice, whether a date. */
export function curatedFields(): Array<{ key: string; label: string; facet: boolean; date: boolean }> {
  return Object.entries(FIELD_META)
    .filter(([, m]) => !m.hidden)
    .map(([key, m]) => ({ key, label: m.label, facet: m.facet !== false, date: m.date === true }));
}

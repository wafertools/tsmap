// Parametric sweep definitions: the JSON file behind Setup ▾ → Sweeps….
//
// A sweep is hierarchical (sweep → series → ordered tests + x values), which a
// one-row-per-thing CSV cannot express without either repeating fields on every
// row or inventing a syntax inside cells. So unlike tsmap's other definitions
// files this one is JSON, and the `sweeps` array inside it is wmap's own
// `SweepSpec` shape verbatim: tsmap validates it and hands it over unchanged,
// so an example in wmap's docs pastes straight in and there is one definition of
// a sweep, not two.
//
// The wrapper (`format`/`version`) is tsmap's: tsmap also opens die data as
// JSON, and a marker is what turns "picked the wrong file" into a clear message
// instead of a confusing shape error.
//
// Range strings in `tests` ("3000..3030") are wmap's, parsed by the same code as
// a derived-test expression's t[3000..3030]. They are passed through untouched —
// what a range matches depends on the tests loaded, which only the build knows,
// and the sweep card reports a range that comes up short.

import type { InsightsOptions } from '@wafertools/wafermap/render';

export type SweepSpec = NonNullable<InsightsOptions['sweeps']>[number];
type SweepSeriesSpec = SweepSpec['series'][number];

export const SWEEPS_FORMAT = 'tsmap-sweeps';
export const SWEEPS_VERSION = 1;

export interface ParseSweepsResult {
  sweeps: SweepSpec[];
  /** Problems that dropped a sweep or a field, each naming where. */
  warnings: string[];
  /** Set when nothing could be read at all — the file as a whole is rejected. */
  error?: string;
}

const RANGE_TEXT = /^\s*\d+\s*(\.\.\s*\d+\s*)?$/;

/**
 * Offset of the first JSON syntax error, found by walking the text.
 *
 * `JSON.parse`'s own message cannot be relied on for this: V8 reports a
 * position for some errors and not others, and WebKit (the Tauri webview on
 * Linux and macOS) reports none. A hand-edited file with one stray comma is the
 * case this file format has to handle well, so the location is computed here.
 */
export function jsonErrorOffset(text: string): number | undefined {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (): never => { throw i; };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        str(); ws();
        if (text[i] !== ':') fail();
        i++; value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return; }
        fail();
      }
    }
    if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return; }
        fail();
      }
    }
    if (c === '"') { str(); return; }
    const lit = /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!lit) fail();
    i += lit![0].length;
  };
  const str = (): void => {
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text[i] < ' ') fail();
      i++;
    }
    if (i >= text.length) fail();
    i++;
  };
  try {
    value(); ws();
    return i < text.length ? i : undefined;
  } catch (at) {
    return typeof at === 'number' ? at : undefined;
  }
}

function lineColumn(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return `line ${line}, column ${before.length - before.lastIndexOf('\n')}`;
}

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every(n => typeof n === 'number' && Number.isFinite(n));

function readSeries(raw: unknown, where: string, warnings: string[]): SweepSeriesSpec | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${where}: not an object — series skipped`);
    return null;
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.label !== 'string' || !s.label.trim()) {
    warnings.push(`${where}: missing "label" — series skipped`);
    return null;
  }
  const at = `${where} "${s.label}"`;
  if (!Array.isArray(s.tests) || s.tests.length === 0) {
    warnings.push(`${at}: "tests" must be a non-empty list of test numbers or ranges like "3000..3030" — series skipped`);
    return null;
  }
  const bad = s.tests.find(t => !(typeof t === 'number' && Number.isInteger(t)) && !(typeof t === 'string' && RANGE_TEXT.test(t)));
  if (bad !== undefined) {
    warnings.push(`${at}: ${JSON.stringify(bad)} in "tests" is not a test number or a range like "3000..3030" — series skipped`);
    return null;
  }
  const series: SweepSeriesSpec = { label: s.label, tests: s.tests as Array<number | string> };
  if (s.xValues !== undefined) {
    if (isNumberArray(s.xValues)) series.xValues = s.xValues;
    else warnings.push(`${at}: "xValues" must be a list of numbers — ignored, so the axis is test order`);
  }
  if (s.xFromName !== undefined) {
    // Checked for shape only: whether the pattern fits the test names depends
    // on the data, and wmap reports that on the card itself.
    if (typeof s.xFromName === 'string' && s.xFromName.includes('{x}')) series.xFromName = s.xFromName;
    else warnings.push(`${at}: "xFromName" must be a pattern containing {x}, like "LRS_STATS_{x}" — ignored, so the axis is test order`);
  }
  if (s.color !== undefined) {
    if (typeof s.color === 'string') series.color = s.color;
    else warnings.push(`${at}: "color" must be a string — ignored`);
  }
  for (const key of Object.keys(s)) {
    if (!['label', 'tests', 'xValues', 'xFromName', 'color'].includes(key)) warnings.push(`${at}: unknown field "${key}" ignored`);
  }
  return series;
}

function readSweep(raw: unknown, index: number, seenIds: Set<string>, warnings: string[]): SweepSpec | null {
  const where = `Sweep ${index + 1}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${where}: not an object — skipped`);
    return null;
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id.trim()) {
    warnings.push(`${where}: missing "id" — skipped`);
    return null;
  }
  const at = `Sweep "${s.id}"`;
  if (seenIds.has(s.id)) {
    warnings.push(`${at}: the id is used twice — the second is skipped`);
    return null;
  }
  if (!Array.isArray(s.series) || s.series.length === 0) {
    warnings.push(`${at}: "series" must be a non-empty list — skipped`);
    return null;
  }
  const series = s.series
    .map((sr, i) => readSeries(sr, `${at}, series ${i + 1}`, warnings))
    .filter((sr): sr is SweepSeriesSpec => sr !== null);
  if (series.length === 0) {
    warnings.push(`${at}: no usable series — skipped`);
    return null;
  }

  const sweep: SweepSpec = {
    id: s.id,
    title: typeof s.title === 'string' && s.title.trim() ? s.title : s.id,
    series,
  };
  if (s.title !== undefined && typeof s.title !== 'string') warnings.push(`${at}: "title" must be a string — the id is used instead`);
  for (const key of ['xLabel', 'yLabel', 'xUnit'] as const) {
    if (s[key] === undefined) continue;
    if (typeof s[key] === 'string') sweep[key] = s[key];
    else warnings.push(`${at}: "${key}" must be a string — ignored`);
  }
  if (s.xScale !== undefined) {
    if (s.xScale === 'linear' || s.xScale === 'log') sweep.xScale = s.xScale;
    else warnings.push(`${at}: "xScale" must be "linear" or "log" — ignored, so the axis is linear`);
  }
  if (s.crossing !== undefined) {
    if (typeof s.crossing === 'boolean') sweep.crossing = s.crossing;
    else warnings.push(`${at}: "crossing" must be true or false — ignored`);
  }
  if (s.separationAt !== undefined) {
    if (isNumberArray(s.separationAt)) sweep.separationAt = s.separationAt;
    else warnings.push(`${at}: "separationAt" must be a list of numbers — ignored`);
  }
  for (const key of Object.keys(s)) {
    if (!['id', 'title', 'series', 'xLabel', 'yLabel', 'xUnit', 'xScale', 'crossing', 'separationAt'].includes(key)) {
      warnings.push(`${at}: unknown field "${key}" ignored`);
    }
  }
  seenIds.add(s.id);
  return sweep;
}

/**
 * Parse a sweeps file. Never throws: a file that is not a sweeps file at all
 * comes back with `error`; a file with some bad entries keeps the good ones and
 * names each problem in `warnings`.
 */
export function parseSweepsFile(text: string): ParseSweepsResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const offset = jsonErrorOffset(text);
    const near = offset !== undefined ? text.slice(offset, offset + 20).split('\n')[0] : '';
    return {
      sweeps: [], warnings: [],
      error: offset !== undefined
        ? `not valid JSON — a problem at ${lineColumn(text, offset)}${near ? `, at "${near}"` : ' (the file ends early)'}. A trailing comma or a missing quote is the usual cause`
        : `not valid JSON (${e instanceof Error ? e.message : String(e)})`,
    };
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc) || (doc as Record<string, unknown>).format !== SWEEPS_FORMAT) {
    return {
      sweeps: [], warnings: [],
      error: `not a sweeps file — expected an object with "format": "${SWEEPS_FORMAT}" (Help → Definitions file formats… saves an example)`,
    };
  }
  const d = doc as Record<string, unknown>;
  const warnings: string[] = [];
  if (typeof d.version === 'number' && d.version > SWEEPS_VERSION) {
    warnings.push(`File is version ${d.version}; this tsmap reads version ${SWEEPS_VERSION} — fields it does not know are ignored`);
  }
  if (!Array.isArray(d.sweeps)) {
    return { sweeps: [], warnings, error: 'the file has no "sweeps" list' };
  }
  const seen = new Set<string>();
  const sweeps = d.sweeps
    .map((s, i) => readSweep(s, i, seen, warnings))
    .filter((s): s is SweepSpec => s !== null);
  return { sweeps, warnings };
}

/** Serialise sweeps to the file `parseSweepsFile` reads. Series are kept on one
 *  line each so a file reads as a table of curves rather than a column of numbers. */
export function formatSweepsFile(sweeps: SweepSpec[]): string {
  const ind = (n: number) => ' '.repeat(n);
  const sweepText = sweeps.map(s => {
    const { series, ...rest } = s;
    const head = Object.entries(rest).map(([k, v]) => `${ind(6)}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    const seriesLines = series.map(sr => `${ind(8)}${JSON.stringify(sr)}`).join(',\n');
    return `${ind(4)}{\n${head.join(',\n')},\n${ind(6)}"series": [\n${seriesLines}\n${ind(6)}]\n${ind(4)}}`;
  });
  return `{\n  "format": "${SWEEPS_FORMAT}",\n  "version": ${SWEEPS_VERSION},\n  "sweeps": [\n${sweepText.join(',\n')}\n  ]\n}\n`;
}

/** The example Help → Definitions file formats… saves. */
export const SWEEPS_TEMPLATE: SweepSpec[] = [{
  id: 'set-reset',
  title: 'Set / reset switching',
  xLabel: 'Voltage (V)',
  yLabel: 'Read current',
  series: [
    { label: 'Reset (falling)', tests: ['3000..3030'], xValues: Array.from({ length: 31 }, (_, i) => Math.round((-1.5 + i * 0.1) * 10) / 10) },
    { label: 'Set (rising)',    tests: ['3100..3130'], xValues: Array.from({ length: 31 }, (_, i) => Math.round((-1.5 + i * 0.1) * 10) / 10) },
  ],
  separationAt: [10, 50],
}];

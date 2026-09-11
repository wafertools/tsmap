// Bin definitions: a human-readable name, pass/fail flag and optional display
// colour per hard or soft bin number, either overriding what STDF/ATDF's own HBR/SBR records
// supplied, or supplying it outright for CSV/JSON/Parquet (which have no
// HBR/SBR equivalent at all — see WCR/HBR/SBR work in packages/parsers).
//
// TypeScript-only, the same fixed-schema config-list pattern as
// testSelectorUI.ts's test definitions and splits.ts's splits CSV — not routed
// through the Rust testdata-parser crate, which exists for large
// arbitrary-column die-data imports, not this.

import type { BinDef } from '@wafertools/wafermap';

export interface BinDefEntry {
  bin: number;
  /** Hard and soft bins occupy independent number spaces (STDF V4) — the
   *  same rule documented throughout this codebase (waferGeometry.ts,
   *  CLAUDE.md). Defaults to 'hard' when no type column/value is given: the
   *  common single-axis case (most CSV/JSON/Parquet loads map only one bin
   *  column) shouldn't need to spell out a type column at all. */
  type: 'hard' | 'soft';
  name?: string;
  /** undefined = no override. Only meaningful for hard bins in practice
   *  (wmap's own `die.hbin ?? die.sbin` precedence), but not rejected for a
   *  soft-bin row — the user opted into this file, not an automatic guess. */
  pass?: boolean;
  /** `#rrggbb`, lower-cased. The colour this bin is drawn in on every map —
   *  a site's standard bin colour sheet, typically. wmap honours it over the
   *  palette (`BinDef.color`), and the viewer can switch that off in the map's
   *  Colour scheme menu. undefined = no override. */
  color?: string;
}

type BinDefField = 'bin' | 'type' | 'name' | 'pass' | 'color';

/** Header cell (normalized: trimmed, lowercased, spaces/dashes/underscores
 *  collapsed) -> canonical column. `hbin`/`sbin` (and their long forms) map
 *  to the `bin` column AND imply `type` directly — see HEADER_IMPLIED_TYPE. */
const HEADER_FIELD_ALIASES: Record<string, BinDefField> = {
  bin: 'bin', binnum: 'bin', binnumber: 'bin',
  hbin: 'bin', hardbin: 'bin',
  sbin: 'bin', softbin: 'bin',
  type: 'type', bintype: 'type',
  name: 'name', binname: 'name',
  pass: 'pass', passfail: 'pass', pf: 'pass',
  color: 'color', colour: 'color', bincolor: 'color', bincolour: 'color', hex: 'color',
};

/** Header names that imply a bin type without a separate `type` column. */
const HEADER_IMPLIED_TYPE: Record<string, 'hard' | 'soft'> = {
  hbin: 'hard', hardbin: 'hard',
  sbin: 'soft', softbin: 'soft',
};

function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const PASS_TOKENS = new Set(['p', 'pass', 'y', 'yes', 'true', '1']);
const FAIL_TOKENS = new Set(['f', 'fail', 'n', 'no', 'false', '0']);

function parsePassFlag(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (PASS_TOKENS.has(v)) return true;
  if (FAIL_TOKENS.has(v)) return false;
  return undefined;
}

/** `#rgb` / `#rrggbb` → `#rrggbb` lower-cased; anything else → undefined.
 *  Hex only, deliberately: CSS colour names and `rgb()` would be accepted by
 *  a browser but not by every tool a colour sheet is edited in, and a typo'd
 *  name (`"gren"`) would reach the canvas as an invalid colour and draw black. */
function parseHexColor(raw: string): string | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return undefined;
  const hex = m[1].toLowerCase();
  return '#' + (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex);
}

/**
 * Parses a bin-definitions file: comma-delimited, **header row required**
 * (`bin,type,name,pass,color`, any order/subset, case-insensitive with synonyms —
 * see HEADER_FIELD_ALIASES). Unlike the test list, there's no legacy
 * header-less mode to preserve — this is a new format with nothing to stay
 * compatible with.
 *
 * Never throws: a malformed individual field is dropped (with `onWarn`, if
 * given) but leaves the rest of the row intact; only a row whose bin number
 * can't be identified at all is skipped entirely.
 */
export function parseBinDefsFile(
  text: string,
  onWarn?: (lineNo: number, message: string) => void,
): BinDefEntry[] {
  const results: BinDefEntry[] = [];
  let columns: Array<BinDefField | undefined> = [];
  let headerImpliedType: 'hard' | 'soft' | undefined;
  let headerSeen = false;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const fields = line.split(',').map(f => f.trim());

    if (!headerSeen) {
      const mapping: Array<BinDefField | undefined> = [];
      const impliedTypes: Array<'hard' | 'soft' | undefined> = [];
      let matchedAny = false;
      for (const raw of fields) {
        const key = normalizeHeaderKey(raw);
        const field = HEADER_FIELD_ALIASES[key];
        mapping.push(field);
        impliedTypes.push(HEADER_IMPLIED_TYPE[key]);
        if (field) matchedAny = true;
        else if (raw) onWarn?.(lineNo, `Unrecognized column "${raw}" ignored`);
      }
      if (!matchedAny) {
        onWarn?.(lineNo, 'Header row has no recognized columns — expected at least "bin"');
        continue;
      }
      columns = mapping;
      headerImpliedType = impliedTypes.find(t => t !== undefined);
      headerSeen = true;
      continue;
    }

    let bin: number | undefined;
    let type: 'hard' | 'soft' | undefined = headerImpliedType;
    let name: string | undefined;
    let pass: boolean | undefined;
    let color: string | undefined;

    for (let c = 0; c < fields.length; c++) {
      const field = columns[c];
      const raw = fields[c];
      if (!field || !raw) continue;
      switch (field) {
        case 'bin': {
          const n = parseInt(raw, 10);
          if (!isNaN(n)) bin = n;
          else onWarn?.(lineNo, `Invalid bin number "${raw}" ignored`);
          break;
        }
        case 'type': {
          const t = raw.toLowerCase();
          if (t === 'hard' || t === 'h') type = 'hard';
          else if (t === 'soft' || t === 's') type = 'soft';
          else onWarn?.(lineNo, `Invalid bin type "${raw}" ignored (expected hard or soft)`);
          break;
        }
        case 'name':
          name = raw;
          break;
        case 'pass': {
          const p = parsePassFlag(raw);
          if (p !== undefined) pass = p;
          else onWarn?.(lineNo, `Invalid pass value "${raw}" ignored (expected P/F, Y/N, true/false)`);
          break;
        }
        case 'color': {
          const hex = parseHexColor(raw);
          if (hex !== undefined) color = hex;
          else onWarn?.(lineNo, `Invalid colour "${raw}" ignored (expected a hex colour such as #1f77b4)`);
          break;
        }
      }
    }

    if (bin === undefined) continue; // unidentifiable bin number — skip the row
    results.push({ bin, type: type ?? 'hard', name, pass, color });
  }

  return results;
}

/** Serializes bin-definition entries back to the file `parseBinDefsFile`
 *  reads — canonical header, one row per entry, all 5 columns always
 *  present (blank for unset name/pass/color). Commas inside `name` are replaced
 *  with a space (no CSV quoting support), same lossy-edge-case tradeoff
 *  `formatTestListCsv` already accepts. */
export function formatBinDefsCsv(entries: BinDefEntry[]): string {
  const clean = (s: string) => s.replace(/,/g, ' ');
  const lines = [
    '# tsmap bin definitions',
    `# Saved: ${new Date().toISOString()}`,
    'bin,type,name,pass,color',
    ...entries.map(e => [
      e.bin,
      e.type,
      e.name !== undefined ? clean(e.name) : '',
      e.pass === undefined ? '' : e.pass ? 'P' : 'F',
      e.color ?? '',
    ].join(',')),
  ];
  return lines.join('\n');
}

interface BinDefParts {
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  passHbins?: number[];
}

/**
 * Merges bin-definition overrides onto `current`, keyed on the **composite**
 * `(type, bin)` pair — hard bin 1 and soft bin 1 are different entries, the
 * same independent-number-spaces rule documented throughout this codebase.
 * Only fields an override actually specifies are touched, mirroring
 * `applyTestOverrides`'s rule exactly: a blank `name` or `color` leaves the
 * existing value alone; `pass === undefined` leaves existing pass-membership alone;
 * `pass === true`/`false` explicitly adds/removes that hard bin from
 * `passHbins`. Empty results collapse to `undefined`, matching `ParsedFile`'s
 * "absent means nothing to show" convention.
 *
 * Serves both call sites in main.ts: STDF/ATDF overriding parsed HBR/SBR
 * (`current` populated), and CSV/JSON/Parquet building bin defs from nothing
 * (`current: {}`).
 */
export function applyBinDefOverrides(current: BinDefParts, overrides: BinDefEntry[]): BinDefParts {
  type Def = { name: string; color?: string };
  const byBin = (defs: BinDef[] | undefined) =>
    new Map<number, Def>((defs ?? []).map(d => [d.bin, { name: d.name, color: d.color }]));
  const hbins = byBin(current.hbinDefs);
  const sbins = byBin(current.sbinDefs);
  const passHbins = new Set<number>(current.passHbins ?? []);

  for (const o of overrides) {
    const defs = o.type === 'hard' ? hbins : sbins;
    if (o.name !== undefined || o.color !== undefined) {
      const prev = defs.get(o.bin);
      // A colour-only row for an unnamed bin keeps an empty name — wmap reads
      // an empty name as "no name" and labels the bin by number, rather than
      // this inventing a name the file never gave.
      defs.set(o.bin, { name: o.name ?? prev?.name ?? '', color: o.color ?? prev?.color });
    }
    if (o.type === 'hard' && o.pass !== undefined) {
      if (o.pass) passHbins.add(o.bin); else passHbins.delete(o.bin);
    }
  }

  const toDefs = (m: Map<number, Def>): BinDef[] =>
    [...m.entries()]
      .map(([bin, d]) => (d.color ? { bin, name: d.name, color: d.color } : { bin, name: d.name }))
      .sort((a, b) => a.bin - b.bin);

  const hbinDefs = toDefs(hbins);
  const sbinDefs = toDefs(sbins);
  const passList = [...passHbins].sort((a, b) => a - b);

  return {
    hbinDefs: hbinDefs.length ? hbinDefs : undefined,
    sbinDefs: sbinDefs.length ? sbinDefs : undefined,
    passHbins: passList.length ? passList : undefined,
  };
}

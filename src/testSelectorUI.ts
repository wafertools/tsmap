import type { TestDef, TestOverride } from './types';
import { createRangeSelection } from './listSelection';
import { ICONS } from '@wafertools/wafermap/render';
import { attachTooltip } from './tooltip';
import { buildToggleGroup } from './toggleGroup';
import { makeLoadDefinitionsButton, type RecentLoadRow } from './recentDefinitionsUI';

export interface CapacityInfo {
  /** Total dies across all files being loaded. */
  dieCount: number;
  /** Total tests found in the scan. */
  totalTests: number;
}

export interface TestSelectorOptions {
  /**
   * Current scan scope for a multi-file binary load: `'largest'` = the test list
   * came from the largest file only (a fast default); `'all'` = every file was
   * scanned and merged. Drives the source caption + the "scan all" toggle.
   * Undefined for single-file or CSV/JSON loads (no scope to widen).
   */
  scanScope?: 'largest' | 'all';
  /** Number of binary files in the load — shown in the "scan all N files" toggle. */
  scanFileCount?: number;
  /**
   * Invoked when the user asks to widen the scan to all files. Receives the
   * in-progress selection + test overrides so the host can re-open the selector
   * with them preserved. Only wired when widening is possible (>1 file, scope
   * still `'largest'`); absent otherwise, which hides the toggle.
   */
  onScanAll?: (selection: number[], testOverrides: Map<number, TestOverride>) => void;
  initialSelection?: number[];
  testOverrides?: Map<number, TestOverride>;
  capacity?: CapacityInfo;
  onSave?: (entries: TestListEntry[]) => Promise<void>;
  onLoad?: () => Promise<string | null>;
  /**
   * Recently-used definitions files, offered behind a caret beside "Load
   * definitions" so a user who reloads the same list for every dataset does not
   * have to walk the file picker each time.
   *
   * Supplied as ready-to-run rows rather than as stored records: resolving one
   * may need to re-read from disk and report that the file has changed, which is
   * platform work this module has no business knowing about. It renders labels
   * and calls `run`; `null` from `run` means "nothing loaded", exactly as
   * `onLoad` already does for a cancelled picker.
   */
  recentLoads?: () => RecentLoadRow[];
  /** Caveat shown once above the recent rows — see `note` in recentDefinitionsUI. */
  recentNote?: string;
  /**
   * Confirm-button text, given the number of selected tests. Defaults to the
   * "Import …" wording used on first load.
   *
   * Reopening the selector to adjust an existing lot is not an import — the data
   * is already here, and narrowing or relabelling applies in memory without
   * re-reading anything. Calling that "Import" described the machinery rather
   * than the act.
   */
  confirmLabel?: (selectedCount: number) => string;
  /**
   * Same file format the "Load definitions" button accepts — applied once, before
   * the overlay's first render, so the selection/renames are already checked
   * when the user sees it (used for a CLI-supplied `--tests` file). The
   * overlay is always still shown; this only pre-fills it, per CLAUDE.md's
   * "test selector is always shown, user must choose explicitly" rule.
   */
  preloadListText?: string;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onAsk?: (message: string) => Promise<boolean>;
}

/** One row of a parsed test-list/definitions file — `num` plus whatever
 * override fields that row actually specified. */
export type TestListEntry = { num: number } & TestOverride;

type TestListField = 'num' | 'name' | 'loLimit' | 'hiLimit' | 'units' | 'testType';

/** Header cell (normalized: trimmed, lowercased, spaces/dashes/underscores
 * collapsed) -> canonical column. Lets a hand-authored or externally-exported
 * file spell columns as "LSL"/"USL"/"Test Type" etc. */
const HEADER_FIELD_ALIASES: Record<string, TestListField> = {
  num: 'num', number: 'num', testnum: 'num', testnumber: 'num',
  name: 'name', testname: 'name',
  lolimit: 'loLimit', lo: 'loLimit', lsl: 'loLimit', low: 'loLimit', lowlimit: 'loLimit',
  hilimit: 'hiLimit', hi: 'hiLimit', usl: 'hiLimit', high: 'hiLimit', highlimit: 'hiLimit',
  units: 'units', unit: 'units',
  testtype: 'testType', type: 'testType',
};

function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** Column order assumed for a comma-delimited file with no header row —
 * matches the file this app has always written (num,name), extended with
 * the new optional columns. */
const DEFAULT_COLUMNS: TestListField[] = ['num', 'name', 'loLimit', 'hiLimit', 'units', 'testType'];

/**
 * Parses a "test list" / test-definitions file: one test per line, either
 * `<num> <name>` (legacy, whitespace/semicolon-separated, no limit/type
 * columns — untouched for backward compatibility) or comma-delimited with an
 * optional self-describing header (`num,name,loLimit,hiLimit,units,testType`,
 * any subset/order, column names matched case-insensitively with synonyms
 * like `lsl`/`usl`/`type` — see `HEADER_FIELD_ALIASES`). Without a header,
 * comma-delimited rows use the default column order above, so old
 * header-less `num,name` saves keep parsing exactly as before.
 *
 * Never throws: a malformed individual field is dropped (with `onWarn`, if
 * given) but leaves the rest of the row intact; only a row whose test number
 * can't be identified at all is skipped entirely.
 */
export function parseTestListFile(
  text: string,
  onWarn?: (lineNo: number, message: string) => void,
): TestListEntry[] {
  const results: TestListEntry[] = [];
  let columns: Array<TestListField | undefined> = DEFAULT_COLUMNS;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (!line.includes(',')) {
      // Legacy shorthand: whitespace/semicolon-separated, num + optional
      // name only — no limit/type columns are reachable via this form.
      const tokens = line.split(/[;\s]+/).filter(t => t.length > 0);
      if (tokens.length === 0) continue;
      const num = parseInt(tokens[0], 10);
      if (isNaN(num)) continue;
      const name = tokens.length > 1 ? tokens.slice(1).join(' ') : undefined;
      results.push({ num, name });
      continue;
    }

    const fields = line.split(',').map(f => f.trim());
    const numIdx = columns.indexOf('num');
    const numRaw = numIdx >= 0 && numIdx < fields.length ? fields[numIdx] : fields[0];
    const num = parseInt(numRaw, 10);

    if (isNaN(num)) {
      // Not a data row: either a header line (redefines `columns` for
      // subsequent rows) or unrecognized text — either way, not data. Only
      // warn about unmatched cells once we know this line IS a header (i.e.
      // at least one cell matched) — a genuinely unrecognized/garbage line
      // (no matches at all) is silently skipped, same as always.
      const mapping: Array<TestListField | undefined> = [];
      const unmatchedRaw: string[] = [];
      let matchedAny = false;
      for (const raw of fields) {
        const field = HEADER_FIELD_ALIASES[normalizeHeaderKey(raw)];
        mapping.push(field);
        if (field) matchedAny = true;
        else if (raw) unmatchedRaw.push(raw);
      }
      if (matchedAny) {
        columns = mapping;
        for (const raw of unmatchedRaw) onWarn?.(lineNo, `Unrecognized column "${raw}" ignored`);
      }
      continue;
    }

    const row: TestListEntry = { num };
    for (let c = 0; c < fields.length; c++) {
      const field = columns[c];
      const raw = fields[c];
      if (!field || field === 'num') {
        if (field !== 'num' && raw) onWarn?.(lineNo, `Unrecognized extra column ${c + 1} ("${raw}") ignored`);
        continue;
      }
      if (!raw) continue; // blank field => no override for this field
      switch (field) {
        case 'name':
          row.name = raw;
          break;
        case 'loLimit':
        case 'hiLimit': {
          const n = Number(raw);
          if (Number.isFinite(n)) row[field] = n;
          else onWarn?.(lineNo, `Invalid ${field === 'loLimit' ? 'loLimit' : 'hiLimit'} value "${raw}" ignored`);
          break;
        }
        case 'units':
          row.units = raw;
          break;
        case 'testType': {
          const t = raw.toUpperCase();
          if (t === 'P' || t === 'F') row.testType = t;
          else onWarn?.(lineNo, `Invalid test type "${raw}" ignored (expected P or F)`);
          break;
        }
      }
    }
    results.push(row);
  }

  return results;
}

/** Serializes test-list entries back to the file `parseTestListFile` reads —
 * canonical header, one row per entry, all 6 columns always present (blank
 * for unset fields). Commas inside `name`/`units` are replaced with a space
 * (no CSV quoting support) — a pre-existing lossy edge case, not new here. */
export function formatTestListCsv(entries: TestListEntry[]): string {
  const clean = (s: string) => s.replace(/,/g, ' ');
  const lines = [
    '# tsmap test definitions',
    `# Saved: ${new Date().toISOString()}`,
    'num,name,loLimit,hiLimit,units,testType',
    ...entries.map(e => [
      e.num,
      e.name !== undefined ? clean(e.name) : '',
      e.loLimit !== undefined ? e.loLimit : '',
      e.hiLimit !== undefined ? e.hiLimit : '',
      e.units !== undefined ? clean(e.units) : '',
      e.testType ?? '',
    ].join(',')),
  ];
  return lines.join('\n');
}

export interface ResolveLoadedTestListResult {
  /** Overrides to merge into the live testOverrides map (num -> override). */
  overrides: Map<number, TestOverride>;
  /** Test numbers to select — already resolved to CURRENT numbers, i.e. a
   *  row recovered by name reports the current test's number, not the file's
   *  stale one. */
  selectedNums: number[];
  /** Row's number wasn't in the current scan, and no unique name match either. */
  unknownCount: number;
  /** Row's number wasn't in the current scan, but its name matched exactly
   *  one current test — recovered using that test's current number. */
  recoveredByNameCount: number;
  /** Row's number wasn't in the current scan, and its name matched more than
   *  one current test — never guessed, counted separately from unknown so
   *  the user can tell "not found" apart from "found more than once". */
  ambiguousCount: number;
  limitOnFunctionalCount: number;
}

/**
 * Resolve a parsed test-list file's rows against the currently loaded tests,
 * recovering rows whose saved NUMBER no longer matches the current scan by
 * falling back to an exact match on NAME — this is what lets a saved list
 * survive a test-numbering scheme change, a hand edit, a column reorder, or
 * any other renumbering, without needing to know which of those happened.
 *
 * Pure and exported so this can be tested directly rather than only through
 * the DOM-driven `applyLoadedList`, which is a thin wrapper around this that
 * additionally mutates `selected`/`testOverrides` and posts log messages.
 *
 * `currentNames` is the number -> effective display name for every test in
 * the current scan (i.e. testOverrides-aware — the caller passes
 * `displayName(num, def)` for each, since only it knows the live override
 * state). `existingOverrides` seeds each resolved override from whatever was
 * already recorded for that number, same merge behaviour as before this was
 * extracted into its own function.
 */
export function resolveLoadedTestList(
  parsed: TestListEntry[],
  currentTestDefs: Record<string, TestDef>,
  currentNames: Map<number, string>,
  existingOverrides: Map<number, TestOverride>,
): ResolveLoadedTestListResult {
  const nameToNums = new Map<string, number[]>();
  for (const [num, label] of currentNames) {
    const list = nameToNums.get(label);
    if (list) list.push(num); else nameToNums.set(label, [num]);
  }

  const overrides = new Map<number, TestOverride>();
  const selectedNums: number[] = [];
  let unknownCount = 0, recoveredByNameCount = 0, ambiguousCount = 0, limitOnFunctionalCount = 0;

  for (const row of parsed) {
    let num = row.num;
    if (!currentNames.has(num)) {
      const candidates = row.name !== undefined ? nameToNums.get(row.name) : undefined;
      if (candidates?.length === 1) {
        num = candidates[0];
        recoveredByNameCount++;
      } else if (candidates && candidates.length > 1) {
        ambiguousCount++;
        continue;
      } else {
        unknownCount++;
        continue;
      }
    }
    selectedNums.push(num);
    const existing = existingOverrides.get(num) ?? {};
    const ov: TestOverride = { ...existing };
    if (row.name !== undefined) ov.name = row.name;
    // Functional tests have no numeric value to check a spec limit against —
    // a row that specifies limits for one (whether the row's own type column
    // says F, or the test's real parsed type is F and the row doesn't
    // override type) is a likely data-entry mistake, so drop the limits and
    // count it rather than carry dead data (applyTestOverrides in lib.ts
    // enforces the same rule as a final safety net).
    const effectiveType = row.testType ?? currentTestDefs[String(num)]?.testType;
    if (effectiveType === 'F' && (row.loLimit !== undefined || row.hiLimit !== undefined)) {
      limitOnFunctionalCount++;
    } else {
      if (row.loLimit !== undefined) ov.loLimit = row.loLimit;
      if (row.hiLimit !== undefined) ov.hiLimit = row.hiLimit;
    }
    if (row.units !== undefined) ov.units = row.units;
    if (row.testType !== undefined) ov.testType = row.testType;
    if (Object.keys(ov).length) overrides.set(num, ov);
  }

  return { overrides, selectedNums, unknownCount, recoveredByNameCount, ambiguousCount, limitOnFunctionalCount };
}

/** One entry as `matchTestRange` needs it — the sorted list the selector builds. */
export type RangeMatchEntry = { num: number; def: { name: string } };

/**
 * Every entry a range expression names, ignoring any filter.
 *
 * The grammar: comma-separated segments, each either a single value or `X-Y`.
 * X and Y are a test number or a test name. `" - "` (spaced) splits
 * unambiguously; otherwise the LAST `-` splits, so `test_005-test_050` reads as
 * a range rather than as one odd name. A name-based range takes everything
 * between the first and last match **by list position**, not alphabetically —
 * the list is in test order, which is what "from here to there" means on screen.
 *
 * Deliberately kept separate from "what may be selected": the selector only ever
 * ticks entries the search/type filter is currently showing, and knowing the
 * difference between the two sets is what lets it distinguish "that range names
 * nothing" from "those tests exist but the filter is hiding them" — which used
 * to be one silent no-op.
 */
export function matchTestRange(rawInput: string, entries: RangeMatchEntry[]): Set<number> {
  const matched = new Set<number>();
  const segments = rawInput.split(',').map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    let beforeDash: string | null = null;
    let afterDash: string | null = null;

    const spacedDash = seg.indexOf(' - ');
    if (spacedDash !== -1) {
      beforeDash = seg.slice(0, spacedDash).trim();
      afterDash = seg.slice(spacedDash + 3).trim();
    } else {
      const lastDash = seg.lastIndexOf('-');
      if (lastDash > 0 && lastDash < seg.length - 1) {
        beforeDash = seg.slice(0, lastDash).trim();
        afterDash = seg.slice(lastDash + 1).trim();
      }
    }

    if (beforeDash !== null && afterDash !== null) {
      const loNum = parseInt(beforeDash, 10);
      const hiNum = parseInt(afterDash, 10);

      if (!isNaN(loNum) && !isNaN(hiNum)) {
        for (const e of entries) {
          if (e.num >= loNum && e.num <= hiNum) matched.add(e.num);
        }
      } else {
        const loLower = beforeDash.toLowerCase();
        const hiLower = afterDash.toLowerCase();
        const loIdx = entries.findIndex(e => e.def.name.toLowerCase().startsWith(loLower) || e.def.name.toLowerCase() === loLower);
        let hiIdx = -1;
        for (let i = entries.length - 1; i >= 0; i--) {
          const n = entries[i].def.name.toLowerCase();
          if (n.startsWith(hiLower) || n === hiLower) { hiIdx = i; break; }
        }
        if (loIdx !== -1 && hiIdx !== -1 && loIdx <= hiIdx) {
          for (let i = loIdx; i <= hiIdx; i++) matched.add(entries[i].num);
        }
      }
    } else {
      const n = parseInt(seg, 10);
      if (!isNaN(n)) {
        if (entries.some(e => e.num === n)) matched.add(n);
      } else {
        const segLower = seg.toLowerCase();
        for (const e of entries) {
          if (e.def.name.toLowerCase() === segLower || e.def.name.toLowerCase().startsWith(segLower)) {
            matched.add(e.num);
          }
        }
      }
    }
  }
  return matched;
}

export function showTestSelectorOverlay(
  testDefs: Record<string, TestDef>,
  onConfirm: (selected: number[], testOverrides: Map<number, TestOverride>) => void,
  onCancel: () => void,
  options: TestSelectorOptions = {},
): void {
  // Sort by `order` (the file's own column/encounter order), not by `num` —
  // CSV/JSON test numbers are now a hash of the test's identity (see
  // lib.ts's stableTestNumber), so sorting by number would show tests in an
  // arbitrary-looking order. `order` is absent for STDF/ATDF, where the real
  // test number IS a meaningful order, hence the `?? a.num` fallback.
  const entries: Array<{ num: number; def: TestDef }> = Object.entries(testDefs)
    .map(([k, def]) => ({ num: parseInt(k, 10), def }))
    .filter(e => !isNaN(e.num))
    .sort((a, b) => (a.def.order ?? a.num) - (b.def.order ?? b.num));

  const allNums = entries.map(e => e.num);

  // Default: nothing selected, or caller-supplied initial selection
  const selected = new Set<number>(options.initialSelection ?? []);

  // Test overrides: loaded from file (or an inline rename), shadow the
  // parser-supplied name/limits/units/type for display, and are applied on
  // top of the real TestDef after import (see applyTestOverrides in lib.ts).
  const testOverrides = new Map<number, TestOverride>(options.testOverrides ?? []);

  function displayName(num: number, def: TestDef): string {
    return testOverrides.get(num)?.name ?? def.name;
  }

  function effectiveLimits(num: number, def: TestDef): { loLimit?: number; hiLimit?: number; units?: string; testType: 'P' | 'F' } {
    const ov = testOverrides.get(num);
    return {
      loLimit: ov?.loLimit ?? def.loLimit,
      hiLimit: ov?.hiLimit ?? def.hiLimit,
      units: ov?.units ?? def.units,
      testType: ov?.testType ?? def.testType,
    };
  }

  // ── Overlay shell ─────────────────────────────────────────────────────────

  // z-modal: this overlay is shown both pre-render (initial load) and
  // post-render ("Tests…" re-invokes it over an already-rendered
  // wafer map/gallery) — it must clear wmap's own toolbar band (--wmap-z,
  // default 6000) in the post-render case, same as any other app modal
  // opened over a rendered map. See the z-index note in CLAUDE.md.
  const overlay = document.createElement('div');
  overlay.id = 'tsmap-test-selector-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:var(--z-modal)',
    'background:rgba(0,0,0,0.5)',
    'display:flex', 'align-items:center', 'justify-content:center',
  ].join(';');

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'tsmap-test-selector-title');
  panel.tabIndex = -1;
  panel.style.cssText = [
    // `--bg-overlay`, the surface every other dialog, menu and table uses.
    // This was the only place outside `.tsmap-modal` on `--bg-modal`, which is
    // why it read as a different shade from the splits dialog beside it.
    'background:var(--bg-overlay)', 'border:1px solid var(--border-mid)',
    'border-radius:var(--radius-container)', 'padding:16px',
    'width:min(640px,90vw)', 'max-height:80vh',
    'display:flex', 'flex-direction:column', 'gap:12px',
    'font-size:12px', 'color:var(--text-light)',
  ].join(';');

  // ── Header ────────────────────────────────────────────────────────────────

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

  const title = document.createElement('div');
  title.id = 'tsmap-test-selector-title';
  title.style.cssText = 'font-size:15px;font-weight:600';
  title.textContent = `Select tests to import (${entries.length} found)`;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = ICONS.close;
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.className = 'btn-icon';
  closeBtn.addEventListener('click', () => { cleanup(); onCancel(); });

  header.append(title, closeBtn);

  // ── Controls row ──────────────────────────────────────────────────────────

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search by name or number…';
  searchInput.style.cssText = [
    'flex:1;min-width:160px;padding:6px 8px',
    'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'background:var(--bg-input);color:var(--text-secondary)',
    'font-size:12px',
  ].join(';');

  let activeType: 'all' | 'P' | 'F' = 'all';
  const typeFilter = buildToggleGroup<'all' | 'P' | 'F'>({
    options: [
      { value: 'all', label: 'All' },
      { value: 'P', label: 'Parametric' },
      { value: 'F', label: 'Functional' },
    ],
    active: activeType,
    ariaLabel: 'Test type',
    onChange: val => {
      activeType = val;
      setRangeMsg('');   // the reachable set just changed — the message is stale
      renderList();
    },
  }).el;

  controls.append(searchInput, typeFilter);

  // ── Range control (lives in the bulk-select row, below) ───────────────────

  const rangeInput = document.createElement('input');
  rangeInput.type = 'text';
  rangeInput.placeholder = 'or a range: 1000-1099, test_005-test_050';
  rangeInput.style.cssText = [
    'flex:1;padding:6px 8px',
    'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'background:var(--bg-input);color:var(--text-secondary)',
    'font-size:12px',
  ].join(';');

  /** Inline outcome/scoping feedback for the range box. The range acts only on
   *  entries the search + type filter currently show (same as Select all/none
   *  beside it), so a range naming real tests can legitimately select nothing.
   *  That used to happen silently — the button appeared dead. It now says what
   *  it did, and when the filter is what blocked it, says so explicitly. */
  const rangeMsg = document.createElement('div');
  rangeMsg.style.cssText = 'font-size:12px;color:var(--text-muted);min-height:0';
  rangeMsg.setAttribute('role', 'status');
  rangeMsg.setAttribute('aria-live', 'polite');
  const setRangeMsg = (text: string, warn = false): void => {
    rangeMsg.textContent = text;
    rangeMsg.style.color = warn ? 'var(--warn-text)' : 'var(--text-muted)';
  };

  const applyRangeBtn = document.createElement('button');
  applyRangeBtn.textContent = 'Select range';
  applyRangeBtn.className = 'btn-secondary';
  applyRangeBtn.addEventListener('click', () => {
    const rawInput = rangeInput.value.trim();
    if (!rawInput) { setRangeMsg(''); return; }

    const visibleSet = new Set(getVisible().map(e => e.num));
    const matched = matchTestRange(rawInput, entries);
    const reachable = [...matched].filter(n => visibleSet.has(n));
    const hidden = matched.size - reachable.length;

    for (const n of reachable) selected.add(n);

    const filterOn = searchInput.value.trim() !== '' || activeType !== 'all';
    if (matched.size === 0) {
      setRangeMsg(`No test matches “${rawInput}”.`, true);
    } else if (reachable.length === 0) {
      setRangeMsg(
        `No shown test in “${rawInput}” — ${hidden} ${hidden === 1 ? 'is' : 'are'} hidden by the current filter. Clear it to reach ${hidden === 1 ? 'it' : 'them'}.`,
        true,
      );
    } else if (hidden > 0) {
      setRangeMsg(`Selected ${reachable.length}. ${hidden} more ${hidden === 1 ? 'matches' : 'match'} but ${hidden === 1 ? 'is' : 'are'} hidden by the current filter.`);
    } else {
      setRangeMsg(`Selected ${reachable.length} test${reachable.length !== 1 ? 's' : ''}${filterOn ? ' from those shown' : ''}.`);
    }

    renderList();
    updateFooter();
  });


  // ── Select all / none ─────────────────────────────────────────────────────

  const bulkRow = document.createElement('div');
  bulkRow.style.cssText = 'display:flex;gap:8px;align-items:center';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = 'Select all';
  selectAllBtn.className = 'btn-secondary';
  selectAllBtn.addEventListener('click', () => {
    for (const e of getVisible()) selected.add(e.num);
    renderList();
    updateFooter();
  });

  const selectNoneBtn = document.createElement('button');
  selectNoneBtn.textContent = 'Select none';
  selectNoneBtn.className = 'btn-secondary';
  selectNoneBtn.addEventListener('click', () => {
    for (const e of getVisible()) selected.delete(e.num);
    renderList();
    updateFooter();
  });

  // The range box lives here, beside Select all/none, because all three do the
  // same thing — tick checkboxes among the entries the filter currently shows.
  // It used to sit in its own row directly under the search box, which grouped
  // it by "is a text input" with the one control it shares no behaviour with,
  // and read as a second search field narrowing the list rather than a
  // selection action. Grouping by verb makes the shared scoping self-evident.
  const bulkSpacer = document.createElement('div');
  bulkSpacer.style.cssText = 'width:1px;align-self:stretch;background:var(--border-dim);margin:0 2px';
  bulkSpacer.setAttribute('aria-hidden', 'true');

  rangeInput.setAttribute('aria-label', 'Select a range of tests, within those shown');

  bulkRow.append(selectAllBtn, selectNoneBtn, bulkSpacer, rangeInput, applyRangeBtn);

  // ── List ──────────────────────────────────────────────────────────────────

  const listContainer = document.createElement('div');
  listContainer.style.cssText = [
    'overflow-y:auto;max-height:40vh',
    'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'font-family:ui-monospace,"Cascadia Code","Segoe UI Mono",monospace',
    'font-size:12px',
  ].join(';');

  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  searchInput.addEventListener('input', () => {
    setRangeMsg('');   // as above: the filter moved, so the last outcome no longer describes it
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { renderList(); }, 150);
  });

  rangeInput.addEventListener('input', () => setRangeMsg(''));
  // Enter applies, rather than doing nothing next to a button labelled with the
  // verb the user just typed an argument for. Not a form submit — this dialog
  // has its own Import/Cancel footer and Enter must not reach it.
  rangeInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') { evt.preventDefault(); evt.stopPropagation(); applyRangeBtn.click(); }
  });

  function getVisible(): Array<{ num: number; def: TestDef }> {
    const q = searchInput.value.trim().toLowerCase();
    return entries.filter(e => {
      if (activeType !== 'all' && e.def.testType !== activeType) return false;
      if (q) {
        const numMatch = e.num.toString().includes(q);
        const nameMatch = displayName(e.num, e.def).toLowerCase().includes(q);
        if (!numMatch && !nameMatch) return false;
      }
      return true;
    });
  }

  /** Range selection — shared with the file filter table and splits dialog
   *  (listSelection.ts). Replaces a local `lastClickedVisibleIndex`, which
   *  anchored on a POSITION in the visible array: narrowing the list with the
   *  search box left it pointing at whatever row had moved into that slot, so
   *  the next shift-click extended from a row the user never clicked. Anchoring
   *  on the test number can't go stale — it either still resolves or it doesn't. */
  const rangeSel = createRangeSelection<number>({
    visibleIds: () => getVisible().map(e => e.num),
    isSelected: (num) => selected.has(num),
    setSelected: (num, on) => { if (on) selected.add(num); else selected.delete(num); },
    onChanged: () => { renderList(); updateFooter(); },
    focusRow: (i) => {
      const boxes = listContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      boxes[i]?.focus();
    },
  });

  function renderList(): void {
    listContainer.innerHTML = '';
    const visible = getVisible();
    for (let vi = 0; vi < visible.length; vi++) {
      const e = visible[vi];
      const row = document.createElement('label');
      row.style.cssText = [
        'display:flex;align-items:center;gap:8px',
        'padding:4px 8px;cursor:pointer',
        'border-bottom:1px solid var(--border-mid)',
      ].join(';');
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-hover-row)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(e.num);
      cb.style.cssText = 'flex-shrink:0;cursor:pointer';
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(e.num); else selected.delete(e.num);
        rangeSel.setAnchor(e.num);   // only a plain toggle moves the anchor
        updateFooter();
      });
      cb.addEventListener('click', (evt) => {
        // preventDefault so the browser's own toggle doesn't flip this row on
        // top of the range just applied to it. Non-shift clicks fall through:
        // the browser toggles cb.checked and the change handler syncs.
        if (rangeSel.handleClick(e.num, evt)) evt.preventDefault();
      });
      cb.addEventListener('keydown', (evt) => {
        if (rangeSel.handleKeydown(e.num, evt)) evt.preventDefault();
      });

      const numSpan = document.createElement('span');
      numSpan.style.cssText = 'color:var(--text-dim);min-width:52px;flex-shrink:0';
      numSpan.textContent = e.num.toString();

      // Renaming for display: looks like plain text until hovered/focused (a
      // border/background only appear then), so the common non-renaming case
      // is visually identical to the old static span. Committing happens on
      // blur/Enter (not per keystroke) — clearing or retyping the original
      // name removes the override so displayName() falls back to e.def.name.
      // Lives in `testOverrides`, the same map Save/Load definitions already
      // read and write, so no separate save-path wiring is needed. Merges
      // into any existing entry (rather than replacing it) so renaming a test
      // never discards a limit/type override loaded from a file on the same row.
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.spellcheck = false;
      nameInput.value = displayName(e.num, e.def) || e.num.toString();
      nameInput.setAttribute('aria-label', `Display name for test ${e.num}`);
      nameInput.style.cssText = [
        'flex:1;min-width:0;font:inherit;color:inherit',
        'background:none;border:1px solid transparent;border-radius:var(--radius-control)',
        'padding:1px 4px;margin:-1px -4px',
        'overflow:hidden;text-overflow:ellipsis',
      ].join(';');
      // Click/mousedown on the input must not fall through to the row's own
      // shift-click range-select handling on the checkbox (that listener is
      // on `cb`, not here, but stop it explicitly rather than rely on the
      // browser's label/form-control click semantics being exactly right).
      nameInput.addEventListener('click', evt => evt.stopPropagation());
      nameInput.addEventListener('mouseenter', () => {
        if (document.activeElement !== nameInput) nameInput.style.borderColor = 'var(--border-mid)';
      });
      nameInput.addEventListener('mouseleave', () => {
        if (document.activeElement !== nameInput) nameInput.style.borderColor = 'transparent';
      });
      nameInput.addEventListener('focus', () => {
        nameInput.style.borderColor = 'var(--accent)';
        nameInput.style.background = 'var(--bg-input)';
      });
      nameInput.addEventListener('blur', () => {
        nameInput.style.borderColor = 'transparent';
        nameInput.style.background = 'none';
        const trimmed = nameInput.value.trim();
        const existing = testOverrides.get(e.num) ?? {};
        if (!trimmed || trimmed === e.def.name) {
          const { name: _name, ...rest } = existing;
          if (Object.keys(rest).length) testOverrides.set(e.num, rest);
          else testOverrides.delete(e.num);
          nameInput.value = e.def.name;
        } else {
          testOverrides.set(e.num, { ...existing, name: trimmed });
          nameInput.value = trimmed;
        }
      });
      nameInput.addEventListener('keydown', evt => {
        if (evt.key === 'Enter') { evt.preventDefault(); nameInput.blur(); }
        else if (evt.key === 'Escape') {
          // Revert the in-progress edit only — stopPropagation so this
          // doesn't also reach the overlay's own document-level Escape
          // listener, which would close the whole dialog.
          evt.preventDefault();
          evt.stopPropagation();
          nameInput.value = displayName(e.num, e.def); // discard in-progress edit
          nameInput.blur();
        }
      });

      // Limits/units and type columns — always shown (not just when overridden),
      // so the dialog doubles as a read-only preview of a test's full definition.
      // Values are *effective* (override-aware, like displayName()) rather than
      // the raw parsed def — the only visible confirmation that a loaded
      // limit/type override actually took effect, since there's no inline
      // editor for these fields (Save/Load definitions is the whole edit workflow).
      const eff = effectiveLimits(e.num, e.def);

      const limitsSpan = document.createElement('span');
      limitsSpan.style.cssText = 'color:var(--text-dim);font-size:12px;flex-shrink:0;min-width:130px;text-align:right';
      const limitParts: string[] = [];
      if (eff.loLimit != null) limitParts.push(`≥${eff.loLimit}`);
      if (eff.hiLimit != null) limitParts.push(`≤${eff.hiLimit}`);
      if (eff.units) limitParts.push(eff.units);
      limitsSpan.textContent = limitParts.join(' ');

      const typeSpan = document.createElement('span');
      typeSpan.style.cssText = 'color:var(--text-dim);font-size:12px;flex-shrink:0;min-width:16px;text-align:center';
      typeSpan.textContent = eff.testType;

      const ov = testOverrides.get(e.num);
      if (ov && (ov.loLimit !== undefined || ov.hiLimit !== undefined || ov.units !== undefined)) {
        attachTooltip(limitsSpan, 'Loaded from file');
      }
      if (ov?.testType !== undefined) {
        attachTooltip(typeSpan, 'Loaded from file');
      }

      row.append(cb, numSpan, nameInput, limitsSpan, typeSpan);
      listContainer.appendChild(row);
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;flex-direction:column;gap:8px';

  // Scan-scope row: a caption describing where the test list came from, and — when
  // only the largest file was scanned — a button to widen the scan to all files.
  const scopeRow = document.createElement('div');
  scopeRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';

  const fileCount = options.scanFileCount ?? 0;
  if (options.scanScope) {
    const scopeNote = document.createElement('span');
    scopeNote.style.cssText = 'font-size:12px;color:var(--text-dim);opacity:0.8';
    scopeNote.textContent = options.scanScope === 'all'
      ? `Test definitions merged from all ${fileCount} files.`
      : 'Test definitions from the largest file.';
    scopeRow.appendChild(scopeNote);

    if (options.scanScope === 'largest' && options.onScanAll) {
      const scanAllBtn = document.createElement('button');
      scanAllBtn.textContent = `Scan all ${fileCount} files`;
      scanAllBtn.className = 'btn-secondary';
      attachTooltip(scanAllBtn, 'Re-scan every file and merge the full test definitions (use when a test only appears in a smaller file). Your current selection is kept.');
      scanAllBtn.addEventListener('click', () => {
        cleanup();
        options.onScanAll!(Array.from(selected).sort((a, b) => a - b), new Map(testOverrides));
      });
      scopeRow.appendChild(scanAllBtn);
    }
  }

  const footerNote = document.createElement('div');
  footerNote.style.cssText = 'font-size:12px;color:var(--text-dim);opacity:0.7';

  function setFooterNotes(loadWarning?: string): void {
    footerNote.textContent = loadWarning ?? '';
    footerNote.style.display = loadWarning ? '' : 'none';
  }
  setFooterNotes();

  const footerRow = document.createElement('div');
  footerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

  const countLabel = document.createElement('span');
  countLabel.style.cssText = 'font-size:12px;color:var(--text-dim)';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px';

  if (options.onSave) {
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save definitions';
    saveBtn.className = 'btn-secondary';
    saveBtn.addEventListener('click', async () => {
      // Iterate `entries` (already sorted by order, see above) rather than
      // `Array.from(selected).sort by number` — a saved list a user might
      // hand-edit should read in the file's own column order, not in the
      // order of a now-hashed, not-particularly-meaningful number.
      const saveEntries: TestListEntry[] = entries
        .filter(e => selected.has(e.num))
        .map(({ num, def }) => {
          const eff = effectiveLimits(num, def);
          return {
            num,
            name: displayName(num, def) || String(num),
            loLimit: eff.loLimit,
            hiLimit: eff.hiLimit,
            units: eff.units,
            testType: eff.testType,
          };
        });
      try {
        await options.onSave!(saveEntries);
        options.onLog?.('info', `Test definitions saved: ${saveEntries.length} test${saveEntries.length !== 1 ? 's' : ''}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        options.onLog?.('error', `Failed to save test definitions: ${msg}`);
      }
    });
    btnRow.appendChild(saveBtn);
  }

  // Shared by the interactive "Load definitions" button and a CLI-supplied
  // `preloadListText` (applied once before the overlay's first render) — same
  // parsing, unknown-test validation, and log messages either way.
  function applyLoadedList(text: string): void {
    let malformedCount = 0;
    const parsed = parseTestListFile(text, () => { malformedCount++; });
    if (parsed.length === 0) {
      options.onLog?.('warn', 'Test definitions file contained no valid entries');
      return;
    }
    const currentNames = new Map(entries.map(e => [e.num, displayName(e.num, e.def)]));
    const result = resolveLoadedTestList(parsed, testDefs, currentNames, testOverrides);

    selected.clear();
    for (const num of result.selectedNums) selected.add(num);
    for (const [num, ov] of result.overrides) testOverrides.set(num, ov);

    const notes: string[] = [];
    if (result.unknownCount > 0) {
      const msg = `${result.unknownCount} test${result.unknownCount !== 1 ? 's' : ''} in file not found in current scan and were ignored`;
      options.onLog?.('warn', msg);
      notes.push(`${msg}.`);
    }
    if (result.recoveredByNameCount > 0) {
      // Not a warning — the reconciliation worked, nothing was lost. Still
      // worth surfacing: it means this file's numbers are stale (a scheme
      // change, a hand edit, anything), and re-saving now would clear that up.
      const n = result.recoveredByNameCount;
      const msg = `${n} test${n !== 1 ? 's' : ''} matched by name instead of test number (the saved number${n !== 1 ? 's' : ''} no longer match${n !== 1 ? '' : 'es'} this scan) — consider re-saving this list`;
      options.onLog?.('info', msg);
      notes.push(`${msg}.`);
    }
    if (result.ambiguousCount > 0) {
      const msg = `${result.ambiguousCount} test${result.ambiguousCount !== 1 ? 's' : ''} in file had a name matching more than one current test and could not be resolved`;
      options.onLog?.('warn', msg);
      notes.push(`${msg}.`);
    }
    if (result.limitOnFunctionalCount > 0) {
      const msg = `${result.limitOnFunctionalCount} functional test${result.limitOnFunctionalCount !== 1 ? 's' : ''} had limit values ignored (limits only apply to parametric tests)`;
      options.onLog?.('warn', msg);
      notes.push(`${msg}.`);
    }
    if (malformedCount > 0) {
      const msg = `${malformedCount} field${malformedCount !== 1 ? 's' : ''} in file could not be parsed and were ignored`;
      options.onLog?.('warn', msg);
      notes.push(`${msg}.`);
    }
    options.onLog?.('info', `Test definitions loaded: ${selected.size} test${selected.size !== 1 ? 's' : ''} selected`);
    setFooterNotes(notes.length ? notes.join(' ') : undefined);
  }

  if (options.onLoad) {
    // Applying is identical however the text was obtained — picker, recent row,
    // or the CLI's --tests preload. Only the source differs, which is what makes
    // a recents list cheap to add here.
    btnRow.appendChild(makeLoadDefinitionsButton({
      pick: () => options.onLoad!(),
      recents: options.recentLoads,
      note: options.recentNote,
      onText: (text) => { applyLoadedList(text); renderList(); updateFooter(); },
      onError: (msg) => options.onLog?.('error', `Failed to load test definitions: ${msg}`),
    }));
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.addEventListener('click', () => { cleanup(); onCancel(); });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-primary';   // the dialog's primary action, not a peer of Cancel

  // ── Memory advisory ────────────────────────────────────────────────────────
  // Thresholds in die×test pairs. Calibrated against known-good behaviour:
  // ~300k dies × 30 tests = 9M pairs is fine; warn starts above ~50M pairs.
  const WARN_PAIRS   = 50_000_000;   // ~50M die×test pairs — show amber
  const DANGER_PAIRS = 200_000_000;  // ~200M die×test pairs — show red + confirm

  const memAdvisory = document.createElement('div');
  memAdvisory.style.cssText = 'font-size:12px;display:none';

  function dieTestPairs(): number {
    if (!options.capacity || selected.size === 0) return 0;
    return options.capacity.dieCount * selected.size;
  }

  function updateMemAdvisory(): void {
    if (!options.capacity || selected.size === 0) {
      memAdvisory.style.display = 'none';
      return;
    }
    const pairs = dieTestPairs();
    if (pairs < WARN_PAIRS) {
      memAdvisory.style.display = 'none';
      return;
    }
    memAdvisory.style.display = '';
    // --error-text / --warn-text, NOT --error / --warn: those two tokens have
    // never existed in any theme block, so the old `var(--error,#f87171)` and
    // `var(--warn,#fbbf24)` fell through to their hardcoded fallbacks in all
    // eight themes. That made the advisory the one piece of chrome that never
    // followed the theme, and put #fbbf24 amber on High contrast's pure-white
    // ground at roughly 1.9:1 — well under AA for text this small.
    if (pairs >= DANGER_PAIRS) {
      memAdvisory.style.color = 'var(--error-text)';
      memAdvisory.textContent = 'Very large selection — risk of running out of memory';
    } else {
      memAdvisory.style.color = 'var(--warn-text)';
      memAdvisory.textContent = 'Large selection — may be slow to load';
    }
  }

  confirmBtn.addEventListener('click', async () => {
    const sel = Array.from(selected).sort((a, b) => a - b);
    const ask = options.onAsk ?? ((msg) => Promise.resolve(window.confirm(msg)));
    if (sel.length === 0) {
      if (!await ask('No tests selected — only bin data will be loaded. Continue?')) return;
    }
    if (dieTestPairs() >= DANGER_PAIRS) {
      if (!await ask('This is a very large selection and may run out of memory. Consider selecting fewer tests. Continue anyway?')) return;
    }
    cleanup();
    onConfirm(sel, new Map(testOverrides));
  });

  function updateFooter(): void {
    const n = selected.size;
    countLabel.textContent = `${n} of ${allNums.length} tests selected`;
    confirmBtn.textContent = options.confirmLabel
      ? options.confirmLabel(n)
      : (n === 0 ? 'Import (bin data only) →' : `Import ${n} test${n !== 1 ? 's' : ''} →`);
    updateMemAdvisory();
  }

  btnRow.append(cancelBtn, confirmBtn);
  footerRow.append(countLabel, btnRow);
  footer.append(scopeRow, footerNote, memAdvisory, footerRow);

  // ── Backdrop click ────────────────────────────────────────────────────────

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { cleanup(); onCancel(); }
  });

  // ── Escape to cancel ──────────────────────────────────────────────────────
  // Routes through the same cleanup + onCancel path as the backdrop/Cancel
  // button so the load flow is restored consistently. Ignored while a nested
  // native confirm (onAsk) is up — window.confirm is modal and consumes keys —
  // so no extra guard is needed here.

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { cleanup(); onCancel(); }
  }
  document.addEventListener('keydown', onKeyDown);

  // ── Assemble ──────────────────────────────────────────────────────────────

  panel.append(header, controls, bulkRow, rangeMsg, listContainer, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  panel.focus(); // move focus into the dialog so Esc and SR navigation work

  if (options.preloadListText) applyLoadedList(options.preloadListText);

  renderList();
  updateFooter();

  // ── Cleanup ───────────────────────────────────────────────────────────────

  function cleanup(): void {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }
}

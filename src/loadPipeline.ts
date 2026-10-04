// The load flow: from "these files" to "this lot is on screen".
//
// Reading, archive expansion, the CSV/JSON/Parquet column mapping, the first-pass test scan, the
// test selector, the full parse, wafer naming, the append confirmation, and the hand-off to the
// renderer. It used to be one 400-line function inside main.ts, entangled with the DOM, the
// platform and the module-level state, and so with no test.
//
// Everything that is not the flow itself arrives through `LoadDeps`: the platform (file reading and
// parsing), the logger and progress indicator, the renderer, and the four dialogs, each reduced to an
// async function that resolves with the user's answer or `null`/`false` for "cancelled". The loaded
// lot is `session` (session.ts). A test supplies fakes for all of it and drives the whole flow.

import { isTauri } from './platform';
import type { FileHandle, StdfTestNames, Platform, HeadersResult } from './platform';
import {
  rustToLocal, unionTestDefs, unionBinInfo, applyTestSelection, makeWaferSource, toWaferData, errMsg,
  effectiveFileExtension, checkSameExtension, isTesterExt, isAtdfExt,
} from './lib';
import type { OverrideUnitNote } from './lib';
import type { UnitConversion } from './units';
import { harmoniseTestUnits } from './units';
import { needsWaferLabelPrompt, markPlaceholder } from './multiFileUI';
import type { FileWaferEntry, RenamedWafer } from './multiFileUI';
import type { CsvMapping } from './mappingUI';
import type { BinDefEntry } from './binDefs';
import { applyBinDefOverrides } from './binDefs';
import type { DerivedSelection } from './testSelectorUI';
import type { BinDef } from '@wafertools/wafermap';
import type { FileDefs, ParsedFile, TestDef, TestOverride, WaferData, WaferSource } from './types';
import { session } from './session';

/**
 * Per-source def map for a set of renamed wafers, optionally extending the
 * current one (an Add-files append keeps the already-loaded files' entries).
 */
export function defsBySourceFrom(
  renamed: RenamedWafer[],
  base?: Map<WaferSource, FileDefs>,
): Map<WaferSource, FileDefs> {
  const map = new Map(base ?? []);
  for (const r of renamed) if (r.source && r.fileDefs) map.set(r.source, r.fileDefs);
  return map;
}

/**
 * Ceiling on tests × dies for pre-ticking the whole test list in the selector.
 *
 * The selector's default-empty rule exists so a big lot can't blow memory on an
 * accidental "import everything" — it is a proxy for cost, not a preference.
 * Below this budget there is nothing to protect against, and making the user
 * hunt for "Select all" is pure friction (the bundled sample is 7 tests × 2,873
 * dies ≈ 20k, four orders of magnitude under).
 *
 * Budgeted on tests × dies rather than test count, because test count is not
 * the cost driver: values accumulate per test per die, so 20 tests × 500k dies
 * is far heavier than 200 tests × 2k dies. Thresholding on test count alone
 * would auto-load the expensive case and still gate the cheap one. Both numbers
 * are already known at this point from the first-pass scan.
 *
 * Deliberately not user-configurable: it is a setting almost nobody would find
 * or tune, and Select all / Select none already cover whatever it gets wrong.
 */
export const AUTOSELECT_CELL_BUDGET = 2_000_000;

export function isCheapToImportAll(testCount: number, dieCount: number): boolean {
  // dieCount is 0 when nothing reported a die count — no basis to judge, so
  // fall back to the conservative default rather than guessing.
  return testCount > 0 && dieCount > 0 && testCount * dieCount <= AUTOSELECT_CELL_BUDGET;
}

/** Where a load is, as the progress indicator names it. */
export type LoadPhase =
  | 'waiting'    // a native picker or a dialog is open — the app is blocked on the user
  | 'reading'    // pulling bytes in
  | 'parsing'    // decoding them
  | 'analysing'  // per-wafer statistics
  | 'rendering'  // cards staging into the gallery
  | 'finishing'; // cards are all in; the lot Summary panel is still filling

export type SelectorResult =
  | { kind: 'confirm'; selection: number[]; overrides: Map<number, TestOverride>; derived: DerivedSelection }
  | { kind: 'cancel' }
  | { kind: 'scanAll'; selection: number[]; overrides: Map<number, TestOverride>; derived: DerivedSelection };

/** What the flow asks the test selector to show. */
export interface SelectorRequest {
  scopedDefs: StdfTestNames;
  /** Undefined with a single binary file: there is nothing to widen. */
  scanScope: 'largest' | 'all' | undefined;
  scanFileCount: number;
  canScanAll: boolean;
  initialSelection: number[];
  testOverrides: Map<number, TestOverride>;
  derivedTests: DerivedSelection['tests'];
  preloadListText: string | undefined;
  capacity: { dieCount: number; totalTests: number; isWebBuild: boolean } | undefined;
}

export interface LoadDeps {
  platform: Platform;
  log(level: 'info' | 'warn' | 'error', msg: string): void;
  loadPhase(phase: LoadPhase, msg: string, done?: number, total?: number): void;
  /** The single place a load ends: clears the busy flag and the indicator. */
  endLoad(identity?: string): void;
  isBusy(): boolean;
  logTimed<T>(label: string, fn: () => Promise<T> | T): Promise<T>;
  logDecodeTime(): void;
  logWarnings(parsed: ParsedFile): void;
  logOverrideUnitNotes(notes: OverrideUnitNote[]): void;
  logUnitConversions(conversions: UnitConversion[]): void;
  logTestDefCollisions(collisions: ReturnType<typeof unionTestDefs>['collisions']): void;
  logPassBinCollisions(collisions: ReturnType<typeof unionBinInfo>['collisions']): void;
  /** First-pass test scan of the given STDF/ATDF files, or null when it failed. */
  scanBinaryTests(files: FileHandle[]): Promise<{ testDefs: StdfTestNames; dieCount: number } | null>;
  /** A CLI `--tests` file, read once: the selector's first open applies it. */
  takeTestListPreload(): string | null;
  derivedForSelector(): DerivedSelection;
  adoptDerived(d: DerivedSelection): void;
  /** Recent-files list, for a load that came from paths. */
  rememberFiles(paths: string[]): void;
  clearViewForLoad(): void;
  showEmptyState(): void;
  /** Hand a finished lot to the renderer. */
  renderWafers(
    wafers: WaferData[],
    fileName: string,
    testDefs: Record<string, TestDef>,
    bins: { hbinDefs?: BinDef[]; sbinDefs?: BinDef[]; passHbins?: number[] },
    defsBySource: Map<WaferSource, FileDefs>,
  ): void;
  /** The four dialogs, as questions. `null`/`false` is the user cancelling. */
  ui: {
    mapping(headers: HeadersResult): Promise<{ mapping: CsvMapping; binDefs: BinDefEntry[] } | null>;
    selectTests(request: SelectorRequest): Promise<SelectorResult>;
    renameWafers(entries: FileWaferEntry[]): Promise<RenamedWafer[] | null>;
    confirmAppend(args: { incoming: RenamedWafer[]; existing: typeof session.wafers }): Promise<boolean>;
  };
}

/**
 * `continuesCurrentLoad` — this call is the next step of a load that is ALREADY
 * running (the file picker opened under `loadPhase('waiting', …)` and is now
 * handing its files on), not a new one. Without it the `busy` guard below would
 * silently no-op the very load that opened the picker.
 *
 * The picker paths used to write `busy = false` directly to get past that
 * guard, which is worse than it looks: `busy` is the flag `setControlsBusy`
 * owns, so clearing it by hand desynchronised the toolbar from the load. The
 * Add buttons re-enabled while the gallery was still rendering (they are also
 * set from the loaded-state path, which reads `busy`), and every `if (busy)`
 * re-entrancy guard in the app went open for the rest of the load — a second
 * load could be started on top of the first. One flag, one owner, and the
 * hand-off says so explicitly instead of faking its precondition.
 */
export async function runLoad(files: FileHandle[], isAppend: boolean, continuesCurrentLoad: boolean, deps: LoadDeps): Promise<void> {
  const { platform, log, loadPhase, endLoad } = deps;
  if (files.length === 0) return;
  if (deps.isBusy() && !continuesCurrentLoad) return;

  // Captured before archive expansion/reassignment below, so a reopened .zip
  // records (and re-expands) its own path rather than its extracted contents.
  const originalPaths = files.every(f => f.path) ? files.map(f => f.path as string) : null;

  loadPhase('reading', `Reading ${files.length} file${files.length > 1 ? 's' : ''}`);
  // Yield two animation frames so the spinner actually paints before the
  // first platform call (WebKitGTK may not repaint on setTimeout(0) alone).
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Expand archives — .gz and .zip handled per-platform
  let needsCleanup = false;
  const anyZip = files.some(f => f.name.toLowerCase().endsWith('.zip'));
  if (anyZip) {
    loadPhase('reading', 'Extracting archive');
    needsCleanup = isTauri && anyZip;
  }
  files = await platform.expandArchives(files).catch(e => {
    log('error', `Archive extraction failed: ${e}`);
    return files;
  });

  if (files.length === 0) {
    endLoad('Error: no files after extraction');
    return;
  }

  // Validate all files have the same extension (relaxed for mixed-format zips)
  // — checkSameExtension/effectiveFileExtension (lib.ts) are shared with the
  // file-filter table's own picker, so this rule lives in exactly one place.
  const mixedFormatsError = checkSameExtension(files.map(f => f.name), needsCleanup);
  if (mixedFormatsError) {
    log('error', mixedFormatsError);
    endLoad('Error: mixed formats');
    return;
  }

  // For CSV/JSON/Parquet: show mapping overlay once for the first such file, apply to all
  const needsMapping = (e: string) => e === 'csv' || e === 'txt' || e === 'dat' || e === 'json' || e === 'parquet';
  const firstMappable = files.find(f => needsMapping(effectiveFileExtension(f.name)));

  let mappingResult: { mapping: CsvMapping; binDefs: BinDefEntry[] } | null = null;

  if (firstMappable) {
    const firstExt = effectiveFileExtension(firstMappable.name);
    loadPhase('reading', `Reading ${firstMappable.name}`);
    const headersResult = await (firstExt === 'json' ? platform.jsonHeaders(firstMappable)
      : firstExt === 'parquet' ? platform.parquetHeaders(firstMappable)
      : platform.csvHeaders(firstMappable)
    ).catch(e => { log('error', `Failed to read headers: ${e}`); return null; });

    if (!headersResult) {
      if (needsCleanup) platform.expandArchives([]).catch(() => {});
      endLoad();
      return;
    }

    const mappableFiles = files.filter(f => needsMapping(effectiveFileExtension(f.name)));
    const note = mappableFiles.length > 1 ? ` — mapping applied to all ${mappableFiles.length} CSV/JSON/Parquet files` : '';
    log('info', `${firstMappable.name}: ${headersResult.rowCount} rows, ${headersResult.headers.length} columns${note}`);

    mappingResult = await deps.ui.mapping(headersResult);
    if (mappingResult === null) { endLoad(); return; }   // cancelled
  }

  const mapping = mappingResult?.mapping;
  const mappingBinDefs = mappingResult?.binDefs ?? [];

  // ── Parse phase ──────────────────────────────────────────────────────────
  // For STDF/ATDF: first-pass scan to get testDefs cheaply, then filtered parse.
  // For CSV/JSON/Parquet: parse fully now (fast), use parsed testDefs for the selector.
  const binaryFiles = files.filter(f => isTesterExt(effectiveFileExtension(f.name)));

  // firstPassTestDefs: merged testDefs from first-pass scan (STDF/ATDF) and/or full parse (CSV/JSON).
  let firstPassTestDefs: StdfTestNames | null = null;
  // Pre-parsed CSV/JSON results — reused after the selector so we don't parse twice.
  const preParsed = new Map<string, ParsedFile>();
  // Die count from the binary scan (PIR count × file count approximation).
  let binaryScanDieCount = 0;

  if (binaryFiles.length > 0) {
    const largestBinary = binaryFiles.reduce((a, b) => {
      const aSize = a.size ?? a.bytes.length;
      const bSize = b.size ?? b.bytes.length;
      return aSize >= bSize ? a : b;
    });
    session.binaryFiles = binaryFiles;
    session.binaryScanScope = 'largest';

    // Default scan scope: the largest file only — a fast, representative test
    // list. The selector offers a "scan all files" toggle to widen this when a
    // test only appears in a smaller file (see scanBinaryTests / onScanAll).
    const scan = await deps.scanBinaryTests([largestBinary]);
    if (scan) {
      session.testNames = scan.testDefs;
      firstPassTestDefs = scan.testDefs;
      // Largest-file die count extrapolated across all files (exact totals come
      // from a "scan all"). Only used for the selector's memory advisory.
      binaryScanDieCount = scan.dieCount * binaryFiles.length;
    }
  }

  // Parse CSV/JSON files now; collect their testDefs for the selector.
  const nonBinaryFiles = files.filter(f => !isTesterExt(effectiveFileExtension(f.name)));
  for (const file of nonBinaryFiles) {
    const fileExt = effectiveFileExtension(file.name);
    loadPhase('parsing', `Parsing ${file.name}`);
    try {
      const parsed: ParsedFile = fileExt === 'json' ? rustToLocal(await platform.parseJson(file, mapping!), file.name)
        : fileExt === 'parquet' ? rustToLocal(await platform.parseParquet(file, mapping!), file.name)
        : rustToLocal(await platform.parseCsv(file, mapping!), file.name);
      // CSV/JSON/Parquet have no HBR/SBR-equivalent record — Rust always
      // stubs hbinDefs/sbinDefs/passHbins empty for these formats, so this is
      // purely additive, never an override of anything actually parsed.
      if (mappingBinDefs.length > 0) {
        const parts = applyBinDefOverrides({}, mappingBinDefs);
        parsed.hbinDefs = parts.hbinDefs;
        parsed.sbinDefs = parts.sbinDefs;
        parsed.passHbins = parts.passHbins;
      }
      preParsed.set(file.name, parsed);
      log('info', `Parsed ${file.name}: ${parsed.wafers.length} wafer${parsed.wafers.length !== 1 ? 's' : ''}`);
      deps.logWarnings(parsed);
      // Merge testDefs from this file into firstPassTestDefs for the selector.
      if (Object.keys(parsed.testDefs).length > 0) {
        firstPassTestDefs = { ...(firstPassTestDefs ?? {}), ...parsed.testDefs };
      }
    } catch (e) {
      log('error', `Failed to parse ${file.name}: ${errMsg(e)}`);
    }
  }

  // ── Test selector ─────────────────────────────────────────────────────────
  // Shown when any file has test data (non-empty merged testDefs), unless
  // importing every test is cheap (see isCheapToImportAll).
  let testSelection: number[] | null = null;
  let overlayTestOverrides: Map<number, TestOverride> = new Map();

  if (firstPassTestDefs && Object.keys(firstPassTestDefs).length > 0) {
    const csvDieCount = Array.from(preParsed.values())
      .reduce((s, p) => s + p.wafers.reduce((ws, w) => ws + w.results.count, 0), 0);

    // The selector can be re-entered when the user clicks "scan all files": we
    // widen the scope, re-scan, merge, and re-open with the same selection +
    // test overrides preserved. `scanScope` tracks whether we're still on the
    // largest file only (so the toggle is offered) or have scanned everything.
    let scanScope: 'largest' | 'all' = 'largest';
    let scopedDefs = firstPassTestDefs;
    let carrySelection: number[] = [];
    let carryOverrides = new Map<number, TestOverride>();
    let carryDerived: DerivedSelection = deps.derivedForSelector();
    // Only the very first open of this load gets the cheap-lot default below —
    // a "scan all files" re-open must carry the user's actual selection, even
    // when that selection is deliberately empty.
    let firstOpen = true;
    // Consumed once, on the very first open of this load's selector — a
    // "scan all files" re-open within the same load must not keep re-applying
    // it over the user's in-progress adjustments (see pendingTestListPreload).
    let testListPreload = deps.takeTestListPreload();

    selector: for (;;) {
      const allTestNums = new Set(Object.keys(scopedDefs).map(Number));
      const totalDieCount = binaryScanDieCount + csvDieCount;
      // Offer "scan all" only with >1 binary file and while still scoped to largest.
      const canScanAll = binaryFiles.length > 1 && scanScope === 'largest';

      // Skip the selector when importing the lot is provably cheap — there is
      // nothing to narrow, and a modal that only asks for a click is friction. A
      // CLI --tests preload always wins: it's an explicit instruction to open it.
      // Any derived tests already set up stay as they are for the session.
      if (firstOpen && !testListPreload && isCheapToImportAll(allTestNums.size, totalDieCount)) {
        testSelection = [...allTestNums];
        log('info', `${testSelection.length} test${testSelection.length !== 1 ? 's' : ''} imported — use Setup ▾ → Tests… to filter them`);
        break;
      }
      firstOpen = false;

      const result = await deps.ui.selectTests({
        scopedDefs,
        scanScope: binaryFiles.length > 1 ? scanScope : undefined,
        scanFileCount: binaryFiles.length,
        canScanAll,
        initialSelection: [...carrySelection, ...carryDerived.selected],
        testOverrides: carryOverrides,
        derivedTests: carryDerived.tests,
        preloadListText: testListPreload ?? undefined,
        capacity: totalDieCount > 0
          ? { dieCount: totalDieCount, totalTests: allTestNums.size, isWebBuild: !isTauri }
          : undefined,
      });
      testListPreload = null; // only ever applied on the loop's first open

      if (result.kind === 'cancel') { endLoad(); return; }

      if (result.kind === 'scanAll') {
        // Preserve the user's in-progress selection/overrides across the re-scan.
        carrySelection = result.selection;
        carryOverrides = result.overrides;
        carryDerived = result.derived;
        const scan = await deps.scanBinaryTests(binaryFiles);
        if (scan) {
          scopedDefs = scan.testDefs;
          firstPassTestDefs = scan.testDefs;   // so the full parse below sees every test
          session.testNames = scan.testDefs;    // so "Tests…" re-uses the widened list
          binaryScanDieCount = scan.dieCount;  // exact total now, not extrapolated
          session.binaryScanScope = 'all';
          scanScope = 'all';
          log('info', `Scanned all ${binaryFiles.length} files: ${Object.keys(scan.testDefs).length} tests total`);
        }
        continue selector; // re-open the selector with the merged list
      }

      // confirm
      overlayTestOverrides = result.overrides;
      deps.adoptDerived(result.derived);
      testSelection = result.selection;
      log('info', `Test filter: ${testSelection.length} of ${allTestNums.size} tests selected`);
      break;
    }
  }

  // The load is now committed (the cancellable mapping/test-selector gates have
  // resolved) and the full parse below can be slow. For a fresh load (not an
  // "add"), clear the previous maps/charts now so the user isn't left looking at
  // stale data from the old file while the new one parses. An append keeps the
  // current view, since the new wafers are added to it. NOTE: the rename overlay
  // (further down) can still be cancelled — `abortFreshLoad()` resets to the empty
  // state on any post-clear bail-out so the user is never stranded on a blank view
  // showing nothing while the old data is silently still in `session.wafers`.
  const clearedForFreshLoad = !isAppend;
  if (clearedForFreshLoad) deps.clearViewForLoad();
  // Return to a clean empty state if a committed fresh load bails out (parse error
  // or rename cancel); for an append the old view is intact, so just go idle.
  const abortFreshLoad = (msg?: string) => {
    if (clearedForFreshLoad) deps.showEmptyState();
    endLoad(msg);
  };

  // ── Full parse for STDF/ATDF, prune/backfill pre-parsed CSV/JSON ──────────
  const entries: FileWaferEntry[] = [];
  const overrideUnitNotes: OverrideUnitNote[] = [];

  try {
    // Finalise pre-parsed CSV/JSON entries — prune to selection.
    for (const [, parsed] of preParsed) {
      applyTestSelection(parsed, testSelection ?? [], null, overlayTestOverrides, overrideUnitNotes);
    }

    for (const file of files) {
      const fileExt = effectiveFileExtension(file.name);

      // CSV/JSON already parsed above — just collect.
      if (!isTesterExt(fileExt)) {
        const pre = preParsed.get(file.name);
        if (pre) entries.push({ filePath: file.path ?? file.name, fileName: file.name, parsed: pre });
        continue;
      }

      loadPhase('parsing', `Parsing ${file.name}`);
      try {
        // If scan failed (firstPassTestDefs null), fall back to unfiltered parse.
        const raw = await deps.logTimed('parse (Rust parse, columnar encode, IPC, decode)', () => firstPassTestDefs === null
          ? (isAtdfExt(fileExt)
            ? platform.parseAtdf(file)
            : platform.parseStdf(file))
          : (isAtdfExt(fileExt)
            ? platform.parseAtdfFiltered(file, testSelection ?? [])
            : platform.parseStdfFiltered(file, testSelection ?? [])));
        deps.logDecodeTime();
        const parsed = await deps.logTimed('rustToLocal (JS reconstruction)', () => rustToLocal(raw, file.name));
        // A filtered parse (the scan succeeded) already holds exactly the selection.
        await deps.logTimed('applyTestSelection', () => applyTestSelection(parsed, testSelection ?? [], firstPassTestDefs, overlayTestOverrides, overrideUnitNotes, firstPassTestDefs !== null));
        entries.push({ filePath: file.path ?? file.name, fileName: file.name, parsed });
        log('info', `Parsed ${file.name}: ${parsed.wafers.length} wafer${parsed.wafers.length !== 1 ? 's' : ''}`);
        deps.logWarnings(parsed);
      } catch (e) {
        log('error', `Failed to parse ${file.name}: ${errMsg(e)}`);
      }
    }
  } catch (e) {
    const msg = errMsg(e);
    log('error', `Parse failed: ${msg}. Try selecting fewer tests.`);
    abortFreshLoad('Out of memory — reduce test selection and try again');
    return;
  }

  if (entries.length === 0) {
    abortFreshLoad('Error: no files parsed successfully');
    return;
  }
  deps.logOverrideUnitNotes(overrideUnitNotes);
  // Before anything reads the tests: a later file recording a test in another SI
  // prefix (mV vs V) is converted to the lot's unit rather than withheld as a clash.
  deps.logUnitConversions(harmoniseTestUnits(entries, isAppend && session.wafers.length > 0 ? session.testDefs : undefined));

  // Rename step — see needsWaferLabelPrompt for when it is shown.
  const allWafers = entries.flatMap(e => e.parsed.wafers);
  const needsRename = needsWaferLabelPrompt(entries);

  const getRenamed = async (): Promise<RenamedWafer[] | null> => {
    if (!needsRename) {
      // needsRename is false only for a single entry, so all wafers share its source.
      const source = makeWaferSource(entries[0].parsed.meta, entries[0].fileName);
      return Promise.resolve(allWafers.map(w => ({
        waferId: markPlaceholder(w.waferId, w.waferIdPlaceholder),
        results: w.results,
        partCount: w.partCount,
        goodCount: w.goodCount,
        failCount: w.failCount,
        fields: w.fields,
        source,
      })));
    }
    // Say so. Without this the indicator kept claiming "Parsing x.csv…" while
    // the app was actually sitting at a dialog waiting for the user — the same
    // dishonesty as naming a phase before its work starts. Every other gate in
    // this file announces `waiting`; these two did not.
    loadPhase('waiting', 'Waiting for wafer names');
    const picked = await deps.ui.renameWafers(entries);
    if (!picked) abortFreshLoad();
    return picked;
  };

  const renamed = await getRenamed();
  if (!renamed) return;

  if (isAppend && session.wafers.length > 0) {
    loadPhase('waiting', 'Waiting for confirmation');
    const confirmed = await deps.ui.confirmAppend({ incoming: renamed, existing: session.wafers });
    if (!confirmed) {
      endLoad(`${session.wafers.length} wafers loaded`);
      return;
    }
      // Shallow spread preserves each wafer's shared `source` reference — do
      // NOT deep-clone or serialize a stamped wafer (e.g. through the parser
      // worker), or reference identity breaks and grouping by source fails.
      const merged = [
        ...session.wafers,
        ...renamed.map(toWaferData),
      ];
      // The union is for tsmap's own test-picking UI only; each wafer keeps
      // its own file's defs for wmap (see session.defsBySource). Appending
      // re-unions from scratch over the already-loaded files plus the new
      // ones, so a collision introduced by the append is reported here and
      // not only on a later reload.
      const appended = unionTestDefs([
        { fileName: session.fileName, testDefs: session.testDefs },
        ...entries.map(e => ({ fileName: e.fileName, testDefs: e.parsed.testDefs })),
      ]);
      deps.logTestDefCollisions(appended.collisions);
      const appendedBins = unionBinInfo([
        { fileName: session.fileName, wafers: session.wafers, hbinDefs: session.hbinDefs, sbinDefs: session.sbinDefs, passHbins: session.passHbins },
        ...entries.map(e => ({ ...e.parsed, fileName: e.fileName })),
      ]);
      deps.logPassBinCollisions(appendedBins.collisions);
      deps.renderWafers(merged, session.fileName, appended.defs, {
        hbinDefs: appendedBins.hbinDefs, sbinDefs: appendedBins.sbinDefs, passHbins: appendedBins.passHbins,
      }, defsBySourceFrom(renamed, session.defsBySource));
      log('info', `Added ${renamed.length} wafer${renamed.length !== 1 ? 's' : ''} — gallery now has ${merged.length}`);
  } else {
    const united = unionTestDefs(entries.map(e => ({ fileName: e.fileName, testDefs: e.parsed.testDefs })));
    deps.logTestDefCollisions(united.collisions);
    const bins = unionBinInfo(entries.map(e => ({ ...e.parsed, fileName: e.fileName })));
    deps.logPassBinCollisions(bins.collisions);
    deps.renderWafers(
      renamed.map(toWaferData),
      entries.length === 1 ? entries[0].fileName : `${entries.length} files`,
      united.defs,
      { hbinDefs: bins.hbinDefs, sbinDefs: bins.sbinDefs, passHbins: bins.passHbins },
      defsBySourceFrom(renamed),
    );
    if (originalPaths) deps.rememberFiles(originalPaths);
  }
}

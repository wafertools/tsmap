declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

import { buildWaferMap } from '@wafertools/wafermap';
import type { WaferMapResult, BinDef } from '@wafertools/wafermap';
import { renderWaferMap, renderWaferGallery, collectWarnings, severityOf, openWaferMapGuide } from '@wafertools/wafermap/render';
import { analyzeWaferMap, analyzeWaferLot, setReportOpener } from '@wafertools/wafermap/stats';
import type { StatsSummary } from '@wafertools/wafermap/stats';
import { createPlatform, isTauri } from './platform';
import type { FileHandle, StdfTestNames, ScanResult, CliStartupArgs, FolderScan } from './platform';
import { basename, rustToLocal, toWmapTestDefs, autoPlotMode, applyTestSelection, applyTestOverrides, diffTestOverride, makeWaferSource, toWmapWaferMeta, wcrGeometryFrom, mergeBinDefs, mergePassHbins, toWaferData, errMsg, deriveFileName, isUrlImportFormat, effectiveFileExtension, checkSameExtension } from './lib';
import { showMappingOverlay } from './mappingUI';
import { showRenameOverlay, showAppendConfirm } from './multiFileUI';
import { showTestSelectorOverlay, formatTestListCsv, parseTestListFile } from './testSelectorUI';
import type { TestListEntry } from './testSelectorUI';
import type { CsvMapping } from './mappingUI';
import type { FileWaferEntry, RenamedWafer } from './multiFileUI';
import type { ParsedFile, WaferData, TestDef, TestOverride, WaferSource } from './types';
import { attachTooltip, upgradeTitleTooltips } from './tooltip';
import { openAnchoredMenu, makeMenuRow } from './anchoredMenu';
import { initTheme, onThemeChange, getTheme, setTheme, THEME_GROUPS, type Theme } from './theme';
import { makeMenuSelect } from './menuSelect';
import { openModal } from './modal';
import { showSplitsModal } from './splitsUI';
import { getEdgeExclusionMm, getWaferDiameterMm, normalizeWaferGeometry, setWaferGeometry } from './waferGeometry';
import { parseBinDefsFile, formatBinDefsCsv, applyBinDefOverrides } from './binDefs';
import type { BinDefEntry } from './binDefs';
import type { WaferGeometry } from './waferGeometry';
import { showWaferGeometryDialog } from './waferGeometryUI';
import type { InferredDiameterHint } from './waferGeometryUI';
import { openFileFilterDialog, pickedFromHandle, pickedFromWebFile, materializePicked, type PickedFile } from './fileFilterUI';
import { showFileAssociationsModal } from './fileAssociationsUI';
import { showDefinitionsTemplatesDialog } from './definitionsTemplatesUI';
import { getSplitLabel, setSplitLabel, waferDisplayLabel, splitsFingerprint, parseSplitsCsv } from './splits';
import { getRecentFiles, addRecentFiles, removeRecentFile, formatRecentTime } from './recentFiles';
import { TSMAP_GUIDE_HTML } from './guideExtension';

const platform = createPlatform();

// Passed to every renderWaferMap/renderWaferGallery call as
// `userGuideExtension`, and directly to `openWaferMapGuide` for the
// nothing-loaded case — the SAME object both places, so tsmap's Help menu
// shows identical combined content regardless of whether a map is currently
// rendered. See WMAP_ISSUES.md #37 (2026-08-28 decision, reversing #32).
const guideExtension = { title: 'tsmap — User Guide', html: TSMAP_GUIDE_HTML };

// ── DOM refs ──────────────────────────────────────────────────────────────────

// Tells index.html's module-error handler that the module got far enough to
// run — after this point a window error is a runtime problem the log panel can
// report, not a failed module load, so the handler must stop retitling the
// window. (It used to retitle on ANY error, including the benign ResizeObserver
// notice fired by an ordinary window resize.)
(window as unknown as { __tsmapBooted?: boolean }).__tsmapBooted = true;

const container       = document.getElementById('map-container')!;
const dropZone        = document.getElementById('drop-zone')!;
const openBtn         = document.getElementById('open-btn')!;
const addBtn          = document.getElementById('add-btn') as HTMLButtonElement;
const openMoreBtn     = document.getElementById('open-more-btn') as HTMLButtonElement;
const addMoreBtn      = document.getElementById('add-more-btn') as HTMLButtonElement;
const recentBtn       = document.getElementById('recent-btn') as HTMLButtonElement;
const lotBtn          = document.getElementById('lot-btn') as HTMLButtonElement;
const resetBtn        = document.getElementById('reset-btn') as HTMLButtonElement;
const helpBtn         = document.getElementById('help-btn') as HTMLButtonElement;
const fileLabel       = document.getElementById('file-label')!;
const busySpinner     = document.getElementById('busy-spinner')!;
const logList         = document.getElementById('log-list')!;
const logToggle       = document.getElementById('log-toggle')!;
const logPanel        = document.getElementById('log-panel')!;

/**
 * Show/hide the whole "a lot is loaded" half of the toolbar — the Lot ▾
 * trigger, the Clear button, and the group separators that frame them.
 * The separators are toggled here rather than left permanently in the markup
 * because a divider with nothing on one side of it reads as a rendering bug;
 * they only earn their place once there's a second group to divide.
 */
function setToolbarGroupVisible(visible: boolean): void {
  const display = visible ? '' : 'none';
  lotBtn.style.display = display;
  resetBtn.style.display = display;
  for (const sep of document.querySelectorAll<HTMLElement>('#toolbar .tb-sep')) {
    sep.style.display = display;
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentWafers: WaferData[] = [];
let currentFileName = 'wafermap';
let currentTestDefs: Record<string, TestDef> = {};
// From STDF/ATDF HBR/SBR — see ParsedFile.hbinDefs/sbinDefs/passHbins
// (types.ts). Undefined for formats with no HBR/SBR equivalent, or a file
// that had none; buildWaferMap call sites treat undefined the same as
// "nothing to pass," falling back to wmap's own default (bare bin numbers,
// passBins [1]).
let currentHbinDefs: BinDef[] | undefined;
let currentSbinDefs: BinDef[] | undefined;
let currentPassHbins: number[] | undefined;

// Tracks the most recently loaded STDF/ATDF files so "Filter tests…" can re-parse them.
let currentBinaryFiles: FileHandle[] = [];
let currentBinaryExt = ''; // 'stdf' | 'std' | 'atdf' | 'atd'
let currentTestNames: StdfTestNames | null = null; // first-pass scan result, reused by "Filter tests…"
// Whether the current test list came from the largest file only or all files —
// so "Filter tests…" can still offer to widen the scan if it wasn't already.
let binaryScanScope: 'largest' | 'all' = 'largest';


// ── App-wide state ────────────────────────────────────────────────────────────

// "Value findings" toggle: when on, wmap's regional parametric test-value
// pass runs (edge/quadrant/site "reads high/low on test X" + spec-region findings).
// This gates ONLY the test-value (Welch) findings — regional yield and bin findings
// are separate wmap analyses (enableHard/SoftBinAnalysis, default on) and run
// regardless of this toggle. Off by default since wmap 0.16.0 — the test-value pass
// scales with regions × tests × dies and is the dominant cost of analysis. Affects
// only analyzeWaferMap/Lot, never parsing, so toggling re-renders the in-memory
// data with no reload (see analyzeOpts).
let valueFindings = false;
const analyzeOpts = () => ({ enableTestValueAnalysis: valueFindings });

// Whether wafer map/gallery titles, cards, and summary panels show a wafer's
// split as a " · <split>" suffix (toggled in the splits modal). On by default
// so assigning a split is immediately visible.
let showSplitSuffix = true;

// Wafer diameter and edge-exclusion band width in mm, passed to every
// buildWaferMap call as `waferConfig.diameter`/`waferConfig.edgeExclusion`.
// Unlike splits (per-wafer), these are single values applied uniformly to
// whatever's currently loaded — initialized once from localStorage at
// startup and updated in place by the Diameter & edge exclusion… dialog/CLI
// flags, rather than re-read from storage on every render (which would mean
// a localStorage.getItem per wafer inside buildLotStatsSummary's loop).
// edgeExclusionMm is only ever non-undefined when waferDiameterMm is also
// set — see waferGeometry.ts's normalizeWaferGeometry, the single place that
// enforces this (an absolute mm exclusion value is only meaningful relative
// to a confirmed diameter — WMAP_ISSUES.md #42).
let waferDiameterMm: number | undefined = getWaferDiameterMm();
let edgeExclusionMm: number | undefined = getEdgeExclusionMm();

let cachedLotStats: ReturnType<typeof buildLotStatsSummary> | null = null;
// The wmap controller for the map currently rendered into the main `container`
// (full-window map/gallery view). Destroyed before the container is cleared so
// wmap's observers/listeners are disconnected deterministically (see
// WMAP_ISSUES.md #21). The modal drilldown owns its own controller separately.
let mainViewController: { destroy(): void; openUserGuide(): void } | null = null;
function destroyMainView() {
  mainViewController?.destroy();
  mainViewController = null;
}
/** Invalidate the memoised lot-stats cache. Call whenever the loaded wafer set changes. */
function clearLotStatsCache() {
  cachedLotStats = null;
}

// ── Log panel ─────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, msg: string) {
  const time = new Date().toLocaleTimeString();
  const el = document.createElement('div');
  el.className = `log-entry log-${level}`;
  el.textContent = `${time}  ${msg}`;
  logList.appendChild(el);
  logList.scrollTop = logList.scrollHeight;
  if (level === 'error') { logPanel.classList.add('open'); syncLogToggle(); }
  const errors = logList.querySelectorAll('.log-error').length;
  logToggle.textContent = errors > 0 ? `Log (${errors} error${errors > 1 ? 's' : ''})` : 'Log';
}

/** Surface any non-fatal parser advisories (e.g. fabricated soft bins) in the log. */
function logWarnings(parsed: ParsedFile) {
  for (const w of parsed.warnings ?? []) log('warn', `${parsed.fileName}: ${w}`);
}

/** Reflect the log panel's open state on the toggle (aria). Tooltip text is a
 *  getter (logToggleTip) so it tracks the open state without a native title. */
function syncLogToggle() {
  logToggle.setAttribute('aria-expanded', String(logPanel.classList.contains('open')));
}
function logToggleTip(): string {
  return logPanel.classList.contains('open') ? 'Hide the log panel' : 'Show the log panel';
}
logToggle.addEventListener('click', () => {
  logPanel.classList.toggle('open');
  syncLogToggle();
});

log('info', `tsmap v${__APP_VERSION__} (${__BUILD_DATE__})`);

// ── Drop-zone affordance ──────────────────────────────────────────────────────
// The dashed frame around "Open file" advertised two things it didn't do: it
// had `cursor:pointer` and a hover highlight but no click handler of its own
// (only the nested button responded, so the frame itself was dead), and
// `.drag-over` was styled in index.html but never applied by any code, so it
// never reacted to a drag. Both are wired here.

/** Clicking the frame — not just the button inside it — opens the picker.
 *  Forwarding via `openBtn.click()` rather than duplicating the open logic
 *  keeps this inside the synchronous user-gesture chain, which the web build's
 *  file input depends on (see the `#file-input` note further down). */
dropZone.addEventListener('click', (e) => {
  if (e.target === dropZone) openBtn.click();
});

let dragActiveTimer: number | undefined;
/** Highlight the frame while a file is being dragged. Deliberately triggered by
 *  a drag anywhere over the window, not just over the frame — dropping anywhere
 *  works, and the toolbar hint says so, so the frame is standing in as the
 *  indicator for the whole window. */
function setDragActive(on: boolean): void {
  window.clearTimeout(dragActiveTimer);
  if (on) {
    dropZone.classList.add('drag-over');
    // dragover fires continuously while the pointer moves; a short idle timeout
    // is far more reliable than dragleave, which also fires every time the
    // cursor crosses a child element's boundary.
    dragActiveTimer = window.setTimeout(() => dropZone.classList.remove('drag-over'), 200);
  } else {
    dropZone.classList.remove('drag-over');
  }
}

// ── Platform intercepts ───────────────────────────────────────────────────────

// Route wmap HTML reports through the platform adapter on BOTH targets. Tauri
// needs it because window.open is blocked in WebKitGTK; web needs it because
// wmap's own fallback is a bare console.warn, so a blocked popup lost the
// report silently. This used to sit inside the isTauri block below, which left
// webPlatform.openReport unreachable — implemented, but nothing could call it.
setReportOpener((html: string) => platform.openReport(html));

if (isTauri) {
  // File drop
  import('@tauri-apps/api/event').then(({ listen }) => {
    // Tauri emits its own drag lifecycle rather than DOM drag events.
    listen('tauri://drag-enter', () => setDragActive(true)).catch(() => {});
    listen('tauri://drag-over',  () => setDragActive(true)).catch(() => {});
    listen('tauri://drag-leave', () => setDragActive(false)).catch(() => {});

    listen<{ paths: string[] }>('tauri://drag-drop', event => {
      setDragActive(false);
      const paths = event.payload.paths ?? [];
      if (paths.length === 0) return;
      void (async () => {
        // A dropped FOLDER is the natural "where?" gesture, and it used to be
        // silently broken: the directory path was wrapped as a FileHandle and
        // sent to the parser, which can only fail. Route it to the same scan
        // the empty state's "Scan a folder…" uses instead. This is also what
        // makes folder scanning reachable once data is loaded, where the empty
        // state is gone.
        const dirs: string[] = [];
        const filePaths: string[] = [];
        for (const p of paths) {
          if (platform.isDirectory && await platform.isDirectory(p)) dirs.push(p);
          else filePaths.push(p);
        }
        if (dirs.length > 0) {
          if (filePaths.length > 0) {
            log('info', `Dropped ${dirs.length} folder${dirs.length === 1 ? '' : 's'} and ${filePaths.length} file${filePaths.length === 1 ? '' : 's'} — scanning the folder${dirs.length === 1 ? '' : 's'}; drop the files on their own to load them directly.`);
          }
          await scanDroppedFolders(dirs);
          return;
        }
        const files: FileHandle[] = filePaths.map(p => ({
          name: basename(p),
          bytes: new Uint8Array(0),
          path: p,
        }));
        handleFiles(files, false);
      })();
    }).catch(e => log('warn', `File drop listener failed: ${e}`));

    // Files forwarded from a second `tsmap <files>` launch (see
    // src-tauri/src/lib.rs's single-instance callback, which focuses this
    // window and emits this event rather than deciding anything itself).
    // Nothing loaded yet → just open it. Otherwise never clobber in-progress
    // analysis silently: ask first, and if declined, open the new data in its
    // own independent window instead of discarding it.
    listen<CliStartupArgs>('cli-open-files', async event => {
      const args = event.payload;
      if (currentWafers.length === 0) {
        applyCliArgs(args);
        return;
      }
      const n = args.files.length;
      const replace = await platform.confirm(
        `Replace the currently loaded data with ${n} file${n !== 1 ? 's' : ''} from the new tsmap launch?`
      );
      if (replace) {
        applyCliArgs(args);
      } else {
        platform.respawnNewInstance(args).catch(e => log('error', `Failed to open a new tsmap window: ${errMsg(e)}`));
      }
    }).catch(e => log('warn', `CLI file listener failed: ${e}`));
  });

  // Files/tests/splits resolved from this process's own CLI args/stdin at launch.
  platform.getStartupFiles().then(args => { if (args) applyCliArgs(args); });
} else {
  // Caller-supplied data URL (e.g. `?dataUrl=https://.../lot.json&dataFormat=json`)
  // — the web build's headless/programmatic counterpart to desktop's
  // `--url`/`--url-format`. No auth is sent; the URL must be
  // self-authenticating (e.g. a presigned link) since a web URL sitting in
  // browser history/logs isn't a secure channel for a separately-issued
  // secret. Consumed once at startup; the params are stripped from the URL
  // immediately after (success or failure) so a refresh doesn't silently
  // re-fetch — wasteful at best, broken outright if the URL was one-time.
  const startupParams = new URLSearchParams(window.location.search);
  const dataUrl = startupParams.get('dataUrl');
  const dataFormat = startupParams.get('dataFormat');
  if (dataUrl || dataFormat) {
    startupParams.delete('dataUrl');
    startupParams.delete('dataFormat');
    const rest = startupParams.toString();
    history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);

    if (!dataUrl || !dataFormat) {
      log('error', 'dataUrl and dataFormat query params must both be given together');
    } else if (!isUrlImportFormat(dataFormat)) {
      log('error', `Unsupported dataFormat "${dataFormat}"`);
    } else {
      // Deferred to the `load` event rather than fired immediately: a
      // `fetch()` issued during the earliest tick of this top-level module's
      // own execution (still `document.readyState === 'interactive'`)
      // reproducibly never settled — neither the `.then` nor the `.catch`
      // ever ran, confirmed by direct logging around the call. The exact
      // same `fetch()`, issued any time after the page finished loading,
      // always resolved immediately and normally.
      const runFetch = () => {
        setBusy(`Fetching ${dataUrl}…`);
        fetch(dataUrl)
          .then(async res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            // handleFiles() has its own re-entrancy guard (`if (busy) return`,
            // main.ts) — setBusy() above set that flag for the fetch itself,
            // so it must be cleared before calling in, or handleFiles silently
            // no-ops (the fetch appears to succeed — bytes obtained — but
            // nothing after it ever happens: no parse, no error, no render).
            setIdle();
            handleFiles([{ name: deriveFileName(dataUrl, dataFormat), bytes }], false);
          })
          .catch(e => {
            // A CORS rejection surfaces to JS as an opaque network TypeError —
            // called out explicitly since it would otherwise look inscrutable
            // to whoever configured the caller's endpoint.
            log('error', `Failed to fetch "${dataUrl}": ${errMsg(e)} — if this is a cross-origin URL, the server must send CORS headers allowing this origin`);
            setIdle();
          });
      };
      if (document.readyState === 'complete') {
        runFetch();
      } else {
        window.addEventListener('load', runFetch, { once: true });
      }
    }
  }

  // Web drag-drop
  document.body.addEventListener('dragover', e => { e.preventDefault(); setDragActive(true); });
  document.body.addEventListener('dragleave', () => { setDragActive(false); });
  document.body.addEventListener('drop', async e => {
    e.preventDefault();
    setDragActive(false);
    if (busy) return;
    const items = Array.from(e.dataTransfer?.files ?? []);
    if (items.length === 0) return;
    // size/lastModified come free from the File and are what the file-filter
    // table's baseline columns read — a dropped file should carry them just
    // like a picked one.
    const files = await Promise.all(items.map(async f => ({
      name: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
      size: f.size,
      lastModified: f.lastModified,
    })));
    handleFiles(files, false);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

/** wmap grades every advisory; map its scale onto the log panel's three levels. */
const WMAP_WARNING_LOG_LEVEL: Record<ReturnType<typeof severityOf>, LogLevel> = {
  error: 'error',
  warning: 'warn',
  info: 'info',
};

/**
 * Surface wmap's own per-wafer advisories in the log panel — the counterpart to
 * `logWarnings` for parser warnings, and subject to the same rule: never build a
 * wafer map without reporting what wmap said about it.
 *
 * Goes through wmap's own `collectWarnings` rather than reading
 * `waferMap.warnings` directly, because since wmap 0.22.0 the advisories come
 * from **two** places and reading either one alone under-reports:
 *
 * - the build — inferred geometry (`partial-coverage`, `geometry-conflict`,
 *   `inferred-pitch`), i.e. what's drawn rests on a guess rather than on data;
 * - the analysis — `test-count-capped`, meaning test-value analysis was skipped
 *   entirely and **no** test findings were produced.
 *
 * That second source is why `statsSummary` is a parameter and why this must be
 * called **after** `analyzeWaferMap`, not before it. `collectWarnings` also
 * de-duplicates and severity-orders, so this stays in step with what wmap's own
 * toolbar indicator shows instead of re-deriving a second, different set.
 *
 * Severity maps to log level (`WMAP_WARNING_LOG_LEVEL`) rather than everything
 * logging as 'warn': wmap grades geometry advisories 'error' because dies may be
 * drawn in the wrong place, which is worth opening the log panel for.
 *
 * Must be called from **every** `buildWaferMap` call site. The gallery path had
 * this inline while the single-wafer path silently dropped the warnings, so a
 * one-wafer load — the case where a geometry advisory is easiest to act on —
 * was the one that never showed it.
 */
// Tracks warnings already logged since the last file load, so re-rendering
// (a Splits change, the geometry dialog, or anything else that clears
// cachedLotStats and re-runs buildWaferMap for every wafer) doesn't re-flood
// the log panel with the same advisory shown moments ago. Cleared at the
// start of every renderWafers — a genuinely new load should still show
// everything, even a warning identical to one from the previous file.
const loggedWmapWarnings = new Set<string>();

function logWmapWarnings(waferId: string, waferMap: WaferMapResult, statsSummary?: StatsSummary | null) {
  for (const warning of collectWarnings({ result: waferMap, statsSummary })) {
    const key = `${waferId}:${warning.code}:${warning.message}`;
    if (loggedWmapWarnings.has(key)) continue;
    loggedWmapWarnings.add(key);
    const conf = warning.confidence !== undefined ? ` (confidence ${(warning.confidence * 100).toFixed(0)}%)` : '';
    log(WMAP_WARNING_LOG_LEVEL[severityOf(warning)], `Wafer ${waferId} [${warning.code}]: ${warning.message}${conf}`);
  }
}

// Return type is inferred (not annotated) so `items[i].label`/`.statsSummary`
// stay visible to TS — they're real fields (spread from `waferMap` plus both
// added below), but an explicit `{ items: ReturnType<typeof buildWaferMap>[] }`
// annotation here would narrow them away for every caller, including the
// Insights tab (via `lotStatsSummary`) and wmap's own Findings sidebar
// report button, which reads `.label`/`.statsSummary` off the same items.
/**
 * Builds the `buildWaferMap` argument object for one wafer — shared by the
 * single-wafer render path (`renderWaferView`) and the per-wafer loop in
 * `buildLotStatsSummary`, which had each independently assembled the same
 * `waferConfig`/`dieConfig`/bin-def fields. `wcr` is passed in already
 * resolved (rather than computed here from `w.source`) so
 * `buildLotStatsSummary` can keep caching it per `WaferSource` reference
 * across many wafers sharing one WCR record.
 */
function buildWmapConfig(
  w: WaferData,
  displayId: string,
  testDefs: ReturnType<typeof toWmapTestDefs>,
  wcr: ReturnType<typeof wcrGeometryFrom> | undefined,
) {
  return {
    results: w.results,
    testDefs,
    waferConfig: {
      metadata: toWmapWaferMeta(w.source, displayId, w.fields),
      // Precedence: user override > this file's own WCR record > wmap's own
      // geometric inference (see waferGeometry.ts's module doc).
      diameter: waferDiameterMm ?? wcr?.waferConfig.diameter,
      center: wcr?.waferConfig.center,
      notch: wcr?.waferConfig.notch,
      edgeExclusion: edgeExclusionMm,
    },
    dieConfig: wcr?.dieConfig,
    // From this file's HBR/SBR (see ParsedFile.hbinDefs/sbinDefs/passHbins,
    // types.ts) — undefined falls back to wmap's own defaults (bare bin
    // numbers, passBins [1]).
    hbinDefs: currentHbinDefs,
    sbinDefs: currentSbinDefs,
    passBins: currentPassHbins,
  };
}

function buildLotStatsSummary(wafers: WaferData[]) {
  const testDefs = toWmapTestDefs(currentTestDefs);
  // WCR geometry is lot-level (one WCR record per file), and every wafer
  // produced by the same file shares its WaferSource by reference (types.ts's
  // own documented invariant), so wcrGeometryFrom's result is identical for
  // every wafer in that file — cache by source reference (a Map handles the
  // `undefined` source of a lot-metadata-less load fine too, as a real key
  // distinct from "not yet computed") rather than recomputing per wafer.
  const wcrCache = new Map<WaferSource | undefined, ReturnType<typeof wcrGeometryFrom>>();
  const wcrFor = (source: WaferSource | undefined) => {
    if (!wcrCache.has(source)) wcrCache.set(source, wcrGeometryFrom(source));
    return wcrCache.get(source);
  };
  const items = wafers.map(w => {
    const displayId = waferDisplayLabel(w, showSplitSuffix);
    const wcr = wcrFor(w.source);
    const waferMap = buildWaferMap(buildWmapConfig(w, displayId, testDefs, wcr));
    const statsSummary = analyzeWaferMap(waferMap, analyzeOpts());
    logWmapWarnings(w.waferId, waferMap, statsSummary);
    return { ...waferMap, label: displayId, statsSummary };
  });
  const perWaferSummaries = items.map(i => i.statsSummary);
  const lotStatsSummary = analyzeWaferLot(items, { perWaferSummaries, ...analyzeOpts() });
  return { items, lotStatsSummary };
}

// ── Wafer split persistence ──────────────────────────────────────────────────
// Splits are just a per-wafer metadata field (see splits.ts) that CSV
// save/load already round-trips explicitly. This is a convenience layer on
// top: re-opening the SAME lot restores prior in-app assignments without the
// user re-loading a CSV every time. Keyed by splitsFingerprint (splits.ts) —
// lot ID + wafer ID, not the source file — so a different lot never inherits
// stale assignments.

const SPLITS_LS_KEY = 'tsmap:wafer-splits';

/**
 * Set by the "Load sample data" flow just before calling handleFiles, since
 * the demo lot's matching splits (waferId → split label, from the bundled
 * PVT-LOT-05_splits.csv) can't be written into SPLITS_LS_KEY until the
 * fingerprint is computable, which needs parsed wafers — not available yet at
 * click time. `loadSavedSplits` below seeds the store from this the moment
 * wafers exist, then defers entirely to the existing restore path (auto-open
 * dialog, log message, etc.) — no separate apply/UI logic duplicated.
 */
let pendingSampleSplitSeed: Map<string, string> | null = null;

/**
 * Set by `applyCliArgs` just before calling `handleFiles`, from a CLI-supplied
 * `--tests` file's content. Consumed once by the very first
 * `showTestSelectorOverlay` call for that load (as `preloadListText`) and
 * cleared — a later re-open of the same overlay within one load (e.g. the
 * "scan all files" widen) must not keep re-applying it over the user's
 * in-progress adjustments.
 */
let pendingTestListPreload: string | null = null;

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
const AUTOSELECT_CELL_BUDGET = 2_000_000;

function isCheapToImportAll(testCount: number, dieCount: number): boolean {
  // dieCount is 0 when nothing reported a die count — no basis to judge, so
  // fall back to the conservative default rather than guessing.
  return testCount > 0 && dieCount > 0 && testCount * dieCount <= AUTOSELECT_CELL_BUDGET;
}

/**
 * Applies any saved splits for this exact wafer set and reports where they came
 * from — callers must surface that (never apply silently), since splits
 * reappearing with no visible cause is confusing.
 *
 * `'restored'` and `'seeded'` are distinguished because they warrant different
 * treatment. A restore from a previous session is genuinely unexpected: the
 * user did nothing to ask for it, so the dialog opens to show what happened. A
 * seed is this same load writing the bundled sample's own splits moments
 * earlier — expected, self-explanatory, and not worth a modal on top of the
 * test selector the user has just dismissed.
 */
type SplitsRestore = 'none' | 'restored' | 'seeded';

function loadSavedSplits(wafers: WaferData[]): SplitsRestore {
  try {
    const store = JSON.parse(localStorage.getItem(SPLITS_LS_KEY) ?? '{}');
    const fromSeed = pendingSampleSplitSeed !== null;
    if (pendingSampleSplitSeed) {
      store[splitsFingerprint(wafers)] = Object.fromEntries(pendingSampleSplitSeed);
      localStorage.setItem(SPLITS_LS_KEY, JSON.stringify(store));
      pendingSampleSplitSeed = null;
    }
    const saved: Record<string, string> | undefined = store[splitsFingerprint(wafers)];
    if (!saved) return 'none';
    let applied = false;
    for (const w of wafers) {
      if (getSplitLabel(w) === undefined && saved[w.waferId]) { setSplitLabel(w, saved[w.waferId]); applied = true; }
    }
    if (!applied) return 'none';
    return fromSeed ? 'seeded' : 'restored';
  } catch { return 'none'; }
}

function saveSplits(wafers: WaferData[]): void {
  try {
    const store = JSON.parse(localStorage.getItem(SPLITS_LS_KEY) ?? '{}');
    const assignments: Record<string, string> = {};
    for (const w of wafers) {
      const v = getSplitLabel(w);
      if (v) assignments[w.waferId] = v;
    }
    store[splitsFingerprint(wafers)] = assignments;
    localStorage.setItem(SPLITS_LS_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — silently skip */ }
}

function renderWafers(
  wafers: WaferData[], label: string, testDefs: Record<string, TestDef> = {},
  binInfo: { hbinDefs?: BinDef[]; sbinDefs?: BinDef[]; passHbins?: number[] } = {},
) {
  currentWafers = wafers;
  currentFileName = label;
  currentTestDefs = testDefs;
  currentHbinDefs = binInfo.hbinDefs;
  currentSbinDefs = binInfo.sbinDefs;
  currentPassHbins = binInfo.passHbins;
  loggedWmapWarnings.clear();
  const restoredSplits = loadSavedSplits(wafers);
  clearLotStatsCache();
  addBtn.disabled = wafers.length === 0;
  addMoreBtn.disabled = addBtn.disabled;
  // One trigger for every lot-scoped dialog (see openLotMenu). Its rows
  // handle their own availability — "Filter tests…" greys out for a file with
  // no test data — so this only needs the "is anything loaded at all" gate.
  setToolbarGroupVisible(wafers.length > 0);
  // Value findings are only meaningful when there are test values. Reset
  // it off on every new load so a fresh (possibly large) lot starts on the fast path.
  valueFindings = false;

  const totalDies = wafers.reduce((n, w) => n + w.results.length, 0);
  const loadedMsg = `${label} — ${wafers.length} wafer${wafers.length !== 1 ? 's' : ''}, ${totalDies} dies`;

  // buildWaferMap/renderWaferMap run synchronously and can take real time on
  // large lots — show the spinner then defer via double-rAF so the first
  // frame actually paints the spinner before the heavy render blocks the
  // main thread (single setTimeout(0) is not reliable in WebKitGTK).
  setBusy(`Rendering ${loadedMsg}…`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    renderWaferView(wafers, label);
    setIdle(loadedMsg);
    // Splits carried over from a previous session on this exact wafer set —
    // never apply that silently. Open the dialog so it's obvious what
    // happened and the user can review, edit, or "Clear all" it.
    if (restoredSplits === 'restored') {
      log('info', 'Restored wafer splits from a previous session — review in the Splits dialog.');
      openSplitsDialog();
    } else if (restoredSplits === 'seeded') {
      // The sample lot ships with its own splits, so seeing them is expected.
      // Log it rather than stacking a second dialog on the test selector the
      // user has just worked through.
      log('info', 'The sample lot includes wafer splits — edit them via Lot ▾ → Splits….');
    }
  }));
}


// Route wmap PNG saves through the native dialog in Tauri; undefined on web uses the default download.
const onSaveImage = isTauri
  ? (blob: Blob, suggestedName: string) => {
      const stem = suggestedName.replace(/\.png$/i, '');
      platform.savePng(blob, stem, 'Save image')
        .then(() => log('info', `PNG saved: ${suggestedName}`))
        .catch((err: unknown) => log('error', `PNG save failed: ${err}`));
    }
  : undefined;

// Route wmap CSV/text exports (Summary/Insights "Export CSV") through the
// native dialog in Tauri; undefined on web uses the default download. Mirrors
// onSaveImage — see WMAP_ISSUES.md #33.
const onSaveText = isTauri
  ? (text: string, suggestedName: string) => {
      platform.saveTextFile(text, suggestedName, 'Save exported data')
        .then(() => log('info', `Saved: ${suggestedName}`))
        .catch((err: unknown) => log('error', `Save failed: ${err}`));
    }
  : undefined;

function renderWaferView(wafers: WaferData[], label: string) {
  destroyMainView();
  container.innerHTML = '';
  const stem = label.replace(/\.[^.]+$/, '');

  const plotMode = autoPlotMode(wafers);
  const wmapTestDefs = toWmapTestDefs(currentTestDefs);
  if (wafers.length === 1) {
    container.classList.remove('gallery');
    const singleWcr = wcrGeometryFrom(wafers[0].source);
    const waferMap = buildWaferMap(buildWmapConfig(
      wafers[0], waferDisplayLabel(wafers[0], showSplitSuffix), wmapTestDefs, singleWcr,
    ));
    const statsSummary = analyzeWaferMap(waferMap, analyzeOpts());
    logWmapWarnings(wafers[0].waferId, waferMap, statsSummary);
    mainViewController = renderWaferMap(container, waferMap, {
      statsSummary,
      summaryPanel: { placement: 'right', defaultOpen: true },
      // No visible wmap help button — tsmap's own Help menu (openHelpMenu)
      // triggers wmap's guide via the controller's openUserGuide(), not a
      // button click. tsmap's own guide content is folded into that same
      // window via userGuideExtension below. See WMAP_ISSUES.md #37.
      showHelpButton: false,
      userGuideExtension: guideExtension,
      downloadFilename: stem,
      onSaveImage,
      onSaveText,
      viewOptions: { plotMode },
      // wmap's own warning indicator is left ON (the `warnings` option's
      // default). It and tsmap's log deliberately show the same advisories:
      // the toolbar indicator is discoverable and persists with the map, the
      // log is the per-wafer history. Don't "de-duplicate" by passing
      // { display: false } — that hides the geometry advisory from anyone who
      // never opens the log panel, which is the gap wmap 0.22.0 closed.
      // Single-wafer counterpart to the gallery's insights below — closes
      // the gap that blocked removing tsmap's own Charts page (see
      // WMAP_ISSUES.md): single-wafer loads had no chart access at all
      // without this.
      insights: { enabled: true },
    });
  } else {
    container.classList.add('gallery');
    cachedLotStats ??= buildLotStatsSummary(wafers);
    const { items, lotStatsSummary } = cachedLotStats;
    mainViewController = renderWaferGallery(container, items, {
      lotStatsSummary,
      summaryPanel: { placement: 'right', defaultOpen: true },
      // No visible wmap help button — tsmap's own Help menu (openHelpMenu)
      // triggers wmap's guide via the controller's openUserGuide(), not a
      // button click. tsmap's own guide content is folded into that same
      // window via userGuideExtension below. See WMAP_ISSUES.md #37.
      showHelpButton: false,
      userGuideExtension: guideExtension,
      downloadFilename: stem,
      onSaveImage,
      onSaveText,
      viewOptions: { plotMode },
      // wmap's own warning indicator is left ON (the `warnings` option's
      // default) — see the note on the single-wafer call above. The gallery
      // collects across every card and de-duplicates, so a lot-wide geometry
      // advisory is stated once there; tsmap's log keeps the per-wafer detail.
      // wmap-owned Insights tab (see WMAP_ISSUES.md #31) — the only chart
      // access now that tsmap's own Charts page has been removed.
      insights: { enabled: true },
    });
  }
}

/**
 * Tear down the current maps/charts view for a fresh (non-append) load that has
 * been committed but may take a while to parse. Unlike `showEmptyState` this does
 * NOT reset load state (`currentBinaryFiles`, `currentTestNames`, button
 * visibility) — those are mid-load and still needed; it only blanks the visible
 * container so the user doesn't see stale data while the new file parses.
 * `renderWafers` replaces this placeholder once the parse completes.
 */
function showLoadingState(msg: string) {
  destroyMainView();
  container.classList.remove('gallery');
  container.innerHTML = '';
  const placeholder = document.createElement('div');
  placeholder.style.cssText =
    'display:flex;align-items:center;justify-content:center;position:absolute;inset:0;' +
    'color:var(--text-faint);font-size:14px;user-select:none;';
  placeholder.textContent = msg;  // textContent: file names are untrusted
  container.appendChild(placeholder);
}


function showEmptyState() {
  currentWafers = [];
  currentTestDefs = {};
  currentHbinDefs = undefined;
  currentSbinDefs = undefined;
  currentPassHbins = undefined;
  currentBinaryFiles = [];
  currentBinaryExt = '';
  currentTestNames = null;
  binaryScanScope = 'largest';
  clearLotStatsCache();
  addBtn.disabled = true;
  addMoreBtn.disabled = true;
  setToolbarGroupVisible(false);
  destroyMainView();
  container.classList.remove('gallery');
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                position:absolute;inset:0;gap:16px;color:var(--text-faint);user-select:none;">
      <svg width="64" height="64" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <!-- Same wafer glyph as public/tsmap-favicon.ico/tsmap-favicon-*.png
             (the wafertools icon family — wafer body, grid, notch, one
             highlighted "anchor" die), shape data copied verbatim from
             /home/paul/Pictures/wafertools-icons/wafertools-icon-template.svg.
             Theme-tinted (var(--border-dim), matching the "Load sample
             data" button's own border right below it), unlike the
             favicon's fixed brand colours — this has to stay legible and
             unobtrusive across all 8 themes as a background placeholder,
             not read as a brand mark on its own. The highlight die keeps
             tsmap's fixed brand green (#3fae52, same as the favicon/app
             icon) as the one accent tying it back to the real icon.

             Stroke widths are NOT copied verbatim from the template — its
             values (2.5/6/9) were sized for direct rasterization at
             1024px+; scaled live to this 64px display size they land at
             sub-pixel widths (down to ~0.15px) that browsers barely render,
             which is exactly what happened to the first version of this
             icon (confirmed empirically — only the highlight die was
             visible, everything else vanished). Multiplied roughly x3-6 so
             real on-screen strokes land around 1-2px instead. -->
        <defs>
          <clipPath id="empty-state-wafer-clip">
            <path d="M 96.17,481.73 A 417,417 0 1,1 98.20,564.54 L 145.11,521.97 Z"/>
          </clipPath>
        </defs>
        <path d="M 96.17,481.73 A 417,417 0 1,1 98.20,564.54 L 145.11,521.97 Z"
              fill="none" stroke="var(--border-dim)" stroke-width="32"/>
        <g clip-path="url(#empty-state-wafer-clip)">
          <g stroke="var(--border-dim)" stroke-width="14" opacity="0.5">
            <line x1="197" y1="95" x2="197" y2="931"/>
            <line x1="422" y1="95" x2="422" y2="931"/>
            <line x1="647" y1="95" x2="647" y2="931"/>
            <line x1="872" y1="95" x2="872" y2="931"/>
            <line x1="95" y1="270" x2="931" y2="270"/>
            <line x1="95" y1="495" x2="931" y2="495"/>
            <line x1="95" y1="720" x2="931" y2="720"/>
          </g>
          <g stroke="var(--border-dim)" stroke-width="22" stroke-dasharray="20 16" opacity="0.9">
            <line x1="95" y1="360" x2="931" y2="360"/>
            <line x1="287" y1="95" x2="287" y2="931"/>
          </g>
          <g fill="none" stroke="var(--border-dim)" stroke-width="26">
            <rect x="197" y="270" width="180" height="180" rx="22" fill="#3fae52" stroke="none"/>
            <rect x="422" y="270" width="180" height="180" rx="22"/>
            <rect x="647" y="270" width="180" height="180" rx="22"/>
            <rect x="197" y="495" width="180" height="180" rx="22"/>
            <rect x="422" y="495" width="180" height="180" rx="22"/>
            <rect x="647" y="495" width="180" height="180" rx="22"/>
          </g>
        </g>
      </svg>
      <div style="font-size:15px;color:var(--text-dim);">Open a file to get started</div>
      <div style="font-size:12px;color:var(--text-veryfaint);">Supports STDF, ATDF, CSV, JSON and Parquet</div>
    </div>`;

  const column = container.firstElementChild as HTMLElement;

  // Loads a bundled synthetic lot through the normal load pipeline (test
  // selector, etc.) so a first-time user — or an evaluator getting past the
  // unsigned-installer security warning — can see the app work before
  // trusting it with their own files. Works on both platforms: desktop reads
  // it as a real bundled resource path, web fetches it as a static asset.
  const sampleBtn = document.createElement('button');
  sampleBtn.type = 'button';
  sampleBtn.className = 'btn-secondary';
  sampleBtn.style.cssText = 'margin-top:4px;';   // layout only
  sampleBtn.textContent = 'Load sample data';
  sampleBtn.addEventListener('click', async () => {
    if (busy) return;
    try {
      const file = await platform.getSampleFile();
      // Best-effort: a missing/failed splits fetch shouldn't block the load
      // itself, so this deliberately doesn't throw — the lot is still a
      // perfectly good demo without its splits.
      const splitsCsv = await platform.getSampleSplitsCsv().catch(() => null);
      if (splitsCsv) pendingSampleSplitSeed = parseSplitsCsv(splitsCsv);
      handleFiles([file], false);
    } catch (e) {
      log('error', `Failed to load sample data: ${errMsg(e)}`);
    }
  });
  column.appendChild(sampleBtn);

  // The discovery moment for "I have a directory of files and don't know which
  // I want". It lives here rather than in the toolbar because it is a way of
  // CHOOSING files, not a third thing to do with them — the toolbar's two
  // buttons are the two operations (replace, append), and a third button beside
  // them implied a third operation that never existed.
  const scanFolderBtn = document.createElement('button');
  scanFolderBtn.type = 'button';
  scanFolderBtn.id = 'scan-folder-btn';
  scanFolderBtn.className = 'btn-secondary';
  scanFolderBtn.style.cssText = 'margin-top:4px;';   // layout only
  scanFolderBtn.textContent = 'Scan a folder…';
  attachTooltip(scanFolderBtn, 'Scan every wafer-map file in a folder, then filter by lot metadata and choose which to load');
  scanFolderBtn.addEventListener('click', () => void scanFolderAndFilter(false));
  column.appendChild(scanFolderBtn);

  // Recent files needs a persistent native path to reopen without the picker —
  // only available on desktop (webPlatform's File objects have no path). Also
  // reachable from the toolbar's Recent button once data is loaded (openRecentMenu).
  if (isTauri && getRecentFiles().length > 0) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:4px;width:320px;';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:12px;color:var(--text-veryfaint);text-transform:uppercase;' +
      'letter-spacing:var(--tracking);margin-bottom:2px;text-align:center;';
    heading.textContent = 'Recent';
    wrap.appendChild(heading);
    wrap.appendChild(buildRecentRows(() => {}, () => { showEmptyState(); }));
    column.appendChild(wrap);
  }
}

/**
 * Builds the recent-files row list (open + remove per entry), shared by the
 * empty-state panel and the toolbar's Recent dropdown (openRecentMenu). Each
 * row's open action is a fresh load (`isAppend: false`), matching "Open file"'s
 * existing replace-current-data behaviour — there is no append-from-recent yet.
 * `onOpen` fires just before a reopen starts (the toolbar menu uses it to close
 * itself); `onRemove` fires after a row is deleted so the caller can re-render.
 */
function buildRecentRows(onOpen: () => void, onRemove: () => void): HTMLElement {
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  for (const entry of getRecentFiles()) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;';

    const rowOpenBtn = document.createElement('button');
    rowOpenBtn.type = 'button';
    rowOpenBtn.className = 'btn-row';
    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameLine.textContent = entry.label;  // textContent: file names are untrusted
    const timeLine = document.createElement('div');
    timeLine.style.cssText = 'font-size:12px;color:var(--text-veryfaint);';
    timeLine.textContent = formatRecentTime(entry.time);
    rowOpenBtn.append(nameLine, timeLine);
    // Dynamically-created element — upgradeTitleTooltips only runs once at
    // startup over the static toolbar, so this needs the themed tooltip
    // wired explicitly (a plain `title` here leaves ghost rendering
    // artifacts on WebKitGTK when the row is removed while it's showing).
    attachTooltip(rowOpenBtn, entry.paths.join('\n'));
    rowOpenBtn.addEventListener('click', () => {
      if (busy) return;
      const files: FileHandle[] = entry.paths.map(p => ({ name: basename(p), bytes: new Uint8Array(0), path: p }));
      onOpen();
      handleFiles(files, false);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Remove ${entry.label} from recent files`);
    removeBtn.className = 'btn-icon';
    removeBtn.style.cssText = 'flex-shrink:0;font-size:14px;';   // layout only
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecentFile(entry.paths);
      syncRecentBtn();
      onRemove();
    });

    row.append(rowOpenBtn, removeBtn);
    list.appendChild(row);
  }
  return list;
}

/** Shows/hides the toolbar's Recent button based on whether any entries exist —
 *  independent of load state, so it stays available once data is loaded (the
 *  gap this closes: the recent list previously only appeared on the empty
 *  state, which disappears the moment a file is open). */
function syncRecentBtn() {
  if (!isTauri) return;
  recentBtn.style.display = getRecentFiles().length > 0 ? '' : 'none';
}

let closeRecentMenu: (() => void) | null = null;
let closeLotMenu: (() => void) | null = null;

/** Opens (or closes, if already open) a themed dropdown of recent files
 *  anchored under `anchor`, reusing buildRecentRows for the row UI. */
function openRecentMenu(anchor: HTMLElement) {
  if (closeRecentMenu) { closeRecentMenu(); return; }

  closeRecentMenu = openAnchoredMenu(
    anchor,
    {
      padding: '8px', minWidth: '260px', maxWidth: '360px', fontSize: '12px',
      onClose: () => { closeRecentMenu = null; },
    },
    (popup, close) => {
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:12px;color:var(--text-veryfaint);text-transform:uppercase;' +
        'letter-spacing:var(--tracking);margin-bottom:6px;';
      heading.textContent = 'Recent';
      popup.appendChild(heading);

      // Re-entrant: removing the last entry from inside a row closes the menu.
      const rebuild = () => {
        popup.querySelector('.recent-rows')?.remove();
        if (getRecentFiles().length === 0) { close(); return; }
        const rows = buildRecentRows(close, rebuild);
        rows.classList.add('recent-rows');
        popup.appendChild(rows);
      };
      rebuild();
    },
  );
}

// ── Multi-file load flow ──────────────────────────────────────────────────────

let busy = false;

function setBusy(msg: string) {
  busy = true;
  fileLabel.textContent = msg;
  busySpinner.classList.add('active');
  openBtn.style.pointerEvents = 'none';
  openBtn.style.opacity = '0.5';
  addBtn.disabled = true;
  addMoreBtn.disabled = true;
  openMoreBtn.style.pointerEvents = 'none';
  openMoreBtn.style.opacity = '0.5';
}

function setIdle(msg = '') {
  busy = false;
  fileLabel.textContent = msg;
  busySpinner.classList.remove('active');
  openBtn.style.pointerEvents = '';
  openBtn.style.opacity = '';
  openMoreBtn.style.pointerEvents = '';
  openMoreBtn.style.opacity = '';
  if (currentWafers.length > 0) { addBtn.disabled = false; addMoreBtn.disabled = false; }
}

/**
 * Fast first-pass scan (PTR/FTR names, no die accumulation) across one or more
 * binary files, merging their test definitions into a single map. Used both for
 * the default largest-file scan and for the selector's "scan all files" toggle.
 * `dieCount` is the exact sum of dies across the scanned files. Returns null only
 * if every scan failed; a per-file failure is logged and skipped. Relies on
 * `currentBinaryExt` for the format (all binary files in a load share it).
 */
async function scanBinaryTests(filesToScan: FileHandle[]): Promise<{ testDefs: StdfTestNames; dieCount: number } | null> {
  const isAtdf = currentBinaryExt === 'atdf' || currentBinaryExt === 'atd';
  const merged: StdfTestNames = {};
  let dieCount = 0;
  let anyOk = false;
  for (const file of filesToScan) {
    setBusy(`Scanning ${file.name} for tests…`);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const result: ScanResult = isAtdf
        ? await platform.atdfTestNames(file)
        : await platform.stdfTestNames(file);
      Object.assign(merged, result.testDefs); // test numbers are the identity key
      dieCount += result.dieCount;
      anyOk = true;
      log('info', `${file.name}: ${Object.keys(result.testDefs).length} tests found, ${result.dieCount.toLocaleString()} dies`);
    } catch (e) {
      log('warn', `Test name scan failed for ${file.name}: ${errMsg(e)}`);
    }
  }
  if (!anyOk) {
    log('warn', 'Test name scan failed — parsing all tests');
    return null;
  }
  return { testDefs: merged, dieCount };
}

async function handleFiles(files: FileHandle[], isAppend: boolean) {
  if (files.length === 0) return;
  if (busy) return;

  // Captured before archive expansion/reassignment below, so a reopened .zip
  // records (and re-expands) its own path rather than its extracted contents.
  const originalPaths = files.every(f => f.path) ? files.map(f => f.path as string) : null;

  setBusy(`Reading ${files.length} file${files.length > 1 ? 's' : ''}…`);
  // Yield two animation frames so the spinner actually paints before the
  // first platform call (WebKitGTK may not repaint on setTimeout(0) alone).
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Expand archives — .gz and .zip handled per-platform
  let needsCleanup = false;
  const anyZip = files.some(f => f.name.toLowerCase().endsWith('.zip'));
  if (anyZip) {
    setBusy(`Extracting archive…`);
    needsCleanup = isTauri && anyZip;
  }
  files = await platform.expandArchives(files).catch(e => {
    log('error', `Archive extraction failed: ${e}`);
    return files;
  });

  if (files.length === 0) {
    setIdle('Error: no files after extraction');
    return;
  }

  // Validate all files have the same extension (relaxed for mixed-format zips)
  // — checkSameExtension/effectiveFileExtension (lib.ts) are shared with the
  // file-filter table's own picker, so this rule lives in exactly one place.
  const mixedFormatsError = checkSameExtension(files.map(f => f.name), needsCleanup);
  if (mixedFormatsError) {
    log('error', mixedFormatsError);
    setIdle('Error: mixed formats');
    return;
  }

  // For CSV/JSON/Parquet: show mapping overlay once for the first such file, apply to all
  const needsMapping = (e: string) => e === 'csv' || e === 'txt' || e === 'dat' || e === 'json' || e === 'parquet';
  const firstMappable = files.find(f => needsMapping(effectiveFileExtension(f.name)));

  let mappingPromise: Promise<{ mapping: CsvMapping; binDefs: BinDefEntry[] } | null> = Promise.resolve(null);

  if (firstMappable) {
    const firstExt = effectiveFileExtension(firstMappable.name);
    setBusy(`Reading ${firstMappable.name}…`);
    const headersResult = await (firstExt === 'json' ? platform.jsonHeaders(firstMappable)
      : firstExt === 'parquet' ? platform.parquetHeaders(firstMappable)
      : platform.csvHeaders(firstMappable)
    ).catch(e => { log('error', `Failed to read headers: ${e}`); return null; });

    if (!headersResult) {
      if (needsCleanup) platform.expandArchives([]).catch(() => {});
      setIdle();
      return;
    }

    const mappableFiles = files.filter(f => needsMapping(effectiveFileExtension(f.name)));
    const note = mappableFiles.length > 1 ? ` — mapping applied to all ${mappableFiles.length} CSV/JSON/Parquet files` : '';
    log('info', `${firstMappable.name}: ${headersResult.rowCount} rows, ${headersResult.headers.length} columns${note}`);

    mappingPromise = new Promise(resolve => {
      showMappingOverlay(headersResult,
        (mapping, binDefs) => resolve({ mapping, binDefs }),
        () => { setIdle(); resolve(null); },
        () => platform.pickTextFile('Select a bin definitions file to load').then(f => f?.content ?? null),
      );
    });
  }

  const mappingResult = await mappingPromise;
  if (mappingResult === null && firstMappable) {
    return; // cancelled
  }
  const mapping = mappingResult?.mapping;
  const mappingBinDefs = mappingResult?.binDefs ?? [];

  // ── Parse phase ──────────────────────────────────────────────────────────
  // For STDF/ATDF: first-pass scan to get testDefs cheaply, then filtered parse.
  // For CSV/JSON/Parquet: parse fully now (fast), use parsed testDefs for the selector.
  const isBinaryExt = (e: string) => e === 'stdf' || e === 'std' || e === 'atdf' || e === 'atd';
  const binaryFiles = files.filter(f => isBinaryExt(effectiveFileExtension(f.name)));

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
    currentBinaryFiles = binaryFiles;
    currentBinaryExt = effectiveFileExtension(largestBinary.name);
    binaryScanScope = 'largest';

    // Default scan scope: the largest file only — a fast, representative test
    // list. The selector offers a "scan all files" toggle to widen this when a
    // test only appears in a smaller file (see scanBinaryTests / onScanAll).
    const scan = await scanBinaryTests([largestBinary]);
    if (scan) {
      currentTestNames = scan.testDefs;
      firstPassTestDefs = scan.testDefs;
      // Largest-file die count extrapolated across all files (exact totals come
      // from a "scan all"). Only used for the selector's memory advisory.
      binaryScanDieCount = scan.dieCount * binaryFiles.length;
    }
  }

  // Parse CSV/JSON files now; collect their testDefs for the selector.
  const nonBinaryFiles = files.filter(f => !isBinaryExt(effectiveFileExtension(f.name)));
  for (const file of nonBinaryFiles) {
    const fileExt = effectiveFileExtension(file.name);
    setBusy(`Parsing ${file.name}…`);
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
      logWarnings(parsed);
      // Merge testDefs from this file into firstPassTestDefs for the selector.
      if (Object.keys(parsed.testDefs).length > 0) {
        firstPassTestDefs = { ...(firstPassTestDefs ?? {}), ...parsed.testDefs };
      }
    } catch (e) {
      log('error', `Failed to parse ${file.name}: ${errMsg(e)}`);
    }
  }

  // ── Test selector ─────────────────────────────────────────────────────────
  // Always shown when any file has test data (non-empty merged testDefs).
  let testSelection: number[] | null = null;
  let overlayTestOverrides: Map<number, TestOverride> = new Map();

  if (firstPassTestDefs && Object.keys(firstPassTestDefs).length > 0) {
    const csvDieCount = Array.from(preParsed.values())
      .reduce((s, p) => s + p.wafers.reduce((ws, w) => ws + w.results.length, 0), 0);

    // The selector can be re-entered when the user clicks "scan all files": we
    // widen the scope, re-scan, merge, and re-open with the same selection +
    // test overrides preserved. `scanScope` tracks whether we're still on the
    // largest file only (so the toggle is offered) or have scanned everything.
    let scanScope: 'largest' | 'all' = 'largest';
    let scopedDefs = firstPassTestDefs;
    let carrySelection: number[] = [];
    let carryOverrides = new Map<number, TestOverride>();
    // Only the very first open of this load gets the cheap-lot default below —
    // a "scan all files" re-open must carry the user's actual selection, even
    // when that selection is deliberately empty.
    let firstOpen = true;
    // Consumed once, on the very first open of this load's selector — a
    // "scan all files" re-open within the same load must not keep re-applying
    // it over the user's in-progress adjustments (see pendingTestListPreload).
    let testListPreload = pendingTestListPreload;
    pendingTestListPreload = null;

    selector: for (;;) {
      const allTestNums = new Set(Object.keys(scopedDefs).map(Number));
      const totalDieCount = binaryScanDieCount + csvDieCount;
      // Offer "scan all" only with >1 binary file and while still scoped to largest.
      const canScanAll = binaryFiles.length > 1 && scanScope === 'largest';

      // Pre-tick everything when importing the lot is provably cheap. A CLI
      // --tests preload always wins — it's an explicit instruction.
      if (firstOpen && !testListPreload && isCheapToImportAll(allTestNums.size, totalDieCount)) {
        carrySelection = [...allTestNums];
      }
      firstOpen = false;

      const result = await new Promise<{ kind: 'confirm'; selection: number[]; overrides: Map<number, TestOverride> }
                                     | { kind: 'cancel' }
                                     | { kind: 'scanAll'; selection: number[]; overrides: Map<number, TestOverride> }>(resolve => {
        showTestSelectorOverlay(
          scopedDefs,
          (sel, overrides) => resolve({ kind: 'confirm', selection: sel, overrides }),
          () => resolve({ kind: 'cancel' }),
          {
            scanScope: binaryFiles.length > 1 ? scanScope : undefined,
            scanFileCount: binaryFiles.length,
            onScanAll: canScanAll ? (sel, overrides) => resolve({ kind: 'scanAll', selection: sel, overrides }) : undefined,
            initialSelection: carrySelection,
            testOverrides: carryOverrides,
            preloadListText: testListPreload ?? undefined,
            capacity: totalDieCount > 0 ? { dieCount: totalDieCount, totalTests: allTestNums.size } : undefined,
            onSave: async (saveEntries: TestListEntry[]) => {
              await platform.saveTextFile(formatTestListCsv(saveEntries), 'test-definitions.csv', 'Save these test definitions to a file');
            },
            onLoad: async () => (await platform.pickTextFile('Select a test definitions file to load'))?.content ?? null,
            onLog: log,
            onAsk: (msg) => platform.confirm(msg),
          },
        );
      });
      testListPreload = null; // only ever applied on the loop's first open

      if (result.kind === 'cancel') { setIdle(); return; }

      if (result.kind === 'scanAll') {
        // Preserve the user's in-progress selection/overrides across the re-scan.
        carrySelection = result.selection;
        carryOverrides = result.overrides;
        const scan = await scanBinaryTests(binaryFiles);
        if (scan) {
          scopedDefs = scan.testDefs;
          firstPassTestDefs = scan.testDefs;   // so the full parse below sees every test
          currentTestNames = scan.testDefs;    // so "Filter tests…" re-uses the widened list
          binaryScanDieCount = scan.dieCount;  // exact total now, not extrapolated
          binaryScanScope = 'all';
          scanScope = 'all';
          log('info', `Scanned all ${binaryFiles.length} files: ${Object.keys(scan.testDefs).length} tests total`);
        }
        continue selector; // re-open the selector with the merged list
      }

      // confirm
      overlayTestOverrides = result.overrides;
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
  // showing nothing while the old data is silently still in `currentWafers`.
  const clearedForFreshLoad = !isAppend;
  if (clearedForFreshLoad) showLoadingState(`Loading ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
  // Return to a clean empty state if a committed fresh load bails out (parse error
  // or rename cancel); for an append the old view is intact, so just go idle.
  const abortFreshLoad = (msg?: string) => {
    if (clearedForFreshLoad) showEmptyState();
    setIdle(msg);
  };

  // ── Full parse for STDF/ATDF, prune/backfill pre-parsed CSV/JSON ──────────
  const entries: FileWaferEntry[] = [];

  try {
    // Finalise pre-parsed CSV/JSON entries — prune to selection.
    for (const [, parsed] of preParsed) {
      applyTestSelection(parsed, testSelection ?? [], null, overlayTestOverrides);
    }

    for (const file of files) {
      const fileExt = effectiveFileExtension(file.name);

      // CSV/JSON already parsed above — just collect.
      if (!isBinaryExt(fileExt)) {
        const pre = preParsed.get(file.name);
        if (pre) entries.push({ filePath: file.path ?? file.name, fileName: file.name, parsed: pre });
        continue;
      }

      setBusy(`Parsing ${file.name}…`);
      try {
        // If scan failed (firstPassTestDefs null), fall back to unfiltered parse.
        const raw = firstPassTestDefs === null
          ? (fileExt === 'atdf' || fileExt === 'atd'
            ? await platform.parseAtdf(file)
            : await platform.parseStdf(file))
          : (fileExt === 'atdf' || fileExt === 'atd'
            ? await platform.parseAtdfFiltered(file, testSelection ?? [])
            : await platform.parseStdfFiltered(file, testSelection ?? []));
        const parsed = rustToLocal(raw, file.name);
        applyTestSelection(parsed, testSelection ?? [], firstPassTestDefs, overlayTestOverrides);
        entries.push({ filePath: file.path ?? file.name, fileName: file.name, parsed });
        log('info', `Parsed ${file.name}: ${parsed.wafers.length} wafer${parsed.wafers.length !== 1 ? 's' : ''}`);
        logWarnings(parsed);
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

  // Rename step — always shown for multi-file, or single file with generic wafer ID
  const allWafers = entries.flatMap(e => e.parsed.wafers);
  const needsRename = entries.length > 1 || (allWafers.length === 1 && /^W\d+$/.test(allWafers[0].waferId));

  const getRenamed = (): Promise<RenamedWafer[] | null> => {
    if (!needsRename) {
      // needsRename is false only for a single entry, so all wafers share its source.
      const source = makeWaferSource(entries[0].parsed.meta, entries[0].fileName);
      return Promise.resolve(allWafers.map(w => ({
        waferId: w.waferId,
        results: w.results,
        partCount: w.partCount,
        goodCount: w.goodCount,
        failCount: w.failCount,
        fields: w.fields,
        source,
      })));
    }
    return new Promise(resolve => {
      showRenameOverlay(entries,
        (renamed) => resolve(renamed),
        () => { abortFreshLoad(); resolve(null); }
      );
    });
  };

  const renamed = await getRenamed();
  if (!renamed) return;

  if (isAppend && currentWafers.length > 0) {
    await new Promise<void>(resolve => {
      showAppendConfirm({
        incoming: renamed,
        existing: currentWafers,
        onConfirm: () => {
          // Shallow spread preserves each wafer's shared `source` reference — do
          // NOT deep-clone or serialize a stamped wafer (e.g. through the parser
          // worker), or reference identity breaks and grouping by source fails.
          const merged = [
            ...currentWafers,
            ...renamed.map(toWaferData),
          ];
          renderWafers(merged, currentFileName, { ...currentTestDefs, ...Object.assign({}, ...entries.map(e => e.parsed.testDefs)) }, {
            hbinDefs: mergeBinDefs([currentHbinDefs, ...entries.map(e => e.parsed.hbinDefs)]),
            sbinDefs: mergeBinDefs([currentSbinDefs, ...entries.map(e => e.parsed.sbinDefs)]),
            passHbins: mergePassHbins([currentPassHbins, ...entries.map(e => e.parsed.passHbins)]),
          });
          log('info', `Added ${renamed.length} wafer${renamed.length !== 1 ? 's' : ''} — gallery now has ${merged.length}`);
          resolve();
        },
        onCancel: () => { setIdle(`${currentWafers.length} wafers loaded`); resolve(); },
      });
    });
  } else {
    renderWafers(
      renamed.map(toWaferData),
      entries.length === 1 ? entries[0].fileName : `${entries.length} files`,
      Object.assign({}, ...entries.map(e => e.parsed.testDefs)),
      {
        hbinDefs: mergeBinDefs(entries.map(e => e.parsed.hbinDefs)),
        sbinDefs: mergeBinDefs(entries.map(e => e.parsed.sbinDefs)),
        passHbins: mergePassHbins(entries.map(e => e.parsed.passHbins)),
      },
    );
    if (originalPaths) { addRecentFiles(originalPaths); syncRecentBtn(); }
  }
}

/**
 * Applies files/tests/splits resolved from CLI args — either this process's
 * own argv/stdin at launch, or argv forwarded from a second `tsmap <files>`
 * launch via the single-instance plugin (see the `cli-open-files` listener
 * below). `--splits`/`--tests` reuse the exact seed/preload mechanisms the
 * "Load sample data" flow and the test selector's own "Load list" button
 * already use — nothing here is a new, silent code path.
 *
 * `--url`/`--url-format` never reach here as such: the Rust side resolves
 * the URL to a real local file *before* the frontend ever runs (see
 * fetch_url.rs's module doc), so a successful fetch is already an ordinary
 * entry in `args.files`, indistinguishable from a path the user typed
 * directly. `args.urlError` is the one trace of it — set only when that
 * resolution failed, surfaced the same non-fatal way a bad `--splits`/
 * `--tests` file already is.
 */
async function applyCliArgs(args: CliStartupArgs): Promise<void> {
  if (args.urlError) {
    log('error', `Failed to fetch --url: ${args.urlError}`);
  }
  if (args.splits) {
    try {
      pendingSampleSplitSeed = parseSplitsCsv(await platform.readTextFile(args.splits));
    } catch (e) {
      log('error', `Failed to read splits file "${args.splits}": ${errMsg(e)}`);
    }
  }
  if (args.tests) {
    try {
      pendingTestListPreload = await platform.readTextFile(args.tests);
    } catch (e) {
      log('error', `Failed to read tests file "${args.tests}": ${errMsg(e)}`);
    }
  }
  // Unlike splits/tests above, these are scalars applied directly rather than
  // seeded-then-consumed at render time — they're not tied to matching
  // per-wafer IDs, so there's nothing to wait for. Set before handleFiles
  // below, so the very first render already reflects them.
  //
  // --wafer-diameter falls back to the already-persisted waferDiameterMm
  // (not just args.waferDiameter) so a launch with only --edge-exclusion
  // still applies cleanly when a diameter was already pinned in a previous
  // session — the gate (normalizeWaferGeometry) only fires when NEITHER
  // source has one, not merely because this launch's argv didn't repeat it.
  if (args.waferDiameter != null || args.edgeExclusion != null) {
    const normalized = normalizeWaferGeometry(
      args.waferDiameter ?? waferDiameterMm,
      args.edgeExclusion ?? edgeExclusionMm,
    );
    if (args.edgeExclusion != null && normalized.edgeExclusionMm === undefined) {
      log('warn', '--edge-exclusion ignored: no wafer diameter is set — pass --wafer-diameter too, or set one via Lot ▾ → Diameter & edge exclusion… first');
    }
    waferDiameterMm = normalized.diameterMm;
    edgeExclusionMm = normalized.edgeExclusionMm;
    setWaferGeometry(normalized);
  }
  const files: FileHandle[] = args.files.map(p => ({
    name: basename(p),
    bytes: new Uint8Array(0),
    path: p,
  }));
  handleFiles(files, false);
}

// ── Open / Add buttons ────────────────────────────────────────────────────────

// Above this many files picked in one go, Open files/Add files offers to
// route the batch into Filter files… instead of parsing it straight away —
// large picks are exactly the case that tool exists for, and offering it
// up front saves parsing a batch the user only wanted to narrow down.
const FILTER_OFFER_THRESHOLD = 5;

/** Returns true if the offer was accepted and the filter dialog now owns the
 *  files (caller must not also call handleFiles); false if declined or the
 *  batch was too small to offer. Called with `busy` still true from the
 *  picker wait, so the confirm dialog can't be raced by a second pick.
 *
 *  Takes `PickedFile`s rather than `FileHandle`s so the offer can be made
 *  *before* any bytes are read on web — routing a 200-file batch into the
 *  filter table shouldn't first materialise all 200 (see `PickedFile`). */
async function offerFilterFirst(picked: PickedFile[], isAppend: boolean, prevLabel: string): Promise<boolean> {
  if (picked.length <= FILTER_OFFER_THRESHOLD) return false;
  setBusy('Waiting for confirmation…');
  const wantsFilter = await platform.confirm(
    `You selected ${picked.length} files. Filter them first before ${isAppend ? 'adding' : 'loading'}?`,
  );
  if (!wantsFilter) return false;
  setIdle(prevLabel);
  void openFileFilterDialog(platform, {
    onConfirmedLoad: (chosen, chosenAppend) => handleFiles(chosen, chosenAppend),
    isAppend,
    confirm: (msg) => platform.confirm(msg),
    log,
  }, picked);
  return true;
}

/**
 * The "where?" entry: pick a folder, then let the filter table answer "which?".
 *
 * This is the whole point of having it. Picking files in the OS dialog and then
 * filtering them in the table meant answering the same question twice — the
 * native dialog asked which files, and the table asked again. A folder picker
 * asks something the table cannot ("where should I look"), so the two steps
 * stop overlapping.
 *
 * Subfolders are opt-in and only offered when there are any: a recursive walk
 * of a mistaken pick (a home directory, a network mount) is the one thing here
 * that could take real time, so it is never the silent default. On the web
 * there is no choice to offer — `webkitdirectory` returns the whole subtree —
 * so the prompt is desktop-only by construction.
 */
/** Scan one or more dropped folders into the filter table. Shares the whole
 *  tail of `scanFolderAndFilter` — subfolder prompt, truncation notice, empty
 *  result — via `openScanInFilter`; only the "how did we get a folder" half
 *  differs (a drop, versus a native picker). */
async function scanDroppedFolders(dirs: string[]) {
  if (busy || !platform.rescanFolder) return;
  const prevLabel = fileLabel.textContent ?? '';
  setBusy(`Scanning ${dirs.length === 1 ? 'folder' : `${dirs.length} folders`}…`);
  const scans: FolderScan[] = [];
  for (const d of dirs) {
    try {
      const scan = await platform.rescanFolder(d, false);
      if (scan) scans.push(scan);
    } catch (e) {
      log('error', `Could not scan "${d}": ${errMsg(e)}`);
    }
  }
  if (scans.length === 0) { setIdle(prevLabel); return; }
  // A dropped folder always replaces, matching a dropped file — drag-and-drop
  // has no way to express "append", and inventing one silently would be worse
  // than the Add files button already being there for that.
  await openScanInFilter(mergeScans(scans), false, prevLabel);
}

/** Combine several folder scans into one listing, de-duplicating by path — two
 *  dropped folders can legitimately contain the same file via a symlink. */
function mergeScans(scans: FolderScan[]): FolderScan {
  const seen = new Set<string>();
  const files: FileHandle[] = [];
  for (const s of scans) {
    for (const f of s.files) {
      const key = f.path ?? f.name;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(f);
    }
  }
  return {
    dirPath: scans[0].dirPath,
    dirName: scans.length === 1 ? scans[0].dirName : `${scans.length} folders`,
    files,
    hasSubdirs: scans.some(s => s.hasSubdirs),
    truncated: scans.some(s => s.truncated),
  };
}

/** The shared tail: offer subfolders where relevant, report a capped or empty
 *  scan, then hand the result to the filter table. */
async function openScanInFilter(scan: FolderScan, isAppend: boolean, prevLabel: string) {
  if (scan.hasSubdirs && platform.rescanFolder && scan.dirPath) {
    setBusy('Waiting for confirmation…');
    const deep = await platform.confirm(`"${scan.dirName}" has subfolders. Include them in the scan?`);
    if (deep) {
      setBusy('Scanning subfolders…');
      try { scan = await platform.rescanFolder(scan.dirPath, true) ?? scan; }
      catch (e) { log('error', `Subfolder scan failed: ${errMsg(e)}`); }
    }
  }
  if (scan.truncated) {
    log('info', `Folder scan stopped at a safety limit — showing the first ${scan.files.length} files found. Narrow the folder to see the rest.`);
  }
  if (scan.files.length === 0) {
    log('error', `No wafer test data files found in "${scan.dirName}".`);
    setIdle(prevLabel);
    return;
  }
  log('info', `Scanning ${scan.files.length} file${scan.files.length === 1 ? '' : 's'} from "${scan.dirName}"…`);
  setIdle(prevLabel);
  void openFileFilterDialog(platform, {
    onConfirmedLoad: (chosen, chosenAppend) => handleFiles(chosen, chosenAppend),
    isAppend,
    confirm: (msg) => platform.confirm(msg),
    log,
  }, scan.files.map(pickedFromHandle));
}

let closePickMenu: (() => void) | null = null;

/**
 * The caret half of Open/Add — "how should I find the files?", for a verb the
 * button has already answered.
 *
 * This is the whole reason the toolbar has two buttons rather than three. The
 * old "Filter files…" was a third sibling that answered a *different* question
 * from its neighbours (how to pick, not what to do), so it read as a third
 * operation and then had to re-ask the verb at the end. Keeping the verb on the
 * button and putting the picking method behind its caret separates the two axes
 * without a button per combination.
 */
function openPickMenu(anchor: HTMLElement, isAppend: boolean) {
  if (closePickMenu) { closePickMenu(); return; }
  anchor.setAttribute('aria-expanded', 'true');
  closePickMenu = openAnchoredMenu(
    anchor,
    {
      stack: true, minWidth: '260px',
      onClose: () => { closePickMenu = null; anchor.setAttribute('aria-expanded', 'false'); },
    },
    (popup, close) => {
      popup.appendChild(makeMenuRow(close, {
        label: 'Choose files…',
        hint: 'Pick individual files in the usual dialog',
        enabled: !busy,
        onClick: () => startFilePick(isAppend),
      }));
      popup.appendChild(makeMenuRow(close, {
        label: 'Scan a folder…',
        hint: 'Read every wafer-map file in a folder, then filter by lot metadata and pick from a table',
        enabled: !busy,
        onClick: () => { void scanFolderAndFilter(isAppend); },
      }));
    },
  );
}

async function scanFolderAndFilter(isAppend: boolean) {
  if (busy) return;
  const prevLabel = fileLabel.textContent ?? '';
  setBusy('Waiting for folder selection…');
  let scan;
  try {
    scan = await platform.pickFolder(
      isAppend ? 'Select a folder to scan and add from' : 'Select a folder to scan and load from',
    );
  } catch (e) {
    log('error', `Folder picker failed: ${errMsg(e)}`);
    setIdle(prevLabel);
    return;
  }
  if (!scan) { setIdle(prevLabel); return; }
  await openScanInFilter(scan, isAppend, prevLabel);
}

async function pickAndHandle(isAppend: boolean) {
  if (busy) return;
  const prevLabel = fileLabel.textContent ?? '';
  setBusy('Waiting for file selection…');
  let files: FileHandle[];
  try {
    files = await platform.pickFiles(isAppend
      ? 'Select one or more wafer test data files to add'
      : 'Select one or more wafer test data files to open');
  } catch (e) {
    log('error', `File picker failed: ${errMsg(e)}`);
    setIdle(prevLabel);
    return;
  }
  if (files.length === 0) {
    setIdle(prevLabel);
    return;
  }
  if (await offerFilterFirst(files.map(pickedFromHandle), isAppend, prevLabel)) return;
  busy = false;
  handleFiles(files, isAppend);
}

/** Start the ordinary "pick individual files" flow for a verb. Assigned below
 *  per platform — desktop goes through the native dialog, the browser through
 *  the hidden `#file-input` (whose click must stay in the user-gesture chain).
 *  Both the toolbar buttons and the caret menu's "Choose files…" row call this,
 *  so the menu is not silently desktop-only. */
let startFilePick: (isAppend: boolean) => void = () => {};

if (isTauri) {
  startFilePick = (isAppend) => { void pickAndHandle(isAppend); };
  openBtn.addEventListener('click', () => startFilePick(false));
  addBtn.addEventListener('click', () => startFilePick(true));
  recentBtn.addEventListener('click', () => openRecentMenu(recentBtn));
  syncRecentBtn();
} else {
  // On web, trigger the native file input synchronously from the click event
  // so the browser treats it as a user gesture (async calls block the picker).
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  let appendOnPick = false;
  // Captured in the click handler, BEFORE setBusy overwrites fileLabel — by
  // the time `change`/`cancel` fire, fileLabel already reads the busy message,
  // so reading it there would restore the wrong text.
  let prevLabelOnPick = '';

  fileInput.addEventListener('change', async () => {
    const rawFiles = Array.from(fileInput.files ?? []);
    fileInput.value = '';  // reset so same file can be re-picked
    if (rawFiles.length === 0) { setIdle(prevLabelOnPick); return; }
    // Offer the filter route before reading a single byte — a batch big enough
    // to be worth filtering is exactly the one not worth materialising first.
    const picked = rawFiles.map(pickedFromWebFile);
    if (await offerFilterFirst(picked, appendOnPick, prevLabelOnPick)) return;
    const files = await Promise.all(picked.map(materializePicked));
    busy = false;
    handleFiles(files, appendOnPick);
  });

  // Unlike `change`, the native file input fires no event at all when the
  // dialog is dismissed without picking a file (Cancel / Esc / the dialog's
  // own close button) — without this listener, `busy` stays true forever and
  // the toolbar is stuck showing "Waiting for file selection…". `cancel`
  // (Chrome 113+, Firefox 121+, Safari 16.4+) fires in exactly that case.
  fileInput.addEventListener('cancel', () => setIdle(prevLabelOnPick));

  startFilePick = (isAppend) => {
    if (busy) return;
    appendOnPick = isAppend;
    prevLabelOnPick = fileLabel.textContent ?? '';
    setBusy('Waiting for file selection…');
    fileInput.click();
  };

  openBtn.addEventListener('click', () => startFilePick(false));
  addBtn.addEventListener('click', () => startFilePick(true));
}

// Platform-independent: both rows the caret menu offers work on either platform
// (`startFilePick` is assigned above, `scanFolderAndFilter` handles both), so
// this is wired once rather than inside each branch — which is how the carets
// ended up desktop-only on the first attempt.
openMoreBtn.addEventListener('click', () => openPickMenu(openMoreBtn, false));
addMoreBtn.addEventListener('click', () => openPickMenu(addMoreBtn, true));

/** Toggle regional test-value findings and re-analyse. Reached from the Lot ▾
 *  menu (`openLotMenu`); a named function rather than an inline listener so the
 *  menu row can call it directly. */
function toggleValueFindings() {
  if (busy || currentWafers.length === 0) return;
  valueFindings = !valueFindings;
  // Analysis results are cached; the toggle changes what they contain, so drop
  // them. Re-render the current map view (gallery/single) with the new setting —
  // the raw dies are already in memory, so this is a re-analyse, not a reload.
  cachedLotStats = null;
  log('info', `Test-value findings ${valueFindings ? 'on — recomputing regional test-value findings' : 'off'}`);
  const label = currentFileName;
  setBusy(`${valueFindings ? 'Analysing' : 'Rendering'} ${label}…`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    renderWaferView(currentWafers, label);
    setIdle(`${label} — ${currentWafers.length} wafer${currentWafers.length !== 1 ? 's' : ''}, ${currentWafers.reduce((n, w) => n + w.results.length, 0)} dies`);
  }));
}

resetBtn.addEventListener('click', () => {
  if (currentWafers.length === 0) return;
  setIdle();
  showEmptyState();
});

/**
 * Capacity figures for the "Filter tests…" selector's memory advisory, derived
 * from what's already loaded rather than from a fresh scan. `dieCount` is the
 * real total across the current wafers; `totalTests` is the widest test list we
 * know about (the first-pass scan if there was one, else the loaded defs), so
 * the "n of N" framing matches the list the selector is actually showing.
 * Returns undefined when there are no dies, which suppresses the advisory
 * rather than showing a meaningless zero.
 */
function filterCapacity(): { dieCount: number; totalTests: number } | undefined {
  const dieCount = currentWafers.reduce((n, w) => n + w.results.length, 0);
  if (dieCount === 0) return undefined;
  const totalTests = Object.keys(currentTestNames ?? currentTestDefs).length;
  return { dieCount, totalTests };
}

/** "Filter tests…" — re-run the test selector against the loaded lot and
 *  re-parse. Reached from the Lot ▾ menu (`openLotMenu`); a named function
 *  rather than an inline listener so the menu row can call it directly. */
async function openFilterTests() {
  if (busy || Object.keys(currentTestDefs).length === 0) return;
  // For CSV/JSON (no binary files), we only support in-memory filtering — no re-parse available.
  // For STDF/ATDF we use currentTestNames from the first-pass scan (may re-parse if user adds tests).
  const selectorTestDefs: StdfTestNames = currentTestNames ?? currentTestDefs;

  // Both of these are assigned exactly once, on the single 'confirm' path that
  // breaks out of filterLoop below — the 'cancel' path returns and 'scanAll'
  // loops again, so there is no route past the loop that leaves them unset.
  // Declared without initializers so that stays true by construction rather
  // than being masked by a placeholder value nothing ever reads.
  let filterTestOverrides: Map<number, TestOverride>;
  let testSelection: number[];
  let scopedDefs = selectorTestDefs;
  let carrySelection: number[] = Object.keys(currentTestDefs).map(Number);
  // Seed with any overrides already baked into currentTestDefs (from the
  // initial load's rename/limit-load) but not reflected in selectorTestDefs
  // (the original first-pass scan) — otherwise an override applied earlier
  // would appear to have silently reverted when the selector reopens here.
  let carryOverrides = new Map<number, TestOverride>();
  for (const [key, def] of Object.entries(currentTestDefs)) {
    const scanned = selectorTestDefs[key];
    if (scanned) {
      const diff = diffTestOverride(def, scanned);
      if (diff) carryOverrides.set(Number(key), diff);
    }
  }

  filterLoop: for (;;) {
    // Offer "scan all" only if this is a multi-file binary load not already widened.
    const canScanAll = currentBinaryFiles.length > 1 && binaryScanScope === 'largest';
    const result = await new Promise<{ kind: 'confirm'; selection: number[]; overrides: Map<number, TestOverride> }
                                   | { kind: 'cancel' }
                                   | { kind: 'scanAll'; selection: number[]; overrides: Map<number, TestOverride> }>(resolve => {
      showTestSelectorOverlay(
        scopedDefs,
        (sel, overrides) => resolve({ kind: 'confirm', selection: sel, overrides }),
        () => resolve({ kind: 'cancel' }),
        {
          scanScope: currentBinaryFiles.length > 1 ? binaryScanScope : undefined,
          scanFileCount: currentBinaryFiles.length,
          onScanAll: canScanAll ? (sel, overrides) => resolve({ kind: 'scanAll', selection: sel, overrides }) : undefined,
          initialSelection: carrySelection,
          testOverrides: carryOverrides,
          // `capacity` and `onAsk` were previously passed only on the initial
          // load, which had it exactly backwards: this path is the one that can
          // WIDEN a selection and force a full re-parse, so it's the only one
          // where the memory advisory can warn about something the user is
          // about to do. Die count comes from what's already in memory — no
          // rescan needed. `onAsk` keeps the "very large selection" prompt on
          // the themed platform dialog instead of falling back to a bare
          // window.confirm on one path and not the other.
          capacity: filterCapacity(),
          onSave: async (entries: TestListEntry[]) => {
            await platform.saveTextFile(formatTestListCsv(entries), 'test-definitions.csv', 'Save these test definitions to a file');
          },
          onLoad: async () => (await platform.pickTextFile('Select a test definitions file to load'))?.content ?? null,
          onLog: log,
          onAsk: (msg) => platform.confirm(msg),
        },
      );
    });

    if (result.kind === 'cancel') return;

    if (result.kind === 'scanAll') {
      carrySelection = result.selection;
      carryOverrides = result.overrides;
      const scan = await scanBinaryTests(currentBinaryFiles);
      if (scan) {
        scopedDefs = scan.testDefs;
        currentTestNames = scan.testDefs;
        binaryScanScope = 'all';
        log('info', `Scanned all ${currentBinaryFiles.length} files: ${Object.keys(scan.testDefs).length} tests total`);
      }
      setIdle();
      continue filterLoop;
    }

    filterTestOverrides = result.overrides;
    testSelection = result.selection;
    break;
  }

  // If the new selection is a subset of already-loaded tests, filter in memory —
  // no re-parse needed. CSV/JSON always use in-memory path (no re-parse available).
  const loadedTestNumbers = new Set(Object.keys(currentTestDefs).map(Number));
  const needsReparse = currentBinaryFiles.length > 0 && testSelection.some(n => !loadedTestNumbers.has(n));

  if (!needsReparse) {
    const keepSet = new Set(testSelection);
    const filteredWafers = currentWafers.map(w => ({
      ...w,
      results: w.results.map(d => {
        if (!d.testValues) return d;
        const testValues: typeof d.testValues = {};
        for (const [k, v] of Object.entries(d.testValues)) {
          if (keepSet.has(Number(k))) testValues[Number(k)] = v;
        }
        return { ...d, testValues };
      }),
    }));
    const filteredDefs: Record<string, TestDef> = {};
    for (const key of Object.keys(currentTestDefs)) {
      if (keepSet.has(Number(key))) filteredDefs[key] = currentTestDefs[key];
    }
    applyTestOverrides(filteredDefs, filterTestOverrides);
    log('info', `Test filter: ${testSelection.length} of ${Object.keys(selectorTestDefs).length} tests (in-memory)`);
    // Bin catalog/pass-bins describe the whole file's HBR/SBR, independent of
    // which tests are selected — carry the existing values through unchanged
    // rather than defaulting to "none" (renderWafers' default for an omitted
    // binInfo param).
    renderWafers(
      filteredWafers,
      currentFileName,
      filteredDefs,
      { hbinDefs: currentHbinDefs, sbinDefs: currentSbinDefs, passHbins: currentPassHbins },
    );
    return;
  }

  // New selection adds tests not in the current load — must re-parse.
  const entries: FileWaferEntry[] = [];
  for (const file of currentBinaryFiles) {
    const parts = file.name.split('.');
    const ext = parts.pop()?.toLowerCase() ?? '';
    const fileExt = ext === 'gz' ? (parts.pop()?.toLowerCase() ?? ext) : ext;
    setBusy(`Parsing ${file.name}…`);
    try {
      const raw = fileExt === 'atdf' || fileExt === 'atd'
        ? await platform.parseAtdfFiltered(file, testSelection)
        : await platform.parseStdfFiltered(file, testSelection);
      const parsed = rustToLocal(raw, file.name);
      applyTestSelection(parsed, testSelection, currentTestNames, filterTestOverrides);
      entries.push({ filePath: file.path ?? file.name, fileName: file.name, parsed });
      log('info', `Re-parsed ${file.name}: ${parsed.wafers.length} wafer${parsed.wafers.length !== 1 ? 's' : ''} (${testSelection.length} tests)`);
      logWarnings(parsed);
    } catch (e) {
      log('error', `Failed to re-parse ${file.name}: ${errMsg(e)}`);
    }
  }

  if (entries.length === 0) {
    setIdle(`${currentWafers.length} wafers loaded`);
    return;
  }

  const allWafers = entries.flatMap(e => e.parsed.wafers);
  const mergedDefs = Object.assign({}, ...entries.map(e => e.parsed.testDefs));
  renderWafers(
    allWafers,
    entries.length === 1 ? entries[0].fileName : `${entries.length} files`,
    mergedDefs,
    {
      hbinDefs: mergeBinDefs(entries.map(e => e.parsed.hbinDefs)),
      sbinDefs: mergeBinDefs(entries.map(e => e.parsed.sbinDefs)),
      passHbins: mergePassHbins(entries.map(e => e.parsed.passHbins)),
    },
  );
}


function openSplitsDialog() {
  if (currentWafers.length === 0) return;
  showSplitsModal(currentWafers, {
    onSave: (csv) => platform.saveTextFile(csv, 'wafer-splits.csv', 'Save wafer splits to a file'),
    onLoad: () => platform.pickTextFile('Select a wafer splits file to load').then(f => f?.content ?? null),
    onLog: log,
    onAsk: (msg) => platform.confirm(msg),
    showSplitSuffix,
    onToggleSuffix: (show) => { showSplitSuffix = show; },
    onChange: () => {
      saveSplits(currentWafers);
      clearLotStatsCache();
      const label = currentFileName;
      setBusy(`Rendering ${label}…`);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        renderWaferView(currentWafers, label);
        setIdle(`${label} — ${currentWafers.length} wafer${currentWafers.length !== 1 ? 's' : ''}, ${currentWafers.reduce((n, w) => n + w.results.length, 0)} dies`);
      }));
    },
  });
}

// Three-tier hint for the dialog's pre-fill/disagreement caption — see
// InferredDiameterHint's doc. WCR (this file's own recorded geometry) wins
// over wmap's own inference; the inference tier is only trusted when
// buildWaferMap actually resolved real physical units (`units === 'mm'`) —
// otherwise `.wafer.diameter` is a dimensionless grid-step count, not
// millimetres (see WMAP_ISSUES.md's discussion in waferGeometry.ts's module
// doc), and must never be shown as one.
function inferredWaferDiameterHint(): InferredDiameterHint {
  if (currentWafers.length === 0) return { source: 'none' };
  const wcr = wcrGeometryFrom(currentWafers[0].source);
  if (wcr?.waferConfig.diameter !== undefined) {
    return { source: 'wcr', diameter: wcr.waferConfig.diameter };
  }
  // Throwaway call with no waferConfig override, purely to read back
  // .wafer.diameter/.units/.inference.wafer.confidence — diameter inference
  // only reads die X/Y positions, so testDefs/metadata are irrelevant here.
  const waferMap = buildWaferMap({ results: currentWafers[0].results });
  if (waferMap.units !== 'mm') return { source: 'none' };
  return {
    source: 'inferred',
    diameter: waferMap.wafer.diameter,
    confidencePercent: Math.round(waferMap.inference.wafer.confidence * 100),
  };
}

// Same pattern as openSplitsDialog's onChange above: waferDiameterMm/
// edgeExclusionMm feed directly into buildWaferMap (both call sites), so
// cachedLotStats — which memoizes buildLotStatsSummary's own buildWaferMap
// output — must be invalidated before re-rendering, or the gallery path
// would silently keep showing the pre-change geometry.
function openWaferGeometryDialog() {
  if (currentWafers.length === 0) return;
  const current: WaferGeometry = { diameterMm: waferDiameterMm, edgeExclusionMm };
  showWaferGeometryDialog(current, inferredWaferDiameterHint(), (geometry) => {
    const normalized = setWaferGeometry(geometry);
    waferDiameterMm = normalized.diameterMm;
    edgeExclusionMm = normalized.edgeExclusionMm;
    clearLotStatsCache();
    const label = currentFileName;
    setBusy(`Rendering ${label}…`);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      renderWaferView(currentWafers, label);
      setIdle(`${label} — ${currentWafers.length} wafer${currentWafers.length !== 1 ? 's' : ''}, ${currentWafers.reduce((n, w) => n + w.results.length, 0)} dies`);
    }));
  });
}

/**
 * Shared shell for the Lot ▾ "definitions" dialogs (Test/Bin definitions) —
 * same modal chrome, button layout, save/load try-catch-log wrapping, and
 * post-load re-render sequence. `onSave` returns the CSV text to write;
 * `onLoad` parses+applies the loaded text and returns whether anything was
 * applied (`false` leaves the dialog open — `onLoad` has already logged why,
 * e.g. "file contained no valid rows"; `true` triggers the re-render and
 * closes the dialog).
 */
function openSaveLoadDefinitionsDialog(opts: {
  title: string;
  errorLabel: string;
  savedMessage: string;
  description: string;
  saveDisabled?: boolean;
  saveFileName: string;
  onSave: () => string;
  onLoad: (text: string) => boolean;
}): void {
  const { title, errorLabel, savedMessage, description, saveDisabled, saveFileName, onSave, onLoad } = opts;

  const modalHandle = openModal({
    title,
    sizing: 'content',
    contentSize: { width: 'min(90vw, 440px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      const descriptionEl = document.createElement('p');
      descriptionEl.style.cssText = 'margin:0;color:var(--text-secondary)';
      descriptionEl.textContent = description;

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save…';
      saveBtn.className = 'btn-secondary';
      saveBtn.disabled = !!saveDisabled;
      saveBtn.style.opacity = saveBtn.disabled ? '0.5' : '';
      saveBtn.addEventListener('click', async () => {
        try {
          await platform.saveTextFile(onSave(), saveFileName, `Save ${errorLabel} to a file`);
          log('info', savedMessage);
        } catch (e) {
          log('error', `Failed to save ${errorLabel}: ${errMsg(e)}`);
        }
      });

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load…';
      loadBtn.className = 'btn-secondary';
      loadBtn.addEventListener('click', async () => {
        let text: string | null;
        try {
          text = (await platform.pickTextFile(`Select a ${errorLabel} file to load`))?.content ?? null;
        } catch (e) {
          log('error', `Failed to load ${errorLabel}: ${errMsg(e)}`);
          return;
        }
        if (text === null) return;
        if (!onLoad(text)) return;
        clearLotStatsCache();
        const label = currentFileName;
        setBusy(`Rendering ${label}…`);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          renderWaferView(currentWafers, label);
          setIdle(`${label} — ${currentWafers.length} wafer${currentWafers.length !== 1 ? 's' : ''}, ${currentWafers.reduce((n, w) => n + w.results.length, 0)} dies`);
        }));
        modalHandle.close();
      });

      buttonRow.append(saveBtn, loadBtn);
      body.append(descriptionEl, buttonRow);
    },
  });
}

// Lightweight Save/Load for the current test list — no selection checkboxes,
// unlike the full Test Selector overlay reached via "Filter tests…". Shares
// parseTestListFile/formatTestListCsv/applyTestOverrides with the selector's
// own Save/Load and with --tests, so there is exactly one implementation of
// "apply a test-list file" regardless of entry point. Can only override
// tests already imported into currentTestDefs (applyTestOverrides silently
// ignores the rest) — importing a *new* test still requires "Filter tests…"'s
// re-selection flow.
function openTestDefinitionsDialog(): void {
  if (currentWafers.length === 0 || Object.keys(currentTestDefs).length === 0) return;

  const entries: TestListEntry[] = Object.entries(currentTestDefs).map(([key, def]) => ({
    num: Number(key),
    name: def.name,
    loLimit: def.loLimit,
    hiLimit: def.hiLimit,
    units: def.units,
    testType: def.testType,
  }));

  openSaveLoadDefinitionsDialog({
    title: 'Test definitions',
    errorLabel: 'test definitions',
    savedMessage: 'Test definitions saved',
    description:
      `Save the ${entries.length} currently imported test${entries.length !== 1 ? 's' : ''} `
      + '(names, limits, units, type) to a CSV, or load a CSV to update them in place. '
      + 'Loading only overrides tests already imported here — to change which tests are '
      + 'imported, use Filter tests… instead.',
    saveFileName: 'test-definitions.csv',
    onSave: () => formatTestListCsv(entries),
    onLoad: (text) => {
      const parsed = parseTestListFile(text, (lineNo, msg) => log('warn', `Test definitions line ${lineNo}: ${msg}`));
      if (parsed.length === 0) { log('warn', 'Test definitions file contained no valid rows'); return false; }
      const matched = parsed.filter(e => String(e.num) in currentTestDefs).length;
      const unmatched = parsed.length - matched;
      const overrides = new Map<number, TestOverride>(parsed.map(e => [e.num, e]));
      applyTestOverrides(currentTestDefs, overrides);
      log('info', `Test definitions loaded: ${matched} matched${unmatched > 0 ? `, ${unmatched} unmatched (not currently imported)` : ''}`);
      return true;
    },
  });
}

// Same shape as openTestDefinitionsDialog above — Save/Load only, no
// selection UI. Unlike test definitions, bin defs feed buildWaferMap
// directly (hbinDefs/sbinDefs/passBins), so a Load re-renders rather than
// just updating in-memory metadata for next render.
function openBinDefinitionsDialog(): void {
  if (currentWafers.length === 0) return;

  const hbinCount = currentHbinDefs?.length ?? 0;
  const sbinCount = currentSbinDefs?.length ?? 0;

  openSaveLoadDefinitionsDialog({
    title: 'Bin definitions',
    errorLabel: 'bin definitions',
    savedMessage: 'Bin definitions saved',
    description: hbinCount === 0 && sbinCount === 0
      ? 'This file has no hard/soft bin names recorded (no HBR/SBR record, or a CSV/JSON/Parquet load with none loaded via the mapping overlay). Load a bin definitions CSV to supply them.'
      : `Save the ${hbinCount} hard bin${hbinCount !== 1 ? 's' : ''} and ${sbinCount} soft bin${sbinCount !== 1 ? 's' : ''} `
        + 'currently named (and which hard bins count as pass) to a CSV, or load a CSV to update them in place.',
    saveDisabled: hbinCount === 0 && sbinCount === 0,
    saveFileName: 'bin-definitions.csv',
    onSave: () => {
      const passSet = new Set(currentPassHbins ?? []);
      const entries: BinDefEntry[] = [
        ...(currentHbinDefs ?? []).map(d => ({ bin: d.bin, type: 'hard' as const, name: d.name, pass: passSet.has(d.bin) })),
        ...(currentSbinDefs ?? []).map(d => ({ bin: d.bin, type: 'soft' as const, name: d.name })),
      ];
      return formatBinDefsCsv(entries);
    },
    onLoad: (text) => {
      const parsed = parseBinDefsFile(text, (lineNo, msg) => log('warn', `Bin definitions line ${lineNo}: ${msg}`));
      if (parsed.length === 0) { log('warn', 'Bin definitions file contained no valid rows'); return false; }
      const merged = applyBinDefOverrides(
        { hbinDefs: currentHbinDefs, sbinDefs: currentSbinDefs, passHbins: currentPassHbins },
        parsed,
      );
      currentHbinDefs = merged.hbinDefs;
      currentSbinDefs = merged.sbinDefs;
      currentPassHbins = merged.passHbins;
      log('info', `Bin definitions loaded: ${parsed.length} entr${parsed.length !== 1 ? 'ies' : 'y'} applied`);
      return true;
    },
  });
}



let closeHelpMenu: (() => void) | null = null;

/**
 * A single Help entry point, one destination: wmap's guide window, carrying
 * BOTH tsmap's own guide content and wmap's built-in wafer-map reference in
 * one combined document (`guideExtension`, folded in via `userGuideExtension`
 * — see the render calls above). Mirrors openRecentMenu's anchored-popup
 * pattern.
 *
 * Used to be two rows (tsmap's own guide as a standalone page always
 * available, "Wafer map reference" gated on a live render) — collapsed to one
 * per WMAP_ISSUES.md #37's 2026-08-28 decision, reversing #32's 2026-07-12
 * cutover. The old "gated on mainViewController" behaviour would have left
 * the empty state (nothing loaded yet) with no guide access at all, since
 * `mainViewController.openUserGuide()` needs a live render — closed by
 * wmap's new controller-free `openWaferMapGuide` export (used only in that
 * one case; the live-controller method is always preferred once one exists,
 * since it reuses that controller's own live-demo bootstrap wiring).
 *
 * No `showToast` confirmation any more either — that existed specifically
 * for the old guide row's `xdg-open`/external-browser path, where a
 * mis-focused destination window could look like the click did nothing. The
 * guide is now always an in-app modal/floating window that opens
 * synchronously and visibly, so that risk doesn't apply.
 */
function openHelpMenu(anchor: HTMLElement) {
  if (closeHelpMenu) { closeHelpMenu(); return; }

  closeHelpMenu = openAnchoredMenu(
    anchor,
    { stack: true, onClose: () => { closeHelpMenu = null; } },
    (popup, close) => {
      popup.appendChild(makeMenuRow(close, {
        label: 'User guide',
        hint: 'File loading, mapping, splits, test selector, wafer map controls, Insights, and more',
        onClick: () => {
          if (mainViewController) mainViewController.openUserGuide();
          else openWaferMapGuide(guideExtension, anchor);
        },
      }));

      popup.appendChild(makeMenuRow(close, {
        label: 'Definitions file formats…',
        hint: 'Save example test-definitions/splits/bin-definitions files — no file needs to be loaded first',
        onClick: () => {
          showDefinitionsTemplatesDialog(
            (content, fileName, label) => platform.saveTextFile(content, fileName, `Save ${label.toLowerCase()} example file`),
            (level, message) => log(level, message),
          );
        },
      }));

      // No such concept in a browser (there's no OS-level "default app for a file
      // type" a web page can register), so this row only exists on desktop.
      if (isTauri) {
        popup.appendChild(makeMenuRow(close, {
          label: 'File associations…',
          hint: 'Open .stdf/.atdf/.parquet files in tsmap automatically from your file manager',
          onClick: () => {
            showFileAssociationsModal({
              getStatus: () => platform.getFileAssociationStatus(),
              setAssociation: (extension, associate) => platform.setFileAssociation(extension, associate),
            });
          },
        }));
      }
    },
  );
}

/**
 * The **Lot ▾** menu — every dialog that acts on the already-loaded lot.
 * These were three separate toolbar buttons (Filter tests…, Splits…, Die
 * list…); they're homogeneous (all open a modal, all only meaningful once
 * data is loaded) and they're the group that keeps growing, so they collapse
 * into one trigger rather than widening a row that already needs three
 * separate overflow defences (see #toolbar's own comment in index.html).
 *
 * Rows that don't currently apply are shown DISABLED with the reason in their
 * tooltip, not hidden — a menu whose contents change shape between loads is
 * harder to learn than one with a stable shape and greyed rows.
 */
function openLotMenu(anchor: HTMLElement) {
  if (closeLotMenu) { closeLotMenu(); return; }

  anchor.setAttribute('aria-expanded', 'true');
  closeLotMenu = openAnchoredMenu(
    anchor,
    {
      stack: true, minWidth: '220px',
      onClose: () => { closeLotMenu = null; anchor.setAttribute('aria-expanded', 'false'); },
    },
    (popup, close) => {
      const hasTests = Object.keys(currentTestDefs).length > 0;
      popup.appendChild(makeMenuRow(close, {
        label: 'Filter tests…',
        hint: hasTests
          ? 'Change which tests are imported, then re-parse'
          : 'This file has no test data to filter',
        enabled: hasTests && !busy,
        onClick: () => { void openFilterTests(); },
      }));
      popup.appendChild(makeMenuRow(close, {
        label: 'Test definitions…',
        hint: hasTests
          ? 'Save or load test names/limits (see also Filter tests… to change which tests are imported)'
          : 'This file has no test data',
        enabled: hasTests && !busy,
        onClick: openTestDefinitionsDialog,
      }));
      popup.appendChild(makeMenuRow(close, {
        label: 'Bin definitions…',
        hint: (currentHbinDefs?.length || currentSbinDefs?.length)
          ? `${currentHbinDefs?.length ?? 0} hard, ${currentSbinDefs?.length ?? 0} soft bin name${((currentHbinDefs?.length ?? 0) + (currentSbinDefs?.length ?? 0)) !== 1 ? 's' : ''} — save or load hard/soft bin names and pass/fail flags`
          : 'Save or load hard/soft bin names and pass/fail flags (no HBR/SBR record found in this file)',
        enabled: !busy,
        onClick: openBinDefinitionsDialog,
      }));
      popup.appendChild(makeMenuRow(close, {
        label: 'Splits…',
        hint: 'Define and assign wafer splits (process corners, experiment groups, etc.)',
        onClick: openSplitsDialog,
      }));
      popup.appendChild(makeMenuRow(close, {
        label: 'Diameter & edge exclusion…',
        hint: waferDiameterMm !== undefined
          ? `${waferDiameterMm} mm wafer${edgeExclusionMm !== undefined ? `, ${edgeExclusionMm} mm exclusion` : ''}`
          : 'Set the wafer diameter and edge-exclusion band (mm), applied to every wafer in this lot',
        onClick: openWaferGeometryDialog,
      }));
      // Moved out of the app bar, where it was a bare switch reading "Value
      // findings" with no indication of what it acted on. In a menu row there
      // is room to name the object, and it sits with the other lot-scoped
      // controls instead of beside the file buttons.
      const hasTestValues = currentWafers.some(w =>
        w.results.some(d => d.testValues && Object.keys(d.testValues).length > 0));
      popup.appendChild(makeMenuRow(close, {
        label: 'Show test-value findings',
        hint: hasTestValues
          ? 'Add regional test-value findings to the summary panel (slower on large lots)'
          : 'This lot has no test values to analyse',
        enabled: hasTestValues && !busy,
        checked: valueFindings,
        onClick: toggleValueFindings,
      }));
    },
  );
}

helpBtn.addEventListener('click', () => openHelpMenu(helpBtn));
lotBtn.addEventListener('click', () => openLotMenu(lotBtn));

// Replace the native `title` tooltips on tsmap's top-toolbar chrome with the
// themed, instant tooltip (see tooltip.ts) so they match the wmap map toolbar
// rather than the OS's slow black hint. Static-text buttons are upgraded from
// their existing `title` markup; the log toggle has runtime-varying text so
// it's wired with a getter instead. Run at the end of module init: the getter
// reads state (logPanel) that is declared above, so wiring earlier would hit
// a temporal-dead-zone ReferenceError and abort the module — killing every
// button handler registered after it.
upgradeTitleTooltips(document.getElementById('toolbar') ?? document);
attachTooltip(logToggle, logToggleTip);
// file-label is CSS-truncated with ellipsis (long paths/filenames would
// otherwise wrap and double the toolbar's height) — a getter-backed tooltip
// shows the untruncated text, since its content changes on every load/idle.
attachTooltip(fileLabel, () => fileLabel.textContent ?? '');

// ── Theme picker ──────────────────────────────────────────────────────────
// Apply the persisted theme, add the toolbar dropdown, and re-render the
// current view on change so the wmap canvas re-resolves its colours (canvas
// colours are read from CSS at draw time, not live-bound — a CSS var flip alone
// won't repaint the wafer). Empty state is pure CSS and needs no re-render.
initTheme();

function refreshCurrentView(): void {
  if (currentWafers.length === 0) return; // empty state: CSS-only, nothing to redraw
  renderWaferView(currentWafers, currentFileName);
}

// Grouped theme picker. Uses the custom menuSelect (not a native <select>):
// with this many themes it sits top-right where the native GTK popup clips
// off-screen on the Linux WebView, and that popup ignores the theme's
// color-scheme. The custom menu flips/scrolls to fit and is fully themed.
// See menuSelect.ts.
const themeSelect = makeMenuSelect(
  THEME_GROUPS.map(g => ({ group: g.group, options: g.themes.map(t => ({ value: t.value, label: t.label })) })),
  getTheme(),
  v => setTheme(v as Theme),
  { ariaLabel: 'Colour theme', className: 'tb-btn' },
);
themeSelect.id = 'theme-select';
attachTooltip(themeSelect, 'Colour theme (Auto follows your system)');
// Pin the theme picker + help button to the right end of the toolbar: the theme
// picker carries `margin-left:auto` so it starts the right-aligned group.
themeSelect.style.marginLeft = 'auto';
helpBtn.style.marginLeft = '';
helpBtn.before(themeSelect);

onThemeChange(refreshCurrentView);

showEmptyState();

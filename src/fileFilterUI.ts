// "Filter files…" — scan a large batch of picked files for lot/wafer-level
// metadata (STDF/ATDF: MIR/WIR/WRR, no die data; CSV/JSON/Parquet: headers +
// first sample row) into the generic filterTable.ts, then Load/Add a chosen
// subset through the app's normal multi-file pipeline. Reached from its own
// toolbar entry; Open files/Add files additionally *offer* to route a large
// pick here (see FILTER_OFFER_THRESHOLD in main.ts), but never divert one
// without asking.
//
// Unlike the rest of the load pipeline this accepts a MIXED-format pick —
// reading metadata doesn't care about format, and "what have I got in this
// directory?" is the case the tool exists for. The one-format-per-load rule is
// enforced on the selected subset at load time instead (confirmAndLoad).
//
// Column set is a dynamic union of whatever metadata keys the scanned files
// actually carry (LotMeta.fields is itself a generic key/value bag, not a
// fixed schema — this mirrors that). Scans run concurrently with a live
// progress count; the table is built once the full column union is known
// rather than growing columns mid-scan, since a later file can introduce a
// key no earlier file had — filterTable.ts's addRow API stays available for
// a future incremental-column-growth version of this.

import { openModal } from './modal';
import { buildFilterTable, formatFilterFile, parseFilterFile, type FilterTableColumn, type FilterTableRow, type FilterTableHandle, type FilterCriteria } from './filterTable';
import { effectiveFileExtension, checkSameExtension, formatFamily, isTesterExt, isAtdfExt } from './lib';
import type { Platform, FileHandle, FileMeta } from './platform';
import { isTauri } from './platform';
import { storageKey } from './storageKeys';
import { detectRole } from './mappingUI';
import { displayValue, labelFor, orderFieldKeys } from './metadata';
import { buildToggleGroup, type ToggleGroup } from './toggleGroup';

function fmtBytes(n: number | undefined): string {
  if (n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ms: number | undefined): string {
  if (ms === undefined) return '';
  return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * A picked file before its bytes have necessarily been read. On desktop the
 * handle carries a `path` and the Rust side reads the file itself, so there
 * are never bytes to hold. On web there is no path, so the only way to scan
 * is to read the file — but reading *every* picked file up front defeats the
 * point of a tool built to triage large batches (200 STDFs would all sit in
 * memory at once). Keeping the original `File` here lets `scanOne` materialise
 * one file at a time, within the concurrency cap, and drop the bytes again
 * straight after.
 */
export interface PickedFile {
  handle: FileHandle;
  /** Web only — the original `File`, re-readable on demand. */
  blob?: File;
}

/** Wraps an already-resolved handle (desktop picker, or a batch Open/Add
 *  handed over by main.ts) as a `PickedFile`. */
export function pickedFromHandle(handle: FileHandle): PickedFile {
  // `handle.webFile` must come across as `blob`: on web a folder scan yields
  // handles with EMPTY `bytes` and the real `File` parked on `webFile`, and
  // `materializePicked` below only knows how to read `blob`. Returning a bare
  // `{ handle }` therefore left every folder-scanned file with no bytes, so
  // each one failed to parse. Caught before release, and desktop never took
  // this route at all (its handles carry `path`) — so the window where it
  // could bite was web-only and never published.
  return { handle, blob: handle.webFile };
}

/** Wraps a browser `File` without reading it. `size`/`lastModified` come free
 *  from the `File` itself, so the table's baseline columns are populated even
 *  though no byte has been touched yet. */
export function pickedFromWebFile(f: File): PickedFile {
  return {
    handle: { name: f.name, bytes: new Uint8Array(0), size: f.size, lastModified: f.lastModified },
    blob: f,
  };
}

/** Ensures `handle.bytes` is populated (web), returning a handle safe to hand
 *  to the normal load pipeline. A no-op on desktop, where parsing reads the
 *  path directly and bytes are never carried over IPC. */
export async function materializePicked(p: PickedFile): Promise<FileHandle> {
  if (!p.blob || p.handle.bytes.length > 0) return p.handle;
  return { ...p.handle, bytes: new Uint8Array(await p.blob.arrayBuffer()) };
}

/**
 * Scans run concurrently, but not all at once: on web each in-flight scan
 * holds a whole file in memory, and on desktop each is a separate Rust
 * command. Four keeps the progress counter moving briskly without either
 * cost scaling with the size of the batch.
 */
const SCAN_CONCURRENCY = 4;

/**
 * The last filter that was actually used to load something, remembered across
 * sessions — the test selector persists its selection the same way, and the
 * common case here is the same filter against a fresh batch of files ("this
 * quarter's production lots", again).
 *
 * Restored **visibly**: applied to the view with a notice saying so, and
 * deliberately without pre-selecting the matching rows (unlike an explicit
 * "Load filter…"). A silently pre-filtered table would read as "the scan only
 * found 3 files", which is exactly the kind of unexplained state this app's
 * splits-restore path also refuses to create.
 */
const LAST_FILTER_KEY = storageKey('tsmap:file-filter');

function loadLastCriteria(): FilterCriteria | null {
  try {
    const stored = localStorage.getItem(LAST_FILTER_KEY);
    if (!stored) return null;
    const parsed = parseFilterFile(stored);
    if ('error' in parsed) return null;
    const { columnValues, searchText } = parsed.criteria;
    // Nothing to restore if it filtered nothing.
    if (Object.keys(columnValues).length === 0 && !searchText.trim()) return null;
    return parsed.criteria;
  } catch {
    return null; // localStorage unavailable (private mode, disabled) — not fatal.
  }
}

function saveLastCriteria(criteria: FilterCriteria): void {
  try {
    localStorage.setItem(LAST_FILTER_KEY, formatFilterFile(criteria));
  } catch { /* quota or unavailable — remembering is a convenience, not a duty */ }
}

/** Human-readable summary of what a restored filter is doing, for the notice. */
/** Names a filter's columns by their on-screen labels (`labelOf`), never by
 *  key — the notice used to say "format" and "lotId". */
function describeCriteria(criteria: FilterCriteria, labelOf: (key: string) => string): string {
  const parts = Object.keys(criteria.columnValues).map(labelOf);
  if (criteria.searchText.trim()) parts.push(`search "${criteria.searchText.trim()}"`);
  return parts.join(', ');
}

/** `Promise.all(items.map(fn))` with a ceiling on how many run at once,
 *  preserving input order in the result. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Dedicated hidden file input for this feature — not the shared `#file-input`
 *  Open/Add already own (main.ts), so this doesn't fight their `change`
 *  listener. Created once, reused. */
let filterFileInput: HTMLInputElement | null = null;
function getFilterFileInput(): HTMLInputElement {
  if (filterFileInput) return filterFileInput;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.stdf,.std,.atdf,.atd,.csv,.json,.parquet,.gz,.zip,.txt,.dat';
  input.style.display = 'none';
  document.body.appendChild(input);
  filterFileInput = input;
  return input;
}

/** Picks files (web: dedicated `<input>`, same synchronous-user-gesture
 *  requirement as every other picker in this app; desktop: the native
 *  dialog via `platform.pickFiles()` — no bytes needed there, since Tauri's
 *  file-meta commands read straight from `path`). */
function pickFilesForFilter(platform: Platform): Promise<PickedFile[]> {
  if (isTauri) return platform.pickFiles('Select multiple files to scan and filter').then(hs => hs.map(pickedFromHandle));
  return new Promise((resolve) => {
    const input = getFilterFileInput();
    const onChange = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      const raw = Array.from(input.files ?? []);
      input.value = '';
      // Deliberately not reading bytes here — see `PickedFile`.
      resolve(raw.map(pickedFromWebFile));
    };
    const onCancel = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      resolve([]);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    input.click();
  });
}

/** `id` is assigned per pick rather than derived from the path/name: on web
 *  there is no path, and two files picked from different directories can share
 *  a name — keying rows on the name alone made them a single selectable row. */
type ScannedFile = { id: string; picked: PickedFile; meta: FileMeta | null; error?: string };

async function scanOne(platform: Platform, picked: PickedFile, id: string, ext: string): Promise<ScannedFile> {
  try {
    // Web: read this one file now and let it go again as soon as the scan
    // returns, so peak memory is bounded by SCAN_CONCURRENCY, not batch size.
    const file = await materializePicked(picked);
    const meta = await (async (): Promise<FileMeta | null> => {
      if (isTesterExt(ext)) return isAtdfExt(ext) ? platform.atdfFileMeta(file) : platform.stdfFileMeta(file);
      if (ext === 'csv' || ext === 'txt' || ext === 'dat') {
        const h = await platform.csvHeaders(file);
        return headersToFileMeta(h.headers, h.sample);
      }
      if (ext === 'json') {
        const h = await platform.jsonHeaders(file);
        return headersToFileMeta(h.headers, h.sample);
      }
      if (ext === 'parquet') {
        const h = await platform.parquetHeaders(file);
        const meta = headersToFileMeta(h.headers, h.sample);
        // Wafers, for Parquet only (see parquetDistinctCount — CSV/JSON would
        // mean reading the whole file): distinct (lot, wafer) pairs, the
        // identity a load gives a wafer. Columns are found with detectRole,
        // the first match winning, as headersToFileMeta does for the lot. A
        // failed count leaves Wafers blank rather than failing the scan.
        const roleCol = (role: string) => h.headers.find(c => detectRole(c, h.sample) === role);
        const waferCol = roleCol('wafer');
        if (waferCol) {
          const lotCol = roleCol('lot');
          meta.waferCount = await platform
            .parquetDistinctCount(file, lotCol ? [lotCol, waferCol] : [waferCol])
            .catch(() => 0);
        }
        return meta;
      }
      return null;
    })();
    if (meta === null) return { id, picked, meta: null, error: `Unsupported for filtering: .${ext}` };
    return { id, picked, meta };
  } catch (e) {
    return { id, picked, meta: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** CSV/JSON/Parquet have no self-describing lot metadata (unlike STDF/ATDF's
 *  MIR) — the closest equivalent is "every header, valued from the first
 *  sample row." A column whose sampled rows disagree is marked "(varies)"
 *  rather than showing an arbitrarily-picked value that could mislead. */
const VARIES = '(varies)';

/** Column roles that are per-die by definition — a die's position, its bins,
 *  its site, or a long-format test row's identity/value/limits. A file-level
 *  column can never be one of these, whatever the sample shows: the sample is
 *  the first five rows, which routinely agree on `y` (one die row) and often on
 *  a bin, so "(varies)" alone left `x`/`y`/`hbin`/`sbin` showing as if they
 *  were lot metadata. Uses the column-mapping dialog's own `detectRole`, so the
 *  filter and the loader agree on what a column is. The catch-all numeric
 *  `test` role is deliberately NOT listed: an unrecognised numeric column may
 *  well be file-level (`temperature_c`), so it keeps the "(varies)" rule.
 *
 *  `wafer` is here too: it is per-wafer, and a flat file routinely holds
 *  several wafers, so its first five rows showed `W01` for files holding
 *  W01–W10 — a file-level value that was simply wrong. */
const PER_DIE_ROLES = new Set<string>([
  'x', 'y', 'hbin', 'sbin', 'site', 'wafer', 'testname', 'testnumber', 'testvalue', 'loLimit', 'hiLimit', 'units',
]);

function headersToFileMeta(headers: string[], sample: Record<string, string>[]): FileMeta {
  const fields: { key: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const h of headers) {
    const role = detectRole(h, sample);
    if (PER_DIE_ROLES.has(role)) continue;
    // A lot column (`lot`, `LOT_ID`, `lot_no`…) is filed under the STDF/ATDF
    // lot record's own key, `lotId` — the key the parser also gives it when
    // the file is loaded. Under its raw header it became a second lot column,
    // so a mixed scan showed the STDF lots in one column and the Parquet lots
    // in another, each looking mostly empty. First lot-like column wins.
    const key = role === 'lot' ? 'lotId' : h;
    if (seen.has(key)) continue;
    seen.add(key);
    const values = new Set(sample.map(r => r[h] ?? ''));
    const value = values.size > 1 ? VARIES : (sample[0]?.[h] ?? '');
    fields.push({ key, value });
  }
  return { lotMeta: { fields }, waferCount: 0 };
}

function metaToRow(sf: ScannedFile, dynamicKeys: string[]): FilterTableRow {
  const file = sf.picked.handle;
  const columns: Record<string, string> = {
    __name: file.name,
    __size: fmtBytes(file.size),
    __modified: fmtDate(file.lastModified),
    __format: effectiveFileExtension(file.name),
  };
  // Size and Modified display as formatted text ("1.5 MB", a localized date),
  // which sorts nothing like the value behind it — carry the raw number so the
  // column sorts as a size/date rather than as a string.
  const sortValues: Record<string, number> = {};
  if (file.size !== undefined) sortValues.__size = file.size;
  if (file.lastModified !== undefined) sortValues.__modified = file.lastModified;
  if (sf.error) {
    columns.__error = sf.error;
  } else if (sf.meta) {
    // Only the kept columns — a dropped one's "(varies)" cells would otherwise
    // still match the search box while showing nowhere.
    const kept = new Set(dynamicKeys);
    const lotFields = sf.meta.lotMeta.fields;
    const get = (k: string) => lotFields.find(x => x.key === k)?.value;
    for (const f of lotFields) {
      if (!kept.has(f.key)) continue;
      columns[f.key] = f.value === VARIES ? f.value : displayValue(f.key, f.value, get);
    }
    const tested = testedAt(sf.meta);
    if (tested) {
      columns.__tested = tested.text;
      if (tested.ms !== undefined) sortValues.__tested = tested.ms;
    }
    if (sf.meta.waferCount > 0) columns.waferCount = String(sf.meta.waferCount);
    // `!= null`, not `!== undefined`: the parser sends `null` for "no SDR", which
    // String() turned into a literal "null" in the Sites column.
    if (sf.meta.siteCount != null) columns.siteCount = String(sf.meta.siteCount);
  }
  for (const k of dynamicKeys) columns[k] ??= '';
  return { id: sf.id, columns, sortValues };
}

/** When a file was tested — the one time worth showing to tell files apart,
 *  e.g. to pick the newest of several retests of one lot. The earliest wafer
 *  start (WIR START_T) where the tester recorded one, else the lot start (MIR
 *  START_T). This replaced separate "Earliest start"/"Latest finish" columns,
 *  which sat beside a raw `startT` column carrying almost the same value and
 *  left the reader to reconcile three timestamps. `ms` is undefined for text
 *  that is not a parseable time (an ATDF value in an unrecognised convention
 *  passes through as-is — see the parser's `FileMeta`), which then sorts as text. */
function testedAt(meta: FileMeta): { text: string; ms?: number } | undefined {
  const raw = meta.earliestStart
    ?? meta.lotMeta.fields.find(f => f.key === TESTED_FALLBACK_KEY)?.value;
  if (!raw || raw === VARIES) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? { text: raw } : { text: fmtDate(ms), ms };
}

/** The lot-record field folded into the Tested column, and so not given a
 *  column of its own. */
const TESTED_FALLBACK_KEY = 'startT';

/** Columns only some files can fill — CSV/JSON produce none of them, and
 *  STDF/ATDF writers often leave times unset. Blank ones drop out of view via
 *  the table's own hideEmptyColumns, not a second rule here. */
const OPTIONAL_COLUMNS: FilterTableColumn[] = [
  { key: '__tested', label: 'Tested' },
  { key: 'waferCount', label: 'Wafers' },
  { key: 'siteCount', label: 'Sites' },
];

/**
 * Expands any `.zip` in the pick into its contents, the way `handleFiles` does
 * via `platform.expandArchives` — without this a picked archive scanned as
 * "Unsupported for filtering: .zip", despite `.zip` being in this dialog's own
 * file-input `accept` list.
 *
 * Only archives are materialised; everything else stays lazy (see `PickedFile`).
 * `.gz` needs nothing here — the parsers unwrap a gzip container themselves
 * (`read_file::maybe_gunzip`), on the bytes path as well as by extension.
 */
async function expandPickedArchives(
  platform: Platform,
  picked: PickedFile[],
  log: FileFilterHandlers['log'],
): Promise<PickedFile[]> {
  const isZip = (p: PickedFile) => p.handle.name.toLowerCase().endsWith('.zip');
  if (!picked.some(isZip)) return picked;

  const out: PickedFile[] = [];
  for (const p of picked) {
    if (!isZip(p)) { out.push(p); continue; }
    try {
      const handle = await materializePicked(p);
      const inner = await platform.expandArchives([handle]);
      out.push(...inner.map(pickedFromHandle));
    } catch (e) {
      // One bad archive shouldn't cost the whole scan.
      log('error', `Could not read ${p.handle.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

export interface FileFilterHandlers {
  /** Load (replace) or Add (append) the selected subset — routes into the
   *  app's existing `handleFiles(files, isAppend)` pipeline, so append/
   *  rename/mismatch-detection is unchanged. Both require the caller to
   *  confirm first (per the confirm-before-load decision). */
  onConfirmedLoad: (files: FileHandle[], isAppend: boolean) => void;
  /** Replace (false) or append (true) — fixed by the caller, since the button
   *  the user pressed already answered it. The dialog never re-asks. */
  isAppend: boolean;
  /** Wraps `platform.confirm` so this module doesn't need its own dialog. */
  confirm: (message: string) => Promise<boolean>;
  log: (level: 'info' | 'error', message: string) => void;
}

/** `prePicked`, when given, skips the file picker and scans these files
 *  directly — used when Open files/Add files itself offers to route an
 *  already-picked large batch into the filter table, so the user isn't
 *  asked to pick the same files twice. */
export async function openFileFilterDialog(
  platform: Platform,
  handlers: FileFilterHandlers,
  prePicked?: PickedFile[],
): Promise<void> {
  // Whether this run replaces or appends is decided by the button that opened
  // it (Open files vs Add files) and never re-asked here. It used to offer both
  // "Load selection…" and "Add selection…", which meant the user answered the
  // same replace-or-append question twice — once in the toolbar, once again at
  // the end — in two different vocabularies ("Open"/"Add" then "Load"/"Add").
  const isAppend = handlers.isAppend;
  const rawPicked = prePicked ?? await pickFilesForFilter(platform);
  if (rawPicked.length === 0) return;

  const picked = await expandPickedArchives(platform, rawPicked, handlers.log);
  if (picked.length === 0) return;

  // Deliberately NO same-format check here. Scanning is read-only metadata, so
  // a directory holding both STDF and CSV can be listed in one table — which is
  // exactly the "what have I actually got here?" case this tool is for. The
  // rule still applies to *loading*, and is enforced on the chosen subset in
  // confirmAndLoad below, where it's a real constraint rather than an
  // artificial one.

  let closeModal: (() => void) | null = null;
  let table: FilterTableHandle | null = null;
  let scannedFiles: ScannedFile[] = [];

  const handle = openModal({
    title: `Filter files — ${picked.length} selected`,
    sizing: 'resizable',
    bodyOverflow: 'hidden',
    mount(body) {
      body.style.cssText += 'padding:16px;display:flex;flex-direction:column;gap:10px;';
      const status = el('div', { fontSize: '12px', color: 'var(--text-muted)' }, `Scanning 0 / ${picked.length}…`);
      body.appendChild(status);
      // Format quick filter — filled once the scan knows which kinds it holds.
      const formatBar = el('div', { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' });
      formatBar.hidden = true;
      body.appendChild(formatBar);
      const tableMount = el('div', { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' });
      body.appendChild(tableMount);
      // Inline problem line — a refusal to load has to be visible in the dialog
      // that stays open, not only in the log panel behind it.
      const notice = el('div', { fontSize: '12px', color: 'var(--error-text)', display: 'none' });
      notice.setAttribute('role', 'alert');   // see waferGeometryUI — visible-only errors aren't announced
      body.appendChild(notice);
      const showNotice = (msg: string | null) => {
        notice.textContent = msg ?? '';
        notice.style.display = msg ? '' : 'none';
      };
      const footer = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: '0' });
      body.appendChild(footer);

      let scannedCount = 0;
      mapWithConcurrency(picked, SCAN_CONCURRENCY, async (p, i) => {
        // Per-file extension, not one for the whole batch — a mixed pick is
        // allowed here (see the note above), so each file dispatches on itself.
        const sf = await scanOne(platform, p, `row-${i}`, effectiveFileExtension(p.handle.name));
        scannedCount++;
        status.textContent = `Scanning ${scannedCount} / ${picked.length}…`;
        return sf;
      }).then((results) => {
        scannedFiles = results;
        const errorCount = results.filter(r => r.error).length;
        const formats = new Set(results.map(r => effectiveFileExtension(r.picked.handle.name)));
        // A load takes one format family (STDF and ATDF are one — see
        // formatFamily), so only a mix of families needs choosing between.
        // The Format column still appears for any mix of extensions.
        const families = new Set([...formats].map(formatFamily));
        const summary = `Scanned ${results.length} file${results.length === 1 ? '' : 's'}`;
        status.textContent = [
          summary,
          families.size > 1 ? `${[...families].join(', ')} files — a load takes one kind (STDF and ATDF count as one)` : null,
          errorCount > 0 ? `${errorCount} failed to scan` : null,
        ].filter(Boolean).join(' — ');

        const dynamicKeySet = new Set<string>();
        // A column only earns its place if at least one file gives it a real
        // value. Blank everywhere, or "(varies)" in every file that has it,
        // means a per-die field (x, y, a bin, a test result) or unused
        // metadata — nothing to tell files apart by. Blank in SOME files is
        // kept: "has this field vs doesn't" is itself a distinction.
        for (const r of results) {
          for (const f of r.meta?.lotMeta.fields ?? []) {
            if (f.value !== '' && f.value !== VARIES) dynamicKeySet.add(f.key);
          }
        }
        // Shown as the Tested column instead — see testedAt.
        dynamicKeySet.delete(TESTED_FALLBACK_KEY);
        // orderFieldKeys also drops hidden fields (WF_UNITS), so their cells
        // are never built — a cell with no column would still match the search.
        const dynamicKeys = orderFieldKeys(dynamicKeySet);
        const rows = results.map(r => metaToRow(r, dynamicKeys));


        // Ordered by the questions asked when triaging a batch: which file,
        // which lot and how much of it, when it was tested (with Modified
        // beside Tested, as the two are read together), what was run, then
        // file-system detail that rarely decides anything. Lot fields use the
        // facet table's own labels and order (metadata.ts), so the dialog and
        // the gallery's facets name a field the same way.
        const pick = (key: string) => OPTIONAL_COLUMNS.filter(c => c.key === key);
        const fieldCol = (key: string): FilterTableColumn => ({ key, label: labelFor(key) });
        const LOT = 'lotId';
        const columns: FilterTableColumn[] = [
          { key: '__name', label: 'Name' },
          ...(dynamicKeySet.has(LOT) ? [fieldCol(LOT)] : []),
          ...pick('waferCount'),
          ...pick('__tested'),
          { key: '__modified', label: 'Modified' },
          ...orderFieldKeys(dynamicKeys).filter(k => k !== LOT).map(fieldCol),
          ...pick('siteCount'),
          { key: '__size', label: 'Size' },
          // Only worth a column when there's something to distinguish.
          ...(formats.size > 1 ? [{ key: '__format', label: 'Format' }] : []),
          ...(errorCount > 0 ? [{ key: '__error', label: 'Error' }] : []),
        ];

        // Format quick filter state. Declared before the table because the
        // table reports filter changes from its very first applyCriteria (the
        // remembered filter, below); the buttons themselves are built after.
        let formatToggle: ToggleGroup<string> | null = null;
        // The remembered filter reapplied on open, while its notice is shown.
        // The notice explains a short table, so it goes as soon as that filter
        // is no longer fully in effect (Clear filters, a column menu) — but not
        // when the kind buttons merely add a Format filter on top of it.
        let reappliedFilter: FilterCriteria | null = null;
        const stillIncludes = (cur: FilterCriteria, applied: FilterCriteria) =>
          (!applied.searchText.trim() || cur.searchText === applied.searchText)
          && Object.entries(applied.columnValues).every(([k, vals]) => {
            const now = cur.columnValues[k] ?? [];
            return now.length === vals.length && vals.every(v => now.includes(v));
          });
        const labelOfColumn = (key: string) => columns.find(c => c.key === key)?.label ?? labelFor(key);
        const ALL_FORMATS = '__all';
        const extsOf = (fam: string) => [...formats].filter(e => formatFamily(e) === fam);
        /** The button a filter state corresponds to: All when the Format column
         *  is unfiltered, a family when its filter is exactly that family's
         *  extensions, and none when the column menu chose something else. */
        const formatChoiceOf = (c: ReturnType<FilterTableHandle['getCriteria']>): string | null => {
          const v = c.columnValues.__format;
          if (!v?.length) return ALL_FORMATS;
          const fams = new Set(v.map(formatFamily));
          if (fams.size !== 1) return null;
          const [fam] = fams;
          return extsOf(fam).every(e => v.includes(e)) ? fam : null;
        };

        table = buildFilterTable({
          columns,
          ariaLabel: 'Scanned files',
          onFilterChange: c => {
            formatToggle?.setActive(formatChoiceOf(c));
            if (reappliedFilter && !stillIncludes(c, reappliedFilter)) {
              reappliedFilter = null;
              showNotice(null);
            }
          },
          // The columns are a union over unlike files — STDF header fields next
          // to CSV/JSON/Parquet files that carry none — so any one kind shown
          // alone would be mostly blank columns.
          hideEmptyColumns: true,
        });
        tableMount.appendChild(table.el);
        table.setRows(rows);

        // Re-apply the last filter that was used to load — see LAST_FILTER_KEY.
        // `select: false` so rows aren't pre-ticked behind the user's back, and
        // always announced, so a short table is never unexplained.
        const remembered = loadLastCriteria();
        if (remembered) {
          const { unknownColumns } = table.applyCriteria(remembered, { select: false });
          const effective: FilterCriteria = {
            columnValues: Object.fromEntries(
              Object.entries(remembered.columnValues).filter(([k]) => !unknownColumns.includes(k)),
            ),
            searchText: remembered.searchText,
          };
          const applied = describeCriteria(effective, labelOfColumn);
          // Set after applyCriteria: its own change notification must not
          // judge the filter against itself mid-apply.
          reappliedFilter = applied ? effective : null;
          showNotice(applied
            ? `Reapplied your last filter (${applied}) — showing ${table.rowCount() > 0 ? '' : 'no '}matches. Use Clear filters to see all ${results.length}.`
            : null);
        }

        // Format quick filter. A load takes one format family (formatFamily),
        // so a scan holding several needs a choice before Load — made here in
        // one click rather than through the Format column's menu. The buttons
        // set that column's own filter, so the menu, Clear filters, Save
        // filter… and the remembered filter all see one state, and
        // onFilterChange (above) keeps the buttons showing it.
        if (families.size > 1 && table) {
          const t = table;
          const counts = new Map<string, number>();
          for (const r of results) {
            const fam = formatFamily(effectiveFileExtension(r.picked.handle.name));
            counts.set(fam, (counts.get(fam) ?? 0) + 1);
          }
          const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const choose = (choice: string) => {
            const cur = t.getCriteria();
            const columnValues = { ...cur.columnValues };
            if (choice === ALL_FORMATS) delete columnValues.__format;
            else columnValues.__format = extsOf(choice);
            t.applyCriteria({ columnValues, searchText: cur.searchText }, { select: false });
          };
          formatToggle = buildToggleGroup<string>({
            options: [
              { value: ALL_FORMATS, label: `All (${results.length})` },
              ...ranked.map(([fam, n]) => ({ value: fam, label: `${fam} (${n})` })),
            ],
            active: formatChoiceOf(t.getCriteria()),
            ariaLabel: 'File kind to show',
            onChange: choose,
          });
          formatBar.append(el('span', { color: 'var(--text-muted)' }, 'Show:'), formatToggle.el);
          formatBar.hidden = false;
          // Start on the most common kind unless a filter already chose one: a
          // mixed selection cannot load, so opening on All only defers the choice.
          if (!t.getCriteria().columnValues.__format?.length) choose(ranked[0][0]);
        }
      });

      // One action, matching the verb already chosen in the toolbar.
      const loadBtn = el('button', {}, isAppend ? 'Add selected…' : 'Load selected…');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-primary';
      loadBtn.addEventListener('click', () => confirmAndLoad(isAppend));
      const saveFilterBtn = el('button', {
        marginRight: 'auto',
      }, 'Save filter…');
      saveFilterBtn.type = 'button';
      saveFilterBtn.className = 'btn-secondary';
      saveFilterBtn.addEventListener('click', () => {
        if (table) void platform.saveTextFile(formatFilterFile(table.getCriteria()), 'filter.json', 'Save this filter to a file');
      });
      const loadFilterBtn = el('button', {
      }, 'Load filter…');
      loadFilterBtn.type = 'button';
      loadFilterBtn.className = 'btn-secondary';
      loadFilterBtn.addEventListener('click', async () => {
        const chosenFile = await platform.pickTextFile('Select a saved filter file to load');
        if (!chosenFile || !table) return;
        const parsed = parseFilterFile(chosenFile.content);
        if ('error' in parsed) {
          const msg = `"${chosenFile.name}" is ${parsed.error}`;
          showNotice(msg);
          handlers.log('error', msg);
          return;
        }
        // A saved filter names columns, but the column set is whatever THIS
        // batch of files happens to carry — so a filter saved against one lot
        // family can reference keys that simply aren't here. Silently matching
        // nothing would look like the filter had failed.
        const { unknownColumns } = table.applyCriteria(parsed.criteria);
        if (unknownColumns.length > 0) {
          showNotice(
            `Applied — but ${unknownColumns.length} filtered column${unknownColumns.length === 1 ? '' : 's'} ` +
            `(${unknownColumns.join(', ')}) ${unknownColumns.length === 1 ? 'is' : 'are'} not present in these files, ` +
            `so ${unknownColumns.length === 1 ? 'it was' : 'they were'} ignored.`,
          );
        } else {
          showNotice(null);
        }
      });

      async function confirmAndLoad(isAppend: boolean): Promise<void> {
        if (!table) return;
        const ids = table.getSelectedIds();
        const chosen = scannedFiles.filter(sf => ids.has(sf.id));
        if (chosen.length === 0) {
          showNotice('Nothing selected — tick the files you want to load.');
          return;
        }
        // The same-format rule the scan deliberately skipped applies here: the
        // load pipeline dispatches one way for the whole batch. Refused inline
        // with the dialog left open, so the selection can just be narrowed.
        const mixedFormatsError = checkSameExtension(chosen.map(sf => sf.picked.handle.name));
        if (mixedFormatsError) {
          // Name the off-screen part of the selection. A filter or search hides
          // rows but does not deselect them, so the files causing this can be
          // invisible — the refusal then looks like it is about the files on
          // screen, which are fine, and there is nothing obvious to change.
          const shown = table.getShownIds();
          const hidden = chosen.filter(sf => !shown.has(sf.id)).length;
          showNotice(hidden > 0
            ? `${mixedFormatsError}. ${hidden} selected file${hidden === 1 ? ' is' : 's are'} ` +
              `hidden by the current search or column filter — "Select none" clears the whole ` +
              `selection, including those.`
            : mixedFormatsError);
          return;
        }
        const unscannable = chosen.filter(sf => sf.error);
        if (unscannable.length > 0) {
          showNotice(
            `${unscannable.length} selected file${unscannable.length === 1 ? '' : 's'} failed to scan ` +
            `and cannot be loaded — deselect ${unscannable.length === 1 ? 'it' : 'them'} first.`,
          );
          return;
        }
        showNotice(null);
        const verb = isAppend ? 'add' : 'load';
        const ok = await handlers.confirm(
          `${isAppend ? 'Add' : 'Load'} ${chosen.length} file${chosen.length === 1 ? '' : 's'}? ` +
          `This will ${verb} the selected files${isAppend ? ' to the current view' : ', replacing anything currently loaded'}.`,
        );
        if (!ok) return;
        // Remember the filter that actually led to a load — that's the signal
        // it was the right one, more than merely having been typed.
        saveLastCriteria(table.getCriteria());
        closeModal?.();
        // Bytes are only read now, and only for the subset actually chosen —
        // the scan deliberately didn't retain them (see `PickedFile`).
        const files = await Promise.all(chosen.map(sf => materializePicked(sf.picked)));
        handlers.onConfirmedLoad(files, isAppend);
      }

      footer.appendChild(saveFilterBtn);
      footer.appendChild(loadFilterBtn);
      footer.appendChild(loadBtn);
    },
  });
  closeModal = handle.close;
}

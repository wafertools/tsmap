// Platform abstraction — switches between Tauri IPC (native) and WASM (web).
// main.ts calls platform.* for all I/O; render/chart code is untouched.

import type { CsvMapping } from './mappingUI';
import type { LotMeta, WaferData, TestDef } from './types';

export interface RustParsedFile {
  meta: LotMeta;
  wafers: WaferData[];
  testDefs: Record<string, TestDef>;
  sites?: unknown[];
  /** Non-fatal advisories from the parser (e.g. fabricated soft bins). */
  warnings?: string[];
}

export interface HeadersResult {
  headers: string[];
  sample: Record<string, string>[];
  rowCount: number;
  /** Coarse per-column type ("number" | "bool" | "string") — set only by
   *  natively-typed sources (Parquet); absent for CSV/JSON. */
  columnTypes?: Record<string, 'number' | 'bool' | 'string'>;
}

export interface FileHandle {
  name: string;
  bytes: Uint8Array;
  /** Native path — set by tauriPlatform, undefined in webPlatform. */
  path?: string;
  /** File size in bytes — set by tauriPlatform (where bytes is empty); equals bytes.length in webPlatform. */
  size?: number;
  /** Last-modified time, epoch ms — a universal column for the file-filter
   *  table regardless of format: unlike any parsed field it costs no parsing
   *  at all and is never a guess.
   *
   *  Set by `tauriPlatform.pickFiles`/`expandArchives` from `stat().mtime`,
   *  and on web by whichever code turns a browser `File` into a handle: the
   *  `#file-input` and drop handlers in `main.ts`, and `pickedFromWebFile` in
   *  `fileFilterUI.ts` — note `webPlatform.pickFiles` itself returns `[]` and
   *  never produces a handle. Undefined only if the platform call failed. */
  lastModified?: number;
}

export type StdfTestNames = Record<string, TestDef>;

export interface ScanResult {
  testDefs: StdfTestNames;
  dieCount: number;
}

/** Fast, MIR/SDR/WIR/WRR-only metadata for the file-filter table — see
 *  `packages/parsers/src/types.rs`'s `FileMeta` (this mirrors it exactly).
 *  Deliberately not a full parse; lot-level fields only, plus wafer-level
 *  aggregates (count, earliest start, latest finish, site count). */
export interface FileMeta {
  lotMeta: LotMeta;
  waferCount: number;
  earliestStart?: string;
  latestFinish?: string;
  siteCount?: number;
}

/** Data files (already expanded from any `--list`), plus an optional
 *  test-selection list and/or splits CSV — resolved to absolute paths by the
 *  Rust side (`cli_files.rs`), from either this process's own argv/stdin or
 *  argv forwarded by the single-instance plugin from a second launch. */
export interface CliStartupArgs {
  files: string[];
  tests?: string;
  splits?: string;
  /** Set when `--url`/`--url-format` (cli_files.rs) failed to fetch — the
   *  Rust side resolves the URL to a real local file *before* the frontend
   *  ever runs (see fetch_url.rs's module doc for why), so `files` already
   *  contains the resolved path on success; this is only ever populated on
   *  failure, for the frontend to surface the same way a bad `--splits`/
   *  `--tests` file already is. */
  urlError?: string;
}

export interface Platform {
  pickFiles(): Promise<FileHandle[]>;
  expandArchives(files: FileHandle[]): Promise<FileHandle[]>;
  parseStdf(file: FileHandle): Promise<RustParsedFile>;
  parseAtdf(file: FileHandle): Promise<RustParsedFile>;
  parseCsv(file: FileHandle, mapping: CsvMapping): Promise<RustParsedFile>;
  parseJson(file: FileHandle, mapping: CsvMapping): Promise<RustParsedFile>;
  parseParquet(file: FileHandle, mapping: CsvMapping): Promise<RustParsedFile>;
  csvHeaders(file: FileHandle): Promise<HeadersResult>;
  jsonHeaders(file: FileHandle): Promise<HeadersResult>;
  /** Unlike csvHeaders/jsonHeaders (computed in plain JS on web, see
   *  parseCsvHeaders/parseJsonHeaders below), Parquet's binary format has no
   *  pure-JS shortcut — this always goes through the WASM worker on web, and
   *  through the native command on Tauri. */
  parquetHeaders(file: FileHandle): Promise<HeadersResult>;
  savePng(blob: Blob, stem: string): Promise<void>;
  openReport(html: string): void;
  /** Opens an external URL in the system browser (Tauri) / a new tab (web). */
  openExternal(url: string): void;
  /**
   * Opens the bundled user guide (built by scripts/build-user-guide.mjs from
   * docs/user-guide.md — see public/guide/). Tauri: the guide is bundled as a
   * resource (tauri.conf.json) and opened as a local file in the system
   * browser, so it works fully offline. Web: it's served from the same
   * origin as the app (Vite copies public/ into the build output), so it's
   * just a relative link — no bundling step needed there.
   */
  openGuide(): void;
  confirm(message: string): Promise<boolean>;
  stdfTestNames(file: FileHandle): Promise<ScanResult>;
  atdfTestNames(file: FileHandle): Promise<ScanResult>;
  /** Fast metadata-only scan for the file-filter table (see `FileMeta`) —
   *  MIR/SDR/WIR/WRR only, no die data. */
  stdfFileMeta(file: FileHandle): Promise<FileMeta>;
  atdfFileMeta(file: FileHandle): Promise<FileMeta>;
  parseStdfFiltered(file: FileHandle, selected: number[]): Promise<RustParsedFile>;
  parseAtdfFiltered(file: FileHandle, selected: number[]): Promise<RustParsedFile>;
  saveTextFile(content: string, defaultName: string): Promise<void>;
  pickTextFile(): Promise<{ content: string; name: string } | null>;
  /** Returns a FileHandle for the bundled synthetic demo lot (13 wafers, 5
   *  process corners), for the empty state's "Load sample data" action. */
  getSampleFile(): Promise<FileHandle>;
  /** Returns the CSV text for the demo lot's matching split assignments
   *  (see splits.ts's parseSplitsCsv), or null if it can't be read — splits
   *  are a bonus on top of the sample load, not required for it to succeed. */
  getSampleSplitsCsv(): Promise<string | null>;
  /** Files/tests-list/splits resolved from this process's own CLI args/stdin
   *  at launch (see cli_files.rs) — consumed exactly once. `null` on web
   *  (there is no CLI entry point there) or when tsmap was launched with no
   *  file arguments at all. */
  getStartupFiles(): Promise<CliStartupArgs | null>;
  /** Launches a brand-new, independent tsmap process for `args` — used when
   *  the user declines to replace the current view with files forwarded from
   *  a second `tsmap <files>` launch (see the `cli-open-files` event). No-op
   *  on web, where there is no process to respawn. */
  respawnNewInstance(args: CliStartupArgs): Promise<void>;
  /** Reads a text file by absolute path — used to fetch the content of a
   *  CLI-supplied `--tests`/`--splits` file. Tauri only; never called on web. */
  readTextFile(path: string): Promise<string>;
  /** Current file-type association status for each of ASSOCIABLE_EXTENSIONS
   *  (see file_associations.rs) — reflects the real OS state (registry on
   *  Windows, mimeapps.list on Linux), not just what the user last clicked.
   *  Tauri only; there is no such concept on web. */
  getFileAssociationStatus(): Promise<FileAssociationStatus[]>;
  /** Associates (or un-associates) `extension` with tsmap. Rejects with a
   *  clear message on failure — most commonly a locked-down machine that
   *  restricts registry/mimeapps.list writes — rather than silently no-op'ing.
   *  Tauri only. */
  setFileAssociation(extension: string, associate: boolean): Promise<void>;
}

export interface FileAssociationStatus {
  extension: string;
  associated: boolean;
  /** The executable path currently registered for this extension (Windows
   *  registry command / Linux `.desktop` file's `Exec=`) — `null` when not
   *  associated or unreadable. This is what the OS will actually launch on a
   *  cold double-click, which can drift from `currentExePath` (e.g. toggled
   *  on once from a debug build, then left stale after switching back to the
   *  release build). */
  registeredExePath: string | null;
  /** The path of the tsmap binary currently running, for comparison against
   *  `registeredExePath`. `null` only if the OS call to resolve it failed. */
  currentExePath: string | null;
}

// ── Tauri platform ────────────────────────────────────────────────────────────

function makeTauriPlatform(): Platform {
  // Lazy imports so the module never fails to load in the browser
  const getInvoke = () => import('@tauri-apps/api/core').then(m => m.invoke);
  const getDialog = () => import('@tauri-apps/plugin-dialog');
  const getFs = () => import('@tauri-apps/plugin-fs');
  const getOpener = () => import('@tauri-apps/plugin-opener');

  return {
    async pickFiles() {
      const { invoke } = await import('@tauri-apps/api/core');
      const { open: dialogOpen } = await import('@tauri-apps/plugin-dialog');
      const lastDir = await invoke<string | null>('get_last_dir').catch(() => null);
      const result = await dialogOpen({
        multiple: true,
        defaultPath: lastDir ?? undefined,
        filters: [
          { name: 'Wafer map files', extensions: ['stdf', 'std', 'atdf', 'atd', 'csv', 'json', 'parquet', 'gz', 'zip'] },
          { name: 'STDF', extensions: ['stdf', 'std'] },
          { name: 'ATDF', extensions: ['atdf', 'atd'] },
          { name: 'CSV / JSON / Parquet', extensions: ['csv', 'json', 'parquet'] },
          { name: 'Archives', extensions: ['gz', 'zip'] },
        ],
      });
      const paths = Array.isArray(result) ? result : result ? [result] : [];
      if (paths.length > 0) invoke('set_last_dir', { path: paths[0] }).catch(() => {});
      const { stat } = await getFs();
      return Promise.all(paths.map(async path => {
        const s = await stat(path).catch(() => null);
        return {
          name: path.split(/[\\/]/).pop() ?? path,
          bytes: new Uint8Array(0),
          path,
          size: s?.size ?? 0,
          lastModified: s?.mtime?.getTime(),
        };
      }));
    },

    async expandArchives(files) {
      const invoke = await getInvoke();
      const { stat } = await getFs();
      const expanded: FileHandle[] = [];
      for (const f of files) {
        if (f.path && f.name.toLowerCase().endsWith('.zip')) {
          const extracted = await invoke<string[]>('extract_archive', { path: f.path });
          for (const p of extracted) {
            const s = await stat(p).catch(() => null);
            expanded.push({
              name: p.split(/[\\/]/).pop() ?? p,
              bytes: new Uint8Array(0),
              path: p,
              size: s?.size ?? 0,
              lastModified: s?.mtime?.getTime(),
            });
          }
        } else {
          expanded.push(f);
        }
      }
      return expanded;
    },

    async parseStdf(file) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_stdf', { path: file.path });
    },

    async parseAtdf(file) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_atdf', { path: file.path });
    },

    async parseCsv(file, mapping) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_csv', { path: file.path, mapping });
    },

    async parseJson(file, mapping) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_json', { path: file.path, mapping });
    },

    async parseParquet(file, mapping) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_parquet', { path: file.path, mapping });
    },

    async csvHeaders(file) {
      const invoke = await getInvoke();
      return invoke<HeadersResult>('csv_headers', { path: file.path });
    },

    async jsonHeaders(file) {
      const invoke = await getInvoke();
      return invoke<HeadersResult>('json_headers', { path: file.path });
    },

    async parquetHeaders(file) {
      const invoke = await getInvoke();
      return invoke<HeadersResult>('parquet_headers', { path: file.path });
    },

    async savePng(blob, stem) {
      const { save: dialogSave } = await getDialog();
      const { writeFile } = await getFs();
      const path = await dialogSave({
        defaultPath: `${stem}.png`,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      });
      if (path) {
        const buf = await blob.arrayBuffer();
        await writeFile(path, new Uint8Array(buf));
      }
    },

    openReport(html) {
      getInvoke().then(invoke => invoke('write_temp_html', { html }));
    },

    openExternal(url) {
      getOpener().then(({ openUrl }) => openUrl(url));
    },

    openGuide() {
      import('@tauri-apps/api/path').then(async ({ resolveResource }) => {
        const { openPath } = await getOpener();
        const path = await resolveResource('guide/index.html');
        await openPath(path);
      });
    },

    async confirm(message) {
      const { ask } = await getDialog();
      return ask(message, { kind: 'warning' });
    },

    async stdfTestNames(file) {
      const invoke = await getInvoke();
      return invoke<ScanResult>('stdf_test_names', { path: file.path });
    },

    async atdfTestNames(file) {
      const invoke = await getInvoke();
      return invoke<ScanResult>('atdf_test_names', { path: file.path });
    },

    async stdfFileMeta(file) {
      const invoke = await getInvoke();
      return invoke<FileMeta>('stdf_file_meta', { path: file.path });
    },

    async atdfFileMeta(file) {
      const invoke = await getInvoke();
      return invoke<FileMeta>('atdf_file_meta', { path: file.path });
    },

    async parseStdfFiltered(file, selected) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_stdf_filtered', { path: file.path, selected });
    },

    async parseAtdfFiltered(file, selected) {
      const invoke = await getInvoke();
      return invoke<RustParsedFile>('parse_atdf_filtered', { path: file.path, selected });
    },

    async saveTextFile(content, defaultName) {
      const { save: dialogSave } = await getDialog();
      const { writeTextFile } = await getFs();
      const path = await dialogSave({
        defaultPath: defaultName,
        filters: [{ name: 'Test list', extensions: ['csv', 'txt'] }],
      });
      if (path) await writeTextFile(path, content);
    },

    async pickTextFile() {
      const { open: dialogOpen } = await getDialog();
      const { readTextFile } = await getFs();
      const path = await dialogOpen({
        multiple: false,
        filters: [{ name: 'Test list', extensions: ['csv', 'txt', '*'] }],
      });
      if (!path || Array.isArray(path)) return null;
      const content = await readTextFile(path);
      const name = path.split(/[\\/]/).pop() ?? path;
      return { content, name };
    },

    async getSampleFile() {
      const { resolveResource } = await import('@tauri-apps/api/path');
      // Bundled via tauri.conf.json's bundle.resources — a real OS path, so
      // this reuses the exact same native parse commands (path-based, with
      // transparent .gz decompression in read_bytes) as any other open.
      // MUST match tauri.conf.json's resources map exactly: bundle.resources
      // must be the { "src": "target" } object form here, not a bare string
      // array — a source path containing "../" (the file lives outside
      // src-tauri) gets its ".." segments rewritten to a literal "_up_" in
      // the resource tree under the array form, so resolveResource('sample-
      // lot.stdf.gz') would 404 (ENOENT) against the real registered key,
      // "_up_/sample_data/sample-lot.stdf.gz". The object form pins the
      // target name explicitly instead of relying on that rewrite.
      const path = await resolveResource('sample-lot.stdf.gz');
      return { name: 'PVT-LOT-05.stdf.gz', bytes: new Uint8Array(0), path };
    },

    async getSampleSplitsCsv() {
      try {
        const { resolveResource } = await import('@tauri-apps/api/path');
        const invoke = await getInvoke();
        const path = await resolveResource('sample-lot-splits.csv');
        return await invoke<string>('read_text_file', { path });
      } catch {
        return null;
      }
    },

    async getStartupFiles() {
      const invoke = await getInvoke();
      return invoke<CliStartupArgs | null>('get_startup_files');
    },

    async respawnNewInstance(args) {
      const invoke = await getInvoke();
      await invoke('respawn_new_instance', { args });
    },

    async readTextFile(path) {
      // The `@tauri-apps/plugin-fs` API is scope-restricted by
      // capabilities/default.json (dialog-picked paths only) — a CLI-supplied
      // `--tests`/`--splits` path was never picked via a dialog, so it isn't
      // in scope and that API rejects it as "forbidden path". Route through
      // the unrestricted `read_text_file` command instead, same as
      // `getSampleSplitsCsv` already does for arbitrary bundled-resource paths.
      const invoke = await getInvoke();
      return invoke<string>('read_text_file', { path });
    },

    async getFileAssociationStatus() {
      const invoke = await getInvoke();
      return invoke<FileAssociationStatus[]>('get_file_association_status');
    },

    async setFileAssociation(extension, associate) {
      const invoke = await getInvoke();
      await invoke('set_file_association', { extension, associate });
    },
  };
}

// ── WASM platform (parsing runs in a worker) ──────────────────────────────────
// All WASM parsing runs in parserWorker.ts so large files don't block the UI
// thread. The worker owns its own WASM instance; this side just correlates
// request/response messages by id.

type ParserOp =
  | 'parseStdf' | 'parseAtdf' | 'parseCsv' | 'parseJson' | 'parseParquet' | 'parquetHeaders'
  | 'stdfTestNames' | 'atdfTestNames' | 'stdfFileMeta' | 'atdfFileMeta'
  | 'parseStdfFiltered' | 'parseAtdfFiltered';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

let parserWorker: Worker | null = null;
let nextCallId = 0;
const pendingCalls = new Map<number, PendingCall>();

function getWorker(): Worker {
  if (parserWorker) return parserWorker;
  const w = new Worker(new URL('./parserWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data as
      { id: number; ok: boolean; result?: unknown; error?: string };
    const call = pendingCalls.get(id);
    if (!call) return;
    pendingCalls.delete(id);
    if (ok) call.resolve(result);
    else call.reject(new Error(error ?? 'parser error'));
  };
  // A panic inside WASM becomes a trap that fires here (not onmessage), so a
  // hung request never silently waits forever — reject every pending call and
  // drop the worker so the next call spins up a fresh one.
  const failAll = (msg: string) => {
    for (const [, call] of pendingCalls) call.reject(new Error(msg));
    pendingCalls.clear();
    parserWorker = null;
  };
  w.onerror = (e) => failAll(`parser worker crashed: ${e.message || 'unknown error'}`);
  w.onmessageerror = () => failAll('parser worker message could not be deserialised');
  parserWorker = w;
  return w;
}

/**
 * Call the parser worker. Copies `bytes` once and transfers the copy so the
 * caller's original buffer stays intact (the "Filter tests…" re-parse flow
 * re-reads the same file from memory). The copy cost is negligible vs parse time.
 */
function callWorker(
  op: ParserOp,
  bytes: Uint8Array,
  extra?: { mapping?: CsvMapping; selected?: number[] },
): Promise<unknown> {
  const id = nextCallId++;
  const copy = bytes.slice();
  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });
    getWorker().postMessage(
      { id, op, bytes: copy, mapping: extra?.mapping, selected: extra?.selected },
      [copy.buffer],
    );
  });
}

/** Decompress a .gz file using the browser's native DecompressionStream. */
async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(bytes as unknown as ArrayBuffer);
  writer.close();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** Extract a .zip archive, returning all contained files as FileHandles. */
async function extractZip(bytes: Uint8Array): Promise<FileHandle[]> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(bytes);
  return Object.entries(files).map(([name, data]) => ({ name, bytes: data }));
}

/** Parse CSV bytes: detect delimiter, extract headers, sample rows, count rows. */
function parseCsvHeaders(bytes: Uint8Array): HeadersResult {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const firstLine = lines[0] ?? '';
  const commas = firstLine.split(',').length - 1;
  const tabs = firstLine.split('\t').length - 1;
  const semis = firstLine.split(';').length - 1;
  const delim = tabs >= commas && tabs >= semis ? '\t' : semis > commas ? ';' : ',';

  const headers = firstLine.split(delim).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const sample: Record<string, string>[] = [];
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const row: Record<string, string> = {};
    const cells = lines[i].split(delim);
    headers.forEach((h, j) => { row[h] = (cells[j] ?? '').trim().replace(/^["']|["']$/g, ''); });
    sample.push(row);
  }
  return { headers, sample, rowCount: lines.length - 1 };
}

/** Parse JSON bytes: extract column names and sample rows. */
function parseJsonHeaders(bytes: Uint8Array): HeadersResult {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text);
  const arr: unknown[] = Array.isArray(parsed) ? parsed : [];

  // Detect nested shape: [{ waferId, results: [{die}] }]
  const firstItem = arr[0];
  const rows: Record<string, unknown>[] =
    firstItem && typeof firstItem === 'object' && Array.isArray((firstItem as Record<string, unknown>).results)
      ? (arr as Array<{ results: unknown[] }>).flatMap(w => w.results as Record<string, unknown>[])
      : arr as Record<string, unknown>[];

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const sample = rows.slice(0, 5).map(r =>
    Object.fromEntries(headers.map(h => [h, String(r[h] ?? '')]))
  );
  return { headers, sample, rowCount: rows.length };
}


function makeWebPlatform(): Platform {
  return {
    // Web file picking is handled directly in main.ts via <input id="file-input">
    // so the click stays in the synchronous user-gesture chain.
    async pickFiles() { return []; },

    async expandArchives(files) {
      const expanded: FileHandle[] = [];
      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.zip')) {
          const inner = await extractZip(f.bytes);
          expanded.push(...inner.map(h => ({ ...h, size: h.bytes.length })));
        } else if (lower.endsWith('.gz')) {
          const decompressed = await decompressGzip(f.bytes);
          expanded.push({ name: f.name.slice(0, -3), bytes: decompressed, size: decompressed.length });
        } else {
          expanded.push({ ...f, size: f.size ?? f.bytes.length });
        }
      }
      return expanded;
    },

    async parseStdf(file) {
      return await callWorker('parseStdf', file.bytes) as RustParsedFile;
    },

    async parseAtdf(file) {
      return await callWorker('parseAtdf', file.bytes) as RustParsedFile;
    },

    async parseCsv(file, mapping) {
      return await callWorker('parseCsv', file.bytes, { mapping }) as RustParsedFile;
    },

    async parseJson(file, mapping) {
      return await callWorker('parseJson', file.bytes, { mapping }) as RustParsedFile;
    },

    async parseParquet(file, mapping) {
      return await callWorker('parseParquet', file.bytes, { mapping }) as RustParsedFile;
    },

    async csvHeaders(file) {
      return parseCsvHeaders(file.bytes);
    },

    async jsonHeaders(file) {
      return parseJsonHeaders(file.bytes);
    },

    async parquetHeaders(file) {
      // No pure-JS shortcut for a binary Parquet schema/footer, unlike
      // csvHeaders/jsonHeaders above — always goes through the WASM worker.
      return await callWorker('parquetHeaders', file.bytes) as HeadersResult;
    },

    async savePng(blob, stem) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stem}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    openReport(html) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },

    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },

    openGuide() {
      // public/guide/ is copied verbatim into the build output by Vite, so
      // it's reachable at a plain same-origin relative URL — no bundling or
      // reachability probing needed (unlike the old GitHub-Pages-hosted
      // version, this ships with the web build itself). Resolved against the
      // current page URL (not a hardcoded base) so it works whether the app
      // is served from `/` (dev) or a subpath (e.g. GitHub Pages `/tsmap/app/`).
      // The filename must be explicit (`guide/index.html`, not `guide/`) —
      // Vite's dev server doesn't resolve directory-index requests the way a
      // production static host does, so a trailing-slash URL silently falls
      // through to the app's own SPA shell instead of the guide.
      window.open(new URL('guide/index.html', window.location.href).href, '_blank', 'noopener');
    },

    async confirm(message) {
      return window.confirm(message);
    },

    async stdfTestNames(file) {
      return await callWorker('stdfTestNames', file.bytes) as ScanResult;
    },

    async atdfTestNames(file) {
      return await callWorker('atdfTestNames', file.bytes) as ScanResult;
    },

    async stdfFileMeta(file) {
      return await callWorker('stdfFileMeta', file.bytes) as FileMeta;
    },

    async atdfFileMeta(file) {
      return await callWorker('atdfFileMeta', file.bytes) as FileMeta;
    },

    async parseStdfFiltered(file, selected) {
      return await callWorker('parseStdfFiltered', file.bytes, { selected }) as RustParsedFile;
    },

    async parseAtdfFiltered(file, selected) {
      return await callWorker('parseAtdfFiltered', file.bytes, { selected }) as RustParsedFile;
    },

    async saveTextFile(content, defaultName) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    pickTextFile() {
      return new Promise<{ content: string; name: string } | null>(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ content: reader.result as string, name: file.name });
          reader.onerror = () => resolve(null);
          reader.readAsText(file);
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    async getSampleFile() {
      // `new URL(..., import.meta.url)` is Vite's asset-reference pattern —
      // resolved (and, for a build, copied/hashed) relative to this module,
      // so it works under both the Tauri dev absolute base and the relative
      // base used for the GitHub Pages web build. Fetched bytes still carry
      // the .gz suffix in their name; expandArchives() in handleFiles already
      // decompresses that via DecompressionStream, same as a dropped .gz file.
      const url = new URL('../sample_data/sample-lot.stdf.gz', import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch sample data: ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { name: 'sample-lot.stdf.gz', bytes };
    },

    // No CLI entry point on web — these three are never actually invoked
    // there (main.ts's `if (isTauri)` startup block is what calls them).
    async getStartupFiles() { return null; },
    async respawnNewInstance() {},
    async readTextFile() { throw new Error('readTextFile is not supported on web'); },
    // No concept of "the OS's default app for a file type" in a browser —
    // never called on web (the Help menu row is Tauri-only, see main.ts).
    async getFileAssociationStatus() { throw new Error('File associations are not supported on web'); },
    async setFileAssociation() { throw new Error('File associations are not supported on web'); },

    async getSampleSplitsCsv() {
      try {
        const url = new URL('../sample_data/PVT-LOT-05_splits.csv', import.meta.url);
        const res = await fetch(url);
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    },
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

export const isTauri = '__TAURI_INTERNALS__' in window;

export function createPlatform(): Platform {
  return isTauri ? makeTauriPlatform() : makeWebPlatform();
}

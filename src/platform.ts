// Platform abstraction — switches between Tauri IPC (native) and WASM (web).
// main.ts calls platform.* for all I/O; render/chart code is untouched.

import type { CsvMapping } from './mappingUI';
import { DATA_FILE_EXTENSIONS } from './lib';
import type { LotMeta, WaferData, TestDef, ParserWarning } from './types';
import type { BinDef } from '@wafertools/wafermap';
import { openModal } from './modal';

export interface RustParsedFile {
  meta: LotMeta;
  wafers: WaferData[];
  testDefs: Record<string, TestDef>;
  sites?: unknown[];
  /** From STDF/ATDF HBR/SBR — see `ParsedFile.hbinDefs`/`sbinDefs`/`passHbins`
   *  (types.ts) for the full doc; `rustToLocal` (lib.ts) carries these
   *  straight through unchanged. */
  hbinDefs?: BinDef[];
  sbinDefs?: BinDef[];
  passHbins?: number[];
  /** Non-fatal advisories from the parser — `{ code, message, severity }`.
   *  Branch on `code`; see `ParserWarning`. */
  warnings?: ParserWarning[];
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
  /** The originating browser `File`, on web only, kept UNREAD so a folder scan
   *  costs nothing until something actually wants the bytes. Desktop has
   *  `path` for this and leaves it undefined.
   *
   *  It must be carried into `PickedFile.blob` by whatever turns this handle
   *  into a `PickedFile` — `materializePicked` reads `blob`, not this. Dropping
   *  it silently yields a handle whose `bytes` stay empty, which surfaces as
   *  every scanned file failing to parse ("file too short to contain a FAR
   *  record") rather than as a missing-data error. */
  webFile?: File;
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
  /** `--sweeps <FILE>` (cli_files.rs) — a sweeps JSON path, resolved but not
   *  read on the Rust side. Replaces the session's sweeps (`adoptSweepsFile`
   *  in main.ts) rather than seeding the next load, so it also works alone. */
  sweeps?: string;
  /** `--edge-exclusion <MM>` (cli_files.rs) — a scalar mm value, already
   *  parsed and validated (non-negative, finite) on the Rust side, unlike
   *  `tests`/`splits` which are file paths resolved but not read there.
   *  Only takes effect once a wafer diameter is known (see `waferDiameter`
   *  below and `waferGeometry.ts`'s `normalizeWaferGeometry`) — Rust
   *  validates this flag's own syntax but has no visibility into whether a
   *  diameter is already persisted from a previous session, so that gate is
   *  enforced in the frontend (`applyCliArgs`), not here. */
  edgeExclusion?: number;
  /** `--wafer-diameter <MM>` (cli_files.rs) — a scalar mm value, validated
   *  `> 0` (strict, unlike `edgeExclusion`'s `>= 0`) on the Rust side. */
  waferDiameter?: number;
  /** Set when `--url`/`--url-format` (cli_files.rs) failed to fetch — the
   *  Rust side resolves the URL to a real local file *before* the frontend
   *  ever runs (see fetch_url.rs's module doc for why), so `files` already
   *  contains the resolved path on success; this is only ever populated on
   *  failure, for the frontend to surface the same way a bad `--splits`/
   *  `--tests` file already is. */
  urlError?: string;
}

export interface FolderScan {
  /** The chosen directory, for display and for `rescanFolder`. Empty on web,
   *  which exposes no directory path. */
  dirPath: string;
  /** Human-readable folder name, for the dialog title. */
  dirName: string;
  files: FileHandle[];
  hasSubdirs: boolean;
  truncated: boolean;
}

/**
 * What a file dialog is for. Each purpose remembers its own folder between
 * sessions, so the next dialog of that kind opens where the last one finished —
 * the per-dialog memory Windows gives an app through `SetClientGuid` and the web
 * through a picker `id`. A purpose with nothing remembered yet starts in the
 * `data` folder: exports, images and definitions usually live beside the data
 * they came from, which beats the OS default of the home folder.
 *
 * Group by the FOLDER a user keeps things in, not by the dialog: saving and
 * loading the same kind of file share one purpose.
 */
export type DialogPurpose =
  /** Wafer data — opening files or scanning a folder. */
  | 'data'
  /** Chart and map images. */
  | 'images'
  /** Exported CSV/text from the map and Insights. */
  | 'exports'
  /** Test, bin, splits and sweeps definitions, and their example files. */
  | 'definitions'
  /** Saved file-filter criteria. */
  | 'filters';

export interface Platform {
  /** `title` (desktop only — ignored on web, which has no native dialog to
   *  title) replaces the OS's own generic default ("Open File" or similar)
   *  with copy naming what's expected — one or more wafer test data files,
   *  and for the filter dialog specifically, that a multi-select is wanted.
   *  Without this, "Open file" and "Filter files…" opened dialogs that
   *  looked identical, and neither hinted that multi-select was expected. */
  pickFiles(title?: string): Promise<FileHandle[]>;
  /** Pick a DIRECTORY and return the data files in it.
   *
   *  This is the "where?" question, as distinct from `pickFiles`'s "which?".
   *  The filter table then answers "which?" — so the two dialogs a scan-and-load
   *  passes through ask different questions, instead of both asking the same one.
   *
   *  `recursive` descends into subfolders (bounded in Rust by a depth and file
   *  cap). `hasSubdirs` lets the caller offer that choice only when there is
   *  something to descend into; `truncated` says the listing hit a cap and is
   *  partial. Returns `null` if the user cancelled. */
  pickFolder(title?: string, recursive?: boolean): Promise<FolderScan | null>;
  /** Whether a dropped path is a directory. Desktop only — the browser's drop
   *  gives File objects, never paths. */
  isDirectory?(path: string): Promise<boolean>;
  /** Re-list a folder already chosen via `pickFolder`, without re-prompting —
   *  used to answer "include subfolders?" without a second native dialog.
   *  Web has no persistent directory handle, so it returns null there. */
  rescanFolder?(dirPath: string, recursive: boolean): Promise<FolderScan | null>;
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
  /** Distinct combinations of `columns`' values across the whole Parquet file
   *  — the file filter's wafer count, as distinct (lot, wafer) pairs. Parquet
   *  only: it reads just those columns, where CSV/JSON would mean reading every
   *  byte of the file during what is meant to be a quick header scan. */
  parquetDistinctCount(file: FileHandle, columns: string[]): Promise<number>;
  /** `title` — see `pickFiles`'s doc: desktop-only, replaces the OS's own
   *  generic default with copy naming what's being saved. */
  savePng(blob: Blob, stem: string, purpose: DialogPurpose, title?: string): Promise<void>;
  openReport(html: string): void;
  /** Opens an external URL in the system browser (Tauri) / a new tab (web). */
  openExternal(url: string): void;
  confirm(message: string): Promise<boolean>;
  stdfTestNames(file: FileHandle): Promise<ScanResult>;
  atdfTestNames(file: FileHandle): Promise<ScanResult>;
  /** Fast metadata-only scan for the file-filter table (see `FileMeta`) —
   *  MIR/SDR/WIR/WRR only, no die data. */
  stdfFileMeta(file: FileHandle): Promise<FileMeta>;
  atdfFileMeta(file: FileHandle): Promise<FileMeta>;
  parseStdfFiltered(file: FileHandle, selected: number[]): Promise<RustParsedFile>;
  parseAtdfFiltered(file: FileHandle, selected: number[]): Promise<RustParsedFile>;
  /** `title`s — see `pickFiles`'s doc: desktop-only, name what's being
   *  saved/loaded rather than leaving the OS's generic default in place. */
  /** Returns what was written, or null if the user cancelled. `path` is desktop-only.
   *  Callers use it to remember a saved definitions file, so a list you just wrote is
   *  one click away next time (see recentDefinitions.ts). */
  saveTextFile(content: string, defaultName: string, purpose: DialogPurpose, title?: string): Promise<{ name: string; path?: string } | null>;
  /** `path` is desktop-only — the browser picker exposes none. It is what lets a
   *  remembered definitions file be re-read fresh instead of served from the
   *  copy cached at pick time (see recentDefinitions.ts). */
  pickTextFile(purpose: DialogPurpose, title?: string, extensions?: string[]): Promise<{ content: string; name: string; path?: string } | null>;
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

/** Last path segment, for either separator (Windows paths come back with `\\`). */
const baseName = (p: string): string => p.split(/[/\\]/).filter(Boolean).pop() ?? p;

function makeTauriPlatform(): Platform {
  // Lazy imports so the module never fails to load in the browser
  const getInvoke = () => import('@tauri-apps/api/core').then(m => m.invoke);
  const getDialog = () => import('@tauri-apps/plugin-dialog');
  const getFs = () => import('@tauri-apps/plugin-fs');
  const getOpener = () => import('@tauri-apps/plugin-opener');

  /** Where a `purpose` dialog should open: its own remembered folder, else the
   *  data folder, else nothing (the OS default). See `DialogPurpose`. */
  async function startDir(purpose: DialogPurpose): Promise<string | undefined> {
    const invoke = await getInvoke();
    const own = await invoke<string | null>('get_last_dir', { purpose }).catch(() => null);
    if (own || purpose === 'data') return own ?? undefined;
    return (await invoke<string | null>('get_last_dir', { purpose: 'data' }).catch(() => null)) ?? undefined;
  }

  /** Record where a `purpose` dialog finished. Only on a real choice — a
   *  cancelled dialog must not move the remembered folder. */
  function remember(purpose: DialogPurpose, path: string): void {
    getInvoke().then(invoke => invoke('set_last_dir', { path, purpose })).catch(() => {});
  }

  /** A save dialog's `defaultPath`: the suggested name inside the purpose's
   *  folder. A bare name leaves the folder to the OS, which on Linux is $HOME
   *  every time. */
  async function savePath(purpose: DialogPurpose, name: string): Promise<string> {
    const dir = await startDir(purpose);
    if (!dir) return name;
    const { join } = await import('@tauri-apps/api/path');
    return join(dir, name);
  }

  /** Shared by `pickFolder` and `rescanFolder`. A local function, not a
   *  Platform method: listing a known directory is an implementation detail of
   *  those two, not something a caller should reach for on its own. */
  async function listFolder(dirPath: string, recursive: boolean): Promise<FolderScan> {
    const { invoke } = await import('@tauri-apps/api/core');
    const listing = await invoke<{ files: string[]; hasSubdirs: boolean; truncated: boolean }>(
      'list_dir_files',
      { path: dirPath, extensions: [...DATA_FILE_EXTENSIONS], recursive },
    );
    const { stat } = await import('@tauri-apps/plugin-fs');
    const files: FileHandle[] = await Promise.all(listing.files.map(async (path) => {
      // Same shape pickFiles produces: no bytes are read, since every Tauri
      // parse and metadata command works from `path`. A 5,000-file folder
      // therefore costs one stat each, not one read each.
      let size: number | undefined;
      let lastModified: number | undefined;
      try {
        const st = await stat(path);
        size = st.size ?? undefined;
        lastModified = st.mtime ? new Date(st.mtime).getTime() : undefined;
      } catch { /* still listed — the metadata scan reports its own error per file */ }
      return { name: baseName(path), bytes: new Uint8Array(), path, size: size ?? 0, lastModified };
    }));
    return { dirPath, dirName: baseName(dirPath), files, hasSubdirs: listing.hasSubdirs, truncated: listing.truncated };
  }

  return {
    async pickFolder(title, recursive = false) {
      const { open: dialogOpen } = await import('@tauri-apps/plugin-dialog');
      const picked = await dialogOpen({
        title, directory: true, multiple: false, defaultPath: await startDir('data'),
      });
      const dirPath = Array.isArray(picked) ? picked[0] : picked;
      if (!dirPath) return null;
      remember('data', dirPath);
      return listFolder(dirPath, recursive);
    },

    async rescanFolder(dirPath, recursive) {
      return listFolder(dirPath, recursive);
    },

    async isDirectory(path) {
      try {
        const { stat } = await import('@tauri-apps/plugin-fs');
        return (await stat(path)).isDirectory === true;
      } catch { return false; }
    },

    async pickFiles(title) {
      const { open: dialogOpen } = await import('@tauri-apps/plugin-dialog');
      const result = await dialogOpen({
        title,
        multiple: true,
        defaultPath: await startDir('data'),
        // One entry per format so the dialog's own type dropdown can narrow
        // to exactly one — split out from a former combined "CSV / JSON /
        // Parquet" entry, which couldn't isolate just one of those three.
        filters: [
          { name: 'Wafer map files', extensions: ['stdf', 'std', 'atdf', 'atd', 'csv', 'json', 'parquet', 'gz', 'zip'] },
          { name: 'STDF', extensions: ['stdf', 'std'] },
          { name: 'ATDF', extensions: ['atdf', 'atd'] },
          { name: 'CSV', extensions: ['csv'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'Parquet', extensions: ['parquet'] },
          { name: 'Archives', extensions: ['gz', 'zip'] },
        ],
      });
      const paths = Array.isArray(result) ? result : result ? [result] : [];
      if (paths.length > 0) remember('data', paths[0]);
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

    async parquetDistinctCount(file, columns) {
      const invoke = await getInvoke();
      return invoke<number>('parquet_distinct_count', { path: file.path, columns });
    },

    async savePng(blob, stem, purpose, title) {
      const { save: dialogSave } = await getDialog();
      const { writeFile } = await getFs();
      const path = await dialogSave({
        title,
        defaultPath: await savePath(purpose, `${stem}.png`),
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      });
      if (path) {
        remember(purpose, path);
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

    async saveTextFile(content, defaultName, purpose, title) {
      const { save: dialogSave } = await getDialog();
      const { writeTextFile } = await getFs();
      // Derive the filter from what is actually being saved. This was hardcoded
      // to CSV/TXT back when test definitions were the only caller; the file
      // filter's own `filter.json` now goes through here too, and a native save
      // dialog constrains — and appends — the offered extension, producing
      // `filter.json.csv`.
      const ext = defaultName.includes('.') ? defaultName.split('.').pop()!.toLowerCase() : 'csv';
      const FILTER_NAMES: Record<string, string> = { csv: 'CSV', txt: 'Text', json: 'JSON' };
      const path = await dialogSave({
        title,
        defaultPath: await savePath(purpose, defaultName),
        filters: [{ name: FILTER_NAMES[ext] ?? ext.toUpperCase(), extensions: [ext] }],
      });
      if (!path) return null;
      remember(purpose, path);
      await writeTextFile(path, content);
      return { name: path.split(/[\\/]/).pop() ?? path, path };
    },

    async pickTextFile(purpose, title, extensions = ['csv', 'txt']) {
      const { open: dialogOpen } = await getDialog();
      const { readTextFile } = await getFs();
      const path = await dialogOpen({
        title,
        multiple: false,
        defaultPath: await startDir(purpose),
        filters: [{ name: 'Definitions', extensions: [...extensions, '*'] }],
      });
      if (!path || Array.isArray(path)) return null;
      remember(purpose, path);
      const content = await readTextFile(path);
      const name = path.split(/[\\/]/).pop() ?? path;
      return { content, name, path };
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

// ── Blocked-popup recovery (web only) ─────────────────────────────────────────
// `window.open` returns null when a popup blocker — or an embedded WebView —
// refuses the window. Every web call site below used to discard that return
// value and fail silently; Help → "tsmap guide" went further and showed an
// "Opening in browser…" toast for a window that never opened, which is exactly
// the false reassurance that toast was added to prevent. Popup blocking is
// default policy on plenty of managed desktops, so this is a normal path, not
// an edge case.
//
// The popup is still tried first everywhere it was before: a real browser
// window is what makes Ctrl+P / Save-as-PDF work on the guide and the report,
// and an iframe can't offer that. These are the fallbacks for when it's
// refused — the same try-popup-then-fall-back shape wmap already uses for its
// own guide (`openUserGuideWindow`) and for gallery card detach.

/** Open a popup, reporting whether it actually opened. */
function openPopup(url: string, features?: string): boolean {
  return window.open(url, '_blank', features) != null;
}

/**
 * Show same-origin HTML in an in-app modal. Used when the popup is refused;
 * `src` for a real URL, `srcdoc` for a generated document.
 */
function openFramedModal(title: string, source: { src: string } | { srcdoc: string }): void {
  openModal({
    title,
    sizing: 'content',
    mount(body) {
      const frame = document.createElement('iframe');
      if ('src' in source) frame.src = source.src;
      else frame.srcdoc = source.srcdoc;
      frame.title = title;
      // inset:0 on a positioned parent rather than height:100% — see the
      // cross-platform CSS rules in CLAUDE.md.
      frame.style.cssText = 'position:absolute;inset:0;width:100%;border:0;background:var(--bg-base)';
      body.style.position = 'relative';
      body.appendChild(frame);
    },
  });
}

/**
 * Last resort for an external URL, which can't be iframed (X-Frame-Options /
 * frame-ancestors). Clicking the link is a fresh user gesture, so the blocker
 * permits it — the user recovers in one click instead of hitting a dead button.
 */
function openBlockedLinkNotice(url: string): void {
  openModal({
    title: 'Popup blocked',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 460px)', height: 'auto' },
    mount(body) {
      const p = document.createElement('p');
      p.textContent = 'Your browser blocked the new window. Open the link directly:';
      p.style.cssText = 'margin:0 0 12px;font-size:12px;color:var(--text-secondary)';
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = url;
      a.style.cssText = 'font-size:12px;color:var(--accent);word-break:break-all';
      body.append(p, a);
      a.focus();
    },
  });
}

// ── WASM platform (parsing runs in a worker) ──────────────────────────────────
// All WASM parsing runs in parserWorker.ts so large files don't block the UI
// thread. The worker owns its own WASM instance; this side just correlates
// request/response messages by id.

// The worker's own list, not a restatement of it — this copy had to be kept in
// step by hand with parserWorker.ts's.
type ParserOp = import('./parserWorker').ParserOp;

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
    const { id, ok, result, error, code } = e.data as
      { id: number; ok: boolean; result?: unknown; error?: string; code?: string };
    const call = pendingCalls.get(id);
    if (!call) return;
    pendingCalls.delete(id);
    if (ok) { call.resolve(result); return; }
    // Rebuild the Error the worker caught, and put the parser's stable `code`
    // back on it: postMessage cannot clone an Error's own properties, so the
    // worker sends it alongside. Without this the web path loses the code that
    // the native path keeps, and `errCode()` would answer differently depending
    // on which build the user is running — the one asymmetry this parser's
    // "one source, two targets" design exists to avoid.
    const err = new Error(error ?? 'parser error');
    if (code) (err as Error & { code?: string }).code = code;
    call.reject(err);
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
 * caller's original buffer stays intact (the "Tests…" re-parse flow
 * re-reads the same file from memory). The copy cost is negligible vs parse time.
 */
function callWorker(
  op: ParserOp,
  bytes: Uint8Array,
  extra?: { mapping?: CsvMapping; selected?: number[]; columns?: string[] },
): Promise<unknown> {
  const id = nextCallId++;
  const copy = bytes.slice();
  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });
    getWorker().postMessage(
      { id, op, bytes: copy, mapping: extra?.mapping, selected: extra?.selected, columns: extra?.columns },
      [copy.buffer],
    );
  });
}

/**
 * Decompress a .gz file using the browser's native DecompressionStream.
 *
 * Checks the gzip magic bytes (0x1f 0x8b) first and returns the input
 * unchanged if they're absent — mirrors the Rust parser's `maybe_gunzip`
 * (CLAUDE.md: "a safe no-op if the caller already decompressed"), and for
 * the same reason: a server that sets `Content-Encoding: gzip` on a
 * `.gz`-suffixed asset (common static-host default, confirmed here against
 * both the Vite dev server and — this is the well-known part — GitHub
 * Pages' Fastly CDN, which does this for any `.gz`-named file regardless of
 * framework) makes the browser's own `fetch()` transparently decompress the
 * body before this function ever sees it. Calling DecompressionStream again
 * on already-decompressed bytes throws `The compressed data was not valid:
 * incorrect header check` — which is exactly what shipped (2026-08,
 * getSampleFile's `sample-lot.stdf.gz`): the error was real, but harmless
 * only by accident, because the Rust parser's own maybe_gunzip silently
 * absorbed the already-decompressed bytes downstream. Web-only — Tauri
 * reads the file straight off disk (resolveResource), no HTTP transport
 * layer involved, so it never hits this.
 */
async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
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


// ── Folder scanning on web ───────────────────────────────────────────────────
//
// Two implementations, tried in order, because the better one is Chromium-only.
//
// 1. `showDirectoryPicker()` (File System Access API). Preferred for ONE reason
//    above all: wording. The `webkitdirectory` input below is labelled entirely
//    by the browser, and Chrome labels it "Open file" / "Upload", then asks
//    "Upload N files to this site?" — telling the user, in the browser's own
//    voice and at the one moment they are paying attention, the exact opposite
//    of what tsmap does and of what every page of our documentation promises.
//    Nothing on the page can change those strings. `showDirectoryPicker` asks
//    "Let this site view files?" with a "View files" button, which is both
//    reassuring and accurate: we read the folder, in the browser, and send
//    nothing anywhere.
//
// 2. `<input type="file" webkitdirectory>` — the fallback, for Firefox and
//    Safari, which implement no equivalent. They keep the misleading wording,
//    which is why `main.ts` also states the truth in tsmap's own voice while
//    the picker is open: that line is not redundant with this preference, it
//    covers the browsers this preference cannot reach.
//
// Both paths produce the same `FolderScan`, so nothing upstream branches.

/** Caps on a folder walk, mirroring `MAX_FILES`/`MAX_DEPTH` in
 *  `src-tauri/src/commands/list_dir_files.rs` — deliberately the same numbers,
 *  so `truncated` means the same thing to a user on either platform and a
 *  folder that scans fully on the desktop does not silently truncate in the
 *  browser. Change them together. */
const SCAN_MAX_FILES = 5000;
const SCAN_MAX_DEPTH = 3;

/** Whether a filename is one of the wafer data formats worth listing. */
function isDataFile(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_FILE_EXTENSIONS.some(e => lower.endsWith(`.${e}`));
}

/** The slice of the File System Access API this uses. Not in the TS DOM lib
 *  (TypeScript 5.9 declares neither `showDirectoryPicker` nor the handle's
 *  `values()`), so it is declared here at exactly the width needed rather than
 *  pulling in a dependency for two methods. */
interface FsFileHandle { kind: 'file'; name: string; getFile(): Promise<File> }
interface FsDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<FsFileHandle | FsDirectoryHandle>;
}
type DirectoryPicker = (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirectoryHandle>;
type OpenFilePicker = (opts?: {
  id?: string; multiple?: boolean; excludeAcceptAllOption?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FsFileHandle[]>;

/** The browser's per-purpose picker memory key — see `DialogPurpose`. The
 *  File System Access API remembers a separate last folder for each `id`. */
const pickerId = (purpose: DialogPurpose): string => `tsmap-${purpose}`;

/** Whether this browser can open files at a remembered folder (Chromium).
 *  Synchronous, so a click handler can choose its path without leaving the
 *  user-gesture chain that both kinds of picker require. */
export function canPickWebFilesByPurpose(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

/**
 * Web: open files through `showOpenFilePicker`, which reopens at the folder
 * last used for `purpose` — the browser's counterpart of the desktop's
 * remembered directory. Call only when `canPickWebFilesByPurpose()`; elsewhere
 * (Firefox, Safari) an `<input type=file>` is all there is, and it cannot be
 * pointed at a folder.
 *
 * Resolves `[]` when the user cancels, and on any other refusal (no user
 * activation, policy) — the caller reports nothing chosen either way.
 */
/** The picker's file-type label per purpose (its "Files of type" entry). */
const PICKER_TYPE_LABEL: Record<DialogPurpose, string> = {
  data: 'Wafer data files', images: 'Images', exports: 'Exported data',
  definitions: 'Definitions files', filters: 'Saved filters',
};

export async function pickWebFilesByPurpose(
  purpose: DialogPurpose, extensions: readonly string[], multiple: boolean,
): Promise<File[]> {
  const picker = (window as unknown as { showOpenFilePicker: OpenFilePicker }).showOpenFilePicker;
  try {
    const handles = await picker({
      id: pickerId(purpose), multiple,
      types: [{ description: PICKER_TYPE_LABEL[purpose], accept: { 'application/octet-stream': extensions.map(e => `.${e.replace(/^\./, '')}`) } }],
    });
    return await Promise.all(handles.map(h => h.getFile()));
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) console.warn('[tsmap] file picker refused:', e);
    return [];
  }
}

/**
 * Folder scan via the File System Access API.
 *
 * Returns `undefined` — distinct from `null` — when this path is unavailable
 * and the caller should fall back: the API is absent, or the call was refused
 * for a reason a retry would not fix (no user activation, enterprise policy).
 * `null` means the user cancelled, which is an answer, not a failure, and must
 * NOT open a second picker in their face.
 */
async function pickFolderViaHandle(): Promise<FolderScan | null | undefined> {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (typeof picker !== 'function') return undefined;

  let dir: FsDirectoryHandle;
  try {
    // `id` makes the browser reopen at the last folder chosen for this purpose,
    // which is the closest the web has to the desktop's remembered directory.
    // Shares the `data` purpose with opening files, as on desktop: scanning a
    // folder and picking files from it are the same task.
    dir = await picker({ mode: 'read', id: pickerId('data') });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    return undefined;
  }

  const files: FileHandle[] = [];
  let hasSubdirs = false;
  let truncated = false;

  const walk = async (d: FsDirectoryHandle, depth: number): Promise<void> => {
    for await (const entry of d.values()) {
      if (files.length >= SCAN_MAX_FILES) { truncated = true; return; }
      if (entry.kind === 'directory') {
        if (depth + 1 > SCAN_MAX_DEPTH) { truncated = true; continue; }
        await walk(entry, depth + 1);
      } else if (isDataFile(entry.name)) {
        if (depth > 0) hasSubdirs = true;
        // Metadata only — `getFile()` does not read the contents, so a 5000-file
        // scan still costs nothing until the filter dialog asks for bytes.
        const file = await entry.getFile();
        files.push({ name: entry.name, bytes: new Uint8Array(), size: file.size, lastModified: file.lastModified, webFile: file });
      }
    }
  };
  await walk(dir, 0);

  return { dirPath: '', dirName: dir.name, files, hasSubdirs, truncated };
}

/** Dedicated hidden directory input — `webkitdirectory`, which every current
 *  browser supports and which returns the folder's whole subtree as ordinary
 *  lazy File handles (no bytes read until something asks). Kept separate from
 *  the shared `#file-input` so neither steals the other's `change` event, and
 *  created once rather than per pick. */
let folderInput: HTMLInputElement | null = null;
function getFolderInput(): HTMLInputElement {
  if (folderInput) return folderInput;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  // Not in the TS DOM lib as a property — it is a real, widely-supported
  // attribute, so set it as one.
  input.setAttribute('webkitdirectory', '');
  input.style.display = 'none';
  document.body.appendChild(input);
  folderInput = input;
  return input;
}

function makeWebPlatform(): Platform {
  return {
    // Web file picking is handled directly in main.ts via <input id="file-input">
    // so the click stays in the synchronous user-gesture chain.
    async pickFiles() { return []; },

    // The browser has no directory path and no persistent handle, so `recursive`
    // is not ours to control: `webkitdirectory` always returns the whole subtree,
    // and `webkitRelativePath` is what tells us a subtree existed at all. The
    // caller therefore never gets a subfolder prompt on web — there is nothing
    // to opt into, it already happened.
    async pickFolder(_title, _recursive) {
      // Preferred path first; `undefined` means it is unavailable here, so fall
      // through to the input. A `null` (user cancelled) is returned as-is.
      const viaHandle = await pickFolderViaHandle();
      if (viaHandle !== undefined) return viaHandle;

      const input = getFolderInput();
      const picked = await new Promise<File[]>((resolve) => {
        const done = (files: File[]) => {
          input.removeEventListener('change', onChange);
          input.removeEventListener('cancel', onCancel);
          input.value = '';
          resolve(files);
        };
        const onChange = () => done(Array.from(input.files ?? []));
        const onCancel = () => done([]);
        input.addEventListener('change', onChange);
        input.addEventListener('cancel', onCancel);
        input.click();
      });
      if (picked.length === 0) return null;

      // Depth is read from webkitRelativePath: "folder/a.stdf" is depth 0 inside
      // the chosen folder, "folder/sub/a.stdf" depth 1. Capped like the handle
      // path and like the desktop's Rust walk, so one folder does not scan
      // fully on one platform and truncate on another.
      const withinCaps = (f: File) =>
        (f.webkitRelativePath.match(/\//g)?.length ?? 1) - 1 <= SCAN_MAX_DEPTH;
      const eligible = picked.filter(f => isDataFile(f.name));
      const wanted = eligible.filter(withinCaps).slice(0, SCAN_MAX_FILES);
      const rel = picked[0].webkitRelativePath || picked[0].name;
      const dirName = rel.includes('/') ? rel.split('/')[0] : '';
      const files: FileHandle[] = await Promise.all(
        wanted.map(async f => ({ name: f.name, bytes: new Uint8Array(), size: f.size, lastModified: f.lastModified, webFile: f })),
      );
      return {
        dirPath: '',
        dirName,
        files,
        hasSubdirs: wanted.some(f => (f.webkitRelativePath.match(/\//g)?.length ?? 0) > 1),
        truncated: wanted.length < eligible.length,
      };
    },


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

    async parquetDistinctCount(file, columns) {
      return await callWorker('parquetDistinctCount', file.bytes, { columns }) as number;
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
      // Popup first — a real browser window keeps Ctrl+P / Save-as-PDF working,
      // which an iframe modal cannot offer. Fall back only when it's refused.
      if (!openPopup(url)) openFramedModal('Summary report', { src: url });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },

    openExternal(url) {
      // An arbitrary external origin can't be iframed (X-Frame-Options /
      // frame-ancestors), so the recovery here is a link the user clicks —
      // that click is a fresh user gesture, which the blocker allows.
      if (!openPopup(url, 'noopener')) openBlockedLinkNotice(url);
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
      // A browser download reports neither a path nor whether the user kept it —
      // the name we asked for is the whole truth available here.
      return { name: defaultName };
    },

    // Firefox/Safari: an `<input type=file>` has no start folder to set.
    async pickTextFile(purpose, _title, extensions = ['csv', 'txt']) {
      if (canPickWebFilesByPurpose()) {
        const [file] = await pickWebFilesByPurpose(purpose, extensions, false);
        return file ? { content: await file.text(), name: file.name } : null;
      }
      return new Promise<{ content: string; name: string } | null>(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = extensions.map(e => `.${e}`).join(',');
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

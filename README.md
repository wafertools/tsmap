# tsmap

[![Test](https://github.com/wafertools/tsmap/actions/workflows/test.yml/badge.svg)](https://github.com/wafertools/tsmap/actions/workflows/test.yml)
[![Build](https://github.com/wafertools/tsmap/actions/workflows/build.yml/badge.svg)](https://github.com/wafertools/tsmap/actions/workflows/build.yml)
[![release](https://img.shields.io/github/v/release/wafertools/tsmap)](https://github.com/wafertools/tsmap/releases)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A desktop and web application for loading and visualising semiconductor wafer map data. Built with [Tauri v2](https://tauri.app/) (Rust backend), a WASM parser for the browser, and [wafermap](https://github.com/wafertools/wafermap) (canvas rendering).

**[Documentation & web app →](https://wafertools.github.io/tsmap/)**

## Community

Questions, ideas, or want to show off a wafer map you built? Use [GitHub
Discussions](https://github.com/wafertools/.github/discussions).

## Features

- **Open** STDF, ATDF, CSV, JSON, and Parquet wafer map files, including `.gz` and `.zip` containers
- **Filter files** — point tsmap at a directory of hundreds of files and it scans only their header metadata (lot ID, part type, tester, wafer count, dates) into a sortable, filterable table, so you load just the handful you actually want. Mixed formats scan together, and a filter can be saved and reloaded
- **Multi-wafer** — all formats support multiple wafers; renders as a gallery automatically
- **Stats & findings** — yield, bin breakdown, ring/quadrant analysis, and spatial findings
- **Coordinate-less dies** — X/Y position is optional; a wafer with no reported position shows a CSV-exportable die list instead of a fabricated map, and a partly-positioned wafer shows both
- **Charts & Insights** — yield by wafer, bin pareto, per-test box plots and histograms, and a cross-test correlation matrix
- **Wafer splits** — attach a process corner or experiment group to each wafer, load and save the assignment as CSV, and group every chart by it
- **Test selector** — for files with many tests, a two-pass flow lets you choose which tests to import before the full parse; the **Lot ▾** menu's "Filter tests…" re-opens the selector after load
- **Open from a URL** — `tsmap --url <url> --url-format <format>` on desktop, `?dataUrl=&dataFormat=` on the browser build, or a `tsmap://open?url=…` deep link from your own web page. `--url-headers <file>` covers data APIs that authenticate via a header. See [Integrations](https://wafertools.github.io/tsmap/integrating-data-selection/) and the [live demo](https://wafertools.github.io/tsmap/demos/open-from-link.html)
- **File associations** — **Help → File associations…** (desktop) registers tsmap as the default handler for `.stdf`/`.atdf`/`.parquet`, so double-clicking one in a file manager opens it here
- **PNG export** — save any wafer map from the toolbar
- **Cross-platform** — Linux (Wayland/X11), macOS, Windows 11; also runs in the browser via WASM

## Supported formats

| Format | Parsing | Notes |
| ------ | ------- | ----- |
| STDF | Rust | Binary V4; MIR (lot meta), SDR (site map), WIR/WRR (wafer), PIR/PRR (die — hbin, sbin, x, y), PTR/FTR (parametric/functional test values) |
| ATDF | Rust | ASCII V4; MIR (lot meta), WIR/WRR (wafer), PIR/PRR (die — hbin, sbin, x, y), PTR/FTR (parametric/functional test values) |
| CSV | Rust | Column mapping step before render; supports wide and long (pivot) formats |
| JSON | Rust | Flat array or nested `[{ wafer fields, results: [{die}] }]`; same mapping step as CSV |
| Parquet | Rust | Typed, columnar; same mapping step as CSV/JSON with a type-mismatch hint. `snappy`/`gzip`/`lz4`/`brotli` on desktop and web; `zstd` desktop-only |

## Installing past security warnings

tsmap is free and open source, but its installers are **not code-signed** — signing certificates cost money and grant no extra safety, only a vendor's stamp. As a result, your OS may warn that the app is from an "unknown publisher" or is "possibly dangerous." This is expected. The steps below let you install anyway. If you'd rather avoid installing at all, the [web version](https://wafertools.github.io/tsmap/) runs entirely in your browser with no download.

### Windows

Running `tsmap-<version>-windows-x64.msi` (or the `-setup.exe` installer) triggers a blue **"Windows protected your PC"** SmartScreen dialog:

1. Click **More info**.
2. Click **Run anyway**.

The warning appears because the installer has no signature and no download reputation yet; it will fade as more people install the app.

### macOS

macOS Gatekeeper blocks unsigned apps by default with **"tsmap can't be opened because it is from an unidentified developer."** To open it:

1. In Finder, locate **tsmap** in Applications.
2. **Right-click** (or Control-click) the app and choose **Open**.
3. Click **Open** in the dialog that appears.

You only need to do this once — macOS remembers the choice.

If macOS instead says the app is **"damaged and can't be opened"** (common on Apple Silicon for downloaded unsigned apps), clear the quarantine flag in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/tsmap.app
```

### Linux

`.AppImage`, `.deb`, and `.rpm` builds run normally; any warning is just a browser download nag. For `.AppImage`, mark it executable first:

```bash
chmod +x tsmap-*-linux-x86_64.AppImage
./tsmap-*-linux-x86_64.AppImage
```

To verify a download is intact, compare its checksum against the one published on the [releases page](https://github.com/wafertools/tsmap/releases).

## Development

```bash
npm install
npm run tauri dev       # full Tauri app (Rust + frontend)
npm run dev:web         # web version at http://localhost:5301 (uses WASM parser)
cargo check             # type-check Rust (run from src-tauri/)
npx tsc --noEmit        # type-check TypeScript
cargo test              # run parser tests (run from packages/parsers/)
```

### Generating test files

```bash
python3 scripts/generate_stdf.py /tmp/test.stdf         # synthetic STDF — 3 wafers, 4 tests
python3 scripts/generate_stdf_large.py /tmp/large.stdf  # large STDF — 25 wafers, 50 tests, ~10k dies/wafer (341 MB)
python3 scripts/generate_atdf.py /tmp/test.atdf         # synthetic ATDF — same structure
```

### Building and publishing the WASM parser package

The parsers compile to a shared crate (`packages/parsers`) that targets both native Tauri and WASM. The published npm package is [`@wafertools/testdata-parser`](https://www.npmjs.com/package/@wafertools/testdata-parser).

Prerequisites: `wasm-pack` (`cargo install wasm-pack`) and the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`).

```bash
cd packages/parsers

# Build
wasm-pack build --target web -s wafertools --no-default-features --features wasm

# Publish
cd pkg
npm publish --access public
```

After publishing a new version, update tsmap to use it:

```bash
# from repo root
npm install @wafertools/testdata-parser@latest
npx tsc --noEmit   # verify types still resolve
```

## Architecture

```text
src/
  main.ts             — app entry: file open, two-pass test selector, renderWafers, chart view
  platform.ts         — platform adapter: Tauri IPC (desktop) or WASM-in-a-Worker (browser)
  parserWorker.ts     — web-only module worker running the WASM parsers off the UI thread
  lib.ts              — pure, DOM-free helpers extracted from main.ts for testability
  types.ts            — shared types: ParsedFile, WaferData, TestDef, LotMeta
  guideExtension.ts   — GENERATED (scripts/build-user-guide.mjs): tsmap's own guide
                        content, folded into wmap's guide window via userGuideExtension

  mappingUI.ts        — CSV/JSON/Parquet column mapping overlay
  multiFileUI.ts      — multi-file rename and append confirmation
  testSelectorUI.ts   — test selector overlay for large STDF/ATDF files
  fileFilterUI.ts     — "Filter files…": header-only metadata scan of a large batch
  filterTable.ts      — generic sortable/filterable table behind the file filter
  fileAssociationsUI.ts — "File associations…" dialog (Tauri only)
  splits.ts / splitsUI.ts — wafer splits: a user-assigned grouping axis over metadata
  waferGeometry.ts / waferGeometryUI.ts — wmap's wafer diameter + edge-exclusion band (mm), global values
  binDefs.ts          — hard/soft bin names + pass/fail flags, overriding HBR/SBR or supplying them for CSV/JSON/Parquet
  definitionsTemplatesUI.ts — "Definitions file formats…": save example test/splits/bin-definitions files with nothing loaded
  metadata.ts         — faceting metadata: distinct wafer-provenance values to group by
  recentFiles.ts      — recently opened file sets on the empty state (desktop only)

  anchoredMenu.ts     — shared popup menu shell for the Recent / Help / Lot toolbar menus
  menuSelect.ts       — themed replacement for a grouped native <select> (WebKitGTK)
  modal.ts            — shared app modal: backdrop, header chrome, Esc/F, focus management
  tooltip.ts          — shared themed hover tooltip for tsmap's own chrome
  theme.ts            — theme selection, persistence, and re-render notification
  icons.ts            — shared Lucide icon set, aligned with wmap's own iconography
  charts/             — yield heatmap, bin pareto, box plot, histogram charts

packages/parsers/     — shared Rust crate (native + WASM targets), published as
                        @wafertools/testdata-parser
  src/types.rs        — DieResult, WaferData, ParsedStdf, LotMeta, TestDef
  src/parse_stdf.rs   — STDF V4 binary parser; first-pass scan, filtered parse, file meta
  src/parse_atdf.rs   — ATDF ASCII parser; first-pass scan, filtered parse, file meta
  src/parse_csv.rs    — CSV/TSV parser with column mapping
  src/parse_json.rs   — JSON array parser with column mapping
  src/parse_parquet.rs — Parquet parser with column mapping; row-oriented, no arrow dep
  src/test_identity.rs — stable test numbering derived from test name / source column
  src/read_file.rs    — read_bytes / read_text, plus maybe_gunzip transparent .gz handling

src-tauri/src/
  lib.rs              — app setup: single-instance, tsmap:// scheme registration, and
                        --url resolution before the window opens
  cli_files.rs        — CLI parsing: positional paths, --list/--tests/--splits,
                        --url/--url-format/--url-headers, and the tsmap:// link form
  commands/           — thin Tauri async wrappers over packages/parsers
    parse_{stdf,atdf,csv,json,parquet}.rs   — per-format parse + header commands
    parse_{stdf,atdf}_filtered.rs           — filtered parse for a chosen test subset
    {stdf,atdf}_test_names.rs               — first-pass test name scan
    {stdf,atdf}_file_meta.rs                — header-only metadata scan for Filter files
    fetch_url.rs        — fetch --url / tsmap:// data to a temp file before the window opens
    file_associations.rs — register/unregister default handler (Windows registry, xdg-mime)
    extract_archive.rs  — extract_archive(path), cleanup_extract()
    read_file.rs        — re-exports the shared crate's read_bytes / read_text
    read_text_file.rs   — plain text file read for the frontend
    last_dir.rs         — remembers the last directory used in a file dialog
    get_startup_files.rs — files passed on the command line at launch
    respawn_new_instance.rs — relaunch for the single-instance handler
    write_temp_html.rs  — opens wmap HTML reports

scripts/
  generate_*.py       — synthetic STDF/ATDF/CSV/JSON/Parquet fixtures and benchmarks
  capture-screenshots.mjs — drives the web build to regenerate the docs screenshots
  run-scenario.mjs    — deterministic, assertion-checked replay of a scripted investigation
  check-*.js/.mjs     — release guards: version sync, wmap/parser published, config drift
```

## Dependencies

Seven npm runtime dependencies, and no bundled UI framework or third-party charting library.

**Frontend (npm)**

- [`@wafertools/wafermap`](https://www.npmjs.com/package/@wafertools/wafermap) — wafer map rendering and analysis
- [`@wafertools/testdata-parser`](https://www.npmjs.com/package/@wafertools/testdata-parser) — the WASM build of `packages/parsers`, used by the browser build
- [`@tauri-apps/api`](https://www.npmjs.com/package/@tauri-apps/api) — Tauri IPC
- [`@tauri-apps/plugin-dialog`](https://www.npmjs.com/package/@tauri-apps/plugin-dialog) · [`plugin-fs`](https://www.npmjs.com/package/@tauri-apps/plugin-fs) · [`plugin-opener`](https://www.npmjs.com/package/@tauri-apps/plugin-opener) — JS bindings for the plugins below
- [`fflate`](https://www.npmjs.com/package/fflate) — zip extraction in the browser build

**Rust — shared parser crate** (`packages/parsers`, published to npm as `@wafertools/testdata-parser`; builds for both native and `wasm32`)

- [`parquet`](https://crates.io/crates/parquet) — Parquet reader, used through its row-oriented `record` API (no `arrow` dependency, which keeps the wasm bundle small). `zstd` is enabled on native only, since its C library needs a cross-compiler toolchain the wasm build can't assume
- [`csv`](https://crates.io/crates/csv) — CSV/TSV reader
- [`flate2`](https://crates.io/crates/flate2) — transparent `.gz` decompression (pure-Rust backend, so it builds for wasm)
- [`serde`](https://crates.io/crates/serde) · [`serde_json`](https://crates.io/crates/serde_json) · [`indexmap`](https://crates.io/crates/indexmap) — data model and JSON parsing
- [`wasm-bindgen`](https://crates.io/crates/wasm-bindgen) · [`serde-wasm-bindgen`](https://crates.io/crates/serde-wasm-bindgen) — the browser build's bridge

The STDF and ATDF parsers are written in this crate, not taken from a library — `rust-stdf` was the original STDF dependency but its ATDF support proved unusable, so both formats are now parsed here.

**Rust — desktop shell** (`src-tauri`)

- [`tauri`](https://crates.io/crates/tauri) v2 — application shell
- [`tauri-plugin-dialog`](https://crates.io/crates/tauri-plugin-dialog) — native file open/save dialogs (all platforms). On Linux its `rfd` backend uses the XDG desktop portal, falling back to `zenity` if present
- [`tauri-plugin-fs`](https://crates.io/crates/tauri-plugin-fs) · [`tauri-plugin-opener`](https://crates.io/crates/tauri-plugin-opener) — filesystem access and opening files/URLs in the OS default handler
- [`tauri-plugin-single-instance`](https://crates.io/crates/tauri-plugin-single-instance) — forwards a second launch (file double-click, deep link) into the running window
- [`tauri-plugin-deep-link`](https://crates.io/crates/tauri-plugin-deep-link) — the `tsmap://open?url=…` URL scheme
- [`reqwest`](https://crates.io/crates/reqwest) — fetches `--url` data (rustls, no OpenSSL system dependency). Deliberately used instead of `tauri-plugin-http`, whose scope system needs a pre-configured allow-list and can't express "fetch whatever URL the caller supplies"
- [`zip`](https://crates.io/crates/zip) — `.zip` archive extraction
- [`winreg`](https://crates.io/crates/winreg) (Windows only) — file-association registration under `HKEY_CURRENT_USER\Software\Classes`

## Licence

[MIT](LICENSE) — © 2026 Paul Robins. The shared parser crate published as
[`@wafertools/testdata-parser`](https://www.npmjs.com/package/@wafertools/testdata-parser)
is covered by the same licence.

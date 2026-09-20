# Development

## Prerequisites

- Node 22+
- Rust (stable) + `cargo`
- Tauri CLI v2 (`npm install` installs it as a dev dependency)
- For the desktop app on Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`
- For rebuilding the WASM parser: `wasm-pack` and the `wasm32-unknown-unknown` target

```bash
cargo install wasm-pack
rustup target add wasm32-unknown-unknown
```

## Running

```bash
npm install

npm run tauri dev    # desktop app — Rust + frontend hot-reload
npm run dev:web      # browser version at http://localhost:5301
```

## Type checking

```bash
npx tsc --noEmit     # TypeScript
cargo check          # Rust (run from src-tauri/)
cargo test           # parser tests (run from packages/parsers/)
```

## Generating test files

```bash
python3 scripts/generate_stdf.py        # synthetic STDF — 3 wafers, 4 tests
python3 scripts/generate_stdf_large.py  # large STDF — 25 wafers, 50 tests, ~10k dies/wafer
python3 scripts/generate_atdf.py        # synthetic ATDF — same structure
python3 scripts/generate_parquet.py     # synthetic Parquet (requires pyarrow) — 3 wafers, 10 tests; --large, --correlated, --codec also available
python3 scripts/generate_sweep_csv.py   # die-count sweep CSVs — the fixtures the web-path ceiling is measured against
```

Measuring per-die memory:

```bash
node scripts/heap-probe.mjs large.stdf   # exact backing-store bytes + V8 elements kind per die container
```

Use it rather than `performance.memory` for any "why is this object expensive" question — a
whole-heap delta supports confident wrong answers, and did three times on 2026-09-20.

**Test numbers come from `scripts/fixture_testnums.py`, not from each generator.** A die's readings are a JS object keyed by test number, and V8 stores integer-like keys as array indices rather than hash keys, so the *values* of the test numbers change per-die heap cost by up to 3x — small sequential numbers around 1,000 are the worst case. No production path reaches it (CSV/JSON numbers are hashed above 1,000,000 by `test_identity.rs`; STDF/ATDF carry the program's own numbers, which are large), but benchmark harnesses that hand-write a mapping did, which made them unrepresentative. Read that module's docstring before changing the numbering.

Files land in `~/.cache/wafertools/fixtures/` — override with `WAFERTOOLS_FIXTURES`, or pass a path as the first argument. Not `/tmp`: that is a RAM-backed tmpfs on systemd distros, and these files are large (the STDF one is 341 MB).

## Architecture

```
src/
  main.ts          — app entry: file open, two-pass test selector, renderWafers, map/gallery view
  platform.ts      — platform adapter: Tauri IPC (desktop) or WASM-in-a-Worker (browser)
  parserWorker.ts  — web-only module worker running the WASM parsers off the UI thread
  mappingUI.ts     — CSV/JSON/Parquet column mapping overlay
  multiFileUI.ts   — multi-file rename and append confirmation
  testSelectorUI.ts — test selector overlay for large STDF/ATDF files
  types.ts         — shared types: ParsedFile, WaferData, TestDef, LotMeta

packages/parsers/  — shared Rust crate, compiles for native Tauri and WASM
  src/types.rs     — DieResult, WaferData, ParsedStdf, LotMeta, TestDef
  src/parse_stdf.rs — STDF V4 binary parser; includes first-pass scan and filtered parse
  src/parse_atdf.rs — ATDF ASCII parser; includes first-pass scan and filtered parse
  src/parse_csv.rs  — CSV/TSV parser with column mapping
  src/parse_json.rs — JSON array parser with column mapping
  src/parse_parquet.rs — Parquet parser (row-oriented, no arrow dep) with the same column mapping
  src/read_file.rs  — read_bytes / read_text with transparent .gz decompression

src-tauri/src/commands/  — thin Tauri async wrappers over packages/parsers
  parse_stdf.rs      — parse_stdf(path)
  parse_atdf.rs      — parse_atdf(path)
  parse_csv.rs       — csv_headers(path), parse_csv(path, mapping)
  parse_json.rs      — json_headers(path), parse_json(path, mapping)
  parse_parquet.rs   — parquet_headers(path), parse_parquet(path, mapping)
  stdf_test_names.rs — stdf_test_names(path) — first-pass test name scan
  atdf_test_names.rs — atdf_test_names(path) — first-pass test name scan
  parse_stdf_filtered.rs — parse_stdf_filtered(path, selected) — filtered parse
  parse_atdf_filtered.rs — parse_atdf_filtered(path, selected) — filtered parse
  extract_archive.rs — extract_archive(path), cleanup_extract()
  write_temp_html.rs — write_temp_html(html)
```

## Building and publishing the WASM parser

The parsers compile to `@wafertools/testdata-parser` on npm. The package is consumed by
both the tsmap web version and can be used independently.

Test a change against the web build without publishing anything, via a local link (from
the repo root — this builds `packages/parsers/pkg/` and symlinks
`node_modules/@wafertools/testdata-parser` to it):

```bash
npm run parser:link    # build (dev/unoptimized) + link
npm run parser:build   # rerun after each Rust edit
npm run dev:web        # picks up the linked build immediately
npm run parser:unlink  # restore the published package — required before any release
```

To actually publish, bump `packages/parsers/Cargo.toml` and then, from the repo root:

```bash
npm run parser:publish -- --otp=YOUR_6_DIGIT_CODE
```

**Never publish by hand from `pkg/`, and never build it with a bare `wasm-pack build`.**
`pkg/` is wasm-pack output: every build regenerates its `package.json`, which carries an
explicit `files` list, and npm publishes exactly that list. `scripts/sync-parser-pkg.mjs`
puts `llms.txt` into `pkg/` *and* into `files` — a bare build drops both, and the publish
succeeds anyway, shipping a package with no `llms.txt`. npm force-includes `README.md`
whatever `files` says, so the tarball still looks plausible. **This is not hypothetical:
it is how 0.11.0 shipped**, and npm versions are immutable, so the repair was 0.11.1.

`parser:publish` runs the optimised build, the sync, and `scripts/publish-parser.mjs`,
which refuses to publish unless every extra is both in `pkg/` and in `files`, and unless
`pkg/package.json`'s version matches the crate's.

After publishing a new version:

```bash
# from repo root
npm install @wafertools/testdata-parser@^NEW_VERSION   # pin the version you published
npm run parser:unlink                                  # if you were linked
npx tsc --noEmit
npm run tag:parser                                     # after committing the pin — it tags HEAD
```

## Building for deployment

```bash
npm run build:web   # outputs to dist/ — deploy to any static host
```

The CI workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages
automatically on every push to `main`.

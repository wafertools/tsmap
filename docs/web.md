# tsmap in the browser

The browser version of tsmap is available at
**[wafertools.github.io/tsmap/app/](https://wafertools.github.io/tsmap/app/)**.

It uses a WebAssembly build of the same Rust parser as the desktop app. Files are parsed
entirely in your browser — nothing is sent to a server. Parsing runs in a background Web
Worker, so the interface stays responsive even while a large file loads.

## Opening files

Click **Open files** to pick one or more files from your device, or drag and drop files
anywhere in the window. Multiple files are loaded as a batch and merged into a single
gallery, with a rename step to label each wafer.

For a large set, **Filter files…** scans just the header metadata of every file you pick —
lot ID, part type, wafer count and so on — and shows them in a sortable, filterable table so
you can load only the ones you want. Files are read a few at a time and released again, so
scanning a big batch doesn't hold it all in memory.

For STDF and ATDF files with more than 200 tests, a test selector overlay appears before
parsing — pick which tests to import, then click **Import**. A **Filter tests…** button in
the toolbar lets you change your selection at any time after load.

## Try it with sample data

No wafer files to hand? Download one of these synthetic samples and open it in the app:

- [tsmap-sample.stdf](samples/tsmap-sample.stdf) — STDF: 3 wafers, ~500 dies each, 20 tests.
- [tsmap-sample.atdf](samples/tsmap-sample.atdf) — ATDF: the same dataset in ASCII form.
- [tsmap-sample.csv](samples/tsmap-sample.csv) — CSV: the same dataset; opening it shows the
  column-mapping overlay.
- [tsmap-sample.json](samples/tsmap-sample.json) — JSON: the same dataset as per-die
  `testValues`.
- [tsmap-sample.parquet](samples/tsmap-sample.parquet) — Parquet: the same shape (3 wafers,
  ~500 dies each, 20 tests), snappy-compressed; opening it shows the same column-mapping
  overlay as CSV/JSON.
- [tsmap-correlated.stdf](samples/tsmap-correlated.stdf) — STDF: 5 wafers, ~200 dies each, 30
  tests with *designed* correlations spanning a full range of Pearson r. Open **Charts** to
  see the correlation matrix and scatter plots come to life.
- [tsmap-correlated.parquet](samples/tsmap-correlated.parquet) — Parquet: the same designed
  correlation dataset.

All seven contain no real device data — they are generated for demonstration.

Or try the **[live demo of opening tsmap from a link](demos/open-from-link.html)** — it
builds the `?dataUrl=` link for each of these samples for you and opens the browser build
directly, alongside the desktop `tsmap://` equivalent.

## Supported formats

All five formats are supported in the browser:

- **STDF** / **ATDF** — parsed directly from binary/text bytes via WASM
- **CSV** / **JSON** / **Parquet** — column mapping overlay appears before rendering; the
  mapping is saved per column layout and restored automatically next time. Parquet's
  `zstd` codec is desktop-only — every other codec (`snappy`, `gzip`, `lz4`, `brotli`) works
  in the browser too
- **Gzip** (`.gz`) — decompressed in-browser using the native `DecompressionStream` API
- **Zip** (`.zip`) — extracted in-browser using [fflate](https://github.com/101arrowz/fflate)

## Differences from the desktop app

| Feature | Browser | Desktop |
|---------|---------|---------|
| File parsing | WASM in a Web Worker (same logic) | Native Rust (off-thread) |
| File picker | Browser dialog | Native OS dialog |
| Last used directory | — | Remembered between sessions |
| Drag and drop | Yes | Yes |
| PNG export | Browser download | Native save dialog |
| HTML reports | Opens in new tab | Writes to temp file |
| Zip extraction | In-browser (fflate) | Rust (native) |
| Offline use | Yes (once loaded) | Yes |
| Opening data from a URL | `?dataUrl=&dataFormat=` query param, subject to the target server's CORS policy | `--url`/`--url-format` CLI flags, a `tsmap://open?url=...&format=...` link, or both — plus optional header-based auth via `--url-headers` |
| File associations (open `.stdf`/`.atdf`/`.parquet` by double-click) | Not available | **Help → File associations…** |

## Browser requirements

Any modern browser with WebAssembly and `DecompressionStream` support — Chrome 80+,
Firefox 113+, Safari 16.4+, Edge 80+.

## Running locally

```bash
git clone https://github.com/wafertools/tsmap
cd tsmap
npm install
npm run dev:web   # opens at http://localhost:5301
```

Requires Node 22+ and Rust (for rebuilding the WASM parser — not needed just to run the dev server).

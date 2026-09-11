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

For every STDF and ATDF file, a test selector overlay appears before parsing — pick which
tests to import, then click **Import**. What varies with size is only whether the tests
arrive already ticked: a small lot is pre-selected, while a large one starts empty so that
importing everything can never be the accidental default. A **Setup ▾ → Tests…** entry in the
toolbar lets you change your selection at any time after load.

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
| Last used directory | — | Remembered between sessions (all three platforms as of 0.1.34; before that, desktop Windows silently did not) |
| Drag and drop | Yes | Yes |
| PNG export | Browser download | Native save dialog |
| HTML reports | Opens in new tab | Writes to temp file |
| Zip extraction | In-browser (fflate) | Rust (native) |
| Offline use | Yes once loaded, but only while the browser cache holds it — [host it yourself](#hosting-tsmap-on-your-own-server) for a dependable offline install | Yes |
| Opening data from a URL | `?dataUrl=&dataFormat=` query param, subject to the target server's CORS policy | `--url`/`--url-format` CLI flags, a `tsmap://open?url=...&format=...` link, or both — plus optional header-based auth via `--url-headers` |
| File associations (open `.stdf`/`.atdf`/`.parquet` by double-click) | Not available | **Help → File associations…** |

## Browser requirements

Any modern browser with WebAssembly and `DecompressionStream` support — Chrome 80+,
Firefox 113+, Safari 16.4+, Edge 80+.

## Hosting tsmap on your own server

The browser build is a plain static site, so you can serve it from your own intranet instead
of using ours. This is the right choice when the machines that need tsmap cannot reach the
public internet, or when policy says lot data must not touch an external origin.

It is also the only *dependable* offline option in a browser. The hosted app keeps working
without a network once loaded, but only because the browser cached it — a hard refresh, an
evicted cache, or a different browser profile all send it looking for
`wafertools.github.io` again. A copy on your own server has no such dependency.

**Download** `tsmap-<version>-web.zip` from the
[latest release](https://github.com/wafertools/tsmap/releases/latest). It is the same
application published at [/app/](https://wafertools.github.io/tsmap/app/), packaged for
self-hosting.

1. Unpack it into any directory your web server serves, e.g. `/var/www/html/tools/tsmap/`.
2. Browse to it: `http://your-server/tools/tsmap/`.

That is the whole procedure. There is no installer, no server-side component, no database and
no build step. The bundle uses relative paths, so it works from the server root or any
subdirectory, over http or https. It requests no external site at any point — installation
included — and needs no cookies, no special headers and no cross-origin isolation.

Files are parsed in the browser by the same WebAssembly parser the hosted version uses, so
nothing is uploaded to your server either. It only ever serves the application.

### Two things that catch people out

**`.wasm` must be served as `application/wasm`.** The parser is WebAssembly; if the server
sends it as `text/plain` or `application/octet-stream` the browser refuses to compile it and
tsmap opens to a blank page. nginx, Apache and Python's `http.server` are correct out of the
box. **IIS is not** — add the MIME type once, under *Server → MIME Types → Add…*, mapping the
extension `.wasm` to `application/wasm`.

**It must be served over `http://` or `https://`.** Opening `index.html` from the filesystem
(a `file://` URL) will not work — browsers block module scripts and web workers on that
scheme. Any web server will do.

### Updating

Replace the directory's contents with a newer bundle. Nothing persists on the server; each
user's preferences live in their own browser.

## Running locally

```bash
git clone https://github.com/wafertools/tsmap
cd tsmap
npm install
npm run dev:web   # opens at http://localhost:5301
```

Requires Node 22+ and Rust (for rebuilding the WASM parser — not needed just to run the dev server).

# Parser API

tsmap's file parsing is not built into the app — it lives in a standalone package,
**[`@wafertools/testdata-parser`](https://www.npmjs.com/package/@wafertools/testdata-parser)**,
which you can use in your own projects.

One Rust source compiles two ways: to WebAssembly for the browser (what the
[web app](web.md) runs, in a background worker), and natively for the desktop app's Tauri
backend. Both paths produce identical results from identical input — there is no
"browser version" of the parsing logic to drift out of step.

## What it parses

| Format | Notes |
| --- | --- |
| **STDF** | Binary. Both byte orders, detected from the FAR record |
| **ATDF** | The ASCII equivalent of STDF |
| **CSV** | Wide (one column per test) or tall (one row per die × test) |
| **JSON** | Array of per-die records |

Gzip-compressed input is decompressed transparently for every format — callers never
branch on compression.

All four parse to **one shared output shape**. There is no format-specific result type, so
a consuming application writes its rendering and analysis code once.

## Install

```bash
npm install @wafertools/testdata-parser
```

```js
import init, { parse_stdf } from '@wafertools/testdata-parser';

await init();
const bytes = new Uint8Array(await file.arrayBuffer());
const parsed = parse_stdf(bytes);
```

## Full API reference

The complete reference — every WASM and native entry point with signatures, the
`CsvMapping` input shape, the `ParsedStdf` / `ScanResult` return shapes, and the two-pass
scan-then-filter flow for large files — is the package README:

**[github.com/wafertools/tsmap/blob/main/packages/parsers/README.md](https://github.com/wafertools/tsmap/blob/main/packages/parsers/README.md)**

It is also rendered on
[the npm package page](https://www.npmjs.com/package/@wafertools/testdata-parser).
That README is the single source of truth for the API and ships with the package, so it
cannot fall out of step with the version you installed — this page deliberately does not
duplicate the type definitions.

## Two-pass parsing, briefly

Production STDF files routinely carry far more tests than a caller wants in memory. The
package is designed around a two-pass flow rather than one all-or-nothing parse:

1. `stdf_test_names` / `atdf_test_names` — a fast scan returning every test definition and
   the die count, with no per-die value accumulation.
2. The caller (or a user, via a selection UI) picks a subset of test numbers.
3. `parse_stdf_filtered` / `parse_atdf_filtered` — a full parse that still walks every
   record, so bin, wafer and lot data are complete, but accumulates test values only for
   the selected tests.

This is what tsmap's own [test selector](user-guide.md) is built on. See the README for the
one caveat: merging first-pass `testDefs` back into the filtered result, so tests seen only
on stop-on-fail dies aren't lost from the metadata.

## Performance

On a 341 MB STDF (266k dies × 51 tests) the native parser reads roughly 95–150 MB/s
depending on the machine, parsing the whole file in 2.3–3.6 s. The WASM build is slower but
runs off the main thread, so a large file never freezes the page.

## Building it yourself

See [Development](development.md#building-and-publishing-the-wasm-parser) for the
`wasm-pack` build and publish steps.

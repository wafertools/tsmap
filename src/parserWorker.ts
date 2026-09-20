// Web parser worker — runs the testdata-parser WASM module off the main thread
// so large STDF/ATDF files don't freeze the page. The Tauri build parses in
// native Rust (spawn_blocking) and never loads this worker.
//
// Protocol: the host posts { id, op, bytes, mapping?, selected? } and transfers
// the bytes ArrayBuffer. The worker replies { id, ok, result } or { id, ok:false,
// error }. Requests are correlated by id. A panic inside WASM becomes a trap that
// fires the worker's global 'error' event; the host side rejects all pending
// promises in that case (see platform.ts).
//
// **Per-wafer streaming was tried here and removed** (2026-09-19). The theory was
// that `postMessage`'s structured clone doubles peak memory, so the worker should
// post one wafer at a time and release each as it went. It is measurably NOT the
// constraint: streaming a 400k-die lot and *discarding* on the main thread peaks at
// 105 MB and works, so the transfer is not what fails — what fails is the main
// thread holding a whole lot as JS objects (~5 KB/die) while this worker is still
// resident. Adding backpressure did not change that, and the streaming protocol
// cost ~12% throughput for no benefit. See tsmap's COLUMNAR_DATA.md section 3d
// before trying it again.

import type { CsvMapping } from './mappingUI';

type WasmModule = typeof import('@wafertools/testdata-parser');

export type ParserOp =
  | 'parseStdf'
  | 'parseAtdf'
  | 'parseCsv'
  | 'parseJson'
  | 'parseParquet'
  | 'parquetHeaders'
  | 'parquetDistinctCount'
  | 'stdfTestNames'
  | 'atdfTestNames'
  | 'stdfFileMeta'
  | 'atdfFileMeta'
  | 'parseStdfFiltered'
  | 'parseAtdfFiltered';

export interface ParserRequest {
  id: number;
  op: ParserOp;
  bytes: Uint8Array;
  mapping?: CsvMapping;
  selected?: number[];
  columns?: string[];
}


export type ParserResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; code?: string };

let wasmPromise: Promise<WasmModule> | null = null;

function loadWasm(): Promise<WasmModule> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      // Explicit asset URL so Vite resolves and copies the .wasm correctly under
      // both `dev:web` and the relative-base GitHub Pages build. Vite rewrites
      // import.meta.url inside a module worker, so this resolves next to the
      // bundled worker chunk. Mirrors loadWasm() in platform.ts.
      const wasmUrl = new URL(
        '@wafertools/testdata-parser/testdata_parser_bg.wasm',
        import.meta.url,
      );
      const mod = await import('@wafertools/testdata-parser');
      // Pass { module_or_path } — the bare-URL form is deprecated in wasm-bindgen.
      await (mod.default as (opts: { module_or_path: URL }) => Promise<unknown>)({
        module_or_path: wasmUrl,
      });
      return mod;
    })();
  }
  return wasmPromise;
}

/**
 * A request field an op cannot run without.
 *
 * `mapping`, `selected` and `columns` are optional on `ParserRequest` because
 * most ops need none of them, so the three that do had been reading them
 * defensively — `req.selected ?? []` and a possibly-undefined `mapping`. Every
 * caller in `platform.ts` supplies the field its op needs, so those fallbacks
 * could never fire in a correct call and existed only to turn a wiring mistake
 * into a plausible wrong answer: `selected ?? []` is a filtered parse that
 * silently accumulates no test values at all, and an undefined mapping is a CSV
 * parse with no columns assigned.
 *
 * The parser types caught this the moment the crate started shipping real
 * declarations — the `any` returns of earlier versions type-checked it happily.
 */
function required<T>(value: T | undefined, field: string, op: ParserOp): T {
  if (value === undefined) {
    throw new Error(`parser worker: '${op}' requires '${field}', which the request did not carry`);
  }
  return value;
}

function run(wasm: WasmModule, req: ParserRequest): unknown {
  const mapping = () => required(req.mapping, 'mapping', req.op);
  const selected = () => required(req.selected, 'selected', req.op);
  switch (req.op) {
    case 'parseStdf':         return wasm.parse_stdf(req.bytes);
    case 'parseAtdf':         return wasm.parse_atdf(req.bytes);
    case 'parseCsv':          return wasm.parse_csv(req.bytes, mapping());
    case 'parseJson':         return wasm.parse_json(req.bytes, mapping());
    case 'parseParquet':      return wasm.parse_parquet(req.bytes, mapping());
    case 'parquetHeaders':    return wasm.parquet_headers(req.bytes);
    case 'parquetDistinctCount':
      return wasm.parquet_distinct_count(req.bytes, required(req.columns, 'columns', req.op));
    case 'stdfTestNames':     return wasm.stdf_test_names(req.bytes);
    case 'atdfTestNames':     return wasm.atdf_test_names(req.bytes);
    case 'stdfFileMeta':      return wasm.stdf_file_meta(req.bytes);
    case 'atdfFileMeta':      return wasm.atdf_file_meta(req.bytes);
    case 'parseStdfFiltered': return wasm.parse_stdf_filtered(req.bytes, selected());
    case 'parseAtdfFiltered': return wasm.parse_atdf_filtered(req.bytes, selected());
  }
}

self.onmessage = async (e: MessageEvent<ParserRequest>) => {
  const req = e.data;
  const post = (res: ParserResponse) => (self as unknown as Worker).postMessage(res);
  try {
    const wasm = await loadWasm();
    const result = run(wasm, req);
    post({ id: req.id, ok: true, result });
  } catch (err) {
    // The parser throws a real Error carrying a stable `code`; postMessage
    // cannot clone an Error's own properties, so the code travels as its own
    // field or the host loses the one part of the failure it can branch on.
    //
    // Deliberately not `errMsg` from lib.ts, unlike every other catch site in
    // the app: nothing here can throw the serialised `{ code, message }` shape,
    // because that one only comes from a Tauri `invoke` and this worker only
    // ever calls WASM. A narrow conversion over the one shape that can occur,
    // rather than pulling lib.ts into the worker bundle for a case that cannot.
    const res: ParserResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: typeof (err as { code?: unknown })?.code === 'string'
        ? (err as { code: string }).code
        : undefined,
    };
    post(res);
  }
};

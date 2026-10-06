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
// A parse's result is one columnar buffer, transferred to the page without a
// copy. The browser build's size limit is this worker's WebAssembly memory:
// 32-bit, so 4 GB, at ~80 bytes per test value (see `WEB_VALUE_BUDGET` in
// lib.ts). A parse that exhausts it traps; that is reported as its own error.

import type { CsvMapping } from './mappingUI';
import { WEB_VALUE_BUDGET } from './webLimits';

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
  /** `parquetDistinctCount`: count a row blank in every named column as a value, instead of skipping it. */
  blankIsAValue?: boolean;
}


export type ParserResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; code?: string };

let wasmPromise: Promise<WasmModule> | null = null;
/** The parser's linear memory, once loaded: its size tells an out-of-memory trap from any other. */
let wasmMemory: WebAssembly.Memory | undefined;

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
      const exports = await (mod.default as (opts: { module_or_path: URL }) => Promise<{ memory?: WebAssembly.Memory }>)({
        module_or_path: wasmUrl,
      });
      wasmMemory = exports?.memory;
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
      return wasm.parquet_distinct_count(req.bytes, required(req.columns, 'columns', req.op), req.blankIsAValue ?? false);
    case 'stdfTestNames':     return wasm.stdf_test_names(req.bytes);
    case 'atdfTestNames':     return wasm.atdf_test_names(req.bytes);
    case 'stdfFileMeta':      return wasm.stdf_file_meta(req.bytes);
    case 'atdfFileMeta':      return wasm.atdf_file_meta(req.bytes);
    case 'parseStdfFiltered': return wasm.parse_stdf_filtered(req.bytes, selected());
    case 'parseAtdfFiltered': return wasm.parse_atdf_filtered(req.bytes, selected());
  }
}

/** Within 64 MB of WebAssembly's 4 GB: memory grows in pages, so a full parser stops just short. */
const OUT_OF_MEMORY_BYTES = 4 * 2 ** 30 - 64 * 2 ** 20;

self.onmessage = async (e: MessageEvent<ParserRequest>) => {
  const req = e.data;
  const post = (res: ParserResponse) => (self as unknown as Worker).postMessage(res);
  try {
    const wasm = await loadWasm();
    const result = run(wasm, req);
    // A parse is a columnar buffer (a fresh copy out of wasm memory, owned by no
    // one else): transfer it, so it moves to the main thread instead of being
    // cloned and this worker never holds a second copy.
    if (result instanceof Uint8Array) {
      (self as unknown as Worker).postMessage({ id: req.id, ok: true, result } satisfies ParserResponse, [result.buffer]);
    } else {
      post({ id: req.id, ok: true, result });
    }
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
    // A trap with the parser's memory at WebAssembly's 4 GB limit is this build
    // running out of room, not a fault in the file: say so, and what to do. A
    // trap short of the limit is a parser bug (a Rust panic also traps) and keeps
    // its own message.
    if (err instanceof WebAssembly.RuntimeError && (wasmMemory?.buffer.byteLength ?? 0) >= OUT_OF_MEMORY_BYTES) {
      post({
        id: req.id,
        ok: false,
        code: 'wasm-out-of-memory',
        error: 'The browser version ran out of memory parsing this file: it can hold about '
          + `${Math.round(WEB_VALUE_BUDGET / 1e6)} million test values (dies × tests). Select fewer tests, `
          + 'load fewer wafers or files at once, or open it in the desktop app, which has no such limit.',
      });
      return;
    }
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

// `profile-webkit.mjs --profile`: the pure-JS path (parse, decode, build,
// analyse) run inside a worker. JavaScriptCore's sampling profiler writes its
// report only when a VM is destroyed, which a worker's is when it closes and
// the page's is not reliably. The parse runs here too rather than in the app's
// parser worker, so the decode lands in this profile; its WebAssembly frames
// are left out of the report. STDF and ATDF fixtures only (a CSV needs a mapping).
import init, { parse_atdf, parse_stdf } from '@wafertools/testdata-parser';
import { decodeColumns } from '@wafertools/testdata-parser/columnar.js';
import type { RustParsedFile } from '../src/platform';
import { buildAndAnalyse } from './profile-analyse';

// The page posts the fixture's file name, which picks the parser.
self.onmessage = async (e: MessageEvent<string>) => {
  const name = e.data;
  const t: Record<string, number> = {};
  try {
    if (!/\.(stdf|atdf)$/i.test(name)) throw new Error(`the worker profile reads STDF and ATDF fixtures, not ${name}`);
    await (init as (o: { module_or_path: URL }) => Promise<unknown>)({
      module_or_path: new URL('@wafertools/testdata-parser/testdata_parser_bg.wasm', import.meta.url),
    });
    const bytes = new Uint8Array(await (await fetch('/__profile-fixture')).arrayBuffer());
    let s = performance.now();
    const buffer = /\.atdf$/i.test(name) ? parse_atdf(bytes) : parse_stdf(bytes);
    t.parse = Math.round(performance.now() - s);
    s = performance.now();
    const parsed = decodeColumns(buffer) as unknown as RustParsedFile;
    t.decode = Math.round(performance.now() - s);
    buildAndAnalyse(parsed, (phase, ms) => { t[phase] = ms; });
    postMessage(t);
  } catch (e) {
    postMessage({ error: String(e) });
  }
  close();
};

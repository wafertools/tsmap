// Decodes the columnar buffer the parse functions return into a `ParsedStdf`.
// The encoder, and the full layout, is `src/columnar.rs`; the two ship together
// in this package so they cannot drift apart.

/** The format this decoder reads — `FORMAT` in `src/columnar.rs`. */
const FORMAT = 1;

const MISSING_I32 = -2147483648;
const MISSING_U32 = 4294967295;
const SUPERSEDES = [undefined, 'partId', 'position'];

/**
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {import('./testdata_parser.js').ParsedStdf}
 */
export function decodeParsed(input) {
  let bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  // Typed-array views need aligned offsets; a buffer that is itself a view at an
  // odd offset is copied once so every column below can be viewed in place.
  if (bytes.byteOffset % 8 !== 0) bytes = bytes.slice();
  const { buffer, byteOffset } = bytes;

  const headerLen = new DataView(buffer, byteOffset, 4).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLen)));
  if (header.columnarFormat !== FORMAT) {
    throw new Error(`testdata-parser: columnar format ${header.columnarFormat} is not the format ${FORMAT} this decoder reads — the parser and its decoder come from different versions`);
  }
  delete header.columnarFormat;
  const body = byteOffset + Math.ceil((4 + headerLen) / 8) * 8;

  for (const wafer of header.wafers) {
    const n = wafer.dieCount;
    const view = (c) => {
      const at = body + c.offset;
      switch (c.kind) {
        case 'i32': return new Int32Array(buffer, at, n);
        case 'u32': return new Uint32Array(buffer, at, n);
        case 'u8':  return new Uint8Array(buffer, at, n);
        case 'i8':  return new Int8Array(buffer, at, n);
        case 'f32': return new Float32Array(buffer, at, n);
        case 'f64': return new Float64Array(buffer, at, n);
        default: throw new Error(`testdata-parser: unknown column kind ${c.kind}`);
      }
    };
    const col = {};
    const values = [];
    const verdicts = [];
    for (const c of wafer.columns) {
      if (c.field === 'testValues') values.push([c.test, view(c)]);
      else if (c.field === 'testPass') verdicts.push([c.test, view(c)]);
      else col[c.field] = view(c);
    }
    const { x, y, dieIndex, hbin, sbin, siteNum, supersedes } = col;
    const partIds = wafer.partIds;

    // Fields assigned in one fixed order, so every die shares a shape.
    const results = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = {};
      if (x && x[i] !== MISSING_I32) d.x = x[i];
      if (y && y[i] !== MISSING_I32) d.y = y[i];
      if (dieIndex && dieIndex[i] !== MISSING_U32) d.dieIndex = dieIndex[i];
      if (hbin && hbin[i] !== MISSING_U32) d.hbin = hbin[i];
      if (sbin && sbin[i] !== MISSING_U32) d.sbin = sbin[i];
      if (siteNum && siteNum[i] !== MISSING_U32) d.siteNum = siteNum[i];
      if (partIds && partIds[i] != null) d.partId = partIds[i];
      if (supersedes && supersedes[i] !== 0) d.supersedes = SUPERSEDES[supersedes[i]];
      results[i] = d;
    }
    // Highest test number first. V8 picks an object's element storage from the
    // first integer-like key it receives: a small one (1001 is below its
    // 1024-slot gap limit) gets a holey array sized to the largest key, ~6 KB
    // for 50 readings at 1001–1050; a large one gets a dictionary, ~1.5 KB.
    // Enumeration order is unaffected — integer-like keys always enumerate
    // ascending — so this changes memory only.
    const byKeyDesc = (a, b) => Number(b[0]) - Number(a[0]);
    values.sort(byKeyDesc);
    verdicts.sort(byKeyDesc);
    for (const [key, v] of values) {
      for (let i = 0; i < n; i++) {
        const value = v[i];
        if (value === value) (results[i].testValues ??= {})[key] = value;  // NaN is missing
      }
    }
    for (const [key, v] of verdicts) {
      for (let i = 0; i < n; i++) {
        if (v[i] !== -1) (results[i].testPass ??= {})[key] = v[i] === 1;
      }
    }

    delete wafer.dieCount;
    delete wafer.columns;
    delete wafer.partIds;
    wafer.results = results;
  }
  return header;
}

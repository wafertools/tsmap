// Decodes the columnar buffer the parse functions return into a `ParsedStdf`.
// The encoder, and the full layout, is `src/columnar.rs`; the two ship together
// in this package so they cannot drift apart.

/** The format this decoder reads — `FORMAT` in `src/columnar.rs`. */
const FORMAT = 2;

const MISSING_I32 = -2147483648;
const MISSING_U32 = 4294967295;
const SUPERSEDES = [undefined, 'partId', 'position'];

/**
 * The buffer's header, and each wafer's columns as typed-array views over the
 * buffer (no copy). Shared by `decodeParsed` and `decodeColumns`.
 */
function readColumns(input) {
  let bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  // Typed-array views need aligned offsets; a buffer that is itself a view at an
  // odd offset is copied once so every column below can be viewed in place.
  if (bytes.byteOffset % 8 !== 0) bytes = bytes.slice();
  const { buffer, byteOffset } = bytes;

  // Columns first, then the JSON header, then its length: see `src/columnar.rs`.
  const headerLen = new DataView(buffer, byteOffset + bytes.length - 4, 4).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(bytes.length - 4 - headerLen, bytes.length - 4)));
  if (header.columnarFormat !== FORMAT) {
    throw new Error(`testdata-parser: columnar format ${header.columnarFormat} is not the format ${FORMAT} this decoder reads — the parser and its decoder come from different versions`);
  }
  delete header.columnarFormat;
  const body = byteOffset;
  checkLayout(header.wafers, bytes.length - 4 - headerLen);

  const wafers = header.wafers.map((wafer) => {
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
    const partIds = wafer.partIds;
    delete wafer.dieCount;
    delete wafer.columns;
    delete wafer.partIds;
    return { wafer, n, col, values, verdicts, partIds };
  });
  return { header, wafers };
}

const WIDTH = { i32: 4, u32: 4, f32: 4, f64: 8, u8: 1, i8: 1 };

/**
 * Every column must lie inside the body (before the header) and no two may
 * share bytes. A typed array only refuses a column that runs off the buffer; one
 * at a wrong offset inside it would decode as plausible, wrong data.
 */
function checkLayout(wafers, bodyLen) {
  if (!(bodyLen >= 0)) throw new Error('testdata-parser: columnar header is longer than the buffer');
  const spans = [];
  for (const wafer of wafers) {
    for (const c of wafer.columns) {
      const width = WIDTH[c.kind];
      if (width === undefined) throw new Error(`testdata-parser: unknown column kind ${c.kind}`);
      const end = c.offset + wafer.dieCount * width;
      if (!Number.isInteger(c.offset) || c.offset < 0 || end > bodyLen) {
        throw new Error(`testdata-parser: column ${c.field}${c.test === undefined ? '' : ` ${c.test}`} lies outside the column data`);
      }
      spans.push([c.offset, end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) throw new Error('testdata-parser: two columns share bytes — the buffer is corrupt');
  }
}

/**
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {import('./testdata_parser.js').ParsedStdf}
 */
export function decodeParsed(input) {
  const { header, wafers } = readColumns(input);
  for (const { wafer, n, col, values, verdicts, partIds } of wafers) {
    const { x, y, dieIndex, hbin, sbin, siteNum, supersedes } = col;

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
    attachValues(results, values);
    attachVerdicts(results, verdicts);
    wafer.results = results;
  }
  return header;
}

/**
 * Like `decodeParsed`, but each wafer's `results` stays columns: the shape
 * `@wafertools/wafermap`'s `buildWaferMap` accepts as `results` (`DieColumns`),
 * with no object per die. Positions, bins and site are per-record typed
 * arrays with STDF's missing values (−32768 for coordinates, 65535 for bins and
 * site); test values and verdicts are sparse (`indices` of the records that
 * have one, and the `values`), values at the precision they were sent.
 *
 * Nothing refers to the input buffer afterwards, so it can be freed.
 *
 * @param {Uint8Array | ArrayBuffer} input
 */
export function decodeColumns(input) {
  const { header, wafers } = readColumns(input);
  for (const { wafer, n, col, values, verdicts, partIds } of wafers) {
    const results = { count: n };
    if (col.x) results.x = stdfInts(col.x, MISSING_I32, COORD_MISSING, Int32Array);
    if (col.y) results.y = stdfInts(col.y, MISSING_I32, COORD_MISSING, Int32Array);
    if (col.hbin) results.hbin = stdfInts(col.hbin, MISSING_U32, U16_MISSING, Uint32Array);
    if (col.sbin) results.sbin = stdfInts(col.sbin, MISSING_U32, U16_MISSING, Uint32Array);
    if (col.siteNum) results.siteNum = stdfInts(col.siteNum, MISSING_U32, U16_MISSING, Uint32Array);
    if (partIds) results.partId = partIds.map(v => (v == null ? undefined : v));
    if (col.supersedes) results.supersedes = Array.from(col.supersedes, c => SUPERSEDES[c]);
    const shared = sharedIndices(n);
    if (values.length) {
      results.testValues = {};
      for (const [key, dense] of values) results.testValues[key] = sparse(dense, v => v === v, shared);  // NaN is missing
    }
    if (verdicts.length) {
      results.testPass = {};
      for (const [key, dense] of verdicts) results.testPass[key] = sparse(dense, v => v !== -1, shared);
    }
    wafer.results = results;
  }
  return header;
}

const COORD_MISSING = -32768;
const U16_MISSING = 65535;

/** A copy of an integer column with the wire's missing value replaced by STDF's. */
function stdfInts(column, wireMissing, stdfMissing, Type) {
  const out = new Type(column.length);
  for (let i = 0; i < column.length; i++) out[i] = column[i] === wireMissing ? stdfMissing : column[i];
  return out;
}

/**
 * A dense column as `{ indices, values }` of the entries `present` accepts,
 * values in the column's own type. Columns with the same entries present share
 * one `indices` array (from `shared`): in most lots every die has every test,
 * so a wafer's columns all hold the same indices, and one copy of them about halves
 * the memory the columns take. Nothing writes to an `indices` array.
 */
function sparse(dense, present, shared) {
  const scratch = shared.scratch;
  let k = 0;
  let hash = 0;
  for (let i = 0; i < dense.length; i++) {
    if (present(dense[i])) { scratch[k++] = i; hash = (Math.imul(hash, 31) + i) | 0; }
  }
  const values = new dense.constructor(k);
  for (let j = 0; j < k; j++) values[j] = dense[scratch[j]];
  return { indices: shared.get(k, hash), values };
}

/**
 * The index arrays of one wafer's columns: `get` returns an earlier array
 * holding the same indices as `scratch[0..count)`, or a copy of them.
 */
function sharedIndices(n) {
  const scratch = new Int32Array(n);
  const seen = new Map();  // `${count}:${hash}` → arrays with that count and hash
  return {
    scratch,
    get(count, hash) {
      const key = `${count}:${hash}`;
      const candidates = seen.get(key);
      if (candidates) {
        for (const c of candidates) {
          let same = true;
          for (let j = 0; j < count; j++) if (c[j] !== scratch[j]) { same = false; break; }
          if (same) return c;
        }
      }
      const indices = scratch.slice(0, count);
      if (candidates) candidates.push(indices); else seen.set(key, [indices]);
      return indices;
    },
  };
}

// Each die's map is built in one go, not a column at a time reaching back into
// every die once per test, and in functions of their own: as one long loop
// inside `decodeParsed`, WebKit's engine (the desktop app on Linux and macOS)
// left the work in its slowest tier and it took ~7 s on a 266k-die lot.

/** A test key as the property key to write: its number when it is one, so no string is parsed per die. */
const propKey = (key) => (String(Number(key)) === key ? Number(key) : key);

function attachValues(results, columns) {
  const keys = columns.map(([key]) => propKey(key));
  const cols = columns.map(([, v]) => v);
  const t = cols.length;
  for (let i = 0; i < results.length; i++) {
    let map;
    for (let j = 0; j < t; j++) {
      const value = cols[j][i];
      if (value === value) (map ??= {})[keys[j]] = value;  // NaN is missing
    }
    if (map) results[i].testValues = map;
  }
}

function attachVerdicts(results, columns) {
  const keys = columns.map(([key]) => propKey(key));
  const cols = columns.map(([, v]) => v);
  const t = cols.length;
  for (let i = 0; i < results.length; i++) {
    let map;
    for (let j = 0; j < t; j++) {
      const verdict = cols[j][i];
      if (verdict !== -1) (map ??= {})[keys[j]] = verdict === 1;
    }
    if (map) results[i].testPass = map;
  }
}

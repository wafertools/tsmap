// The parser's columnar decoder (packages/parsers/js/columnar.js) against the
// golden files the Rust encoder's tests write (`columnar::tests` in
// packages/parsers/src/columnar.rs): each buffer must decode to exactly the JSON
// serde makes of the same parse, which is what tsmap received before parses
// became columnar.
import { describe, it, expect } from 'vitest';
import { decodeColumns, decodeParsed } from '../packages/parsers/js/columnar.js';
import EVERY_FIELD_HEX from '../packages/parsers/tests/columnar-golden/every-field.hex?raw';
import EVERY_FIELD_JSON from '../packages/parsers/tests/columnar-golden/every-field.json?raw';
import COORDLESS_HEX from '../packages/parsers/tests/columnar-golden/coordless-lot.hex?raw';
import COORDLESS_JSON from '../packages/parsers/tests/columnar-golden/coordless-lot.json?raw';

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], b => parseInt(b, 16));
const CASES = {
  'every-field':   { bin: fromHex(EVERY_FIELD_HEX), json: JSON.parse(EVERY_FIELD_JSON) },
  'coordless-lot': { bin: fromHex(COORDLESS_HEX),   json: JSON.parse(COORDLESS_JSON) },
};

describe('decodeParsed', () => {
  for (const [name, { bin, json }] of Object.entries(CASES)) {
    it(`${name}: decodes to what serde produced`, () => {
      expect(decodeParsed(bin)).toEqual(json);
    });
  }

  it('accepts an ArrayBuffer, and a view at an unaligned offset', () => {
    const { bin, json } = CASES['every-field'];
    expect(decodeParsed(bin.slice().buffer)).toEqual(json);
    const shifted = new Uint8Array(bin.length + 3);
    shifted.set(bin, 3);
    expect(decodeParsed(shifted.subarray(3))).toEqual(json);
  });

  it('refuses a format it does not read', () => {
    const { bin } = CASES['every-field'];
    const len = new DataView(bin.buffer, bin.byteOffset + bin.length - 4).getUint32(0, true);
    const at = bin.length - 4 - len;
    const header = new TextDecoder().decode(bin.subarray(at, at + len)).replace('"columnarFormat":2', '"columnarFormat":9');
    const patched = bin.slice();
    patched.set(new TextEncoder().encode(header), at);
    expect(() => decodeParsed(patched)).toThrow(/columnar format 9/);
  });

  /** The golden buffer with its header rewritten by `edit`. */
  function withHeader(edit: (header: { wafers: { columns: { offset: number }[] }[] }) => void) {
    const { bin } = CASES['every-field'];
    const len = new DataView(bin.buffer, bin.byteOffset + bin.length - 4).getUint32(0, true);
    const bodyLen = bin.length - 4 - len;
    const header = JSON.parse(new TextDecoder().decode(bin.subarray(bodyLen, bodyLen + len)));
    edit(header);
    const json = new TextEncoder().encode(JSON.stringify(header));
    const out = new Uint8Array(bodyLen + json.length + 4);
    out.set(bin.subarray(0, bodyLen));
    out.set(json, bodyLen);
    new DataView(out.buffer).setUint32(bodyLen + json.length, json.length, true);
    return { out, bodyLen };
  }

  it('reads a header rebuilt unchanged', () => {
    expect(decodeParsed(withHeader(() => {}).out)).toEqual(CASES['every-field'].json);
  });

  it('refuses a column that overlaps another', () => {
    const { out } = withHeader((h) => { const c = h.wafers[0].columns; c[1].offset = c[0].offset; });
    expect(() => decodeParsed(out)).toThrow(/share bytes/);
  });

  it('refuses a column that runs into the header', () => {
    const { bodyLen } = withHeader(() => {});
    const { out } = withHeader((h) => { h.wafers[0].columns[0].offset = bodyLen - 8; });
    expect(() => decodeParsed(out)).toThrow(/outside the column data/);
  });
});

describe('decodeColumns', () => {
  /** A wafer's columns turned back into rows, as `decodeParsed` builds them. */
  function toRows(r: ReturnType<typeof decodeColumns>['wafers'][number]['results']) {
    const rows: Array<Record<string, unknown>> = Array.from({ length: r.count }, () => ({}));
    const int = (col: ArrayLike<number> | undefined, missing: number, key: string) => {
      if (col) for (let i = 0; i < r.count; i++) if (col[i] !== missing) rows[i][key] = col[i];
    };
    int(r.x, -32768, 'x'); int(r.y, -32768, 'y');
    int(r.hbin, 65535, 'hbin'); int(r.sbin, 65535, 'sbin'); int(r.siteNum, 65535, 'siteNum');
    r.partId?.forEach((v, i) => { if (v !== undefined) rows[i].partId = v; });
    r.supersedes?.forEach((v, i) => { if (v !== undefined) rows[i].supersedes = v; });
    for (const [tn, { indices, values }] of Object.entries(r.testValues ?? {})) {
      indices.forEach((i, k) => { ((rows[i].testValues ??= {}) as Record<string, number>)[tn] = values[k]; });
    }
    for (const [tn, { indices, values }] of Object.entries(r.testPass ?? {})) {
      indices.forEach((i, k) => { ((rows[i].testPass ??= {}) as Record<string, boolean>)[tn] = values[k] === 1; });
    }
    return rows;
  }

  for (const [name, { bin }] of Object.entries(CASES)) {
    it(`${name}: the same records as decodeParsed, as columns`, () => {
      const rows = decodeParsed(bin);
      const cols = decodeColumns(bin);
      expect({ ...cols, wafers: undefined }).toEqual({ ...rows, wafers: undefined });
      cols.wafers.forEach((w, i) => {
        const { results: rowResults, ...rowRest } = rows.wafers[i];
        const { results, ...rest } = w;
        expect(rest).toEqual(rowRest);
        // The parser's own `dieIndex` has no place in wmap's input.
        expect(toRows(results)).toEqual(rowResults.map(({ dieIndex: _d, ...r }: { dieIndex?: number }) => r));
      });
    });
  }

  it('columns with the same records present share one indices array, and only they do', () => {
    let shares = 0;
    for (const { bin } of Object.values(CASES)) {
      for (const w of decodeColumns(bin).wafers) {
        const pairs = [...Object.values(w.results.testValues ?? {}), ...Object.values(w.results.testPass ?? {})];
        for (let a = 0; a < pairs.length; a++) {
          for (let b = a + 1; b < pairs.length; b++) {
            const same = [...pairs[a].indices].join() === [...pairs[b].indices].join();
            expect(pairs[a].indices === pairs[b].indices).toBe(same);
            if (same) shares++;
          }
        }
      }
    }
    expect(shares).toBeGreaterThan(0);
  });

  it('keeps no reference to the input buffer', () => {
    const { bin } = CASES['every-field'];
    const cols = decodeColumns(bin);
    for (const w of cols.wafers) {
      for (const v of Object.values(w.results)) {
        if (ArrayBuffer.isView(v)) expect(v.buffer).not.toBe(bin.buffer);
      }
      for (const { indices, values } of Object.values(w.results.testValues ?? {})) {
        expect(indices.buffer).not.toBe(bin.buffer);
        expect(values.buffer).not.toBe(bin.buffer);
      }
    }
  });
});

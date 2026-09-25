// The parser's columnar decoder (packages/parsers/js/columnar.js) against the
// golden files the Rust encoder's tests write (`columnar::tests` in
// packages/parsers/src/columnar.rs): each buffer must decode to exactly the JSON
// serde makes of the same parse, which is what tsmap received before parses
// became columnar.
import { describe, it, expect } from 'vitest';
import { decodeParsed } from '../packages/parsers/js/columnar.js';
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
    const len = new DataView(bin.buffer, bin.byteOffset).getUint32(0, true);
    const header = new TextDecoder().decode(bin.subarray(4, 4 + len)).replace('"columnarFormat":1', '"columnarFormat":9');
    const patched = bin.slice();
    patched.set(new TextEncoder().encode(header), 4);
    expect(() => decodeParsed(patched)).toThrow(/columnar format 9/);
  });
});

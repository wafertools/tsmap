import { describe, it, expect, beforeAll } from 'vitest';
import INDICES_JSON from '../packages/parsers/tests/sample-golden/indices.json?raw';

// The web build picks its preview rows in TypeScript; the native build picks
// them in `packages/parsers/src/sample.rs`. Both are held to the same golden
// file, which the Rust side checks in `matches_the_shared_golden_file`, so the
// two copies cannot drift apart unnoticed.
// Imported dynamically after stubbing `window`: `platform.ts` reads it at module
// scope, and this suite runs in vitest's node environment (see pickedFile.test.ts).
let sampleIndices: typeof import('./platform')['sampleIndices'];
beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= {};
  ({ sampleIndices } = await import('./platform'));
});

const golden = JSON.parse(INDICES_JSON) as { head: number; spread: number; cases: { rows: number; indices: number[] }[] };

describe('sampleIndices', () => {
  for (const c of golden.cases) {
    it(`agrees with the parser for ${c.rows} rows`, () => {
      expect(sampleIndices(c.rows)).toEqual(c.indices);
    });
  }

  it('never repeats a row or leaves the file', () => {
    for (const c of golden.cases) {
      const idx = sampleIndices(c.rows);
      expect(new Set(idx).size).toBe(idx.length);
      expect(idx.every(i => i >= 0 && i < c.rows)).toBe(true);
    }
  });
});

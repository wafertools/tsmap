import { describe, it, expect, beforeAll } from 'vitest';

// The file filter reads a CSV/JSON/Parquet file's lot-level columns from a sample of rows. A Parquet file can be
// asked about a whole column cheaply, so a column the sample cannot settle is checked exactly (`settleFromColumns`).
// What must hold: a value is shown bare only when the whole column has it; a column that is "25" in some rows and
// empty in the rest is NOT constant, and the check must count the empty rows to know.
// Imported dynamically after stubbing `window` (see sample.test.ts).
let headersToFileMeta: typeof import('./fileFilterUI')['headersToFileMeta'];
let settleFromColumns: typeof import('./fileFilterUI')['settleFromColumns'];
beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= {};
  ({ headersToFileMeta, settleFromColumns } = await import('./fileFilterUI'));
});

const file = { name: 'lot.parquet', bytes: new Uint8Array(0) };
/** A platform whose whole-column distinct count is `distinct`, recording how it was asked. */
function platformAnswering(distinct: number) {
  const asked: Array<{ columns: string[]; blankIsAValue: boolean }> = [];
  return {
    asked,
    platform: { parquetDistinctCount: async (_f: unknown, columns: string[], blankIsAValue: boolean) => { asked.push({ columns, blankIsAValue }); return distinct; } },
  };
}
const metaFor = (temps: string[]) =>
  headersToFileMeta(['lot', 'temperature'], temps.map(t => ({ lot: 'L1', temperature: t })), 1000);
const valueOf = (meta: ReturnType<typeof metaFor>) => meta.lotMeta.fields.find(f => f.key.toLowerCase().includes('temp'))?.value;

describe('settleFromColumns', () => {
  it('shows a sampled value as "(first rows)" until the column is checked', () => {
    expect(valueOf(metaFor(['25', '25', '25']))).toBe('25 (first rows)');
  });

  it('asks with blank rows counted as a value', async () => {
    const { platform, asked } = platformAnswering(1);
    await settleFromColumns(platform as never, file, metaFor(['25', '25']));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(a => a.blankIsAValue === true)).toBe(true);
  });

  it('shows the bare value when the whole column has just that one value', async () => {
    const meta = metaFor(['25', '25', '25']);
    await settleFromColumns(platformAnswering(1).platform as never, file, meta);
    expect(valueOf(meta)).toBe('25');
  });

  it('shows "(varies)" for a column that is 25 in the sample and empty or different elsewhere', async () => {
    // Two distinct values in the whole column: 25, and "blank" (or any other). The sample alone agreed on 25.
    const meta = metaFor(['25', '25', '25']);
    await settleFromColumns(platformAnswering(2).platform as never, file, meta);
    expect(valueOf(meta)).toBe('(varies)');
  });

  it('leaves a column that is blank throughout blank, and calls one that is blank in the sample but not elsewhere varying', async () => {
    const allBlank = metaFor(['', '', '']);
    await settleFromColumns(platformAnswering(1).platform as never, file, allBlank);
    expect(valueOf(allBlank)).toBe('');
    const mixed = metaFor(['', '', '']);
    await settleFromColumns(platformAnswering(2).platform as never, file, mixed);
    expect(valueOf(mixed)).toBe('(varies)');
  });

  it('keeps the sample\'s answer when the read fails', async () => {
    const meta = metaFor(['25', '25']);
    const failing = { parquetDistinctCount: async () => { throw new Error('unreadable'); } };
    await settleFromColumns(failing as never, file, meta);
    expect(valueOf(meta)).toBe('25 (first rows)');
  });
});

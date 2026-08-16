import { describe, it, expect } from 'vitest';
import {
  filterAndSortRows, formatFilterFile, parseFilterFile, FILTER_FILE_KIND,
  type FilterTableRow,
} from './filterTable';

function row(id: string, columns: Record<string, string>): FilterTableRow {
  return { id, columns };
}

const ROWS: FilterTableRow[] = [
  row('a', { lot: 'LOT-1', temp: '25', name: 'Charlie' }),
  row('b', { lot: 'LOT-2', temp: '85', name: 'Alice' }),
  row('c', { lot: 'LOT-1', temp: '85', name: 'Bob' }),
];

describe('filterAndSortRows — column filters', () => {
  it('returns every row when no filters are set', () => {
    expect(filterAndSortRows(ROWS, {})).toHaveLength(3);
  });

  it('filters to rows whose column value is in the included set', () => {
    const out = filterAndSortRows(ROWS, { columnFilters: new Map([['lot', new Set(['LOT-1'])]]) });
    expect(out.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('combines multiple column filters with AND', () => {
    const out = filterAndSortRows(ROWS, {
      columnFilters: new Map([['lot', new Set(['LOT-1'])], ['temp', new Set(['85'])]]),
    });
    expect(out.map(r => r.id)).toEqual(['c']);
  });

  it('an empty included-values set matches nothing', () => {
    const out = filterAndSortRows(ROWS, { columnFilters: new Map([['lot', new Set()]]) });
    expect(out).toHaveLength(0);
  });
});

describe('filterAndSortRows — search', () => {
  it('matches search text against any column, case-insensitively', () => {
    const out = filterAndSortRows(ROWS, { searchText: 'alice' });
    expect(out.map(r => r.id)).toEqual(['b']);
  });

  it('matches across different columns for different rows', () => {
    const out = filterAndSortRows(ROWS, { searchText: 'lot-1' });
    expect(out.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('blank/whitespace-only search text is a no-op', () => {
    expect(filterAndSortRows(ROWS, { searchText: '   ' })).toHaveLength(3);
  });
});

describe('filterAndSortRows — sort', () => {
  it('sorts ascending by string column', () => {
    const out = filterAndSortRows(ROWS, { sortKey: 'name', sortDir: 'asc' });
    expect(out.map(r => r.id)).toEqual(['b', 'c', 'a']); // Alice, Bob, Charlie
  });

  it('sorts descending by string column', () => {
    const out = filterAndSortRows(ROWS, { sortKey: 'name', sortDir: 'desc' });
    expect(out.map(r => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts numerically, not lexicographically, for numeric column values', () => {
    // Lexicographic would put '25' after '85' among strings starting differently,
    // but numeric values here (25, 85, 85) must sort as numbers.
    const out = filterAndSortRows(ROWS, { sortKey: 'temp', sortDir: 'asc' });
    expect(out[0]!.columns.temp).toBe('25');
  });

  it('does not sort when sortKey is set but sortDir is null', () => {
    const out = filterAndSortRows(ROWS, { sortKey: 'name', sortDir: null });
    expect(out.map(r => r.id)).toEqual(['a', 'b', 'c']); // original order preserved
  });
});

describe('filterAndSortRows — sortValues', () => {
  // The columns this exists for: __size and __modified display as formatted
  // text ("900.0 KB", a localized date), which sorts nothing like the value
  // behind it. Without sortValues these order 1.5 MB → 12.0 MB → 900.0 KB.
  const SIZED: FilterTableRow[] = [
    { id: 'mb1', columns: { size: '1.5 MB' }, sortValues: { size: 1_572_864 } },
    { id: 'kb', columns: { size: '900.0 KB' }, sortValues: { size: 921_600 } },
    { id: 'mb12', columns: { size: '12.0 MB' }, sortValues: { size: 12_582_912 } },
  ];

  it('sorts by the numeric value, not the formatted text', () => {
    expect(filterAndSortRows(SIZED, { sortKey: 'size', sortDir: 'asc' }).map(r => r.id))
      .toEqual(['kb', 'mb1', 'mb12']);
  });

  it('reverses with sortDir desc', () => {
    expect(filterAndSortRows(SIZED, { sortKey: 'size', sortDir: 'desc' }).map(r => r.id))
      .toEqual(['mb12', 'mb1', 'kb']);
  });

  it('would order these wrongly without sortValues — guards the regression', () => {
    const stripped = SIZED.map(r => ({ id: r.id, columns: r.columns }));
    expect(filterAndSortRows(stripped, { sortKey: 'size', sortDir: 'asc' }).map(r => r.id))
      .toEqual(['mb1', 'mb12', 'kb']);
  });

  it('puts rows with no sort value last in both directions', () => {
    const withBlank = [...SIZED, { id: 'unknown', columns: { size: '' } }];
    const last = (dir: 'asc' | 'desc') => {
      const out = filterAndSortRows(withBlank, { sortKey: 'size', sortDir: dir });
      return out[out.length - 1]?.id;
    };
    expect(last('asc')).toBe('unknown');
    expect(last('desc')).toBe('unknown');
  });

  it('leaves columns without sortValues on the existing numeric/text path', () => {
    expect(filterAndSortRows(ROWS, { sortKey: 'temp', sortDir: 'asc' }).map(r => r.id))
      .toEqual(['a', 'b', 'c']);
  });
});

describe('filterAndSortRows — combined', () => {
  it('applies filter, search, and sort together', () => {
    const out = filterAndSortRows(ROWS, {
      columnFilters: new Map([['lot', new Set(['LOT-1', 'LOT-2'])]]),
      searchText: '8',
      sortKey: 'name',
      sortDir: 'asc',
    });
    // temp=85 rows only ('8' in search), sorted by name: Bob, Alice -> b before c
    expect(out.map(r => r.id)).toEqual(['b', 'c']);
  });
});

// ── Saved filter files ────────────────────────────────────────────────────────
// The envelope exists because Load filter… used to accept any valid JSON: a
// package.json "loaded successfully", wiping every filter and selecting all
// rows. These pin the refusal.

describe('formatFilterFile / parseFilterFile', () => {
  const criteria = { columnValues: { lot: ['LOT-1', 'LOT-2'] }, searchText: '85' };

  it('round-trips criteria unchanged', () => {
    const parsed = parseFilterFile(formatFilterFile(criteria));
    expect(parsed).toEqual({ criteria });
  });

  it('writes a self-identifying envelope', () => {
    const raw = JSON.parse(formatFilterFile(criteria));
    expect(raw.kind).toBe(FILTER_FILE_KIND);
    expect(raw.version).toBe(1);
  });

  it('rejects an unrelated JSON file rather than silently clearing filters', () => {
    const packageJson = JSON.stringify({ name: 'tsmap', version: '0.1.26' });
    expect(parseFilterFile(packageJson)).toEqual({ error: 'not a tsmap filter file' });
  });

  it('rejects malformed JSON', () => {
    expect(parseFilterFile('{not json')).toEqual({ error: 'not valid JSON' });
  });

  it('rejects a JSON scalar', () => {
    expect(parseFilterFile('42')).toEqual({ error: 'not a saved filter' });
  });

  it('refuses a file from a newer format version', () => {
    const future = JSON.stringify({ kind: FILTER_FILE_KIND, version: 99, columnValues: {}, searchText: '' });
    expect(parseFilterFile(future)).toEqual({
      error: 'saved by a newer version of tsmap (format 99)',
    });
  });

  it('tolerates a hand-edited file with a missing searchText', () => {
    const handEdited = JSON.stringify({ kind: FILTER_FILE_KIND, version: 1, columnValues: { lot: ['A'] } });
    expect(parseFilterFile(handEdited)).toEqual({
      criteria: { columnValues: { lot: ['A'] }, searchText: '' },
    });
  });

  it('drops a column whose values are not an array', () => {
    const bad = JSON.stringify({
      kind: FILTER_FILE_KIND, version: 1,
      columnValues: { good: ['A'], bad: 'not-an-array' }, searchText: '',
    });
    expect(parseFilterFile(bad)).toEqual({
      criteria: { columnValues: { good: ['A'] }, searchText: '' },
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { FileHandle, HeadersResult, Platform } from './platform';
import type { LoadDeps, SelectorResult } from './loadPipeline';
import type { RenamedWafer } from './multiFileUI';
import type { TestDef, WaferData } from './types';
import { emptySession, session } from './session';
import { columnsFromRows } from './columns';

// The load flow, driven end to end with fakes for the platform, the renderer and the four dialogs.
// Imported dynamically after stubbing `window` for the same reason as pickedFile.test.ts: platform.ts
// reads `'__TAURI_INTERNALS__' in window` at module scope, and this suite runs in the node environment.

type Pipeline = typeof import('./loadPipeline');
let runLoad: Pipeline['runLoad'];

beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
  ({ runLoad } = await import('./loadPipeline'));
});

const file = (name: string, size = 10): FileHandle => ({ name, bytes: new Uint8Array(size), path: `/data/${name}` });

const def = (name: string): TestDef => ({ name, testType: 'P' });

const wafer = (waferId: string, dies = 4): WaferData => ({
  waferId,
  results: columnsFromRows(Array.from({ length: dies }, (_, i) => ({
    x: i, y: 0, hbin: 1, sbin: 1, siteNum: 1, testValues: { 1: i, 2: i * 2 }, testPass: { 1: true, 2: true },
  }))),
  partCount: dies, goodCount: dies, failCount: 0,
});

/** A raw parse result. Two wafers, so a single file never needs the rename step. */
const raw = (tests: Record<string, TestDef> = { '1': def('A'), '2': def('B') }) => ({
  meta: { fields: [] },
  wafers: [wafer('W01'), wafer('W02')],
  testDefs: tests,
  warnings: [],
});

const headers: HeadersResult = { headers: ['x', 'y'], sample: [], rowCount: 2 };
const mappingAnswer = { mapping: {} as never, binDefs: [] };
const confirm = (selection: number[]): SelectorResult =>
  ({ kind: 'confirm', selection, overrides: new Map(), derived: { selected: [], tests: [] } as never });

interface Harness {
  deps: LoadDeps;
  log: Array<[string, string]>;
  ended: Array<string | undefined>;
  rendered: Array<{ wafers: WaferData[]; fileName: string; testDefs: Record<string, TestDef> }>;
  platform: Record<string, ReturnType<typeof vi.fn>>;
  ui: { mapping: ReturnType<typeof vi.fn>; selectTests: ReturnType<typeof vi.fn>; renameWafers: ReturnType<typeof vi.fn>; confirmAppend: ReturnType<typeof vi.fn> };
  scan: ReturnType<typeof vi.fn>;
  cleared: { view: number; empty: number };
  remembered: string[][];
}

function harness(over: { platform?: Record<string, unknown>; ui?: Partial<Harness['ui']>; scan?: Harness['scan']; preload?: string | null } = {}): Harness {
  const log: Harness['log'] = [];
  const ended: Harness['ended'] = [];
  const rendered: Harness['rendered'] = [];
  const cleared = { view: 0, empty: 0 };
  const remembered: string[][] = [];
  const platform = {
    expandArchives: vi.fn(async (f: FileHandle[]) => f),
    csvHeaders: vi.fn(async () => headers),
    jsonHeaders: vi.fn(async () => headers),
    parquetHeaders: vi.fn(async () => headers),
    parseCsv: vi.fn(async () => raw()),
    parseJson: vi.fn(async () => raw()),
    parseParquet: vi.fn(async () => raw()),
    parseStdf: vi.fn(async () => raw()),
    parseAtdf: vi.fn(async () => raw()),
    parseStdfFiltered: vi.fn(async () => raw()),
    parseAtdfFiltered: vi.fn(async () => raw()),
    ...over.platform,
  } as Record<string, ReturnType<typeof vi.fn>>;
  const ui = {
    mapping: vi.fn(async () => mappingAnswer),
    selectTests: vi.fn(async () => confirm([1, 2])),
    renameWafers: vi.fn(async (): Promise<RenamedWafer[] | null> => null),
    confirmAppend: vi.fn(async () => true),
    ...over.ui,
  };
  // Many tests × many dies: over the cheap-lot budget, so the selector is shown.
  const scan = over.scan ?? vi.fn(async () => ({ testDefs: { '1': def('A'), '2': def('B') }, dieCount: 5_000_000 }));
  const deps: LoadDeps = {
    platform: platform as unknown as Platform,
    log: (level, msg) => { log.push([level, msg]); },
    loadPhase: () => {},
    endLoad: id => { ended.push(id); },
    isBusy: () => false,
    logTimed: async (_l, fn) => fn(),
    logDecodeTime: () => {},
    logWarnings: () => {},
    logOverrideUnitNotes: () => {},
    logUnitConversions: () => {},
    logTestDefCollisions: () => {},
    logPassBinCollisions: () => {},
    scanBinaryTests: scan as unknown as LoadDeps['scanBinaryTests'],
    takeTestListPreload: () => over.preload ?? null,
    derivedForSelector: () => ({ selected: [], tests: [] }) as never,
    adoptDerived: () => {},
    rememberFiles: p => { remembered.push(p); },
    clearViewForLoad: () => { cleared.view++; },
    showEmptyState: () => { cleared.empty++; },
    renderWafers: (wafers, fileName, testDefs) => { rendered.push({ wafers, fileName, testDefs }); },
    ui: ui as unknown as LoadDeps['ui'],
  };
  return { deps, log, ended, rendered, platform, ui, scan, cleared, remembered };
}

const errors = (h: Harness) => h.log.filter(([l]) => l === 'error').map(([, m]) => m);

beforeEach(() => {
  Object.assign(session, emptySession());
});

describe('runLoad', () => {
  it('does nothing for an empty file list', async () => {
    const h = harness();
    await runLoad([], false, false, h.deps);
    expect(h.ended).toEqual([]);
    expect(h.rendered).toEqual([]);
  });

  it('ignores a new load while one is running, but not its own continuation', async () => {
    const h = harness();
    h.deps.isBusy = () => true;
    await runLoad([file('a.stdf')], false, false, h.deps);
    expect(h.platform.expandArchives).not.toHaveBeenCalled();
    await runLoad([file('a.stdf')], false, true, h.deps);
    expect(h.platform.expandArchives).toHaveBeenCalled();
  });

  it('refuses a mixed-format batch before reading anything', async () => {
    const h = harness();
    await runLoad([file('a.stdf'), file('b.parquet')], false, false, h.deps);
    expect(errors(h)[0]).toMatch(/Mixed formats not supported/);
    expect(h.ended).toEqual(['Error: mixed formats']);
    expect(h.ui.mapping).not.toHaveBeenCalled();
    expect(h.scan).not.toHaveBeenCalled();
    expect(h.cleared.view).toBe(0);
  });

  it('stops at once when archive extraction leaves nothing', async () => {
    const h = harness({ platform: { expandArchives: vi.fn(async () => []) } });
    await runLoad([file('a.zip')], false, false, h.deps);
    expect(h.ended).toEqual(['Error: no files after extraction']);
  });

  it('ends quietly when the column mapping is cancelled, leaving the view alone', async () => {
    const h = harness({ ui: { mapping: vi.fn(async () => null) } });
    await runLoad([file('a.csv')], false, false, h.deps);
    expect(h.ended).toEqual([undefined]);
    expect(h.platform.parseCsv).not.toHaveBeenCalled();
    expect(h.cleared.view).toBe(0);
    expect(h.rendered).toEqual([]);
  });

  it('ends when the headers cannot be read', async () => {
    const h = harness({ platform: { csvHeaders: vi.fn(async () => { throw new Error('bad file'); }) } });
    await runLoad([file('a.csv')], false, false, h.deps);
    expect(errors(h)[0]).toMatch(/Failed to read headers/);
    expect(h.ui.mapping).not.toHaveBeenCalled();
    expect(h.ended).toEqual([undefined]);
  });

  describe('test selector', () => {
    it('skips the selector for a cheap lot and imports every test', async () => {
      const h = harness({ scan: vi.fn(async () => ({ testDefs: { '1': def('A'), '2': def('B') }, dieCount: 10 })) });
      await runLoad([file('a.stdf')], false, false, h.deps);
      expect(h.ui.selectTests).not.toHaveBeenCalled();
      expect(h.log.some(([, m]) => /2 tests imported/.test(m))).toBe(true);
      expect(h.platform.parseStdfFiltered).toHaveBeenCalledWith(expect.anything(), [1, 2]);
      expect(h.rendered).toHaveLength(1);
    });

    it('shows the selector when a --tests preload is waiting, even for a cheap lot', async () => {
      const h = harness({ preload: '1 A', scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) });
      await runLoad([file('a.stdf')], false, false, h.deps);
      expect(h.ui.selectTests).toHaveBeenCalledTimes(1);
      expect(h.ui.selectTests.mock.calls[0][0].preloadListText).toBe('1 A');
    });

    it('shows it for a big lot and parses only the confirmed selection', async () => {
      const h = harness({ ui: { selectTests: vi.fn(async () => confirm([2])) } });
      await runLoad([file('a.stdf')], false, false, h.deps);
      expect(h.ui.selectTests.mock.calls[0][0].initialSelection).toEqual([]);
      expect(h.platform.parseStdfFiltered).toHaveBeenCalledWith(expect.anything(), [2]);
      expect(h.log.some(([, m]) => /1 of 2 tests selected/.test(m))).toBe(true);
      expect(Object.keys(h.rendered[0].testDefs)).toEqual(['2']);
    });

    it('ends without touching the view when the selector is cancelled', async () => {
      const h = harness({ ui: { selectTests: vi.fn(async (): Promise<SelectorResult> => ({ kind: 'cancel' })) } });
      await runLoad([file('a.stdf')], false, false, h.deps);
      expect(h.ended).toEqual([undefined]);
      expect(h.cleared.view).toBe(0);
      expect(h.platform.parseStdfFiltered).not.toHaveBeenCalled();
    });

    it('scans only the largest file first, and offers scan-all for several', async () => {
      const h = harness();
      const small = file('small.stdf', 5);
      const big = file('big.stdf', 500);
      await runLoad([small, big], false, false, h.deps);
      expect(h.scan.mock.calls[0][0]).toEqual([big]);
      const request = h.ui.selectTests.mock.calls[0][0];
      expect(request.canScanAll).toBe(true);
      expect(request.scanScope).toBe('largest');
      expect(request.scanFileCount).toBe(2);
    });

    it('re-scans every file on scan-all and re-opens with the selection kept', async () => {
      const wide = { '1': def('A'), '2': def('B'), '3': def('C') };
      const scan = vi.fn()
        .mockResolvedValueOnce({ testDefs: { '1': def('A'), '2': def('B') }, dieCount: 5_000_000 })
        .mockResolvedValueOnce({ testDefs: wide, dieCount: 5_000_000 });
      const selectTests = vi.fn()
        .mockResolvedValueOnce({ kind: 'scanAll', selection: [1], overrides: new Map(), derived: { selected: [], tests: [] } })
        .mockResolvedValueOnce(confirm([1, 3]));
      const h = harness({ scan, ui: { selectTests } });
      const files = [file('a.stdf', 5), file('b.stdf', 50)];
      await runLoad(files, false, false, h.deps);

      expect(scan).toHaveBeenCalledTimes(2);
      expect(scan.mock.calls[1][0]).toEqual(files);
      const second = selectTests.mock.calls[1][0];
      expect(second.scanScope).toBe('all');
      expect(second.canScanAll).toBe(false);
      expect(second.initialSelection).toContain(1);
      expect(Object.keys(second.scopedDefs)).toEqual(['1', '2', '3']);
      expect(session.binaryScanScope).toBe('all');
      expect(session.testNames).toEqual(wide);
      expect(h.platform.parseStdfFiltered).toHaveBeenCalledWith(expect.anything(), [1, 3]);
    });
  });

  describe('naming and appending', () => {
    it('stops at the rename step for several files, and a cancel returns to the empty state', async () => {
      const h = harness({ scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) });
      await runLoad([file('a.stdf'), file('b.stdf')], false, false, h.deps);
      expect(h.ui.renameWafers).toHaveBeenCalledTimes(1);
      expect(h.ui.renameWafers.mock.calls[0][0]).toHaveLength(2);
      expect(h.cleared.view).toBe(1);
      expect(h.cleared.empty).toBe(1);
      expect(h.ended).toEqual([undefined]);
      expect(h.rendered).toEqual([]);
    });

    it('keeps the old view when a rename is cancelled during an append', async () => {
      const h = harness({ scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) });
      await runLoad([file('a.stdf'), file('b.stdf')], true, false, h.deps);
      expect(h.cleared.view).toBe(0);
      expect(h.cleared.empty).toBe(0);
      expect(h.ended).toEqual([undefined]);
    });

    it('renders a fresh load, names it after the file, and remembers its paths', async () => {
      const h = harness({ scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) });
      await runLoad([file('lot.stdf')], false, false, h.deps);
      expect(h.ui.renameWafers).not.toHaveBeenCalled();
      expect(h.rendered).toHaveLength(1);
      expect(h.rendered[0].fileName).toBe('lot.stdf');
      expect(h.rendered[0].wafers.map(w => w.waferId)).toEqual(['W01', 'W02']);
      expect(h.remembered).toEqual([['/data/lot.stdf']]);
    });

    it('names a several-file load by its count', async () => {
      const renamed = (id: string): RenamedWafer => ({ waferId: id, results: wafer(id).results });
      const h = harness({
        scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })),
        ui: { renameWafers: vi.fn(async () => [renamed('a'), renamed('b')]) },
      });
      await runLoad([file('a.stdf'), file('b.stdf')], false, false, h.deps);
      expect(h.rendered[0].fileName).toBe('2 files');
      expect(h.rendered[0].wafers.map(w => w.waferId)).toEqual(['a', 'b']);
    });

    describe('with a lot already loaded', () => {
      beforeEach(() => {
        session.wafers = [wafer('OLD')];
        session.fileName = 'old.stdf';
        session.testDefs = { '9': def('Old') };
      });
      const cheap = { scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) };

      it('asks before appending, and a refusal leaves everything as it was', async () => {
        const h = harness({ ...cheap, ui: { confirmAppend: vi.fn(async () => false) } });
        await runLoad([file('a.stdf')], true, false, h.deps);
        expect(h.ui.confirmAppend).toHaveBeenCalledTimes(1);
        expect(h.rendered).toEqual([]);
        expect(h.ended).toEqual(['1 wafers loaded']);
        expect(session.wafers.map(w => w.waferId)).toEqual(['OLD']);
      });

      it('appends the new wafers after the old and unions the test definitions', async () => {
        const h = harness(cheap);
        await runLoad([file('a.stdf')], true, false, h.deps);
        expect(h.rendered).toHaveLength(1);
        expect(h.rendered[0].fileName).toBe('old.stdf');
        expect(h.rendered[0].wafers.map(w => w.waferId)).toEqual(['OLD', 'W01', 'W02']);
        expect(Object.keys(h.rendered[0].testDefs).sort()).toEqual(['1', '9']);
        expect(h.cleared.view).toBe(0);
        expect(h.remembered).toEqual([]);
      });
    });
  });

  describe('parse failures', () => {
    const cheap = () => ({ scan: vi.fn(async () => ({ testDefs: { '1': def('A') }, dieCount: 10 })) });

    it('reports a file that fails and still loads the others', async () => {
      const parseStdfFiltered = vi.fn()
        .mockRejectedValueOnce(new Error('truncated record'))
        .mockResolvedValue(raw());
      const h = harness({ ...cheap(), platform: { parseStdfFiltered } });
      await runLoad([file('bad.stdf'), file('good.stdf')], false, false, h.deps);
      expect(errors(h)).toEqual([expect.stringMatching(/Failed to parse bad\.stdf: truncated record/)]);
      expect(h.rendered).toHaveLength(1);
      expect(h.rendered[0].fileName).toBe('good.stdf');
    });

    it('returns to the empty state when no file parses', async () => {
      const h = harness({ ...cheap(), platform: { parseStdfFiltered: vi.fn(async () => { throw new Error('nope'); }) } });
      await runLoad([file('a.stdf')], false, false, h.deps);
      expect(h.ended).toEqual(['Error: no files parsed successfully']);
      expect(h.cleared.empty).toBe(1);
      expect(h.rendered).toEqual([]);
    });

    it('keeps the old view when no file parses during an append', async () => {
      const h = harness({ ...cheap(), platform: { parseStdfFiltered: vi.fn(async () => { throw new Error('nope'); }) } });
      await runLoad([file('a.stdf')], true, false, h.deps);
      expect(h.ended).toEqual(['Error: no files parsed successfully']);
      expect(h.cleared.empty).toBe(0);
    });

    it('does not abort the load when one CSV fails to parse', async () => {
      const h = harness({ platform: { parseCsv: vi.fn(async () => { throw new Error('bad row'); }) } });
      await runLoad([file('a.csv')], false, false, h.deps);
      expect(errors(h)[0]).toMatch(/Failed to parse a\.csv: bad row/);
      expect(h.ended).toEqual(['Error: no files parsed successfully']);
    });
  });

  describe('CSV', () => {
    it('maps once, parses, and renders without a second parse', async () => {
      const h = harness({ ui: { selectTests: vi.fn(async () => confirm([1])) } });
      // two wafers x 4 dies is cheap, so the selector is skipped and every test imports
      await runLoad([file('a.csv')], false, false, h.deps);
      expect(h.ui.mapping).toHaveBeenCalledTimes(1);
      expect(h.platform.parseCsv).toHaveBeenCalledTimes(1);
      expect(h.scan).not.toHaveBeenCalled();
      expect(h.rendered).toHaveLength(1);
      expect(h.rendered[0].fileName).toBe('a.csv');
    });
  });
});

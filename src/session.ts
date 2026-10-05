// The lot that is currently loaded, in one place.
//
// This used to be fourteen module-level `let`s in main.ts, read and written from
// the load flow, the Tests…/Splits… dialogs, the bin definitions dialog and
// the renderer. One object means a load can be described (and, in a test, set up
// and checked) as a single value, and a reset is one call, rather than a list of
// assignments somebody has to remember to keep complete.

import type { BinDef } from '@wafertools/wafermap';
import type { FileHandle, StdfTestNames } from './platform';
import type { TestDefCollision } from './lib';
import type { TestListEntry } from './testSelectorUI';
import type { FileDefs, TestDef, WaferData, WaferSource } from './types';

export interface LotSession {
  wafers: WaferData[];
  fileName: string;
  /** The lot-wide UNION of every file's test definitions — for the test selector, the
   *  test-definitions file and `applyTestSelection`, which legitimately need one list. */
  testDefs: Record<string, TestDef>;
  /**
   * Each loaded file's OWN test definitions, keyed by the `WaferSource` its wafers share
   * by reference (the same key `wcrFor` uses).
   *
   * `testDefs` above is the lot-wide union. What it must NOT be is the thing handed to
   * wmap: a test number identifies a test within a test program, so across a multi-file
   * load the same number can name different measurements. Flattening the files' lists
   * into one object (`Object.assign`, which is last-wins) silently kept whichever file
   * loaded last, and every wafer was then plotted, normalised and capability-scored
   * against that survivor's limits — a 0-5 nA leakage test judged against a 260-380 mV
   * threshold's spec. wmap reconciles per wafer (`mergeTestDefs`) and withholds any
   * number the files disagree about, which it can only do if each wafer arrives with its
   * own file's defs.
   */
  defsBySource: Map<WaferSource, FileDefs>;
  /** Files that disagree about a test number, from the current load — retained so the
   *  test-definitions dialog can refuse an override it cannot apply honestly. */
  testDefCollisions: TestDefCollision[];
  /** From STDF/ATDF HBR/SBR — see ParsedFile.hbinDefs/sbinDefs/passHbins (types.ts).
   *  Undefined for formats with no HBR/SBR equivalent, or a file that had none;
   *  buildWaferMap call sites treat undefined the same as "nothing to pass," falling
   *  back to wmap's own default (bare bin numbers, passBins [1]). */
  hbinDefs: BinDef[] | undefined;
  sbinDefs: BinDef[] | undefined;
  passHbins: number[] | undefined;
  /** Derived tests: the rows of the loaded test-definitions file that carry an expression
   *  (see TestListEntry). Handed to every buildWaferMap call, which computes them per die;
   *  they then behave as ordinary tests everywhere. */
  derivedTests: TestListEntry[];
  /** Which of them the user has selected — the rest stay defined (reopening the selector
   *  lists them) but are not computed. */
  derivedSelected: Set<number>;
  /** The most recently loaded STDF/ATDF files, so "Tests…" can re-parse them. */
  binaryFiles: FileHandle[];
  /** First-pass scan result, reused by "Tests…". */
  testNames: StdfTestNames | null;
  /** Whether the current test list came from the largest file only or all files — so
   *  "Tests…" can still offer to widen the scan if it wasn't already. */
  binaryScanScope: 'largest' | 'all';
}

/** What an empty app holds. A function, not a constant: the collections are fresh each time. */
export function emptySession(): LotSession {
  return {
    wafers: [],
    fileName: 'wafermap',
    testDefs: {},
    defsBySource: new Map(),
    testDefCollisions: [],
    hbinDefs: undefined,
    sbinDefs: undefined,
    passHbins: undefined,
    derivedTests: [],
    derivedSelected: new Set(),
    binaryFiles: [],
    testNames: null,
    binaryScanScope: 'largest',
  };
}

/** The one live session. Mutated in place (`session.wafers = …`), never replaced. */
export const session: LotSession = emptySession();

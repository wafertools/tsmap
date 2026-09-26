import type { ParsedStdf } from './testdata_parser.js';

/**
 * Turn the buffer a parse function returns (`parse_stdf`, `parse_csv`, …) into a
 * `ParsedStdf`. Accepts the `Uint8Array` the function returned, or the
 * `ArrayBuffer` it was transferred or delivered as.
 */
export function decodeParsed(input: Uint8Array | ArrayBuffer): ParsedStdf;

/** A wafer's records as columns: the shape `@wafertools/wafermap` accepts as `results` (`DieColumns`). */
export interface ParsedColumns {
  /** Number of records. */
  count: number;
  /** Per record; −32768 = no position. */
  x?: Int32Array;
  y?: Int32Array;
  /** Per record; 65535 = none. */
  hbin?: Uint32Array;
  sbin?: Uint32Array;
  siteNum?: Uint32Array;
  partId?: Array<number | string | undefined>;
  supersedes?: Array<'partId' | 'position' | undefined>;
  /** Per test number: the records that have a value, and their values. */
  testValues?: Record<number, { indices: Int32Array; values: Float32Array | Float64Array }>;
  /** Per test number: the records that have a recorded verdict; 1 = pass, 0 = fail. */
  testPass?: Record<number, { indices: Int32Array; values: Int8Array }>;
}

/** A `ParsedStdf` whose wafers carry their records as columns. */
export type ParsedStdfColumns = Omit<ParsedStdf, 'wafers'> & {
  wafers: Array<Omit<ParsedStdf['wafers'][number], 'results'> & { results: ParsedColumns }>;
};

/**
 * Like `decodeParsed`, but each wafer's `results` stays columns, with no object
 * per die: positions, bins and site as typed arrays with STDF's missing values,
 * test values and verdicts sparse. Pass a wafer's `results` straight to
 * `buildWaferMap`. Nothing refers to the input buffer afterwards. Within a
 * wafer, columns with the same records present share one `indices` array:
 * treat them as read-only.
 */
export function decodeColumns(input: Uint8Array | ArrayBuffer): ParsedStdfColumns;

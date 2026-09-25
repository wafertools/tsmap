import type { ParsedStdf } from './testdata_parser.js';

/**
 * Turn the buffer a parse function returns (`parse_stdf`, `parse_csv`, …) into a
 * `ParsedStdf`. Accepts the `Uint8Array` the function returned, or the
 * `ArrayBuffer` it was transferred or delivered as.
 */
export function decodeParsed(input: Uint8Array | ArrayBuffer): ParsedStdf;

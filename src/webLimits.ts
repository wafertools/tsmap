// The browser build's size limit, shared by the test selector's warning
// (lib.ts, `webValueBudgetWarning`) and the parser worker's out-of-memory
// message, which does not import lib.ts. One number, in one place.

/**
 * Test values (dies × selected tests) the browser build can be relied on to
 * parse.
 *
 * The browser build parses in WebAssembly, whose memory is 32-bit: 4 GB at
 * most. The parser holds the file plus about 40–45 bytes per test value while
 * it parses. Measured 2026-09-26 in V8 (the parser's WASM memory after one
 * parse, which never shrinks, so it is the peak), and loaded in Chrome:
 *
 * | lot | values | parser memory | in Chrome |
 * | --- | --- | --- | --- |
 * | 266,325 dies × 51 tests (341 MB STDF) | 13.6M | 855 MB | loads |
 * | 400,000 × 50 (CSV) | 20M | 970 MB | loads |
 * | 1,000,000 × 50 | 50M | 2,197 MB | loads |
 * | 1,500,000 × 50 | 75M | 3,736 MB | loads, 2.3 GB page heap with the gallery |
 * | 2,000,000 × 50 | 100M | out of memory | the parse fails |
 *
 * So the axis is values, not dies. Selecting fewer tests lowers it, because a
 * filtered parse holds only the selected tests. 60M leaves the parser about a
 * quarter of its memory spare. The desktop build parses natively, with no such
 * limit.
 *
 * Deliberately not a hard block: the user is told the number and decides.
 */
export const WEB_VALUE_BUDGET = 60_000_000;

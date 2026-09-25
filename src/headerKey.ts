/** A column header in the form every header alias table in tsmap is keyed by:
 *  trimmed, lowercased, with spaces, `_` and `-` removed — so `Lo Limit`,
 *  `lo-limit` and `LoLimit` are one name. */
export function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

import { storageKey } from './storageKeys';
// Persistence for wafer geometry overrides passed to wmap as
// `buildWaferMap({ waferConfig: { diameter, edgeExclusion } })`. Both are
// single global values applied to every wafer in whatever's currently loaded
// — unlike splits.ts, these are fixed physical/process properties, not
// something that varies per wafer — persisted the same simple way theme.ts
// persists the theme choice.
//
// Edge exclusion is only ever meaningful relative to a confirmed diameter:
// wmap's diameter is *inferred* from the die grid when not supplied (see
// `inferWaferFromXY`, packages/core/inference/wafer.ts in wafermap), and its
// edge-exclusion math has no guard against an exclusion value that doesn't
// fit the resolved radius — logged as WMAP_ISSUES.md #42. `normalizeWaferGeometry`
// below is the single place that enforces "edge exclusion only applies once a
// diameter is set" — every caller (the dialog, the CLI) goes through it
// rather than re-deriving the rule.

const DIAMETER_KEY = storageKey('tsmap:wafer-diameter-mm');
const EXCLUSION_KEY = storageKey('tsmap:edge-exclusion-mm');

/** The persisted wafer diameter in mm, or `undefined` if unset/invalid. */
export function getWaferDiameterMm(): number | undefined {
  try {
    const raw = localStorage.getItem(DIAMETER_KEY);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Persists `mm`, or clears the stored value when `mm` is unset/non-positive/invalid. */
export function setWaferDiameterMm(mm: number | undefined): void {
  try {
    if (mm == null || !Number.isFinite(mm) || mm <= 0) localStorage.removeItem(DIAMETER_KEY);
    else localStorage.setItem(DIAMETER_KEY, String(mm));
  } catch {
    // ignore — same as theme.ts, a private-browsing/storage-denied session
    // just doesn't persist across launches
  }
}

/** The persisted edge-exclusion width in mm, or `undefined` if unset/invalid.
 *  `0` is a legitimate, persistable "no exclusion" value here — unlike
 *  diameter (which has no meaningful zero), the CLI (`--edge-exclusion`,
 *  `cli_files.rs`) validates `>= 0` and the dialog accepts `0` too, so this
 *  must not silently coerce an explicit `0` into "unset" (they render
 *  identically either way — wmap's own `edgeExclusion > 0` check treats both
 *  the same — but persistence should still preserve what the user actually
 *  set, not quietly discard it). */
export function getEdgeExclusionMm(): number | undefined {
  try {
    const raw = localStorage.getItem(EXCLUSION_KEY);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Persists `mm` (including an explicit `0` — see `getEdgeExclusionMm`), or
 *  clears the stored value when `mm` is unset/negative/invalid. */
export function setEdgeExclusionMm(mm: number | undefined): void {
  try {
    if (mm == null || !Number.isFinite(mm) || mm < 0) localStorage.removeItem(EXCLUSION_KEY);
    else localStorage.setItem(EXCLUSION_KEY, String(mm));
  } catch {
    // ignore
  }
}

export interface WaferGeometry {
  diameterMm: number | undefined;
  edgeExclusionMm: number | undefined;
}

/**
 * Enforces "edge exclusion only applies once a diameter is set" — an
 * absolute mm exclusion value is only meaningful relative to a confirmed
 * diameter (see the module doc above). When `diameterMm` is unset, any
 * `edgeExclusionMm` is dropped rather than silently applied against
 * whatever wmap would otherwise infer.
 */
export function normalizeWaferGeometry(
  diameterMm: number | undefined,
  edgeExclusionMm: number | undefined,
): WaferGeometry {
  if (diameterMm === undefined) return { diameterMm: undefined, edgeExclusionMm: undefined };
  return { diameterMm, edgeExclusionMm };
}

/** Normalizes then persists both values through the single gate above — the
 *  choke point every caller (dialog, CLI) goes through, so persisted state
 *  can never end up in the gated-invalid combination either. */
export function setWaferGeometry(geometry: WaferGeometry): WaferGeometry {
  const normalized = normalizeWaferGeometry(geometry.diameterMm, geometry.edgeExclusionMm);
  setWaferDiameterMm(normalized.diameterMm);
  setEdgeExclusionMm(normalized.edgeExclusionMm);
  return normalized;
}

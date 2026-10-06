import { storageKey } from './storageKeys';
// Persistence for the reticle (stepper field) grid passed to wmap as
// `buildWaferMap({ reticleConfig })`. A reticle is the group of dies exposed in
// one lithography step: its width and height in dies are properties of the
// product and the stepper, not of a wafer, so one value applies to every wafer
// in whatever is loaded — persisted the same simple way waferGeometry.ts keeps
// the diameter.
//
// Nothing in a wafer file says how many dies make a field, so there is no
// automatic value to fall back on: unset means no reticle overlay and no
// reticle-position findings, which is what wmap does without a config.

const RETICLE_KEY = storageKey('tsmap:reticle');

export interface ReticleSettings {
  /** Field width in dies. */
  width: number;
  /** Field height in dies. */
  height: number;
  /** The die at a field's min-x/min-y corner; omitted means die (0, 0). */
  anchorDie?: { x: number; y: number };
}

const isPositiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * `value` as settings, or `undefined` when it is not a usable reticle: a field is a whole
 * number of dies in each direction, and an anchor is a die position. The one gate for the
 * dialog, storage and anything else that reads a reticle from outside.
 */
export function normalizeReticle(value: unknown): ReticleSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as { width?: unknown; height?: unknown; anchorDie?: { x?: unknown; y?: unknown } | null };
  if (!isPositiveInt(v.width) || !isPositiveInt(v.height)) return undefined;
  const out: ReticleSettings = { width: v.width, height: v.height };
  const a = v.anchorDie;
  // An anchor of (0, 0) is wmap's default, so it is not stored as a setting of its own.
  if (a && isInt(a.x) && isInt(a.y) && (a.x !== 0 || a.y !== 0)) out.anchorDie = { x: a.x, y: a.y };
  return out;
}

/** The persisted reticle, or `undefined` if unset or unreadable. */
export function getReticle(): ReticleSettings | undefined {
  try {
    const raw = localStorage.getItem(RETICLE_KEY);
    return raw === null ? undefined : normalizeReticle(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** Persists `reticle`, or clears the stored value when it is unset or unusable. Returns what was kept. */
export function setReticle(reticle: ReticleSettings | undefined): ReticleSettings | undefined {
  const kept = normalizeReticle(reticle);
  try {
    if (kept === undefined) localStorage.removeItem(RETICLE_KEY);
    else localStorage.setItem(RETICLE_KEY, JSON.stringify(kept));
  } catch {
    // ignore — a session where storage is denied just doesn't remember it, like theme.ts
  }
  return kept;
}

/** The `reticleConfig` wmap takes, or `undefined` so the key can be left off the call. */
export function toWmapReticleConfig(reticle: ReticleSettings | undefined) {
  return reticle === undefined
    ? undefined
    : { width: reticle.width, height: reticle.height, ...(reticle.anchorDie ? { anchorDie: reticle.anchorDie } : {}) };
}

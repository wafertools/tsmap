// The reader's wafer-map preferences — every view option wmap classes as one (`WAFER_PREFERENCE_KEYS`: colour
// schemes, overlays, legend position, number format, the Insights charts' axis settings and the rest) —
// remembered across loads and restarts.
//
// wmap decides which options are preferences, so this keeps exactly those, and nothing that describes the data
// on screen: orientation, the compact layout and log scale are state in wmap, because carried to another lot
// each would describe it wrongly. A save is a plain save-on-change of the preference keys a change touched; a
// restore spreads what was saved into `viewOptions` at mount.

import { listBinColorSchemes, listValueColorSchemes } from '@wafertools/wafermap';
import { WAFER_PREFERENCE_KEYS } from '@wafertools/wafermap/render';
import type { WaferPreferences, WaferViewOptions } from '@wafertools/wafermap/render';
import { storageKey } from './storageKeys';

// The slot the colour choices were first kept in, so they survive the change to keeping every preference.
const KEY = storageKey('tsmap:map-colors');

const isBoolean = (v: unknown): boolean => typeof v === 'boolean';
const oneOf = (...allowed: string[]) => (v: unknown): boolean => typeof v === 'string' && allowed.includes(v);

/**
 * What a saved value must be to be restored, per preference. A `Record` over every key, so a preference wmap adds
 * is a type error here until it is given a check. A saved scheme name that is no longer registered is dropped
 * rather than passed through: wmap would quietly draw its default while the menu showed nothing ticked.
 */
const VALID: Record<keyof WaferPreferences, (v: unknown) => boolean> = {
  binColorScheme: (v) => typeof v === 'string' && listBinColorSchemes().some(s => s.name === v),
  valueColorScheme: (v) => typeof v === 'string' && listValueColorSchemes().some(s => s.name === v),
  reverseValueScheme: isBoolean,
  useDefinedBinColors: isBoolean,
  showDieLabels: isBoolean,
  showRingBoundaries: isBoolean,
  showQuadrantBoundaries: isBoolean,
  showReticle: isBoolean,
  showXYIndicator: isBoolean,
  showAxes: isBoolean,
  legendPosition: oneOf('default', 'compact', 'bottom', 'top', 'left', 'floating'),
  fallbackFormat: oneOf('si', 'engineering'),
  markFailingDies: isBoolean,
  colorbarRangeMode: oneOf('spec', 'data'),
  chartAxisIncludesLimits: isBoolean,
  chartClipOutliers: isBoolean,
  chartLimitLines: oneOf('test', 'spec', 'both', 'none'),
};

function readSaved(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * The saved preferences, to spread into `viewOptions` at mount: only wmap's preference keys, each only when its
 * value is still valid. Empty when nothing is saved or storage is unavailable, so wmap's own defaults apply.
 */
export function loadMapPrefs(): WaferPreferences {
  const saved = readSaved();
  const prefs: Record<string, unknown> = {};
  for (const key of WAFER_PREFERENCE_KEYS) {
    if (key in saved && VALID[key](saved[key])) prefs[key] = saved[key];
  }
  return prefs as WaferPreferences;
}

/**
 * `onViewOptionsChange` handler for both the single map and the gallery. Saves the preference keys among the
 * changed ones, a mixed change included; a change to state alone (plot mode, active test, orientation) passes
 * through without touching storage.
 */
export function saveMapPrefs(opts: WaferViewOptions, changed: readonly (keyof WaferViewOptions)[]): void {
  const keys = changed.filter((k): k is keyof WaferPreferences => (WAFER_PREFERENCE_KEYS as readonly string[]).includes(k));
  if (!keys.length) return;
  const saved = readSaved();
  for (const key of keys) {
    if (opts[key] === undefined) delete saved[key];
    else saved[key] = opts[key];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Unavailable or full — the choice still applies for this session.
  }
}

// The setup file: the settings that belong to a product or a site rather than to one lot — wafer diameter, edge
// exclusion, the reticle, which result counts for a retested die, and which limits exclude a test value. They each
// have a dialog; this is the one file that carries them all, so a site can share them and a launch can start from them
// (`--setup`). Same family as the other definitions files: a `setting,value` CSV with a header, `#` comments, lenient
// names, a bad value dropped with a warning and never the whole file. Loading never clears a setting the file does not
// state, and Save writes only what is set, so the two never fight.
//
// Every value goes through the module that owns it — `normalizeReticle`, `normalizeWaferGeometry` and the two choice lists —
// so a value the dialog would refuse is refused here too.

import { normalizeHeaderKey } from './headerKey';
import { normalizeReticle, type ReticleSettings } from './reticle';
import { RETEST_POLICIES, type RetestPolicy } from './retestPolicy';
import { VALUE_FILTER_MODES, type ValueFilterMode } from './valueFilter';

export interface SetupSettings {
  waferDiameterMm?: number;
  edgeExclusionMm?: number;
  reticle?: ReticleSettings;
  retestPolicy?: RetestPolicy;
  valueFilter?: ValueFilterMode;
}

type SetupKey = 'diameter' | 'edge' | 'reticle' | 'retests' | 'valueFilter';

const KEY_ALIASES: Record<string, SetupKey> = {
  waferdiameter: 'diameter', diameter: 'diameter',
  edgeexclusion: 'edge', exclusion: 'edge', edge: 'edge',
  reticle: 'reticle', stepperfield: 'reticle', stepper: 'reticle', field: 'reticle',
  retests: 'retests', retestpolicy: 'retests', retest: 'retests',
  valuefilter: 'valueFilter', excludevalues: 'valueFilter', excludevaluesoutsidelimits: 'valueFilter',
};

/** `4x3` or `4x3@1,0`: the field in dies, and the die at its min-x/min-y corner. The `--reticle` flag's form. */
export function parseReticleText(text: string): ReticleSettings | undefined {
  const m = /^\s*(\d+)\s*[xX]\s*(\d+)\s*(?:@\s*(-?\d+)\s*,\s*(-?\d+)\s*)?$/.exec(text);
  if (!m) return undefined;
  return normalizeReticle({
    width: Number(m[1]), height: Number(m[2]),
    ...(m[3] !== undefined ? { anchorDie: { x: Number(m[3]), y: Number(m[4]) } } : {}),
  });
}

export function formatReticleText(r: ReticleSettings): string {
  return `${r.width}x${r.height}${r.anchorDie ? `@${r.anchorDie.x},${r.anchorDie.y}` : ''}`;
}

/** A positive or non-negative number with an optional `mm`, or undefined. */
function parseMm(text: string, allowZero: boolean): number | undefined {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : undefined;
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1').trim();

/**
 * Reads a setup file. Never throws: an unrecognised setting or a value that does not fit is reported through
 * `onWarn` and left out, the rest of the file still applies.
 */
export function parseSetupFile(text: string, onWarn?: (lineNo: number, message: string) => void): SetupSettings {
  const out: SetupSettings = {};
  let headerChecked = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const comma = line.indexOf(',');
    const rawKey = (comma < 0 ? line : line.slice(0, comma)).trim();
    const rawValue = comma < 0 ? '' : unquote(line.slice(comma + 1));
    if (!headerChecked) {
      headerChecked = true;
      const k = normalizeHeaderKey(rawKey);
      if ((k === 'setting' || k === 'key' || k === 'name') && normalizeHeaderKey(rawValue) === 'value') continue;
    }
    const key = KEY_ALIASES[normalizeHeaderKey(rawKey)];
    if (!key) { onWarn?.(i + 1, `Unrecognized setting "${rawKey}" ignored`); continue; }
    if (rawValue === '') continue;   // blank leaves the setting alone, as in every definitions file
    switch (key) {
      case 'diameter': {
        const mm = parseMm(rawValue, false);
        if (mm === undefined) onWarn?.(i + 1, `Invalid wafer diameter "${rawValue}" ignored (expected a number of millimetres above 0)`);
        else out.waferDiameterMm = mm;
        break;
      }
      case 'edge': {
        const mm = parseMm(rawValue, true);
        if (mm === undefined) onWarn?.(i + 1, `Invalid edge exclusion "${rawValue}" ignored (expected a number of millimetres, 0 or more)`);
        else out.edgeExclusionMm = mm;
        break;
      }
      case 'reticle': {
        const r = parseReticleText(rawValue);
        if (!r) onWarn?.(i + 1, `Invalid reticle "${rawValue}" ignored (expected WxH or WxH@X,Y in whole dies, such as 4x3 or 4x3@1,0)`);
        else out.reticle = r;
        break;
      }
      case 'retests': {
        const v = rawValue.toLowerCase() as RetestPolicy;
        if (!RETEST_POLICIES.includes(v)) onWarn?.(i + 1, `Invalid retest policy "${rawValue}" ignored (expected ${RETEST_POLICIES.join(', ')})`);
        else out.retestPolicy = v;
        break;
      }
      case 'valueFilter': {
        const lower = rawValue.toLowerCase();
        const v = (lower === 'off' ? 'none' : lower) as ValueFilterMode;
        if (!VALUE_FILTER_MODES.includes(v)) onWarn?.(i + 1, `Invalid value filter "${rawValue}" ignored (expected ${VALUE_FILTER_MODES.join(', ')})`);
        else out.valueFilter = v;
        break;
      }
    }
  }
  return out;
}

/** The file `parseSetupFile` reads. The two choices are always written (the value in force is worth stating in a shared file); the rest only when set. */
export function formatSetupFile(s: SetupSettings): string {
  const rows: string[] = [];
  if (s.waferDiameterMm !== undefined) rows.push(`waferDiameter,${s.waferDiameterMm}`);
  if (s.waferDiameterMm !== undefined && s.edgeExclusionMm !== undefined) rows.push(`edgeExclusion,${s.edgeExclusionMm}`);
  if (s.reticle) rows.push(`reticle,${formatReticleText(s.reticle)}`);
  if (s.retestPolicy) rows.push(`retests,${s.retestPolicy}`);
  if (s.valueFilter) rows.push(`valueFilter,${s.valueFilter}`);
  return [
    '# tsmap setup',
    `# Saved: ${new Date().toISOString()}`,
    '# Diameter and edge exclusion are millimetres; reticle is the field in dies (WxH, or WxH@X,Y for its corner die).',
    'setting,value',
    ...rows.map(r => r.replace(/^([^,]+),(.*)$/, (_m, k: string, v: string) => (v.includes(',') ? `${k},"${v}"` : `${k},${v}`))),
  ].join('\n');
}

const MM = (n: number) => `${n} mm`;

/** What a setup says, one phrase per setting it states, for the log and the dialog. */
export function describeSetup(s: SetupSettings): string[] {
  const out: string[] = [];
  if (s.waferDiameterMm !== undefined) out.push(`wafer diameter ${MM(s.waferDiameterMm)}`);
  if (s.edgeExclusionMm !== undefined) out.push(`edge exclusion ${MM(s.edgeExclusionMm)}`);
  if (s.reticle) out.push(`reticle ${formatReticleText(s.reticle)}`);
  if (s.retestPolicy) out.push(`retests ${s.retestPolicy}`);
  if (s.valueFilter) out.push(`value filter ${s.valueFilter}`);
  return out;
}

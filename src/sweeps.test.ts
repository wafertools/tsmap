import { describe, it, expect } from 'vitest';
import RRAM_SWEEPS from '../sample_data/RRAM-LOT-06_sweeps.json?raw';
import { parseSweepsFile, formatSweepsFile, jsonErrorOffset, SWEEPS_TEMPLATE } from './sweeps';

const wrap = (sweeps: unknown) => JSON.stringify({ format: 'tsmap-sweeps', version: 1, sweeps });
const SWEEP = {
  id: 'sr', title: 'Set / reset',
  series: [
    { label: 'Reset', tests: ['3000..3030'], xValues: [0, 1] },
    { label: 'Set', tests: [3100, '3101..3130'] },
  ],
  separationAt: [10],
};

describe('parseSweepsFile', () => {
  it('passes a valid sweep through unchanged — it is wmap\'s own shape', () => {
    const r = parseSweepsFile(wrap([SWEEP]));
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.sweeps).toEqual([SWEEP]);
  });

  it('rejects a file that is not a sweeps file, rather than reading die data as sweeps', () => {
    expect(parseSweepsFile('[{"x":1,"y":2}]').error).toMatch(/not a sweeps file/);
    expect(parseSweepsFile('{"sweeps":[]}').error).toMatch(/not a sweeps file/);
  });

  it('reports where a JSON syntax error is', () => {
    const r = parseSweepsFile('{\n  "format": "tsmap-sweeps",\n  "sweeps": [,]\n}');
    expect(r.error).toMatch(/at line 3, column 14, at ",]"/);
  });

  it('locates a trailing comma, a missing quote, and a truncated file', () => {
    expect(jsonErrorOffset('{"a": [1, 2,]}')).toBe(12);
    expect(jsonErrorOffset('{"a": tru}')).toBe(6);
    expect(jsonErrorOffset('{"a": 1')).toBe(7);
    expect(jsonErrorOffset('{"a": "x\\"y"}')).toBeUndefined();
  });

  it('keeps the good sweeps and names each bad one', () => {
    const r = parseSweepsFile(wrap([
      SWEEP,
      { id: 'sr', title: 'dup', series: SWEEP.series },
      { title: 'no id', series: SWEEP.series },
      { id: 'bad-tests', series: [{ label: 'A', tests: ['30..x'] }] },
    ]));
    expect(r.sweeps.map(s => s.id)).toEqual(['sr']);
    expect(r.warnings.join('\n')).toMatch(/"sr": the id is used twice/);
    expect(r.warnings.join('\n')).toMatch(/Sweep 3: missing "id"/);
    expect(r.warnings.join('\n')).toMatch(/"30\.\.x" in "tests" is not a test number or a range/);
  });

  it('drops a bad optional field with a warning and keeps the sweep', () => {
    const r = parseSweepsFile(wrap([{ ...SWEEP, separationAt: ['10'], extra: 1 }]));
    expect(r.sweeps[0].separationAt).toBeUndefined();
    expect(r.warnings.join('\n')).toMatch(/separationAt/);
    expect(r.warnings.join('\n')).toMatch(/unknown field "extra"/);
  });

  it('accepts x values read from test names, an x unit and a log x axis', () => {
    const cdf = {
      id: 'cdf', title: 'LRS CDF', xLabel: 'LRS threshold', xUnit: 'Ω', xScale: 'log',
      series: [{ label: 'After 0x5', tests: ['31200..31230'], xFromName: 'LRS_STATS_{x}' }],
    };
    const r = parseSweepsFile(JSON.stringify({ format: 'tsmap-sweeps', version: 1, sweeps: [cdf] }));
    expect(r.warnings).toEqual([]);
    expect(r.sweeps).toEqual([cdf]);
  });

  it('drops a name pattern without {x}, or an unknown x scale, with a warning', () => {
    const r = parseSweepsFile(JSON.stringify({ format: 'tsmap-sweeps', version: 1, sweeps: [{
      id: 's', xScale: 'logarithmic', series: [{ label: 'A', tests: [1, 2], xFromName: 'LRS_STATS_' }],
    }] }));
    expect(r.sweeps[0].xScale).toBeUndefined();
    expect(r.sweeps[0].series[0].xFromName).toBeUndefined();
    expect(r.warnings.some(w => /"xFromName" must be a pattern containing \{x\}/.test(w))).toBe(true);
    expect(r.warnings.some(w => /"xScale" must be "linear" or "log"/.test(w))).toBe(true);
  });

  it('an empty list is valid — it clears the sweeps', () => {
    const r = parseSweepsFile(wrap([]));
    expect(r.error).toBeUndefined();
    expect(r.sweeps).toEqual([]);
  });

  it('round-trips through formatSweepsFile', () => {
    expect(parseSweepsFile(formatSweepsFile(SWEEPS_TEMPLATE)).sweeps).toEqual(SWEEPS_TEMPLATE);
  });

  it('reads the bundled RRAM sample', () => {
    const r = parseSweepsFile(RRAM_SWEEPS);
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.sweeps.map(s => s.id)).toEqual(['set-reset', 'endurance']);
  });
});

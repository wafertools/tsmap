import { describe, it, expect } from 'vitest';
import { parseSetupFile, formatSetupFile, parseReticleText, formatReticleText, describeSetup } from './setupFile';

const warnings = () => { const w: string[] = []; return { w, on: (n: number, m: string) => w.push(`${n}: ${m}`) }; };

describe('parseReticleText', () => {
  it.each([['4x3', { width: 4, height: 3 }], ['4X3', { width: 4, height: 3 }], ['4 x 3 @ 1, 0', { width: 4, height: 3, anchorDie: { x: 1, y: 0 } }],
    ['4x3@-1,2', { width: 4, height: 3, anchorDie: { x: -1, y: 2 } }], ['4x3@0,0', { width: 4, height: 3 }]])('%s', (text, want) => {
    expect(parseReticleText(text)).toEqual(want);
  });
  it.each(['', '4', '0x3', '4x0', '4x3@1', '4x3@a,b', '-4x3', '4.5x3'])('refuses %j', text => {
    expect(parseReticleText(text)).toBeUndefined();
  });
  it('round-trips through formatReticleText', () => {
    expect(parseReticleText(formatReticleText({ width: 5, height: 2, anchorDie: { x: 1, y: -1 } }))).toEqual({ width: 5, height: 2, anchorDie: { x: 1, y: -1 } });
  });
});

describe('parseSetupFile', () => {
  it('reads every setting', () => {
    const text = 'setting,value\nwaferDiameter,300\nedgeExclusion,3\nreticle,"4x3@1,0"\nretests,best\nvalueFilter,spec\n';
    expect(parseSetupFile(text)).toEqual({
      waferDiameterMm: 300, edgeExclusionMm: 3, reticle: { width: 4, height: 3, anchorDie: { x: 1, y: 0 } }, retestPolicy: 'best', valueFilter: 'spec',
    });
  });

  it('takes the reticle’s comma without quotes, splitting only at the first comma', () => {
    expect(parseSetupFile('reticle,4x3@1,0').reticle).toEqual({ width: 4, height: 3, anchorDie: { x: 1, y: 0 } });
  });

  it('works without a header, with comments, aliases, units and any case', () => {
    const text = '# site standard\nDiameter,300 mm\nEXCLUSION, 2.5mm\nStepper Field,4x3\nRetest-Policy,Worst\nExclude values,off\n';
    expect(parseSetupFile(text)).toEqual({ waferDiameterMm: 300, edgeExclusionMm: 2.5, reticle: { width: 4, height: 3 }, retestPolicy: 'worst', valueFilter: 'none' });
  });

  it('drops a bad value with a warning and keeps the rest', () => {
    const { w, on } = warnings();
    const s = parseSetupFile('waferDiameter,abc\nedgeExclusion,-1\nreticle,4\nretests,sometimes\nvalueFilter,spec\nmystery,1\n', on);
    expect(s).toEqual({ valueFilter: 'spec' });
    expect(w).toHaveLength(5);
    expect(w[4]).toMatch(/Unrecognized setting "mystery"/);
  });

  it('refuses a zero diameter but allows a zero exclusion', () => {
    expect(parseSetupFile('waferDiameter,0').waferDiameterMm).toBeUndefined();
    expect(parseSetupFile('edgeExclusion,0').edgeExclusionMm).toBe(0);
  });

  it('leaves a setting alone when its value is blank', () => {
    expect(parseSetupFile('waferDiameter,\nretests,\n')).toEqual({});
  });

  it('lets a later line win', () => {
    expect(parseSetupFile('retests,first\nretests,best').retestPolicy).toBe('best');
  });
});

describe('formatSetupFile', () => {
  it('round-trips through the parser', () => {
    const s = { waferDiameterMm: 300, edgeExclusionMm: 3, reticle: { width: 4, height: 3, anchorDie: { x: 1, y: 0 } }, retestPolicy: 'best' as const, valueFilter: 'spec' as const };
    expect(parseSetupFile(formatSetupFile(s))).toEqual(s);
  });

  it('writes only what is set, and no exclusion without a diameter', () => {
    const rows = formatSetupFile({ edgeExclusionMm: 3, retestPolicy: 'last' }).split('\n').filter(l => !l.startsWith('#'));
    expect(rows).toEqual(['setting,value', 'retests,last']);
  });

  it('quotes the reticle’s comma so a spreadsheet reads one cell', () => {
    expect(formatSetupFile({ reticle: { width: 4, height: 3, anchorDie: { x: 1, y: 0 } } })).toContain('reticle,"4x3@1,0"');
  });
});

describe('describeSetup', () => {
  it('names each setting a setup states', () => {
    expect(describeSetup({ waferDiameterMm: 300, retestPolicy: 'best' })).toEqual(['wafer diameter 300 mm', 'retests best']);
    expect(describeSetup({})).toEqual([]);
  });
});

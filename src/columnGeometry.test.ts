// What must hold for geometry read from a flat file's columns: a size is used only with its unit, the first wafer
// to state a field supplies it, a disagreement is reported, and the result feeds the same rule STDF's WCR does.

import { describe, it, expect } from 'vitest';
import { geometryFromColumns } from './columnGeometry';
import { makeWaferSource, wcrGeometryFrom } from './lib';

const wafer = (...pairs: Array<[string, string]>) => ({ fields: pairs.map(([key, value]) => ({ key, value })) });

describe('geometryFromColumns', () => {
  it('reads the labels a die-list export writes, converting sizes to millimetres', () => {
    const { fields, notes } = geometryFromColumns([wafer(
      ['Wafer diameter', '300 mm'], ['Die width', '16.9 mm'], ['Die height', '0.5 in'], ['Wafer flat', 'Bottom'],
      ['Centre die X', '12'], ['X increases', 'Right'], ['Y increases', 'Down'],
    )]);
    const get = (k: string) => fields.find(f => f.key === k)?.value;
    expect(get('wafrSiz')).toBe('300');
    expect(get('dieWid')).toBe('16.9');
    expect(get('dieHt')).toBe('12.7');
    expect(get('wfFlat')).toBe('D');
    expect(get('centerX')).toBe('12');
    expect(get('posX')).toBe('R');
    expect(get('posY')).toBe('D');
    expect(get('wfUnits')).toBe('3');
    expect(notes).toEqual([]);
  });

  it('leaves a size with no unit alone and says why', () => {
    const { fields, notes } = geometryFromColumns([wafer(['Wafer diameter', '300'], ['Die width', '10 mm'])]);
    expect(fields.find(f => f.key === 'wafrSiz')).toBeUndefined();
    expect(fields.find(f => f.key === 'dieWid')?.value).toBe('10');
    expect(notes[0]).toContain('Wafer diameter');
  });

  it('ignores columns that are not geometry, and blank cells without comment', () => {
    const { fields, notes } = geometryFromColumns([wafer(['Lot', 'A1'], ['Wafer diameter', ''])]);
    expect(fields).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('uses the first wafer\'s value and reports a later wafer that differs', () => {
    const { fields, notes } = geometryFromColumns([wafer(['Wafer diameter', '300 mm']), wafer(['Wafer diameter', '200 mm'])]);
    expect(fields.find(f => f.key === 'wafrSiz')?.value).toBe('300');
    expect(notes[0]).toContain('wafrSiz');
  });

  it('does not take a bare Diameter, Flat or Notch column as the wafer\'s', () => {
    const { fields } = geometryFromColumns([wafer(['Diameter', '4 in'], ['Flat', 'Left'], ['Notch', 'Down'])]);
    expect(fields).toEqual([]);
  });

  it('accepts the STDF names too', () => {
    const { fields } = geometryFromColumns([wafer(['WF_FLAT', 'L'], ['POS_X', 'L'])]);
    expect(fields.map(f => f.key).sort()).toEqual(['posX', 'wfFlat']);
  });

  it('reaches the map through the same rule as a WCR', () => {
    const wafers = [wafer(['Wafer diameter', '200 mm'], ['Die width', '5 mm'], ['Die height', '4 mm'], ['Wafer flat', 'Bottom'])];
    const source = makeWaferSource({ fields: [] }, 'x.csv', wafers);
    expect(wcrGeometryFrom(source)).toEqual({
      waferConfig: { diameter: 200, notch: { type: 'bottom' } },
      dieConfig: { width: 5, height: 4 },
    });
  });

  it('reads a column that is the same on every wafer from the file\'s lot-level fields, where the parser puts it', () => {
    const { fields } = geometryFromColumns([wafer(['Lot', 'A'])], [{ key: 'Wafer diameter', value: '300 mm' }, { key: 'Die width', value: '10 mm' }]);
    expect(fields.find(f => f.key === 'wafrSiz')?.value).toBe('300');
    expect(fields.find(f => f.key === 'dieWid')?.value).toBe('10');
    const source = makeWaferSource({ fields: [{ key: 'Wafer diameter', value: '200 mm' }] }, 'x.csv', [wafer()]);
    expect(wcrGeometryFrom(source)?.waferConfig.diameter).toBe(200);
  });

  it('does not override an STDF file\'s own WCR', () => {
    const source = makeWaferSource({ fields: [{ key: 'wafrSiz', value: '300' }, { key: 'wfUnits', value: '3' }] }, 'x.stdf', [wafer(['Wafer diameter', '200 mm'])]);
    expect(wcrGeometryFrom(source)?.waferConfig.diameter).toBe(300);
  });
});

import { columnsFromRows } from './columns';
import { describe, it, expect } from 'vitest';
import { curatedFields, displayValue, facetValueOf, isHiddenField, labelFor } from './metadata';
import { wmapAttributes } from './lib';
import type { MetaField, WaferData, WaferSource } from './types';

const fields = (o: Record<string, string>): MetaField[] =>
  Object.entries(o).map(([key, value]) => ({ key, value }));

const src = (o: Record<string, string>): WaferSource => ({ sourceFile: 'f.stdf', fields: fields(o) });

// Wafer with N dies, optional lot-level source and per-wafer fields.
function wafer(waferId: string, dieCount: number, source?: WaferSource, waferFields?: Record<string, string>): WaferData {
  return {
    waferId,
    results: columnsFromRows(Array.from({ length: dieCount }, (_, i) => ({ x: i, y: 0, hbin: 1 }))),
    source,
    fields: waferFields ? fields(waferFields) : undefined,
  };
}

describe('WCR fields', () => {
  // The bundled sample's record (PVT-LOT-05), which showed as "Wf Units: 3 · Wf Flat: D".
  const sample = src({ wafrSiz: '300', dieHt: '16.9', dieWid: '16.9', wfUnits: '3', wfFlat: 'D', centerX: '0', centerY: '0', posX: 'R', posY: 'U' });
  const getter = (o: Record<string, string>) => (k: string): string | undefined => o[k];

  it('gives sizes their units, never a bare number', () => {
    const w = wafer('W1', 1, sample);
    expect(facetValueOf(w, 'wafrSiz')).toBe('300 mm');
    expect(facetValueOf(w, 'dieWid')).toBe('16.9 mm');
    expect(facetValueOf(w, 'dieHt')).toBe('16.9 mm');
  });

  it('decodes every defined units code', () => {
    expect(displayValue('wafrSiz', '12', getter({ wfUnits: '1' }))).toBe('12 in');
    expect(displayValue('wafrSiz', '30', getter({ wfUnits: '2' }))).toBe('30 cm');
    expect(displayValue('dieWid', '1000', getter({ wfUnits: '4' }))).toBe('1000 mil');
  });

  it('says when units are not recorded, and names an invalid code rather than guessing', () => {
    expect(displayValue('wafrSiz', '300', getter({ wfUnits: '0' }))).toBe('300 (units not recorded)');
    expect(displayValue('wafrSiz', '300', getter({}))).toBe('300 (units not recorded)');
    expect(displayValue('wafrSiz', '300', getter({ wfUnits: '135' }))).toBe('300 (invalid units code 135)');
  });

  it('decodes the flat side and axis directions to words', () => {
    const w = wafer('W1', 1, sample);
    expect(facetValueOf(w, 'wfFlat')).toBe('Bottom');
    expect(facetValueOf(w, 'posX')).toBe('Right');
    expect(facetValueOf(w, 'posY')).toBe('Up');
    expect(displayValue('wfFlat', 'X', getter({}))).toBe('unrecognised code X');
  });

  it('never shows WF_UNITS as a field of its own — the sizes carry it', () => {
    expect(isHiddenField('wfUnits')).toBe(true);
    const keys = curatedFields().map(f => f.key);
    expect(keys).not.toContain('wfUnits');
    expect(keys).toContain('wafrSiz');
  });

  it('labels WCR fields in plain language and keeps them out of the default facets', () => {
    expect(labelFor('wfFlat')).toBe('Wafer flat');
    expect(labelFor('wafrSiz')).toBe('Wafer diameter');
    expect(curatedFields().find(f => f.key === 'wafrSiz')!.facet).toBe(false);
  });

  it('passes an ordinary field through unchanged', () => {
    expect(displayValue('lotId', '3', getter({ wfUnits: '3' }))).toBe('3');
  });
});

describe('facetValueOf', () => {
  it('reads a lot-level (source) field', () => {
    expect(facetValueOf(wafer('W1', 1, src({ lotId: 'A' })), 'lotId')).toBe('A');
  });
  it('reads a per-wafer field', () => {
    expect(facetValueOf(wafer('W1', 1, undefined, { frameId: 'FR-9' }), 'frameId')).toBe('FR-9');
  });
  it('returns undefined when no source and no wafer field', () => {
    expect(facetValueOf(wafer('W1', 1, undefined), 'lotId')).toBeUndefined();
  });
  it('returns undefined for an absent key', () => {
    expect(facetValueOf(wafer('W1', 1, src({ lotId: 'A' })), 'jobName')).toBeUndefined();
  });
  it('truncates date-typed fields to date-only', () => {
    expect(facetValueOf(wafer('W1', 1, src({ startT: '2026-06-23T14:31:00Z' })), 'startT')).toBe('2026-06-23');
  });
});

describe('wmapAttributes — tsmap\'s curation as wmap\'s `attributes` option', () => {
  const attrs = wmapAttributes();

  it('re-keys each field the way toWmapWaferMeta sends it, so wmap finds the entry', () => {
    expect(attrs.lot).toEqual({ label: 'Lot', facet: true });
    expect(attrs.testProgram).toMatchObject({ label: 'Program', facet: true });
    expect(attrs.product).toMatchObject({ label: 'Part type' });
    expect(attrs.operator).toMatchObject({ label: 'Operator' });
    expect(attrs.split).toMatchObject({ label: 'Split', facet: true });
  });

  it('covers both spellings of the temperature, which is a number only when it parses as one', () => {
    expect(attrs.temperature).toEqual(attrs.testTemp);
    expect(attrs.temperature.label).toBe('Temperature');
  });

  it('keeps the low-value and geometry fields out of Group by, and says which field is a date', () => {
    for (const key of ['jobRev', 'execType', 'waferDiameter', 'dieWidth', 'centreDieX', 'xIncreases']) {
      expect(attrs[key], key).toBeDefined();
      expect(attrs[key].facet, key).toBe(false);
    }
    expect(attrs.testDate).toMatchObject({ label: 'Test date', date: true });
  });

  it('leaves a hidden field out (WF_UNITS rides inside the sizes), and names every curated field once', () => {
    expect(attrs.wfUnits).toBeUndefined();
    const raw = curatedFields();
    expect(new Set(raw.map(f => f.key)).size).toBe(raw.length);
    expect(Object.keys(attrs).length).toBeGreaterThanOrEqual(raw.length);
  });
});

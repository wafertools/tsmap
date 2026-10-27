import { describe, it, expect } from 'vitest';
import { STORED_ITEMS } from './storageKeys';
import {
  portableSettings, writeSettingsFile, parseSettingsFile, applySettings, valueFits, portableKeys, EXCLUDED, SETTINGS_FORMAT,
} from './settingsFile';

const file = (settings: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ format: SETTINGS_FORMAT, version: 1, settings, ...extra });

describe('the allow-list', () => {
  it('decides every stored setting: portable or left out with a reason', () => {
    const decided = new Set([...portableKeys(), ...Object.keys(EXCLUDED)]);
    expect(STORED_ITEMS.filter(i => !decided.has(i.key)).map(i => i.key)).toEqual([]);
  });
  it('names no setting that does not exist', () => {
    const real = new Set(STORED_ITEMS.map(i => i.key));
    expect([...portableKeys(), ...Object.keys(EXCLUDED)].filter(k => !real.has(k))).toEqual([]);
  });
  it('never carries recent files or file contents', () => {
    expect(portableKeys()).not.toContain('tsmap:recent-files');
    expect(portableKeys()).not.toContain('tsmap:recent-definitions');
    expect(portableKeys()).not.toContain('tsmap:csv-mappings');
    expect(portableKeys()).not.toContain('tsmap:wafer-splits');
  });
  it('leaves the five setup values to the setup file, so no value is in two files', () => {
    for (const key of ['tsmap:wafer-diameter-mm', 'tsmap:edge-exclusion-mm', 'tsmap:reticle', 'tsmap:value-filter', 'tsmap:retest-policy']) {
      expect(portableKeys()).not.toContain(key);
      expect(EXCLUDED[key]).toMatch(/setup file/);
    }
  });
});

describe('valueFits', () => {
  it.each([
    ['tsmap:theme', 'dark', true], ['tsmap:theme', 'neon', false],
    ['tsmap:map-colors', '{"showReticle":true}', true], ['tsmap:map-colors', '{nope', false],
    ['tsmap:pinned-tests', '[1001,1002]', true],
    ['tsmap:retest-policy', 'best', false], ['tsmap:reticle', '{"width":4,"height":3}', false],
    ['tsmap:recent-files', '[]', false], ['tsmap:unknown', 'x', false], ['tsmap:theme', '', false],
  ])('%s = %j -> %s', (key, value, want) => {
    expect(valueFits(key, value)).toBe(want);
  });
  it('refuses a value that is not text, or is huge', () => {
    expect(valueFits('tsmap:theme', 5)).toBe(false);
    expect(valueFits('tsmap:plots', '[' + '1,'.repeat(2_000_000) + '1]')).toBe(false);
  });
});

describe('export', () => {
  const read = (m: Record<string, string>) => (k: string) => m[k] ?? null;
  it('lists only the portable settings that are stored and readable', () => {
    const items = portableSettings(read({
      'tsmap:theme': 'nord', 'tsmap:map-colors': '{nope', 'tsmap:retest-policy': 'best', 'tsmap:recent-files': '["/home/me/a.stdf"]', 'tsmap:csv-mappings': '{}',
    }));
    expect(items.map(i => i.key)).toEqual(['tsmap:theme']);
    expect(items[0].label).toBe('Colour theme');
  });
  it('writes a file that carries keys and values and nothing else', () => {
    const items = portableSettings(read({ 'tsmap:theme': 'nord', 'tsmap:pinned-tests': '[1001]', 'tsmap:reticle': '{"width":2,"height":2}' }));
    const data = JSON.parse(writeSettingsFile(items));
    expect(data.format).toBe(SETTINGS_FORMAT);
    expect(data.settings).toEqual([{ key: 'tsmap:theme', value: 'nord' }, { key: 'tsmap:pinned-tests', value: '[1001]' }]);
  });
});

describe('import', () => {
  it('round-trips through the file and back into storage', () => {
    const items = portableSettings(k => ({ 'tsmap:theme': 'nord', 'tsmap:pinned-tests': '[1001,1002]' } as Record<string, string>)[k] ?? null);
    const parsed = parseSettingsFile(writeSettingsFile(items));
    const written: Record<string, string> = {};
    expect(applySettings(parsed.items, (k, v) => { written[k] = v; })).toBe(2);
    expect(written).toEqual({ 'tsmap:theme': 'nord', 'tsmap:pinned-tests': '[1001,1002]' });
  });

  it('leaves out a setting that is excluded, unknown or unreadable, each with a message', () => {
    const warns: string[] = [];
    const { items } = parseSettingsFile(file([
      { key: 'tsmap:theme', value: 'dark' },
      { key: 'tsmap:recent-definitions', value: '[{"content":"secret"}]' },
      { key: 'tsmap:wafer-splits', value: '{}' },
      { key: 'tsmap:mystery', value: 'x' },
      { key: 'tsmap:map-colors', value: '{nope' },
      { key: 'tsmap:retest-policy', value: 'best' },
      { key: 5, value: 'x' },
    ]), m => warns.push(m));
    expect(items.map(i => i.key)).toEqual(['tsmap:theme']);
    expect(warns).toHaveLength(6);
    expect(warns[0]).toMatch(/file paths and file contents/);
    expect(warns[4]).toMatch(/setup file/);   // a setup value in a settings file is pointed at the setup file
  });

  it('keeps the first of a repeated setting', () => {
    const { items } = parseSettingsFile(file([{ key: 'tsmap:theme', value: 'dark' }, { key: 'tsmap:theme', value: 'nord' }]));
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe('dark');
  });

  it('never writes a value that does not fit, even if handed one', () => {
    const written: string[] = [];
    expect(applySettings([{ key: 'tsmap:theme', label: '', description: '', value: 'neon' }], k => written.push(k))).toBe(0);
    expect(written).toEqual([]);
  });

  it('survives a storage that throws', () => {
    expect(applySettings([{ key: 'tsmap:theme', label: '', description: '', value: 'dark' }], () => { throw new Error('full'); })).toBe(0);
  });

  it.each([
    ['not JSON', '{nope'],
    ['another kind of file', JSON.stringify({ format: 'tsmap-column-mappings', version: 1, settings: [] })],
    ['a newer version', file([], { version: 9 })],
    ['no list', JSON.stringify({ format: SETTINGS_FORMAT, version: 1 })],
  ])('reads %s as nothing, with a message', (_why, text) => {
    const warns: string[] = [];
    expect(parseSettingsFile(text, m => warns.push(m)).items).toEqual([]);
    expect(warns).toHaveLength(1);
  });
});


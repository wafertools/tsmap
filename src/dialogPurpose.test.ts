// Every file dialog remembers its own folder per purpose (see `DialogPurpose`).
// On the web that memory is the File System Access API's picker `id`, so these
// pin what the browser is asked for: the id, and an `accept` list the API will
// take — it throws on a multi-part extension such as `.stdf.gz`, which would
// turn every Open in Chromium into a silent no-op.

import { describe, it, expect, beforeEach } from 'vitest';
import INDEX_HTML from '../index.html?raw';
import { DATA_PICKER_EXTENSIONS } from './lib';

type Call = { id?: string; multiple?: boolean; types?: { description: string; accept: Record<string, string[]> }[] };
const calls: Call[] = [];
let next: () => Promise<unknown> = async () => [];

const win = globalThis as unknown as { window: Record<string, unknown> };
win.window ??= {};

const { canPickWebFilesByPurpose, pickWebFilesByPurpose } = await import('./platform');

beforeEach(() => {
  calls.length = 0;
  win.window.showOpenFilePicker = (opts: Call) => { calls.push(opts); return next(); };
});

describe('per-purpose web file picker', () => {
  it('is offered only where the browser has showOpenFilePicker', () => {
    expect(canPickWebFilesByPurpose()).toBe(true);
    delete win.window.showOpenFilePicker;
    expect(canPickWebFilesByPurpose()).toBe(false);
  });

  it('asks the browser to remember the folder under the purpose', async () => {
    const file = { name: 'lot.stdf' };
    next = async () => [{ kind: 'file', name: 'lot.stdf', getFile: async () => file }];
    const files = await pickWebFilesByPurpose('data', DATA_PICKER_EXTENSIONS, true);
    expect(files).toEqual([file]);
    expect(calls[0].id).toBe('tsmap-data');
    expect(calls[0].multiple).toBe(true);
    await pickWebFilesByPurpose('filters', ['json'], false);
    expect(calls[1].id).toBe('tsmap-filters');
  });

  it('offers only extensions the File System Access API accepts', async () => {
    next = async () => [];
    await pickWebFilesByPurpose('data', DATA_PICKER_EXTENSIONS, true);
    const exts = Object.values(calls[0].types![0].accept).flat();
    expect(exts.length).toBe(DATA_PICKER_EXTENSIONS.length);
    for (const e of exts) expect(e).toMatch(/^\.[a-z0-9]+$/);
  });

  it('reads a cancel as nothing chosen', async () => {
    next = async () => { throw new DOMException('cancelled', 'AbortError'); };
    expect(await pickWebFilesByPurpose('definitions', ['csv'], false)).toEqual([]);
  });

  it("index.html's file input does not restate the list — main.ts sets it", () => {
    const input = /<input id="file-input"[^>]*>/s.exec(INDEX_HTML)?.[0] ?? '';
    expect(input).not.toMatch(/accept=/);
  });
});

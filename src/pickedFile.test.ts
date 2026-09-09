import { describe, it, expect, beforeAll } from 'vitest';
import type { FileHandle } from './platform';

/**
 * Regression cover for the folder-scan path on WEB.
 *
 * `webPlatform.pickFolder` returns handles with an empty `bytes` and the real
 * browser `File` parked on `webFile`, so scanning a large folder costs no
 * reads. `materializePicked` is what finally reads it — but it looks at
 * `PickedFile.blob`, not at the handle. `pickedFromHandle` therefore has to
 * carry one across to the other, and when it did not (it returned a bare
 * `{ handle }`) every folder-scanned file reached the parser with zero bytes
 * and failed as "file too short to contain a FAR record".
 *
 * It went unnoticed in the tree (never in a release) because desktop handles
 * carry `path` and never take this route, and because the screenshot step
 * covering the filter table had itself been failing — so the one artefact that
 * would have shown it was stale.
 *
 * Imported dynamically after stubbing `window`: this suite runs in vitest's
 * node environment (no jsdom/happy-dom is configured) and `platform.ts`
 * evaluates `'__TAURI_INTERNALS__' in window` at module scope, which a static
 * import would hit before any stub could run.
 */

type FilterUI = typeof import('./fileFilterUI');
let pickedFromHandle: FilterUI['pickedFromHandle'];
let materializePicked: FilterUI['materializePicked'];

beforeAll(async () => {
  (globalThis as { window?: unknown }).window ??= {};
  ({ pickedFromHandle, materializePicked } = await import('./fileFilterUI'));
});

function webHandle(bytes: Uint8Array): FileHandle {
  // Minimal stand-in for a browser File — `materializePicked` only ever calls
  // arrayBuffer(), so nothing here needs a real File implementation.
  const blob = { arrayBuffer: async () => bytes.buffer } as unknown as File;
  return { name: 'small.stdf', bytes: new Uint8Array(0), size: bytes.length, webFile: blob };
}

describe('pickedFromHandle — web folder scan', () => {
  it('carries webFile across to blob so the bytes can be read later', () => {
    const handle = webHandle(new Uint8Array([1, 2, 3]));
    expect(pickedFromHandle(handle).blob).toBe(handle.webFile);
  });

  it('materialises real bytes from a scanned handle that starts empty', async () => {
    const handle = webHandle(new Uint8Array([1, 2, 3, 4]));
    expect(handle.bytes.length).toBe(0);

    const out = await materializePicked(pickedFromHandle(handle));

    // The actual defect: this came back still empty, so the parser was handed
    // nothing and reported a truncated file rather than a missing one.
    expect(Array.from(out.bytes)).toEqual([1, 2, 3, 4]);
  });

  it('leaves a desktop handle alone — no webFile, bytes read from path later', () => {
    const handle: FileHandle = { name: 'small.stdf', bytes: new Uint8Array(0), path: '/data/small.stdf' };
    const picked = pickedFromHandle(handle);
    expect(picked.blob).toBeUndefined();
    expect(picked.handle).toBe(handle);
  });
});

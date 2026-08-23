/**
 * Shared repo-relative paths for the capture/scenario harness.
 *
 * ROOT is computed the same way every script under scripts/ or scripts/lib/
 * has always computed it: pop this file's own name and its containing
 * directories off the URL until we land on the project root. Kept in one
 * place so every consumer (capture-screenshots.mjs, run-scenario.mjs, …)
 * agrees on where dist/testdata/sample_data actually are.
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';

export const ROOT       = resolve(fileURLToPath(import.meta.url), '../../../');
export const DIST       = `${ROOT}/dist`;
export const TESTDATA   = `${ROOT}/testdata`;
export const SAMPLEDATA = `${ROOT}/sample_data`;

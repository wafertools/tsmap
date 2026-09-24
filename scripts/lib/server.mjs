/**
 * Static file server for driving the built tsmap web app from Playwright.
 *
 * Serves dist/ at /, testdata/ (gitignored, generated fixtures) at
 * /testdata/, and sample_data/ (committed fixtures) at /sample_data/. Using
 * these routes lets the page fetch demo files itself instead of streaming
 * bytes through CDP — see inject.mjs.
 *
 * Extracted from capture-screenshots.mjs (2026-08) so the screenshot harness
 * and the scenario runner (scripts/run-scenario.mjs) share one server rather
 * than two copies drifting apart. Note this is the *tsmap-internal* half of that job only; the
 * cross-repo extraction with ../wafermap's own capture-screenshots.mjs is a
 * separate, unstarted job.
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';
import { DIST, TESTDATA, SAMPLEDATA } from './paths.mjs';

const MIME = {
  '.html':  'text/html',
  '.js':    'application/javascript',
  '.mjs':   'application/javascript',
  '.css':   'text/css',
  '.json':  'application/json',
  '.wasm':  'application/wasm',
  '.png':   'image/png',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.stdf':  'application/octet-stream',
  '.std':   'application/octet-stream',
  '.atdf':  'text/plain',
  '.atd':   'text/plain',
  '.csv':   'text/csv',
  '.txt':   'text/plain',
};

/** Starts the static server on an ephemeral port. Resolves { server, port }. */
export function startServer() {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      let fsPath;
      if (urlPath.startsWith('/testdata/')) {
        fsPath = join(TESTDATA, urlPath.slice('/testdata/'.length));
      } else if (urlPath.startsWith('/sample_data/')) {
        fsPath = join(SAMPLEDATA, urlPath.slice('/sample_data/'.length));
      } else {
        fsPath = join(DIST, urlPath);
      }

      if (!existsSync(fsPath)) {
        resp.writeHead(404); resp.end('Not found: ' + fsPath); return;
      }
      const ext = extname(fsPath);
      const mime = MIME[ext] ?? 'application/octet-stream';
      resp.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
      resp.end(readFileSync(fsPath));
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

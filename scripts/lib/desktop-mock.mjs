/**
 * Desktop mode for the lesson captures.
 *
 * Some of tsmap's interface exists only in the desktop app (`isTauri` in src/platform.ts): the Recent list on the
 * start screen and under Open files ▾, the File associations dialog, and the desktop wording of the start screen and of
 * Reset saved settings. The captures drive the web build in headless Chromium, so those parts are reached by giving the
 * page a stand-in for the Tauri bridge before the app starts. This is a stand-in for the native commands and nothing
 * else: every pixel is the app's own interface, drawn by the same code as in the desktop window.
 *
 * The stand-in is installed on every load (lesson-shots.mjs) but does nothing unless the page's localStorage holds
 * `lesson:desktop` = "1", which the `desktopMode` step sets and clears (scripts/lib/steps.mjs), so one scenario can
 * show the browser, then the desktop app, then the browser again.
 */

/** Runs in the page, before the app. Self-contained: it is serialised by Playwright. */
export function desktopInitScript() {
  let on = false;
  try { on = localStorage.getItem('lesson:desktop') === '1'; } catch { /* storage unavailable */ }
  if (!on) return;

  // Stale on purpose: the parquet association points at an older install, so the dialog shows its mismatch warning.
  const associations = [
    { extension: 'stdf', associated: true, registeredExePath: '/usr/local/bin/tsmap', currentExePath: '/usr/local/bin/tsmap' },
    { extension: 'atdf', associated: false, registeredExePath: null, currentExePath: '/usr/local/bin/tsmap' },
    { extension: 'parquet', associated: true, registeredExePath: '/opt/tsmap-0.2.0/tsmap', currentExePath: '/usr/local/bin/tsmap' },
  ];
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd) => {
      if (cmd === 'get_file_association_status') return Promise.resolve(associations);
      if (cmd === 'set_file_association') return Promise.resolve();
      if (cmd === 'get_startup_files') return Promise.resolve(null);
      // Event subscriptions (the drag-and-drop and second-launch listeners): accepted, and never fired.
      if (typeof cmd === 'string' && cmd.startsWith('plugin:event|')) return Promise.resolve(0);
      return Promise.reject(new Error(`lesson capture mock: unhandled invoke "${cmd}"`));
    },
    transformCallback: () => 0,
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
  };

  // Recently opened file sets, as src/recentFiles.ts stores them.
  try {
    const KEY = 'tsmap:recent-files';
    if (!localStorage.getItem(KEY)) {
      const now = Date.now();
      const hour = 3600 * 1000;
      localStorage.setItem(KEY, JSON.stringify([
        { paths: ['/home/lab/probe/PVT-LOT-05.zip'], label: 'PVT-LOT-05.zip', time: now - 2 * hour },
        { paths: ['/home/lab/probe/EDGE-LOT-01_W01.stdf', '/home/lab/probe/EDGE-LOT-01_W02.stdf'], label: 'EDGE-LOT-01_W01.stdf + 1 more', time: now - 27 * hour },
        { paths: ['/home/lab/char/SWEEP-LOT-06.zip'], label: 'SWEEP-LOT-06.zip', time: now - 80 * hour },
      ]));
    }
  } catch { /* storage unavailable */ }
}

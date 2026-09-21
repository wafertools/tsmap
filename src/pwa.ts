// Progressive-web-app wiring for the hosted web build: service-worker
// registration, the update prompt, and persistent storage.
//
// WHY THIS EXISTS. tsmap ships installers for some platforms and not others —
// RHEL being the one people actually ask about. An installed PWA is the closest
// substitute we can offer without a build target: a launcher entry, its own
// window, and the whole app cached locally so it keeps working with no network.
// One honest limitation to know before pointing anyone at it: Firefox on the
// desktop does not implement PWA installation at all, so on a stock RHEL
// desktop there is no install button. The offline caching still applies there;
// the install does not. Chromium, Chrome and Edge have both.
//
// THE UPDATE IS ALWAYS THE USER'S CALL. Nothing here auto-reloads. The web
// build holds uploaded bytes in memory and cannot re-read the original files
// (that is exactly why the web "Recent files" list is labelled as saved copies),
// so a reload the user did not ask for discards their loaded lot with no way
// back. `registerType: 'prompt'` in vite.config.ts is the other half of this;
// neither half is safe to change alone.
//
// The counterpart risk is a user pinned on a stale build forever, which for a
// tool whose output drives lot dispositions is worse than a missing feature. So
// the prompt is a persistent banner, not a toast that times out: it stays until
// it is acted on, and returns on the next load if it was dismissed.

import { registerSW } from 'virtual:pwa-register';
import { errMsg } from './lib';

export interface PwaOptions {
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
  /**
   * Whether a lot is currently loaded. Read at the moment the banner is shown,
   * not at init — an update usually arrives long after startup, by which time
   * the answer has changed. Drives the wording only: an empty app can reload
   * with nothing to say, a loaded one must be told what it is about to lose.
   */
  hasLoadedData: () => boolean;
}

/**
 * Register the service worker and wire the update prompt. Safe to call
 * unconditionally: it no-ops in the desktop build, in dev, and in any browser
 * without service-worker support.
 */
export function initPwa(opts: PwaOptions): void {
  // `virtual:pwa-register` resolves to a stub when the plugin is absent (the
  // Tauri build), but the guard is kept explicit so the desktop path does not
  // depend on a build-time substitution staying benign.
  if (!('serviceWorker' in navigator)) return;

  requestPersistentStorage(opts.onLog);

  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateBanner(opts, updateSW);
    },
    onOfflineReady() {
      // Deliberately a log line rather than UI. "This app now works offline" is
      // worth being able to confirm, but it is not worth a dialog in front of
      // someone who came here to open a file.
      opts.onLog('info', 'tsmap is now cached for offline use — it will open without a network connection.');
    },
    onRegisterError(error: unknown) {
      opts.onLog('warn', `Offline caching unavailable: ${errMsg(error)}`);
    },
  });
}

/**
 * Ask for storage that the browser will not evict under pressure.
 *
 * Everything tsmap remembers — column mappings, splits, bin definitions, the
 * theme — is in localStorage, which is best-effort storage: a browser clearing
 * space is entitled to drop all of it, and the user's first sign is that a lot
 * they set up last week has forgotten its splits. An installed PWA is normally
 * granted persistence without a prompt; a plain tab usually is not, which is
 * why the failure is logged quietly rather than reported as a problem.
 */
function requestPersistentStorage(onLog: PwaOptions['onLog']): void {
  if (!navigator.storage?.persist) return;
  void navigator.storage.persist().then(granted => {
    if (!granted) onLog('info', 'Saved settings use best-effort browser storage — install tsmap as an app to make them persistent.');
  }).catch(() => { /* not worth reporting: nothing the user can act on */ });
}

let banner: HTMLElement | null = null;
let bannerObserver: ResizeObserver | null = null;

function showUpdateBanner(opts: PwaOptions, updateSW: (reload?: boolean) => Promise<void>): void {
  if (banner) return;

  const box = document.createElement('div');
  // --z-modal, not a literal: this has to clear wmap's own overlay band, which
  // is the whole reason that scale exists (see the :root block in index.html).
  //
  // `bottom` is measured from #log-bar rather than pinned to the viewport: the
  // bottom-right corner is the log toggle, and the log panel grows upward to
  // 120px when opened. A fixed 16px sat on top of both — including on top of
  // the very log lines this module writes when the update is postponed.
  box.style.cssText = 'position:fixed;right:16px;z-index:var(--z-modal);'
    + 'max-width:340px;display:flex;flex-direction:column;gap:8px;'
    + 'padding:12px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-container);'
    + 'background:var(--bg-overlay);box-shadow:var(--shadow-modal);'
    + 'font-size:12px;color:var(--text-light)';
  box.setAttribute('role', 'status');

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600';
  title.textContent = 'A new version of tsmap is available';
  box.appendChild(title);

  const detail = document.createElement('div');
  detail.style.cssText = 'color:var(--text-secondary)';
  detail.textContent = opts.hasLoadedData()
    ? 'Updating reloads the app. The currently loaded data will be cleared and the files must be opened again.'
    : 'Updating reloads the app. Nothing is loaded, so nothing is lost.';
  box.appendChild(detail);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:2px';

  const later = document.createElement('button');
  later.className = 'btn-secondary';
  later.textContent = 'Not now';
  later.onclick = () => dismiss(opts);

  const update = document.createElement('button');
  update.className = 'btn-primary';
  update.textContent = 'Update and reload';
  update.onclick = () => {
    update.disabled = true;
    // `true` tells the waiting worker to take over and reloads the page.
    void updateSW(true);
  };

  row.append(later, update);
  box.appendChild(row);
  document.body.appendChild(box);
  banner = box;
  bannerObserver = sitAboveLogBar(box);
}

/**
 * Keep the banner clear of the log bar, including when the log panel is opened
 * or closed while the banner is up.
 */
function sitAboveLogBar(box: HTMLElement): ResizeObserver | null {
  const logBar = document.getElementById('log-bar');
  if (!logBar) { box.style.bottom = '16px'; return null; }
  const place = () => { box.style.bottom = `${logBar.getBoundingClientRect().height + 16}px`; };
  place();
  const observer = new ResizeObserver(place);
  observer.observe(logBar);
  return observer;
}

function dismiss(opts: PwaOptions): void {
  banner?.remove();
  banner = null;
  // Disconnected with the banner it positions — otherwise it keeps measuring
  // #log-bar for an element that is no longer in the document.
  bannerObserver?.disconnect();
  bannerObserver = null;
  // Said out loud, because a dismissed banner does not come back this session
  // and "how do I get that back" is otherwise unanswerable. Deliberately does
  // NOT promise the update lands on the next reload: a waiting worker takes
  // over when the last client for the scope goes away, which an ordinary
  // in-place reload does not guarantee. Promising it and not delivering is how
  // a user ends up believing they are current when they are not.
  opts.onLog('info', 'Update postponed — tsmap will offer it again the next time it starts.');
}

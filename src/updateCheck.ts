// Desktop only — the "a newer tsmap is available" notice.
//
// NOTIFY, NEVER INSTALL. The check asks GitHub which release is newest
// (`check_latest_release`, src-tauri/src/commands/check_update.rs) and, if it is
// ahead of this build, shows a banner pointing at the release page. Downloading
// and installing stay the user's own act: the installers are not signed, so a
// self-installing updater would have nothing to verify and would sit badly with
// the "parsing happens entirely on this machine" promise. A user pinned on an old
// build is still better told than not, which is what this is for.
//
// THE CHECK IS A NETWORK REQUEST, SO IT HAS A SWITCH. On at startup by default;
// Preferences → "Check for updates at startup" turns it off, and "Check for
// updates now" runs it on demand either way. A site with no route to github.com
// just sees one quiet line in the log.
//
// The web build does not use this: its service worker (pwa.ts) already offers
// updates, and a browser page cannot be "installed over".

import { storageKey } from './storageKeys';

export interface LatestRelease {
  version: string;
  url: string;
}

export interface UpdateCheckOptions {
  /** The running build's version (`__APP_VERSION__`). */
  currentVersion: string;
  fetchLatest: () => Promise<LatestRelease>;
  openRelease: (url: string) => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** The numeric part of a version as a list, ignoring any `-pre`/`+build` suffix: "0.2.1-beta" → [0, 2, 1]. */
function versionParts(v: string): number[] {
  return v.trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map(p => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Whether `latest` is a later version than `current`. Equal or older, or unreadable, is false. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

const CHECK_KEY = 'tsmap:update-check';
const SKIPPED_KEY = 'tsmap:update-skipped';

function read(key: string): string | null {
  try { return localStorage.getItem(storageKey(key)); } catch { return null; }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(storageKey(key), value); } catch { /* unavailable — lasts this session only */ }
}

/** Whether tsmap checks for a newer release when it starts. On unless the user has turned it off. */
export function startupCheckEnabled(): boolean {
  return read(CHECK_KEY) !== 'off';
}

export function setStartupCheckEnabled(on: boolean): void {
  write(CHECK_KEY, on ? 'on' : 'off');
}

/**
 * Check for a newer release.
 *
 * `manual` is the user asking: it shows a notice for "up to date" and for
 * failures (beside `near`, the control they used, when given), and ignores a
 * version they skipped. A startup check writes the same lines to the log but
 * shows nothing unless there is news — an offline machine is not warned at
 * every launch.
 */
export async function checkForUpdate(opts: UpdateCheckOptions, manual: boolean, near?: HTMLElement): Promise<void> {
  let latest: LatestRelease;
  try {
    latest = await opts.fetchLatest();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (manual) {
      opts.onLog('warn', `Could not check for updates: ${reason}`);
      showNotice(`Could not check for updates: ${reason}`, near);
    } else opts.onLog('info', `Update check skipped: ${reason}`);
    return;
  }

  if (!isNewerVersion(latest.version, opts.currentVersion)) {
    opts.onLog('info', `tsmap ${opts.currentVersion} is up to date.`);
    if (manual) showNotice(`tsmap ${opts.currentVersion} is up to date.`, near);
    return;
  }
  if (!manual && read(SKIPPED_KEY) === latest.version) return;

  opts.onLog('info', `tsmap ${latest.version} is available (this is ${opts.currentVersion}): ${latest.url}`);
  showBanner(opts, latest);
}

let banner: HTMLElement | null = null;
let bannerObserver: ResizeObserver | null = null;

function closeBanner(): void {
  banner?.remove();
  banner = null;
  bannerObserver?.disconnect();
  bannerObserver = null;
}

/**
 * The box both the banner and the short notice sit in, placed on screen.
 * Same band and corner as the web build's update banner (pwa.ts): --z-modal so
 * it clears wmap's overlays, measured from #log-bar so it never covers the log toggle.
 */
function mountBox(near?: HTMLElement): HTMLElement {
  closeBanner();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;z-index:var(--z-modal);'
    + 'max-width:340px;display:flex;flex-direction:column;gap:8px;'
    + 'padding:12px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-container);'
    + 'background:var(--bg-overlay);box-shadow:var(--shadow-modal);'
    + 'font-size:12px;color:var(--text-light)';
  box.setAttribute('role', 'status');
  document.body.appendChild(box);
  banner = box;

  if (near) {
    // Where the menu the user clicked just was: under its button, right edges level,
    // kept inside the window.
    const r = near.getBoundingClientRect();
    box.style.top = `${r.bottom + 6}px`;
    box.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    return box;
  }

  const logBar = document.getElementById('log-bar');
  if (!logBar) { box.style.bottom = '16px'; return box; }
  const place = () => { box.style.bottom = `${logBar.getBoundingClientRect().height + 16}px`; };
  place();
  bannerObserver = new ResizeObserver(place);
  bannerObserver.observe(logBar);
  return box;
}

/**
 * The answer to a manual check that found nothing to offer. `near` is the button
 * that opened the menu the check was started from; without it the notice takes the
 * corner the banner uses. The Log panel has
 * the line too, but a user who has just clicked a menu row should not have to
 * open a closed panel to learn it ran. Goes away by itself: unlike the update
 * banner there is nothing to act on.
 */
function showNotice(text: string, near?: HTMLElement): void {
  const box = mountBox(near);
  box.textContent = text;
  const mine = box;
  setTimeout(() => { if (banner === mine) closeBanner(); }, NOTICE_MS);
}

const NOTICE_MS = 6000;

function showBanner(opts: UpdateCheckOptions, latest: LatestRelease): void {
  const box = mountBox();

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600';
  title.textContent = `tsmap ${latest.version} is available`;
  box.appendChild(title);

  const detail = document.createElement('div');
  detail.style.cssText = 'color:var(--text-secondary)';
  detail.textContent = `You have ${opts.currentVersion}. The release page has the installers and what changed. Nothing is installed automatically, and the lot you have open is not affected.`;
  box.appendChild(detail);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:2px';

  const skip = document.createElement('button');
  skip.className = 'btn-secondary';
  skip.textContent = 'Skip this version';
  skip.onclick = () => {
    write(SKIPPED_KEY, latest.version);
    closeBanner();
    opts.onLog('info', `Will not mention tsmap ${latest.version} again at startup. Preferences → Check for updates now still shows it.`);
  };

  const later = document.createElement('button');
  later.className = 'btn-secondary';
  later.textContent = 'Not now';
  later.onclick = closeBanner;

  const view = document.createElement('button');
  view.className = 'btn-primary';
  view.textContent = 'View release';
  view.onclick = () => { opts.openRelease(latest.url); closeBanner(); };

  row.append(skip, later, view);
  box.appendChild(row);
}

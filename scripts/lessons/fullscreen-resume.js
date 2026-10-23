/*
 * Keeps a lesson in full screen from one lesson to the next.
 *
 * A browser ends full screen whenever the page changes, and only lets a page enter it again after a key press or
 * click. So this remembers, for the browser tab, that the reader was in full screen, and re-enters it on the first
 * key press or click in the next lesson (the arrow key that advances a slide does). The same call the slide
 * script itself makes is used, so the two cannot disagree about what "full screen" means.
 */
(() => {
  const KEY = 'tsmap-learn-fullscreen';
  const doc = document;
  const active = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const supported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const store = {
    get: () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } },
    set: (on) => { try { on ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } },
  };
  if (!supported) return;

  // Following a link or closing the tab also ends full screen, but that is the browser's doing, not the reader's.
  let leaving = false;
  addEventListener('pagehide', () => { leaving = true; });
  doc.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a[href]')) leaving = true; }, true);

  const onChange = () => {
    if (active()) store.set(true);
    else if (!leaving) store.set(false);
  };
  doc.addEventListener('fullscreenchange', onChange);
  doc.addEventListener('webkitfullscreenchange', onChange);

  if (!store.get() || active()) return;

  // The note stays until the reader acts, so it is not missed; it is polite to screen readers and never takes focus.
  const note = doc.createElement('div');
  note.setAttribute('role', 'status');
  note.textContent = 'Press any key or click to return to full screen';
  note.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;padding:8px 14px;border-radius:8px;'
    + 'background:rgba(0,0,0,.78);color:#fff;font:14px/1.4 Inter,system-ui,sans-serif;pointer-events:none';
  doc.body.appendChild(note);

  const resume = (e) => {
    doc.removeEventListener('keydown', resume, true);
    doc.removeEventListener('pointerdown', resume, true);
    note.remove();
    // The slide script already toggles full screen on F and F11; a second request would switch it off again.
    if (e.type === 'keydown' && (e.key === 'f' || e.key === 'F' || e.key === 'F11')) return;
    if (active()) return;
    const el = doc.body;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };
  doc.addEventListener('keydown', resume, true);
  doc.addEventListener('pointerdown', resume, true);
})();

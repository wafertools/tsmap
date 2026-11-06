import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isNewerVersion, checkForUpdate, startupCheckEnabled, setStartupCheckEnabled, type UpdateCheckOptions } from './updateCheck';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

// The suite runs without a DOM; the notice needs only enough of one to be mounted and read back.
let shown: { textContent: string; removed: boolean; style: Record<string, string> }[] = [];
beforeEach(() => {
  store.clear();
  shown = [];
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    createElement: () => {
      const el = { textContent: '', removed: false, style: {} as Record<string, string>, setAttribute() {}, remove() { el.removed = true; } };
      shown.push(el);
      return el;
    },
    getElementById: () => null,
    body: { appendChild() {} },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('isNewerVersion', () => {
  it('compares each part as a number, not as text', () => {
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true);
    expect(isNewerVersion('0.1.9', '0.1.10')).toBe(false);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
  });

  it('is false for the same version, and tolerates a v prefix and a missing part', () => {
    expect(isNewerVersion('0.2.1', '0.2.1')).toBe(false);
    expect(isNewerVersion('v0.2.1', '0.2.1')).toBe(false);
    expect(isNewerVersion('0.2', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.2.1', '0.2')).toBe(true);
  });

  it('ignores a pre-release or build suffix', () => {
    expect(isNewerVersion('0.3.0-beta.1', '0.2.9')).toBe(true);
    expect(isNewerVersion('0.2.1+build5', '0.2.1')).toBe(false);
  });

  it('is false for text that is not a version', () => {
    expect(isNewerVersion('latest', '0.2.1')).toBe(false);
  });
});

describe('the startup switch', () => {
  it('is on until the user turns it off', () => {
    expect(startupCheckEnabled()).toBe(true);
    setStartupCheckEnabled(false);
    expect(startupCheckEnabled()).toBe(false);
    setStartupCheckEnabled(true);
    expect(startupCheckEnabled()).toBe(true);
  });
});

describe('checkForUpdate', () => {
  const opts = (fetchLatest: UpdateCheckOptions['fetchLatest']) => ({
    currentVersion: '0.2.1',
    fetchLatest,
    openRelease: vi.fn(),
    onLog: vi.fn(),
  });

  it('logs at startup that the build is current, without showing anything', async () => {
    const o = opts(async () => ({ version: '0.2.1', url: 'u' }));
    await checkForUpdate(o, false);
    expect(o.onLog).toHaveBeenCalledWith('info', expect.stringContaining('up to date'));
    expect(shown).toHaveLength(0);
  });

  it('does not mention a version the user skipped, at startup', async () => {
    store.set('tsmap:update-skipped', '0.3.0');
    const o = opts(async () => ({ version: '0.3.0', url: 'u' }));
    await checkForUpdate(o, false);
    expect(o.onLog).not.toHaveBeenCalled();
  });

  it('says so when asked and the build is current', async () => {
    const o = opts(async () => ({ version: '0.2.1', url: 'u' }));
    await checkForUpdate(o, true);
    expect(o.onLog).toHaveBeenCalledWith('info', expect.stringContaining('up to date'));
  });

  it('shows a notice for a manual check, and clears it by itself', async () => {
    const o = opts(async () => ({ version: '0.2.1', url: 'u' }));
    await checkForUpdate(o, true);
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toContain('up to date');
    vi.advanceTimersByTime(6000);
    expect(shown[0].removed).toBe(true);
  });

  it('puts the notice under the control the check was started from', async () => {
    vi.stubGlobal('window', { innerWidth: 1000 });
    const near = { getBoundingClientRect: () => ({ bottom: 40, right: 900 }) } as unknown as HTMLElement;
    await checkForUpdate(opts(async () => ({ version: '0.2.1', url: 'u' })), true, near);
    expect(shown[0].style.top).toBe('46px');
    expect(shown[0].style.right).toBe('100px');
  });

  it('shows no notice for a startup check', async () => {
    await checkForUpdate(opts(async () => ({ version: '0.2.1', url: 'u' })), false);
    await checkForUpdate(opts(async () => { throw new Error('offline'); }), false);
    expect(shown).toHaveLength(0);
  });

  it('shows the reason in the notice when a manual check fails', async () => {
    await checkForUpdate(opts(async () => { throw new Error('offline'); }), true);
    expect(shown[0].textContent).toContain('offline');
  });

  it('logs an unreachable GitHub quietly at startup and as a warning when asked', async () => {
    const o = opts(async () => { throw new Error('offline'); });
    await checkForUpdate(o, false);
    expect(o.onLog).toHaveBeenLastCalledWith('info', expect.stringContaining('offline'));
    await checkForUpdate(o, true);
    expect(o.onLog).toHaveBeenLastCalledWith('warn', expect.stringContaining('offline'));
  });
});

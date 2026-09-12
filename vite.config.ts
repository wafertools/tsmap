import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync, realpathSync, lstatSync } from "fs";
import { fileURLToPath } from "url";
/// <reference types="vitest" />

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// When @wafertools/wafermap is npm-linked to a local checkout (`npm run
// wmap:link`), its files live OUTSIDE this project root, so Vite's dev server
// blocks them ("outside of Vite serving allow list") and the linked wmap never
// loads. Detect the symlink and, only then, allow serving its real directory.
// In normal (published-dep) dev the link is absent, so the fs boundary stays
// exactly as tight as before — this opens up precisely when linked, and CI's
// clean install is never linked. See CLAUDE.md "Developing wmap alongside tsmap".
function linkedWmapDir(): string | null {
  try {
    const entry = fileURLToPath(new URL('./node_modules/@wafertools/wafermap', import.meta.url));
    if (!lstatSync(entry).isSymbolicLink()) return null;
    return realpathSync(entry); // the ../wafermap checkout the symlink points to
  } catch {
    return null;
  }
}
const wmapLink = linkedWmapDir();

// ── PWA (web build only) ─────────────────────────────────────────────────────
//
// Makes the hosted web build installable ("Install app" in Chromium/Edge) and
// genuinely offline-capable, which is the closest thing we have to a package
// for the distros we don't build installers for (RHEL in particular). Note
// Firefox desktop does not support installing PWAs at all — the offline
// caching still applies there, the install button does not.
//
// GATED ON `isTauriBuild`, and that gate is not cosmetic: a service worker
// registered inside the Tauri WebView would keep serving its own cached copy
// of the frontend after a desktop upgrade, with none of the browser devtools
// reflexes available to clear it. The desktop app already has offline assets —
// they're bundled — so there is nothing to gain and a stale-app class of bug
// to lose.
//
// `registerType: 'prompt'` + `injectRegister: null`: the update is never
// applied behind the user's back. src/pwa.ts owns the registration and the
// prompt, because reloading discards whatever is loaded — the web build cannot
// re-read the original files — so this has to be the user's call, not a
// silent swap of assets underneath a loaded lot.
const pwaPlugin = VitePWA({
  // DISABLED, not omitted. The plugin owns the `virtual:pwa-register` module
  // src/pwa.ts imports; dropping it from the plugin list entirely would leave
  // that import unresolvable and break the desktop build at bundle time.
  // `disable` keeps the module resolving — to a no-op — and emits no service
  // worker and no manifest.
  disable: isTauriBuild,
  registerType: 'prompt',
  injectRegister: null,
  // Relative, so they resolve against the manifest's own URL. The deployed app
  // lives at /tsmap/app/, not at an origin root, and `base: './'` above is the
  // same decision expressed for assets — an absolute '/' here would scope the
  // app to the whole GitHub Pages origin and claim the docs site with it.
  manifest: {
    id: './',
    name: 'tsmap — semiconductor test data viewer',
    short_name: 'tsmap',
    description: 'View and analyse semiconductor wafer test data (STDF, ATDF, CSV, JSON, Parquet) — entirely in the browser, no upload.',
    start_url: '.',
    scope: '.',
    display: 'standalone',
    // Matches --bg-toolbar / --bg-app in the dark theme, which is also the
    // startup default. index.html carries a <meta name="theme-color"> that
    // theme.ts keeps in step afterwards; this is only the pre-boot value the
    // OS uses for the window chrome and splash.
    theme_color: '#262628',
    background_color: '#2e2e31',
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
      // Separate entry, not `purpose: 'any maskable'` on the one above: a
      // launcher crops a maskable icon to its own shape, and the plain icon
      // is full-bleed artwork that would lose its edges to that crop. See
      // scripts/generate_pwa_icons.py.
      { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // `wasm` is the load-bearing entry: without it the parser binary is not
    // precached and the installed app opens offline and then cannot parse
    // anything — an app-shaped shell with its one job missing. `gz` covers the
    // bundled sample lot.
    globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,gz}'],
    // The guide's screenshots are 6.1 MB against the app's own ~3.2 MB, so they
    // are left out of the precache: making every first-time visitor download
    // triple the app to read a guide most of them never open is the wrong
    // default. The guide's own markup is in the JS bundle (guideExtension.ts)
    // and is precached regardless; only the images are fetched on demand.
    //
    // Precaching them would not buy offline screenshots anyway — see the
    // runtimeCaching note below. Measured, not assumed.
    globIgnores: ['**/guide/images/**'],
    // Default is 2 MiB, which silently skips the 2.2 MB parser wasm — silently
    // being the problem: the build succeeds and the failure only shows up
    // offline, in the browser, at the moment someone opens a file.
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    runtimeCaching: [{
      // Matched on path suffix rather than a full URL, so it holds both for the
      // deployed app (/tsmap/app/guide/images/...) and for a self-hosted copy
      // at an origin root. CacheFirst because these are immutable build output.
      //
      // NARROWER IN PRACTICE THAN IT LOOKS, and deliberately kept anyway.
      // wmap's guide normally opens in a `window.open` popup, and an
      // about:blank popup has NO service-worker controller — its subresource
      // requests bypass the worker entirely, so neither this rule nor a
      // precache entry can serve them. (Its images do resolve correctly: an
      // about:blank document inherits the opener's base URL, which is why
      // they are relative paths — see scripts/build-user-guide.mjs.) What this
      // rule does cover is wmap's in-page fallback, used when the browser or
      // policy blocks popups, which IS controlled. Verified both ways: popup →
      // uncontrolled, cache stays empty; fallback → controlled, 12 entries.
      // The consequence for users is in docs/web.md; the wmap-side gap is
      // logged in WMAP_ISSUES.md.
      urlPattern: /\/guide\/images\/[^/]+$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'tsmap-guide-images',
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
      },
    }],
  },
  // No service worker in `npm run dev:web`. A worker in dev caches modules
  // that HMR then replaces, and the confusion is all cost and no benefit.
  devOptions: { enabled: false },
});

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [pwaPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  // Use absolute paths for Tauri (serves from localhost), relative for web deploy
  base: isTauriBuild ? '/' : './',

  // Treat .wasm files as static assets so the web platform can import them
  assetsInclude: ['**/*.wasm'],

  // The parser worker (parserWorker.ts) dynamically imports the WASM module,
  // which forces code-splitting — unsupported by the default iife worker format.
  // ES modules also let `new URL(..., import.meta.url)` resolve the .wasm asset.
  worker: { format: 'es' },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 1b. Bound the dependency scan to the real entry.
  //
  // `optimizeDeps.entries` defaults to crawling EVERY `.html` under the root —
  // 157 files here, including the generated docs site (`site/`), the packaged
  // guide (`public/guide/`), and dozens of Tauri codegen assets and old .deb
  // bundle trees under `target/`. esbuild is handed all of them at once and can
  // die mid-scan ("Failed to scan for dependencies … write EPIPE"), which takes
  // `tauri dev` down with it.
  //
  // Note this is NOT covered by `server.watch.ignored` below: that bounds the
  // file WATCHER, a different setting. `target/**` was already excluded from
  // watching for the same "large, high-churn, irrelevant" reason, and the scan
  // needed telling separately.
  optimizeDeps: {
    entries: ['index.html'],
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` and the Cargo workspace's
      // `target/` build output (large, high-churn, and irrelevant to the
      // frontend — watching it can exhaust the OS inotify watcher limit).
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
    // 4. when wmap is linked, allow the dev server to serve its out-of-root
    //    files (default allow list is the project root only). No-op unlinked.
    ...(wmapLink ? { fs: { allow: ['.', wmapLink] } } : {}),
  },
}));

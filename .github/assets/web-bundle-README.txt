tsmap VERSION — self-hosted browser build
=========================================

This is the tsmap web application as a plain static site. Serve this folder from
any web server and open it in a browser. There is no installer, no database, no
server-side component, and no build step.

Everything runs in the browser: wafer files are parsed locally by a WebAssembly
build of the same Rust parser the desktop app uses. No test data is uploaded
anywhere, and the application requests no external site — it works on a network
with no internet access at all.


QUICK START
-----------

  1. Unpack this folder somewhere your web server serves, e.g.
       /var/www/html/tools/tsmap/

  2. Browse to it:
       http://your-server/tools/tsmap/

That is the whole procedure. The bundle uses relative paths, so it works from
the server root or from any subdirectory, under http or https.

To try it without a server (Python is enough):

    cd tsmap-web-VERSION
    python3 -m http.server 8080
    # then open http://localhost:8080/


THREE THINGS THAT CATCH PEOPLE OUT
----------------------------------

1. .wasm MUST be served as "application/wasm".

   The parser is WebAssembly. If the server sends it as text/plain or
   application/octet-stream, the browser refuses to compile it and tsmap opens
   to a blank page with a console error.

   nginx, Apache and Python's http.server already do this correctly.
   IIS does NOT — add the MIME type once:

     Server > MIME Types > Add...
       File name extension:  .wasm
       MIME type:            application/wasm

2. It must be served over http:// or https://, not opened as a file.

   Double-clicking index.html (a file:// URL) will not work: browsers block
   module scripts and web workers on that scheme. Any web server is fine.

3. Offline use and "install as an app" need https://.

   Both are built on a service worker, which browsers only permit in a secure
   context: https://, or http://localhost. Over plain http:// on an intranet
   hostname tsmap still works completely -- it just loads from the server every
   time and cannot be installed. If that matters, give the host a certificate;
   an internal CA is fine, it does not have to be publicly trusted.

No other configuration is needed. tsmap sets no cookies, needs no special
headers, and does not require cross-origin isolation.


UPDATING
--------

Replace the folder's contents with a newer bundle. Nothing persists on the
server; each user's preferences live in their own browser.

Over https://, browsers hold a cached copy, so users are not switched over the
instant you replace the files: tsmap spots the new version and offers each user
an update to accept when it suits them. This is deliberate -- reloading discards
whatever they have loaded at the time. Expect a short tail of users on the
previous version rather than an instant cut-over.


WHAT YOUR USERS CAN OPEN
------------------------

STDF, ATDF, CSV, JSON and Parquet, plus .gz and .zip archives of those.
Parquet's zstd codec is the one desktop-only case; snappy, gzip, lz4 and
brotli all work in the browser.


DOCUMENTATION AND SOURCE
------------------------

  Tutorial      https://wafertools.github.io/tsmap/tutorial/
  User guide    https://wafertools.github.io/tsmap/user-guide/
  Troubleshoot  https://wafertools.github.io/tsmap/troubleshooting/
  Source        https://github.com/wafertools/tsmap

tsmap is MIT licensed. If your users need native file dialogs, file
associations, or OS drag-and-drop, the desktop application is on the same
release page as this bundle.

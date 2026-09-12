#!/usr/bin/env python3
"""Generate the PWA install icons from the app icon.

The installed-app icon must exist in two forms, and they are NOT the same
image:

  * `any`      — the icon as drawn, shown as-is. Transparent margins are the
                 platform's business, not ours.
  * `maskable` — the OS crops it to its own shape (circle on Android, squircle
                 on some launchers, rounded square elsewhere) and may cut away
                 everything outside the inner 80% "safe zone". An `any` icon
                 declared maskable therefore gets its edges shaved off; the
                 usual symptom is a logo that looks fine in Chrome's install
                 dialog and clipped on the desktop. So the maskable variant is
                 built deliberately: opaque background (the crop must never
                 reveal the page behind it) with the glyph inset to ~60% of the
                 canvas, comfortably inside the safe zone.

Source is `src-tauri/icons/icon.png` — the same 512x512 master the desktop
bundle icons come from, so the installed PWA and the installed desktop app
cannot drift apart visually.

Committed output, because the build must not need Python. Re-run after changing
the app icon:

    python3 scripts/generate_pwa_icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
OUT = ROOT / "public"

# The source icon's own background green, read straight off its edge pixels
# rather than typed in, so it cannot drift from the master. The maskable ground
# must be the SAME green: the source is a full-bleed rounded square whose
# corners are transparent, and a crop that reveals anything but green there
# reads as a rendering fault.
MASK_BG = (63, 174, 82, 255)
# Fraction of the canvas the artwork occupies in the maskable variant. The
# source's wafer glyph already spans ~10%-90%, i.e. exactly the safe-zone
# boundary, so it needs pulling in — not the usual 60%, which would leave a
# small logo swimming in green.
MASK_SCALE = 0.82


def main() -> None:
    src = Image.open(SRC).convert("RGBA")

    for size in (192, 512):
        src.resize((size, size), Image.LANCZOS).save(OUT / f"pwa-{size}.png")
        print(f"wrote public/pwa-{size}.png")

    size = 512
    inner = round(size * MASK_SCALE)
    canvas = Image.new("RGBA", (size, size), MASK_BG)
    glyph = src.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(glyph, (offset, offset))
    canvas.save(OUT / "pwa-maskable-512.png")
    print("wrote public/pwa-maskable-512.png")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Where generated test fixtures go.

Every generator under scripts/ used to default to a hardcoded /tmp/<name>
path. On a systemd-era distro /tmp is a tmpfs, so those files are held in RAM
and can only ever be pushed to swap, never written back to disk. The
generators here produce large files on purpose — generate_stdf_large.py alone
emits ~341 MB — and a handful of leftover runs was enough to put 4 GB of a
14 GB machine permanently out of reach and earn a global OOM kill
(2026-09-12). Fixtures belong on real storage.

The location is resolved once, here, rather than restated at each call site:
ten generators and four Rust benches have to agree on it, and two copies of
that rule is the bug. `packages/parsers/src/bench_fixtures.rs` implements the
same order for the Rust side — keep the two in step.

Resolution order:
  1. $WAFERTOOLS_FIXTURES          — explicit override, wins outright
  2. $XDG_CACHE_HOME/wafertools/fixtures
  3. ~/.cache/wafertools/fixtures  — the XDG default

Cache is the right category: these files are reproducible from the scripts
that made them, so nothing is lost if they are deleted, but they are
expensive enough to build that a reboot should not discard them (which a
tmpfs /tmp does).
"""

import os
from pathlib import Path

__all__ = ['fixture_dir', 'fixture_path']


def fixture_dir() -> Path:
    """The directory fixtures are written to. Created if absent."""
    override = os.environ.get('WAFERTOOLS_FIXTURES')
    if override:
        base = Path(override).expanduser()
    else:
        xdg = os.environ.get('XDG_CACHE_HOME')
        cache = Path(xdg).expanduser() if xdg else Path.home() / '.cache'
        base = cache / 'wafertools' / 'fixtures'
    base.mkdir(parents=True, exist_ok=True)
    return base


def fixture_path(name: str) -> Path:
    """Full path for a fixture basename, e.g. fixture_path('bench.stdf')."""
    return fixture_dir() / name


if __name__ == '__main__':
    print(fixture_dir())

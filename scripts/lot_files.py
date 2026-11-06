"""A lot tested in several probe sessions, as files.

An STDF file is one data stream: one FAR first, one MIR, one MRR last (the spec). A lot probed in several sessions is
therefore one file per session, `<LOT>_S1.stdf`, `<LOT>_S2.stdf`, ..., never the sessions written one after another
into one file. `write_lot_zip` writes a lot's session files and puts them into `<LOT>.zip`, which tsmap opens as one
load, so a lot is still one file to download and open.

The zip's entries carry a fixed time, so regenerating the same data gives the same bytes.
"""
import zipfile
from pathlib import Path

FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def session_file_name(lot_id: str, number: int, ext: str = 'stdf') -> str:
    return f'{lot_id}_S{number}.{ext}'


def write_lot_zip(path: Path, members: list) -> Path:
    """Write `members` ([(file name, bytes)], in order) as the zip at `path`, and each member beside it as a file of its
    own, so every session is also a file a test or a reader can open on its own."""
    for name, data in members:
        (path.parent / name).write_bytes(data)
    with zipfile.ZipFile(path, 'w') as z:
        for name, data in members:
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data, compresslevel=9)
    return path

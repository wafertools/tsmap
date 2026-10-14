use std::borrow::Cow;
use std::io::Read;
use crate::error::{ParseError, ParseResult};

/// Largest decompressed size, as a multiple of the compressed size, that a gzip
/// file's stated size (ISIZE) is trusted for when reserving memory. Test data
/// compresses well under this; a stated size beyond it is a damaged trailer.
const MAX_GZIP_RATIO: usize = 64;

/// A compressed container the parsers unwrap transparently.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Compression { Gzip, Bzip2 }

impl Compression {
    /// Detected from the leading magic bytes: `1f 8b` (gzip) or `BZh` + a block
    /// size digit (bzip2).
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        match bytes {
            [0x1f, 0x8b, ..] => Some(Self::Gzip),
            [b'B', b'Z', b'h', b'1'..=b'9', ..] => Some(Self::Bzip2),
            _ => None,
        }
    }

    /// Detected from a path's last extension: `.gz` or `.bz2`, any case.
    pub fn of_path(path: &str) -> Option<Self> {
        let ext = std::path::Path::new(path).extension()?.to_str()?;
        if ext.eq_ignore_ascii_case("gz") { Some(Self::Gzip) }
        else if ext.eq_ignore_ascii_case("bz2") { Some(Self::Bzip2) }
        else { None }
    }

    /// A reader yielding the decompressed stream.
    pub fn decoder<'a>(self, r: impl Read + 'a) -> Box<dyn Read + 'a> {
        match self {
            Self::Gzip => Box::new(flate2::read::GzDecoder::new(r)),
            // Multi: a file written by pbzip2 or `cat a.bz2 b.bz2` is several streams.
            Self::Bzip2 => Box::new(bzip2::read::MultiBzDecoder::new(r)),
        }
    }

    /// The decompressed size to reserve before reading. Growing the buffer by doubling
    /// briefly holds the old and the new one together — 1.5 GB for a 670 MB file — and
    /// WASM memory never shrinks, so that moment sets the module's size. Gzip states
    /// the size (ISIZE, its last four bytes; the last member's, so a multi-member file
    /// may be larger and grows from there); bzip2 does not.
    ///
    /// ISIZE is only as good as the file's last four bytes: a truncated or damaged file
    /// ends in arbitrary ones, up to 4 GiB. So it is used only up to `MAX_GZIP_RATIO`
    /// times the compressed size, past which the buffer grows as it is read.
    fn size_hint(self, bytes: &[u8]) -> usize {
        match self {
            Self::Gzip if bytes.len() >= 18 => {
                let n = bytes.len();
                let isize = u32::from_le_bytes([bytes[n - 4], bytes[n - 3], bytes[n - 2], bytes[n - 1]]) as usize;
                if isize <= n.saturating_mul(MAX_GZIP_RATIO) { isize } else { 0 }
            }
            _ => 0,
        }
    }

    /// The error for a stream that would not decompress.
    pub fn invalid(self, e: impl std::fmt::Display) -> ParseError {
        match self {
            Self::Gzip => ParseError::gzip_invalid(e),
            Self::Bzip2 => ParseError::bzip2_invalid(e),
        }
    }
}

/// Transparently unwrap a gzip or bzip2 container, detecting it by magic bytes
/// and **borrowing** when there isn't one — so the overwhelmingly common
/// uncompressed case costs nothing, which matters when the input is a 340 MB
/// STDF handed over from the browser.
///
/// THE rule for the bytes path: every `*_from_bytes`-shaped entry point in this
/// crate calls this first, so a `.stdf.gz` or `.stdf.bz2` behaves the same
/// whether it arrived as a path (native — `read_bytes` unwraps it by extension)
/// or as raw bytes (WASM/browser, where there is no filename to inspect).
///
/// Safe to call on already-decompressed input: the magic-byte check makes a
/// second call a no-op, so the native path double-calling it is harmless.
pub fn maybe_decompress(bytes: &[u8]) -> ParseResult<Cow<'_, [u8]>> {
    match Compression::sniff(bytes) {
        None => Ok(Cow::Borrowed(bytes)),
        Some(c) => {
            let mut buf = Vec::new();
            // A failed reservation is not an error: the buffer grows as it is read instead.
            let _ = buf.try_reserve_exact(c.size_hint(bytes));
            c.decoder(bytes).read_to_end(&mut buf).map_err(|e| c.invalid(e))?;
            Ok(Cow::Owned(buf))
        }
    }
}

/// The file at `path`, decompressed as it is read. The one place a path's
/// compression is decided: by its extension (`Compression::of_path`), else by its
/// leading magic bytes, as `maybe_decompress` decides for bytes — so a gzipped
/// `lot.stdf` reads on the path as it does from its bytes.
#[cfg(feature = "native")]
pub fn open_decompressed(path: &str) -> ParseResult<(Box<dyn Read>, Option<Compression>)> {
    use std::io::BufRead;
    let mut file = std::io::BufReader::new(std::fs::File::open(path).map_err(ParseError::file_read)?);
    let c = match Compression::of_path(path) {
        Some(c) => Some(c),
        None => Compression::sniff(file.fill_buf().map_err(ParseError::file_read)?),
    };
    let r: Box<dyn Read> = match c {
        Some(c) => c.decoder(file),
        None => Box::new(file),
    };
    Ok((r, c))
}

/// The compression `open_decompressed` would read `path` with.
#[cfg(feature = "native")]
pub fn compression_of(path: &str) -> ParseResult<Option<Compression>> {
    open_decompressed(path).map(|(_, c)| c)
}

#[cfg(feature = "native")]
pub fn read_bytes(path: &str) -> ParseResult<Vec<u8>> {
    let (mut r, c) = open_decompressed(path)?;
    let mut buf = Vec::new();
    r.read_to_end(&mut buf).map_err(|e| match c {
        Some(c) => c.invalid(e),
        None => ParseError::file_read(e),
    })?;
    Ok(buf)
}

#[cfg(feature = "native")]
pub fn read_text(path: &str) -> ParseResult<String> {
    let bytes = read_bytes(path)?;
    String::from_utf8(bytes).map_err(ParseError::encoding_invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_gzip_size_hint_beyond_the_ratio_is_not_trusted() {
        let mut bytes = vec![0x1f, 0x8b];
        bytes.resize(100, 0);
        let n = bytes.len();
        bytes[n - 4..].copy_from_slice(&1000u32.to_le_bytes());
        assert_eq!(Compression::Gzip.size_hint(&bytes), 1000);
        bytes[n - 4..].copy_from_slice(&[0xff, 0xff, 0xff, 0xf0]);
        assert_eq!(Compression::Gzip.size_hint(&bytes), 0);
    }
}

use std::borrow::Cow;
use std::io::Read;
use crate::error::{ParseError, ParseResult};

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
    /// WASM memory never shrinks, so that moment became the module's size. Gzip states
    /// the size (ISIZE, its last four bytes; the last member's, so a multi-member file
    /// may be larger and grows from there); bzip2 does not.
    fn size_hint(self, bytes: &[u8]) -> usize {
        match self {
            Self::Gzip if bytes.len() >= 18 => {
                let n = bytes.len();
                u32::from_le_bytes([bytes[n - 4], bytes[n - 3], bytes[n - 2], bytes[n - 1]]) as usize
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
            let mut buf = Vec::with_capacity(c.size_hint(bytes));
            c.decoder(bytes).read_to_end(&mut buf).map_err(|e| c.invalid(e))?;
            Ok(Cow::Owned(buf))
        }
    }
}

/// The file at `path`, decompressed by extension (see `Compression::of_path`)
/// as it is read. The one place a path's compression is decided.
#[cfg(feature = "native")]
pub fn open_decompressed(path: &str) -> ParseResult<(Box<dyn Read>, Option<Compression>)> {
    let file = std::fs::File::open(path).map_err(ParseError::file_read)?;
    let c = Compression::of_path(path);
    let r: Box<dyn Read> = match c {
        Some(c) => c.decoder(file),
        None => Box::new(std::io::BufReader::new(file)),
    };
    Ok((r, c))
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

/**
 * Content sniffing from file signatures ("magic bytes").
 *
 * An upload's `Content-Type` and file extension are both chosen by the
 * client. This reads the first bytes instead, for the formats an upload
 * handler most often has to verify. It is a positive identifier only: an
 * unknown signature yields `undefined`, never a guess.
 *
 * @module httpMime/sniff
 */

interface Signature {
  readonly type: string;
  readonly offset: number;
  readonly bytes: readonly number[];
}

const ASCII = (text: string): readonly number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

const SIGNATURES: readonly Signature[] = Object.freeze([
  { type: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { type: "image/gif", offset: 0, bytes: ASCII("GIF87a") },
  { type: "image/gif", offset: 0, bytes: ASCII("GIF89a") },
  { type: "image/bmp", offset: 0, bytes: ASCII("BM") },
  { type: "image/tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { type: "image/tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { type: "application/pdf", offset: 0, bytes: ASCII("%PDF-") },
  { type: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { type: "application/gzip", offset: 0, bytes: [0x1f, 0x8b] },
  { type: "application/x-7z-compressed", offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { type: "application/x-rar-compressed", offset: 0, bytes: ASCII("Rar!\u001a\u0007") },
  { type: "audio/mpeg", offset: 0, bytes: ASCII("ID3") },
  { type: "audio/ogg", offset: 0, bytes: ASCII("OggS") },
  { type: "audio/flac", offset: 0, bytes: ASCII("fLaC") },
  { type: "video/mp4", offset: 4, bytes: ASCII("ftyp") },
  { type: "video/x-matroska", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { type: "font/woff", offset: 0, bytes: ASCII("wOFF") },
  { type: "font/woff2", offset: 0, bytes: ASCII("wOF2") },
  { type: "application/x-msdownload", offset: 0, bytes: ASCII("MZ") },
  { type: "application/x-elf", offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
]);

/** The most bytes any signature needs; callers may pass only this many. */
export const CONTENT_SNIFF_BYTES = 12;

/**
 * Identifies a media type from the leading bytes of a file.
 *
 * RIFF containers are told apart by their form tag (`WEBP`, `WAVE`, `AVI `).
 *
 * @param bytes - The file's first bytes ({@link CONTENT_SNIFF_BYTES} suffice).
 * @returns The media type, or `undefined` when the signature is not known.
 */
export function sniffContentType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, 0, ASCII("RIFF")) && bytes.length >= 12) {
    const form = String.fromCharCode(...bytes.subarray(8, 12));

    if (form === "WEBP") return "image/webp";
    if (form === "WAVE") return "audio/wav";
    if (form === "AVI ") return "video/x-msvideo";

    return undefined;
  }

  for (const signature of SIGNATURES) {
    if (startsWith(bytes, signature.offset, signature.bytes)) {
      return signature.type;
    }
  }

  return undefined;
}

/**
 * Whether a file's signature is consistent with a declared media type.
 *
 * `true` when the bytes identify exactly that type, or when the signature is
 * unknown (text formats have none), so only a positive contradiction fails.
 *
 * @param bytes - The file's first bytes.
 * @param declared - The client's `Content-Type`, parameters allowed.
 */
export function matchesDeclaredContentType(
  bytes: Uint8Array,
  declared: string,
): boolean {
  const sniffed = sniffContentType(bytes);

  if (sniffed === undefined) {
    return true;
  }

  const essence = (declared.split(";", 1)[0] ?? "").trim().toLowerCase();

  return essence === sniffed || (sniffed === "image/jpeg" && essence === "image/jpg");
}

function startsWith(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  for (const [index, value] of expected.entries()) {
    if (bytes[offset + index] !== value) {
      return false;
    }
  }

  return true;
}

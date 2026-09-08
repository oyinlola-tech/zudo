/**
 * Encodes bytes as URL-safe Base64 without padding.
 *
 * An empty byte array encodes to the empty string.
 */
export function toBase64Url(value: Uint8Array): string {
  assertBytes(value);

  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
    "base64url",
  );
}

/**
 * Decodes URL-safe Base64 into bytes.
 *
 * Input must be canonical: unpadded, using only the URL-safe alphabet,
 * never of length ≡ 1 (mod 4), and with zero-valued trailing bits. The
 * empty string decodes to an empty byte array.
 */
export function fromBase64Url(value: string): Uint8Array {
  if (!isBase64Url(value)) {
    throw new TypeError("Invalid Base64URL value.");
  }

  return new Uint8Array(Buffer.from(value, "base64url"));
}

/**
 * Returns whether a string is valid, canonical URL-safe Base64.
 *
 * The empty string is valid (it encodes zero bytes).
 */
export function isBase64Url(value: string): boolean {
  if (typeof value !== "string" || value.length % 4 === 1) {
    return false;
  }

  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    return false;
  }

  // Reject non-canonical encodings (non-zero trailing bits).
  return Buffer.from(value, "base64url").toString("base64url") === value;
}

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Value must be a Uint8Array.");
  }
}

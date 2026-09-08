/**
 * Encodes bytes as standard, padded Base64.
 *
 * An empty byte array encodes to the empty string.
 */
export function toBase64(value: Uint8Array): string {
  assertBytes(value);

  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
    "base64",
  );
}

/**
 * Decodes standard Base64 into bytes.
 *
 * Input must be canonical: padded to a multiple of four characters, using
 * only the standard alphabet, with zero-valued trailing bits. The empty
 * string decodes to an empty byte array.
 */
export function fromBase64(value: string): Uint8Array {
  if (!isBase64(value)) {
    throw new TypeError("Invalid Base64 value.");
  }

  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * Returns whether a string is valid, canonical standard Base64.
 *
 * The empty string is valid (it encodes zero bytes).
 */
export function isBase64(value: string): boolean {
  if (typeof value !== "string" || value.length % 4 !== 0) {
    return false;
  }

  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return false;
  }

  // Reject non-canonical encodings (non-zero trailing bits).
  return Buffer.from(value, "base64").toString("base64") === value;
}

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Value must be a Uint8Array.");
  }
}

/**
 * Encodes bytes as lowercase hexadecimal.
 *
 * An empty byte array encodes to the empty string.
 */
export function toHex(value: Uint8Array): string {
  assertBytes(value);

  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
    "hex",
  );
}

/**
 * Decodes hexadecimal into bytes.
 *
 * Both upper- and lowercase digits are accepted. The empty string decodes
 * to an empty byte array. Throws for odd lengths or non-hex characters.
 */
export function fromHex(value: string): Uint8Array {
  if (!isHex(value)) {
    throw new TypeError("Invalid hexadecimal value.");
  }

  return new Uint8Array(Buffer.from(value, "hex"));
}

/**
 * Returns whether a string is valid hexadecimal (even length, hex digits only).
 *
 * The empty string is valid (it encodes zero bytes).
 */
export function isHex(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length % 2 === 0 &&
    /^[0-9a-fA-F]*$/.test(value)
  );
}

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Value must be a Uint8Array.");
  }
}

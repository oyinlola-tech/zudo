const MAX_BYTE_LENGTH = 6;

/**
 * Converts a number into an unsigned big-endian byte array.
 *
 * The default width of 6 bytes (48 bits) is the largest width for which
 * every safe integer conversion is exact.
 */
export function numberToBytes(
  value: number,
  byteLength = MAX_BYTE_LENGTH,
): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("value must be a non-negative safe integer.");
  }

  if (
    !Number.isInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MAX_BYTE_LENGTH
  ) {
    throw new RangeError(
      `byteLength must be an integer between 1 and ${MAX_BYTE_LENGTH}.`,
    );
  }

  const result = new Uint8Array(byteLength);

  let remaining = value;

  for (let index = byteLength - 1; index >= 0; index -= 1) {
    result[index] = remaining % 256;

    remaining = Math.floor(remaining / 256);
  }

  if (remaining !== 0) {
    throw new RangeError(
      "value does not fit within the requested byte length.",
    );
  }

  return result;
}

/**
 * Converts unsigned big-endian bytes into a number.
 */
export function bytesToNumber(value: Uint8Array): number {
  if (value.byteLength === 0 || value.byteLength > MAX_BYTE_LENGTH) {
    throw new RangeError(
      `Byte array length must be between 1 and ${MAX_BYTE_LENGTH}.`,
    );
  }

  let result = 0;

  for (const byte of value) {
    result = result * 256 + byte;
  }

  return result;
}

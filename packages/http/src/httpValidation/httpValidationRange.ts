/**
 * HTTP Range header validation.
 *
 * Validates byte-range request headers (e.g. bytes=0-499).
 */

export function isValidRange(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }

  /*
   * Supports common byte-range forms:
   *
   * bytes=0-499
   * bytes=500-
   * bytes=-500
   * bytes=0-499,500-999
   */
  if (!value.startsWith("bytes=")) {
    return false;
  }

  const ranges = value
    .slice(6)
    .split(",")
    .map((range) => range.trim());

  if (ranges.length === 0) {
    return false;
  }

  return ranges.every(isValidByteRange);
}

function isValidByteRange(range: string): boolean {
  const match = /^(\d*)-(\d*)$/.exec(range);

  if (!match) {
    return false;
  }

  const [, start, end] = match;

  if (start === undefined || end === undefined) {
    return false;
  }

  return start.length > 0 || end.length > 0;
}

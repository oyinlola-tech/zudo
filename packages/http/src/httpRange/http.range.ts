/**
 * HTTP byte-range utilities.
 *
 * Implements parsing and resolution of HTTP Range headers, primarily for
 * byte-range responses such as files and static assets.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ByteRange {
  readonly start: number | undefined;
  readonly end: number | undefined;
}

export interface ResolvedByteRange {
  readonly start: number;
  readonly end: number;
  readonly length: number;
}

export interface RangeResult {
  readonly unit: string;
  readonly ranges: readonly ResolvedByteRange[];
}

export interface UnsatisfiableRange {
  readonly unit: string;
  readonly ranges: readonly ByteRange[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_RANGE_UNIT = "bytes";

export const MAX_RANGE_COUNT = 128;

/* -------------------------------------------------------------------------- */
/* Range Header Parsing                                                       */
/* -------------------------------------------------------------------------- */

export function parseRangeHeader(value: string | undefined | null):
  | {
      readonly unit: string;
      readonly ranges: readonly ByteRange[];
    }
  | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const separator = value.indexOf("=");

  if (separator === -1) {
    return undefined;
  }

  const unit = value.slice(0, separator).trim();

  if (unit.length === 0) {
    return undefined;
  }

  const rangeValue = value.slice(separator + 1).trim();

  if (rangeValue.length === 0) {
    return undefined;
  }

  const parts = rangeValue.split(",");

  /*
   * The count is checked before anything is parsed: a header with 100 000
   * comma-separated ranges must not be fully parsed and allocated only to be
   * rejected afterwards.
   */
  if (parts.length > MAX_RANGE_COUNT) {
    return undefined;
  }

  const ranges: ByteRange[] = [];

  for (const part of parts) {
    const range = parseByteRange(part);

    if (range === undefined) {
      return undefined;
    }

    ranges.push(range);
  }

  return {
    unit,
    ranges,
  };
}

export function parseByteRange(value: string): ByteRange | undefined {
  const trimmed = value.trim();

  const separator = trimmed.indexOf("-");

  if (separator === -1) {
    return undefined;
  }

  const startValue = trimmed.slice(0, separator).trim();

  const endValue = trimmed.slice(separator + 1).trim();

  if (startValue.length === 0 && endValue.length === 0) {
    return undefined;
  }

  const start =
    startValue.length > 0 ? parseNonNegativeInteger(startValue) : undefined;

  const end =
    endValue.length > 0 ? parseNonNegativeInteger(endValue) : undefined;

  if (startValue.length > 0 && start === undefined) {
    return undefined;
  }

  if (endValue.length > 0 && end === undefined) {
    return undefined;
  }

  if (start === undefined && end === undefined) {
    return undefined;
  }

  if (start !== undefined && end !== undefined && start > end) {
    return undefined;
  }

  return {
    start,
    end,
  };
}

/* -------------------------------------------------------------------------- */
/* Range Resolution                                                           */
/* -------------------------------------------------------------------------- */

export function resolveByteRange(
  range: ByteRange,
  size: number,
): ResolvedByteRange | undefined {
  validateSize(size);

  if (size === 0) {
    return undefined;
  }

  /*
   * "-N" means the final N bytes.
   */
  if (range.start === undefined) {
    const suffixLength = range.end;

    if (suffixLength === undefined || suffixLength <= 0) {
      return undefined;
    }

    const length = Math.min(suffixLength, size);

    const start = size - length;

    const end = size - 1;

    return {
      start,
      end,
      length,
    };
  }

  const start = range.start;

  if (start >= size) {
    return undefined;
  }

  /*
   * An omitted end means through the final byte.
   */
  const end =
    range.end === undefined ? size - 1 : Math.min(range.end, size - 1);

  if (end < start) {
    return undefined;
  }

  return {
    start,
    end,
    length: end - start + 1,
  };
}

export function resolveRanges(
  ranges: readonly ByteRange[],
  size: number,
): readonly ResolvedByteRange[] {
  validateSize(size);

  return ranges
    .map((range) => resolveByteRange(range, size))
    .filter((range): range is ResolvedByteRange => range !== undefined);
}

export function resolveRangeHeader(
  header: string | undefined | null,
  size: number,
): RangeResult | undefined {
  const parsed = parseRangeHeader(header);

  if (!parsed) {
    return undefined;
  }

  /*
   * Overlapping and duplicate ranges are coalesced here as well as in
   * `createRangeResponse`. Without it `bytes=0-0,0-0,...` yields one
   * multipart part per repetition — roughly 80 bytes of boundary and headers
   * for each byte of payload.
   */
  const ranges = normalizeRanges(resolveRanges(parsed.ranges, size));

  return {
    unit: parsed.unit,
    ranges,
  };
}

/* -------------------------------------------------------------------------- */
/* Range Classification                                                       */
/* -------------------------------------------------------------------------- */

export function isByteRangeUnit(unit: string): boolean {
  return unit.trim().toLowerCase() === DEFAULT_RANGE_UNIT;
}

export function isRangeSatisfiable(range: ByteRange, size: number): boolean {
  return resolveByteRange(range, size) !== undefined;
}

export function hasSatisfiableRanges(
  ranges: readonly ByteRange[],
  size: number,
): boolean {
  return resolveRanges(ranges, size).length > 0;
}

export function isUnsatisfiableRangeHeader(
  header: string | undefined | null,
  size: number,
): boolean {
  const parsed = parseRangeHeader(header);

  if (!parsed) {
    return false;
  }

  return resolveRanges(parsed.ranges, size).length === 0;
}

/* -------------------------------------------------------------------------- */
/* Range Normalization                                                        */
/* -------------------------------------------------------------------------- */

export function normalizeRanges(
  ranges: readonly ResolvedByteRange[],
): readonly ResolvedByteRange[] {
  if (ranges.length <= 1) {
    return [...ranges];
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  const result: ResolvedByteRange[] = [];

  for (const range of sorted) {
    const previous = result[result.length - 1];

    if (!previous) {
      result.push(range);
      continue;
    }

    if (range.start <= previous.end + 1) {
      const end = Math.max(previous.end, range.end);

      result[result.length - 1] = {
        start: previous.start,
        end,
        length: end - previous.start + 1,
      };

      continue;
    }

    result.push(range);
  }

  return result;
}

export function mergeRanges(
  ranges: readonly ResolvedByteRange[],
): readonly ResolvedByteRange[] {
  return normalizeRanges(ranges);
}

/* -------------------------------------------------------------------------- */
/* Range Header Formatting                                                    */
/* -------------------------------------------------------------------------- */

export function formatRangeHeader(
  ranges: readonly ByteRange[],
  unit = DEFAULT_RANGE_UNIT,
): string {
  if (ranges.length === 0) {
    throw new RangeError("At least one range is required.");
  }

  const formatted = ranges.map((range) => formatByteRange(range));

  return `${unit}=${formatted.join(", ")}`;
}

export function formatByteRange(range: ByteRange): string {
  const start = range.start !== undefined ? String(range.start) : "";

  const end = range.end !== undefined ? String(range.end) : "";

  if (start.length === 0 && end.length === 0) {
    throw new RangeError("A byte range must contain a start or end value.");
  }

  return `${start}-${end}`;
}

/* -------------------------------------------------------------------------- */
/* Content-Range                                                              */
/* -------------------------------------------------------------------------- */

export function formatContentRange(
  range: ResolvedByteRange,
  size: number,
  unit = DEFAULT_RANGE_UNIT,
): string {
  validateSize(size);

  if (range.start < 0 || range.end < range.start || range.end >= size) {
    throw new RangeError("Resolved range is outside the resource bounds.");
  }

  return `${unit} ${range.start}-${range.end}/${size}`;
}

export function formatUnsatisfiedContentRange(
  size: number,
  unit = DEFAULT_RANGE_UNIT,
): string {
  validateSize(size);

  return `${unit} */${size}`;
}

/* -------------------------------------------------------------------------- */
/* Range Response                                                             */
/* -------------------------------------------------------------------------- */

export function createRangeResponse(
  header: string | undefined | null,
  size: number,
): {
  readonly status: 200 | 206 | 416;
  readonly ranges: readonly ResolvedByteRange[];
  readonly contentRange?: string;
} {
  validateSize(size);

  const parsed = parseRangeHeader(header);

  if (!parsed || !isByteRangeUnit(parsed.unit)) {
    return {
      status: 200,
      ranges: [],
    };
  }

  const ranges = resolveRanges(parsed.ranges, size);

  if (ranges.length === 0) {
    return {
      status: 416,
      ranges: [],
      contentRange: formatUnsatisfiedContentRange(size),
    };
  }

  /*
   * A single satisfiable range is represented by a normal 206 response with
   * a Content-Range header. Multipart range formatting belongs elsewhere.
   */
  const merged = normalizeRanges(ranges);

  const single = merged.length === 1 ? merged[0] : undefined;

  if (single !== undefined) {
    return {
      status: 206,
      ranges: merged,
      contentRange: formatContentRange(single, size),
    };
  }

  return {
    status: 206,
    ranges: merged,
  };
}

/* -------------------------------------------------------------------------- */
/* Range Request Helpers                                                      */
/* -------------------------------------------------------------------------- */

export function isFullResourceRange(
  range: ResolvedByteRange,
  size: number,
): boolean {
  validateSize(size);

  return range.start === 0 && range.end === size - 1;
}

export function getRangeLength(range: ResolvedByteRange): number {
  return range.end - range.start + 1;
}

export function sliceRange<T>(
  value: ArrayLike<T>,
  range: ResolvedByteRange,
): T[] {
  const result: T[] = [];

  const end = Math.min(range.end, value.length - 1);

  const start = Math.max(0, range.start);

  for (let index = start; index <= end; index += 1) {
    /* `index` is clamped to `[0, value.length - 1]` above, so this read is
     * in bounds. The cast only restores what `ArrayLike<T>` promises: a
     * runtime `undefined` here would be a hole in a sparse input, and
     * skipping it would silently shift every later element. */
    result.push(value[index] as T);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Range Coalescing                                                           */
/* -------------------------------------------------------------------------- */

export function coalesceRanges(
  ranges: readonly ResolvedByteRange[],
  maxRanges = 16,
): readonly ResolvedByteRange[] {
  if (maxRanges <= 0) {
    throw new RangeError("maxRanges must be greater than zero.");
  }

  const merged = normalizeRanges(ranges);

  if (merged.length <= maxRanges) {
    return merged;
  }

  /*
   * If a client asks for an excessive number of ranges, combine the ranges
   * into a bounded number of larger ranges. This prevents unbounded multipart
   * response overhead.
   */
  const result: ResolvedByteRange[] = [];

  const groupSize = Math.ceil(merged.length / maxRanges);

  for (let index = 0; index < merged.length; index += groupSize) {
    const group = merged.slice(index, index + groupSize);

    const first = group[0];

    const last = group[group.length - 1];

    if (first && last) {
      result.push({
        start: first.start,
        end: last.end,
        length: last.end - first.start + 1,
      });
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Internal Validation                                                        */
/* -------------------------------------------------------------------------- */

function parseNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    return undefined;
  }

  return number;
}

function validateSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError("Resource size must be a non-negative safe integer.");
  }
}

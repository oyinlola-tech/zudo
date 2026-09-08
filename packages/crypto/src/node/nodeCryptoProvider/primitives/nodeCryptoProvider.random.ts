import { randomBytes, randomInt } from "node:crypto";

/** Largest range accepted by `node:crypto.randomInt`. */
const MAX_RANGE = 2 ** 48;

export async function randomBytesImpl(length: number): Promise<Uint8Array> {
  if (!Number.isInteger(length) || length <= 0) {
    throw new TypeError("randomBytes length must be a positive integer.");
  }

  return new Uint8Array(randomBytes(length));
}

/**
 * Returns a uniformly distributed integer in `[min, max)`.
 *
 * Delegates to `node:crypto.randomInt`, which is unbiased for ranges up
 * to 2^48. A range of exactly one value returns `min`.
 */
export async function randomIntImpl(min: number, max: number): Promise<number> {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new TypeError("randomInt bounds must be safe integers.");
  }

  if (max <= min) {
    throw new RangeError("max must be greater than min.");
  }

  const range = max - min;

  if (range > MAX_RANGE) {
    throw new RangeError(`randomInt range must not exceed 2^48.`);
  }

  if (range === 1) {
    return min;
  }

  return randomInt(min, max);
}

export async function randomUUIDImpl(): Promise<string> {
  const bytes = await randomBytesImpl(16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

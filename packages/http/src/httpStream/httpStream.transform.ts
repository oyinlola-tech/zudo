/**
 * @zudojs/http/httpStream — Create PassThrough and Readable stream instances.
 */

import { Readable, PassThrough } from "node:stream";

import type { HTTPStreamFactoryOptions } from "./httpStream.types.js";

import { DEFAULT_STREAM_HIGH_WATER_MARK } from "./httpStream.constants.js";

export function createPassThrough(
  options: HTTPStreamFactoryOptions = {},
): PassThrough {
  return new PassThrough({
    highWaterMark: options.highWaterMark ?? DEFAULT_STREAM_HIGH_WATER_MARK,
  });
}

export function createReadableStream(
  data: Iterable<unknown> | AsyncIterable<unknown>,
  options: HTTPStreamFactoryOptions = {},
): Readable {
  return Readable.from(data, {
    highWaterMark: options.highWaterMark ?? DEFAULT_STREAM_HIGH_WATER_MARK,
    signal: options.signal,
  });
}

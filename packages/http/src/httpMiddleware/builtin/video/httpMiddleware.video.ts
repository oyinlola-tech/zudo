/**
 * Video compression utilities using FFmpeg.
 *
 * @module httpMiddleware/builtin/video
 *
 * Requires: npm install fluent-ffmpeg (and an ffmpeg binary)
 */

import { Readable } from "node:stream";

import type { HttpMiddleware } from "../../httpMiddleware.type.js";

import {
  applyCompressedBody,
  getResponseBytes,
  getResponseMediaType,
  loadOptionalModule,
  type MediaCompressionErrorHandler,
} from "../helpers/index.js";

import {
  CONTAINER_TYPES,
  DEFAULT_VIDEO_FORMAT as DEFAULT_FORMAT,
  buildOutputOptions,
} from "./httpMiddleware.video.options.js";

export interface VideoCompressionOptions {
  readonly bitrate?: string;
  readonly preset?:
    | "ultrafast"
    | "superfast"
    | "veryfast"
    | "faster"
    | "fast"
    | "medium"
    | "slow"
    | "slower"
    | "veryslow";
  readonly crf?: number;
  readonly format?: "mp4" | "webm" | "mov";
  /** Input container; defaults to `mp4`. */
  readonly inputFormat?: string;
  readonly scale?: { readonly width?: number; readonly height?: number };
}

export interface VideoCompressionMiddlewareOptions {
  readonly enabled?: boolean;
  readonly contentTypeMap?: Record<string, VideoCompressionOptions>;
  readonly tempDir?: string;
  /**
   * Called when compression fails. The original response is still served.
   */
  readonly onError?: MediaCompressionErrorHandler;
}

interface FfmpegCommand {
  input(source: Readable): FfmpegCommand;
  inputFormat(format: string): FfmpegCommand;
  outputOptions(options: readonly string[]): FfmpegCommand;
  format(format: string): FfmpegCommand;
  on(event: "error", listener: (error: Error) => void): FfmpegCommand;
  pipe(): NodeJS.ReadableStream;
}

type FfmpegFactory = () => FfmpegCommand;

/**
 * Transcodes a video held in memory.
 *
 * `fluent-ffmpeg`'s export is a factory: `input()` exists only on the
 * command it returns. Calling it on the module (as this did) threw
 * `ffmpegInstance.input is not a function` on every call.
 */
export async function compressVideo(
  inputBuffer: Buffer,
  options: VideoCompressionOptions = {},
): Promise<Buffer> {
  const ffmpeg = await loadOptionalModule<FfmpegFactory>(
    "fluent-ffmpeg",
    "npm install fluent-ffmpeg",
  );

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const output = ffmpeg()
      .input(Readable.from([inputBuffer]))
      .inputFormat(options.inputFormat ?? "mp4")
      .outputOptions(buildOutputOptions(options))
      .format(options.format ?? DEFAULT_FORMAT)
      .on("error", reject)
      .pipe();

    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
  });
}

/**
 * Compresses `video/*` responses, reading status, headers and body from the
 * response returned by `next()`.
 */
export function createVideoCompressionMiddleware(
  options: VideoCompressionMiddlewareOptions = {},
): HttpMiddleware {
  const enabled = options.enabled ?? true;

  return async (_context, next) => {
    const response = await next();

    const mediaType = getResponseMediaType(response);

    if (!enabled || !mediaType?.startsWith("video/")) {
      return response;
    }

    const body = getResponseBytes(response);

    if (!body || body.length === 0) {
      return response;
    }

    const compression = options.contentTypeMap?.[mediaType] ?? {};

    const format = compression.format ?? DEFAULT_FORMAT;

    try {
      const compressed = await compressVideo(body, compression);

      return applyCompressedBody(
        response,
        compressed,
        CONTAINER_TYPES[format] ?? "video/mp4",
      );
    } catch (error) {
      options.onError?.(error, response);

      return response;
    }
  };
}

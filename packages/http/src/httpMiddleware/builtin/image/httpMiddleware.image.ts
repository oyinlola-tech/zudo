/**
 * Image compression middleware using Sharp.
 *
 * @module httpMiddleware/builtin/image
 *
 * Requires: npm install sharp
 */

import type { HttpMiddleware } from "../../httpMiddleware.type.js";

import {
  applyCompressedBody,
  getResponseBytes,
  getResponseMediaType,
  loadOptionalModule,
  type MediaCompressionErrorHandler,
} from "../helpers/index.js";

export interface ImageCompressionOptions {
  readonly quality?: number;
  readonly format?: "jpeg" | "png" | "webp" | "avif";
  readonly width?: number;
  readonly height?: number;
  readonly fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export interface ImageCompressionMiddlewareOptions {
  readonly enabled?: boolean;
  readonly defaultQuality?: number;
  readonly defaultFormat?: "jpeg" | "png" | "webp" | "avif";
  /** Upper bound on the output width; applied to every image. */
  readonly maxWidth?: number;
  /** Upper bound on the output height; applied to every image. */
  readonly maxHeight?: number;
  readonly contentTypeMap?: Record<string, ImageCompressionOptions>;
  /**
   * Called when compression fails. The original response is still served.
   * Defaults to a no-op.
   */
  readonly onError?: MediaCompressionErrorHandler;
}

interface SharpPipeline {
  resize(options: Record<string, unknown>): SharpPipeline;
  jpeg(options: { quality: number }): SharpPipeline;
  png(options: { quality: number }): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  avif(options: { quality: number }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}

type SharpFactory = (input: Buffer) => SharpPipeline;

const DEFAULT_QUALITY = 80;
const DEFAULT_FORMAT = "jpeg";

export async function compressImage(
  buffer: Buffer,
  options: ImageCompressionOptions = {},
): Promise<Buffer> {
  const sharp = await loadOptionalModule<SharpFactory>(
    "sharp",
    "npm install sharp",
  );

  const quality = options.quality ?? DEFAULT_QUALITY;
  const format = options.format ?? DEFAULT_FORMAT;

  let pipeline = sharp(buffer);

  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? "inside",
      withoutEnlargement: true,
    });
  }

  return pipeline[format]({ quality }).toBuffer();
}

function capDimension(
  requested: number | undefined,
  max: number | undefined,
): number | undefined {
  if (max === undefined) {
    return requested;
  }

  return requested === undefined ? max : Math.min(requested, max);
}

/**
 * Compresses `image/*` responses. Status, headers and body are read from the
 * response returned by `next()`, and `maxWidth` / `maxHeight` cap every
 * output.
 */
export function createImageCompressionMiddleware(
  options: ImageCompressionMiddlewareOptions = {},
): HttpMiddleware {
  const enabled = options.enabled ?? true;
  const contentTypeMap = options.contentTypeMap ?? {};

  return async (_context, next) => {
    const response = await next();

    const mediaType = getResponseMediaType(response);

    if (!enabled || !mediaType?.startsWith("image/")) {
      return response;
    }

    const buffer = getResponseBytes(response);

    if (!buffer || buffer.length === 0) {
      return response;
    }

    const mapped = contentTypeMap[mediaType] ?? {};

    const format = mapped.format ?? options.defaultFormat ?? DEFAULT_FORMAT;

    try {
      const compressed = await compressImage(buffer, {
        ...mapped,
        quality: mapped.quality ?? options.defaultQuality ?? DEFAULT_QUALITY,
        format,
        width: capDimension(mapped.width, options.maxWidth),
        height: capDimension(mapped.height, options.maxHeight),
      });

      return applyCompressedBody(response, compressed, `image/${format}`);
    } catch (error) {
      options.onError?.(error, response);

      return response;
    }
  };
}

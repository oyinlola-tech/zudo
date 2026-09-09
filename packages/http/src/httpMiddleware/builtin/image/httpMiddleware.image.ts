/**
 * Image compression middleware using Sharp.
 *
 * @module httpMiddleware/builtin/image
 *
 * Requires: npm install sharp
 */

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../httpMiddleware.type.js";

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

import { applyHeadersToResponse } from "../helpers/index.js";

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
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly contentTypeMap?: Record<string, ImageCompressionOptions>;
}

const DEFAULT_QUALITY = 80;
const DEFAULT_FORMAT = "jpeg";

async function getSharp() {
  try {
    const mod = await import("sharp");
    return (mod as any).default ?? mod;
  } catch {
    throw new Error("Sharp is not installed. Run: npm install sharp");
  }
}

export async function compressImage(
  buffer: Buffer,
  options: ImageCompressionOptions = {},
): Promise<Buffer> {
  const sharpInstance = await getSharp();

  const quality = options.quality ?? DEFAULT_QUALITY;
  const format = options.format ?? DEFAULT_FORMAT;

  let pipeline = sharpInstance(buffer);

  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? "inside",
      withoutEnlargement: true,
    });
  }

  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality }).toBuffer();
    case "png":
      return pipeline.png({ quality }).toBuffer();
    case "webp":
      return pipeline.webp({ quality }).toBuffer();
    case "avif":
      return pipeline.avif({ quality }).toBuffer();
    default:
      return pipeline.toBuffer();
  }
}

export function createImageCompressionMiddleware(
  options: ImageCompressionMiddlewareOptions = {},
): HttpMiddleware {
  const enabled = options.enabled ?? true;
  const defaultQuality = options.defaultQuality ?? DEFAULT_QUALITY;
  const defaultFormat = options.defaultFormat ?? DEFAULT_FORMAT;
  const contentTypeMap = options.contentTypeMap ?? {};

  return async (
    context: HttpMiddlewareContext,
    next: () => Promise<ResponseContext>,
  ) => {
    if (!enabled) {
      return next();
    }

    const response = await next();

    const contentType = context.response.headers["content-type"] as
      string | undefined;

    if (!contentType || !contentType.startsWith("image/")) {
      return response;
    }

    const body = context.response.body;
    if (!Buffer.isBuffer(body) && typeof body !== "string") {
      return response;
    }

    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

    const compressionOptions = contentTypeMap[contentType] ?? {
      quality: defaultQuality,
      format: defaultFormat,
    };

    try {
      const compressed = await compressImage(buffer, compressionOptions);
      const newContentType =
        compressionOptions.format === "jpeg"
          ? "image/jpeg"
          : compressionOptions.format === "png"
            ? "image/png"
            : compressionOptions.format === "webp"
              ? "image/webp"
              : compressionOptions.format === "avif"
                ? "image/avif"
                : contentType;

      const headers = new Headers(response.headers as Record<string, string>);
      headers.set("content-type", newContentType);
      headers.set(
        "cache-control",
        headers.get("cache-control") ?? "public, max-age=86400",
      );

      return applyHeadersToResponse(response, headers).setBody(compressed);
    } catch {
      return response;
    }
  };
}

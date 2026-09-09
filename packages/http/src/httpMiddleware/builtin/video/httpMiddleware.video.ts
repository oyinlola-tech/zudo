/**
 * Video compression utilities using FFmpeg.
 *
 * @module httpMiddleware/builtin/video
 *
 * Requires: npm install fluent-ffmpeg
 */

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../httpMiddleware.type.js";

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

import { applyHeadersToResponse } from "../helpers/index.js";

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
  readonly scale?: { readonly width?: number; readonly height?: number };
}

export interface VideoCompressionMiddlewareOptions {
  readonly enabled?: boolean;
  readonly contentTypeMap?: Record<string, VideoCompressionOptions>;
  readonly tempDir?: string;
}

const DEFAULT_CRF = 28;
const DEFAULT_PRESET = "medium";
const DEFAULT_FORMAT = "mp4";

async function getFfmpeg() {
  try {
    const mod = await import("fluent-ffmpeg");
    return (mod as any).default ?? mod;
  } catch {
    throw new Error(
      "fluent-ffmpeg is not installed. Run: npm install fluent-ffmpeg",
    );
  }
}

export async function compressVideo(
  inputBuffer: Buffer,
  options: VideoCompressionOptions = {},
): Promise<Buffer> {
  const ffmpegInstance = await getFfmpeg();
  const crf = options.crf ?? DEFAULT_CRF;
  const preset = options.preset ?? DEFAULT_PRESET;
  const format = options.format ?? DEFAULT_FORMAT;

  return new Promise((resolve, reject) => {
    const outputBuffer: Buffer[] = [];

    ffmpegInstance
      .input(inputBuffer)
      .inputFormat("mp4")
      .outputOptions([
        `-crf ${crf}`,
        `-preset ${preset}`,
        "-movflags +faststart",
      ])
      .format(format)
      .on("end", () => {
        resolve(Buffer.concat(outputBuffer));
      })
      .on("error", (err: Error) => {
        reject(err);
      })
      .pipe((err: Error | null, stdout: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }
        stdout.on("data", (chunk: Buffer) => {
          outputBuffer.push(chunk);
        });
      });
  });
}

export function createVideoCompressionMiddleware(
  options: VideoCompressionMiddlewareOptions = {},
): HttpMiddleware {
  const enabled = options.enabled ?? true;

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

    if (!contentType || !contentType.startsWith("video/")) {
      return response;
    }

    const body = context.response.body;
    if (!Buffer.isBuffer(body)) {
      return response;
    }

    const compressionOptions = options.contentTypeMap?.[contentType] ?? {};

    try {
      const compressed = await compressVideo(body, compressionOptions);
      const newContentType = "video/mp4";

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

/**
 * Shared helpers for the media (image / video) compression middleware.
 *
 * Both middleware used to read the stale `context.response` instead of the
 * response `next()` returned, so a handler that returned a fresh response
 * context (the documented style) was never compressed. These helpers read
 * everything from the returned response.
 *
 * @module httpMiddleware/builtin/helpers/media
 */

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

/**
 * Reports a compression failure. The uncompressed response is still served.
 */
export type MediaCompressionErrorHandler = (
  error: unknown,
  response: ResponseContext,
) => void;

/**
 * The media type of a response (`image/png; q=1` → `image/png`), lowercased.
 */
export function getResponseMediaType(
  response: ResponseContext,
): string | undefined {
  const raw = response.headers["content-type"];

  if (typeof raw !== "string") {
    return undefined;
  }

  const mediaType = raw.split(";", 1)[0]?.trim().toLowerCase();

  return mediaType ? mediaType : undefined;
}

/**
 * The response body as a Buffer, or `undefined` for a body that is not held
 * in memory (streams, JSON values).
 */
export function getResponseBytes(response: ResponseContext): Buffer | undefined {
  const body: unknown = response.body;

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  return undefined;
}

/**
 * Loads an optional peer module's callable default export.
 */
export async function loadOptionalModule<T>(
  specifier: string,
  install: string,
): Promise<T> {
  try {
    const mod = (await import(specifier)) as { readonly default?: T };

    return (mod.default ?? mod) as T;
  } catch {
    throw new Error(`${specifier} is not installed. Run: ${install}`);
  }
}

/**
 * Replaces the body and content type of a compressed response.
 */
export function applyCompressedBody(
  response: ResponseContext,
  body: Buffer,
  contentType: string,
): ResponseContext {
  response.setHeader("content-type", contentType);

  if (response.headers["cache-control"] === undefined) {
    response.setHeader("cache-control", "public, max-age=86400");
  }

  response.removeHeader("content-length");

  return response.setBody(body);
}

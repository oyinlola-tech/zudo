/**
 * HTTP response writer.
 *
 * Provides the runtime-independent contract and utilities used to translate
 * an HttpResponseContext into a concrete HTTP response.
 *
 * Runtime adapters such as Node.js, Bun, or Deno should implement the
 * HttpResponseWriter interface rather than coupling the HTTP core to a
 * specific runtime.
 */

import {
  HttpResponseContext,
  serializeResponseCookie,
} from "./httpResponse.context.js";

import type { ResponseBody, ResponseCookie } from "./httpResponse.context.js";

import {
  isValidHeaderFieldName,
  isValidHeaderFieldValue,
} from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ResponseWriteOptions {
  readonly flushHeaders?: boolean;

  readonly end?: boolean;
}

export interface HttpResponseWriter {
  readonly headersSent: boolean;

  readonly writableEnded: boolean;

  readonly writable: boolean;

  writeHead(
    status: number,
    statusText?: string,
    headers?: Readonly<Record<string, string>>,
  ): void;

  setHeader(name: string, value: string): void;

  appendHeader(name: string, value: string): void;

  removeHeader(name: string): void;

  write(chunk: string | Uint8Array): boolean;

  end(chunk?: string | Uint8Array): void;

  flushHeaders?(): void;

  flush?(): void;

  /**
   * Resolves once the underlying sink has drained.
   *
   * Implemented by runtime writers that can report backpressure. Without it a
   * streaming body is pulled as fast as the source produces, so a slow client
   * buffers the whole stream in process memory.
   */
  waitForDrain?(): Promise<void>;
}

export interface ResponseWriter {
  write(
    context: HttpResponseContext,
    writer: HttpResponseWriter,
    options?: ResponseWriteOptions,
  ): void | Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

import {
  HttpResponseWriterError as ResponseWriterError,
  ResponseAlreadySentError as ResponseAlreadySentError,
  UnsupportedResponseBodyError as UnsupportedResponseBodyError,
} from "@zudojs/errors";

export {
  ResponseWriterError,
  ResponseAlreadySentError,
  UnsupportedResponseBodyError,
};

/* -------------------------------------------------------------------------- */
/* Default Writer                                                             */
/* -------------------------------------------------------------------------- */

export class DefaultResponseWriter implements ResponseWriter {
  async write(
    context: HttpResponseContext,
    writer: HttpResponseWriter,
    options: ResponseWriteOptions = {},
  ): Promise<void> {
    assertWritable(writer);

    context.assertMutable();

    const body = context.body;

    const status = context.status;

    const statusText = context.statusText;

    const cookies = context.cookies;

    /*
     * `prepareAutomaticHeaders` mutates the context's header map (inferring
     * Content-Type / Content-Length, stripping Content-Length from
     * body-forbidden statuses). `context.headers` is a getter that returns a
     * fresh copy on every access, so the header map must be read *after* this
     * call — passing a snapshot taken beforehand silently discards every
     * automatic header.
     */
    prepareAutomaticHeaders(context);

    writeHeaders(context, writer);

    writeCookies(writer, cookies);

    /*
     * `writeHead` is what commits the header block. Flushing beforehand
     * commits it with the socket's default status (200) and makes the
     * subsequent `writeHead` throw ERR_HTTP_HEADERS_SENT, so every response
     * would reach the client as a 200. Flush only after the status line has
     * been written.
     */
    writer.writeHead(status, statusText);

    if (options.flushHeaders !== false && writer.flushHeaders) {
      writer.flushHeaders();
    }

    if (isBodyForbidden(status)) {
      writer.end();
      context.commit();

      return;
    }

    if (body === undefined || body === null) {
      if (options.end !== false) {
        writer.end();
        context.commit();
      }

      return;
    }

    if (isReadableStream(body)) {
      await writeReadableStream(body, writer);

      writer.end();
      context.commit();

      return;
    }

    const normalized = normalizeBody(body);

    if (normalized === undefined) {
      writer.end();
      context.commit();

      return;
    }

    if (options.end === false) {
      writer.write(normalized);

      return;
    }

    writer.end(normalized);

    context.commit();
  }
}

/* -------------------------------------------------------------------------- */
/* Convenience Function                                                       */
/* -------------------------------------------------------------------------- */

export async function writeResponse(
  context: HttpResponseContext,
  writer: HttpResponseWriter,
  options: ResponseWriteOptions = {},
): Promise<void> {
  const responseWriter = new DefaultResponseWriter();

  await responseWriter.write(context, writer, options);
}

/* -------------------------------------------------------------------------- */
/* Header Writing                                                             */
/* -------------------------------------------------------------------------- */

export function writeHeaders(
  context: HttpResponseContext,
  writer: HttpResponseWriter,
  headers: Readonly<
    Record<string, string | string[] | undefined>
  > = context.headers,
): void {
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    if (!isValidHeaderFieldName(name)) {
      throw new ResponseWriterError(
        `Refusing to write response header with invalid field name: ${JSON.stringify(name)}`,
      );
    }

    const values = Array.isArray(value) ? value : [value];

    for (const entry of values) {
      if (!isValidHeaderFieldValue(entry)) {
        throw new ResponseWriterError(
          `Refusing to write response header "${name}": value contains a control character or surrounding whitespace.`,
        );
      }
    }

    if (name.toLowerCase() === "set-cookie") {
      /*
       * Set-Cookie is the one header that must not be folded into a single
       * comma-separated line: browsers read the joined form as one malformed
       * cookie, so every cookie after the first is lost. Emit one line each.
       */
      for (const entry of values) {
        writer.appendHeader(name, entry);
      }

      continue;
    }

    writer.setHeader(name, values.join(", "));
  }
}

export function writeCookies(
  writer: HttpResponseWriter,
  cookies: readonly ResponseCookie[],
): void {
  for (const cookie of cookies) {
    const serialized = serializeResponseCookie(cookie);

    writer.appendHeader("set-cookie", serialized);
  }
}

/* -------------------------------------------------------------------------- */
/* Automatic Headers                                                          */
/* -------------------------------------------------------------------------- */

export function prepareAutomaticHeaders(context: HttpResponseContext): void {
  const body = context.body;

  if (
    context.contentType === undefined &&
    body !== undefined &&
    body !== null
  ) {
    const inferred = inferContentType(body);

    if (inferred) {
      context.setContentType(inferred);
    }
  }

  if (
    context.contentLength === undefined &&
    body !== undefined &&
    body !== null &&
    !isReadableStream(body)
  ) {
    const length = getBodyByteLength(body);

    if (length !== undefined) {
      context.setContentLength(length);
    }
  }

  if (isBodyForbidden(context.status)) {
    context.removeHeader("content-length");
  }
}

/* -------------------------------------------------------------------------- */
/* Body Normalization                                                         */
/* -------------------------------------------------------------------------- */

export function normalizeBody(
  body: ResponseBody,
): string | Uint8Array | undefined {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (isReadableStream(body)) {
    throw new UnsupportedResponseBodyError(
      "ReadableStream bodies must be handled by the streaming writer.",
    );
  }

  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    typeof body === "number" ||
    typeof body === "boolean" ||
    typeof body === "bigint"
  ) {
    return String(body);
  }

  if (typeof body === "object") {
    return JSON.stringify(body);
  }

  throw new UnsupportedResponseBodyError();
}

/* -------------------------------------------------------------------------- */
/* Streaming                                                                  */
/* -------------------------------------------------------------------------- */

export async function writeReadableStream(
  stream: ReadableStream<Uint8Array>,
  writer: HttpResponseWriter,
): Promise<void> {
  const reader = stream.getReader();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      if (result.value) {
        const accepted = writer.write(result.value);

        if (!accepted && writer.waitForDrain) {
          await writer.waitForDrain();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* -------------------------------------------------------------------------- */
/* Body Helpers                                                               */
/* -------------------------------------------------------------------------- */

export function getBodyByteLength(body: ResponseBody): number | undefined {
  if (typeof body === "string") {
    return getUtf8ByteLength(body);
  }

  if (body instanceof Uint8Array) {
    return body.byteLength;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (body === undefined || body === null) {
    return 0;
  }

  if (isReadableStream(body)) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(body);

    if (serialized === undefined) {
      return undefined;
    }

    return getUtf8ByteLength(serialized);
  } catch {
    return undefined;
  }
}

export function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  return unescape(encodeURIComponent(value)).length;
}

/* -------------------------------------------------------------------------- */
/* Content Type Inference                                                     */
/* -------------------------------------------------------------------------- */

export function inferContentType(body: ResponseBody): string | undefined {
  if (typeof body === "string") {
    return "text/plain; charset=utf-8";
  }

  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return "application/octet-stream";
  }

  if (isReadableStream(body)) {
    return undefined;
  }

  if (body !== undefined && body !== null && typeof body === "object") {
    return "application/json; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

/* -------------------------------------------------------------------------- */
/* Status Rules                                                               */
/* -------------------------------------------------------------------------- */

export function isBodyForbidden(status: number): boolean {
  return (
    status === 101 ||
    status === 204 ||
    status === 205 ||
    status === 304 ||
    (status >= 100 && status < 200)
  );
}

/* -------------------------------------------------------------------------- */
/* Runtime Detection                                                          */
/* -------------------------------------------------------------------------- */

export function isReadableStream(
  value: unknown,
): value is ReadableStream<Uint8Array> {
  if (typeof ReadableStream === "undefined") {
    return false;
  }

  return value instanceof ReadableStream;
}

/* -------------------------------------------------------------------------- */
/* Writer State                                                               */
/* -------------------------------------------------------------------------- */

export function assertWritable(writer: HttpResponseWriter): void {
  if (writer.headersSent) {
    throw new ResponseAlreadySentError(
      "HTTP response headers have already been sent.",
    );
  }

  if (writer.writableEnded) {
    throw new ResponseAlreadySentError("HTTP response has already ended.");
  }

  if (writer.writable === false) {
    throw new ResponseWriterError("HTTP response is not writable.", {
      code: "HTTP_RESPONSE_NOT_WRITABLE",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Adapter Helpers                                                            */
/* -------------------------------------------------------------------------- */

export function createResponseWriter(
  writer: HttpResponseWriter,
): ResponseWriter {
  return {
    write(context, _writer, options) {
      return writeResponse(context, writer, options);
    },
  };
}

export function isResponseWriter(value: unknown): value is HttpResponseWriter {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<HttpResponseWriter>;

  return (
    typeof candidate.writeHead === "function" &&
    typeof candidate.setHeader === "function" &&
    typeof candidate.appendHeader === "function" &&
    typeof candidate.removeHeader === "function" &&
    typeof candidate.write === "function" &&
    typeof candidate.end === "function"
  );
}

import type { IncomingMessage } from "node:http";

import {
  DEFAULT_BODY_ENCODING,
  DEFAULT_BODY_LIMIT,
  isFormContentType,
  isJSONContentType,
  isMultipartContentType,
  isTextContentType,
  parseBody,
  readBody,
  readForm,
  readJSON,
  readText,
  type HTTPBodyReaderOptions,
  type HTTPBodyParseOptions,
} from "./http.body.js";

import {
  parseMultipart,
  type MultipartForm,
  type MultipartOptions,
} from "../httpMultipart/http.multipart.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ParsedBody =
  unknown | Buffer | string | Record<string, string | string[]> | MultipartForm;

export type BodyParserFormat = "json" | "form" | "text" | "multipart" | "raw";

export interface BodyParserOptions extends HTTPBodyParseOptions {
  readonly multipart?: MultipartOptions;
  readonly strictContentType?: boolean;
}

export interface BodyParserResult<T = unknown> {
  readonly body: T;
  readonly format: BodyParserFormat;
  readonly contentType?: string;
  readonly contentLength?: number;
}

export interface BodyParser {
  parse<T = unknown>(request: IncomingMessage): Promise<BodyParserResult<T>>;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_BODY_PARSER_OPTIONS: Required<
  Pick<BodyParserOptions, "limit" | "encoding" | "strictContentType">
> = {
  limit: DEFAULT_BODY_LIMIT,

  encoding: DEFAULT_BODY_ENCODING,

  strictContentType: false,
};

/* -------------------------------------------------------------------------- */
/* Main Parser                                                                */
/* -------------------------------------------------------------------------- */

export async function parseRequestBody<T = ParsedBody>(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<BodyParserResult<T>> {
  const contentType = getRequestContentType(request);

  const contentLength = getRequestContentLength(request);

  const format = detectBodyFormat(contentType);

  /*
   * `strictContentType` means "only accept media types this parser
   * understands". Omitting the header is easier than supplying an
   * unrecognised one, so a missing Content-Type must be rejected too or the
   * option only blocks the harmless case.
   */
  if (options.strictContentType && format === "raw") {
    throw new UnsupportedBodyTypeError(contentType ?? "(missing)");
  }

  const body = await parseByFormat<T>(request, format, options);

  return {
    body,
    format,
    contentType,
    contentLength,
  };
}

/* -------------------------------------------------------------------------- */
/* Format Detection                                                           */
/* -------------------------------------------------------------------------- */

export function detectBodyFormat(
  contentType: string | undefined,
): BodyParserFormat {
  if (isJSONContentType(contentType)) {
    return "json";
  }

  if (isFormContentType(contentType)) {
    return "form";
  }

  if (isMultipartContentType(contentType)) {
    return "multipart";
  }

  if (isTextContentType(contentType)) {
    return "text";
  }

  return "raw";
}

/* -------------------------------------------------------------------------- */
/* Format Parser                                                              */
/* -------------------------------------------------------------------------- */

async function parseByFormat<T>(
  request: IncomingMessage,
  format: BodyParserFormat,
  options: BodyParserOptions,
): Promise<T> {
  switch (format) {
    case "json":
      return readJSON<T>({
        request,
        limit: options.limit ?? DEFAULT_BODY_LIMIT,
        encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
        strict: options.strict,
      });

    case "form":
      return readForm({
        request,
        limit: options.limit ?? DEFAULT_BODY_LIMIT,
        encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
      }) as T;

    case "multipart":
      return parseMultipart(request, {
        limit: options.multipart?.limit ?? options.limit ?? DEFAULT_BODY_LIMIT,

        maxFileSize: options.multipart?.maxFileSize,

        maxFiles: options.multipart?.maxFiles,

        maxFields: options.multipart?.maxFields,

        maxFieldSize: options.multipart?.maxFieldSize,

        maxParts: options.multipart?.maxParts,

        encoding:
          options.multipart?.encoding ??
          options.encoding ??
          DEFAULT_BODY_ENCODING,
      }) as T;

    case "text":
      return readText({
        request,
        limit: options.limit ?? DEFAULT_BODY_LIMIT,
        encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
      }) as T;

    case "raw":
    default:
      return readBody({
        request,
        limit: options.limit ?? DEFAULT_BODY_LIMIT,
        encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
      }) as T;
  }
}

/* -------------------------------------------------------------------------- */
/* Individual Parsers                                                         */
/* -------------------------------------------------------------------------- */

export async function parseJSONBody<T = unknown>(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<T> {
  return readJSON<T>({
    request,
    limit: options.limit ?? DEFAULT_BODY_LIMIT,
    encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
    strict: options.strict,
  });
}

export async function parseFormBody(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<Record<string, string | string[]>> {
  return readForm({
    request,
    limit: options.limit ?? DEFAULT_BODY_LIMIT,
    encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
  });
}

export async function parseTextBody(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<string> {
  return readText({
    request,
    limit: options.limit ?? DEFAULT_BODY_LIMIT,
    encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
  });
}

export async function parseRawBody(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<Buffer> {
  return readBody({
    request,
    limit: options.limit ?? DEFAULT_BODY_LIMIT,
    encoding: options.encoding ?? DEFAULT_BODY_ENCODING,
  });
}

export async function parseMultipartBody(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<MultipartForm> {
  return parseMultipart(request, {
    limit: options.multipart?.limit ?? options.limit ?? DEFAULT_BODY_LIMIT,

    maxFileSize: options.multipart?.maxFileSize,

    maxFiles: options.multipart?.maxFiles,

    maxFields: options.multipart?.maxFields,

    maxFieldSize: options.multipart?.maxFieldSize,

    maxParts: options.multipart?.maxParts,

    encoding:
      options.multipart?.encoding ?? options.encoding ?? DEFAULT_BODY_ENCODING,
  });
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createBodyParser(options: BodyParserOptions = {}): BodyParser {
  const resolved: BodyParserOptions = {
    ...DEFAULT_BODY_PARSER_OPTIONS,
    ...options,
  };

  return {
    async parse<T = unknown>(
      request: IncomingMessage,
    ): Promise<BodyParserResult<T>> {
      return parseRequestBody<T>(request, resolved);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Request Inspection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Reports whether a request is framed as carrying a body.
 *
 * A message carrying both `Content-Length` and `Transfer-Encoding` is
 * rejected rather than being resolved in favour of either framing — RFC 9112
 * §6.1 requires that, and silently picking one is the CL.TE half of a
 * request-smuggling differential.
 */
export function hasRequestBody(request: IncomingMessage): boolean {
  const method = request.method?.toUpperCase();

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const contentLength = getRequestContentLength(request);

  if (contentLength !== undefined) {
    return contentLength > 0;
  }

  const transferEncoding = request.headers["transfer-encoding"];

  if (transferEncoding) {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Content Type                                                               */
/* -------------------------------------------------------------------------- */

export function getRequestContentType(
  request: IncomingMessage,
): string | undefined {
  const value = request.headers["content-type"];

  if (Array.isArray(value)) {
    return value[0]?.split(";", 1)[0]?.trim().toLowerCase();
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.split(";", 1)[0]?.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Content Length                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reads `Content-Length`, rejecting duplicate headers whose values disagree
 * and a message that also carries `Transfer-Encoding`.
 */
export function getRequestContentLength(
  request: IncomingMessage,
): number | undefined {
  const header = request.headers["content-length"];

  if (header === undefined) {
    return undefined;
  }

  const values = (Array.isArray(header) ? header : [header]).flatMap((entry) =>
    typeof entry === "string" ? entry.split(",") : [],
  );

  if (values.length === 0) {
    return undefined;
  }

  let length: number | undefined;

  for (const value of values) {
    const raw = value.trim();

    const parsed = Number(raw);

    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed)) {
      throw new InvalidContentLengthError(raw);
    }

    if (length !== undefined && parsed !== length) {
      throw new InvalidContentLengthError(values.join(", "));
    }

    length = parsed;
  }

  if (request.headers["transfer-encoding"] !== undefined) {
    throw new InvalidContentLengthError(
      "Content-Length and Transfer-Encoding must not both be present.",
    );
  }

  return length;
}

/* -------------------------------------------------------------------------- */
/* Media Type Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function isJSONRequest(request: IncomingMessage): boolean {
  return isJSONContentType(getRequestContentType(request));
}

export function isFormRequest(request: IncomingMessage): boolean {
  return isFormContentType(getRequestContentType(request));
}

export function isMultipartRequestBody(request: IncomingMessage): boolean {
  return isMultipartContentType(getRequestContentType(request));
}

export function isTextRequest(request: IncomingMessage): boolean {
  return isTextContentType(getRequestContentType(request));
}

/* -------------------------------------------------------------------------- */
/* Body Parser Errors                                                         */
/* -------------------------------------------------------------------------- */

import {
  BodyParserError,
  UnsupportedBodyTypeError,
  InvalidContentLengthError,
} from "@zudojs/errors";

export { BodyParserError, UnsupportedBodyTypeError, InvalidContentLengthError };

/* -------------------------------------------------------------------------- */
/* Body Parser Middleware Helper                                              */
/* -------------------------------------------------------------------------- */

export interface ParsedBodyRequest extends IncomingMessage {
  body?: unknown;
}

export async function attachParsedBody(
  request: ParsedBodyRequest,
  options: BodyParserOptions = {},
): Promise<BodyParserResult> {
  const result = await parseRequestBody(request, options);

  request.body = result.body;

  return result;
}

/* -------------------------------------------------------------------------- */
/* Compatibility Helper                                                       */
/* -------------------------------------------------------------------------- */

export async function parseBodyWithOptions<T = unknown>(
  request: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<T> {
  const result = await parseRequestBody<T>(request, options);

  return result.body;
}

/* -------------------------------------------------------------------------- */
/* Re-exported Low Level Helpers                                              */
/* -------------------------------------------------------------------------- */

export { parseBody, readBody, readForm, readJSON, readText };

export type { HTTPBodyReaderOptions, HTTPBodyParseOptions };

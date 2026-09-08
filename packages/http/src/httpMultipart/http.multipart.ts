import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface MultipartFile {
  readonly fieldName: string;
  readonly filename: string;
  readonly contentType: string;
  readonly encoding: string;
  readonly size: number;
  readonly data: Buffer;
}

export interface MultipartField {
  readonly fieldName: string;
  readonly value: string;
}

export interface MultipartForm {
  readonly fields: Record<string, string | string[]>;
  readonly files: readonly MultipartFile[];
}

export interface MultipartOptions {
  readonly limit?: number;
  readonly maxFileSize?: number;
  readonly maxFieldSize?: number;
  readonly maxFiles?: number;
  readonly maxFields?: number;
  readonly maxParts?: number;
  readonly encoding?: BufferEncoding;

  /**
   * Skip a part that carries no `Content-Disposition` field name instead of
   * rejecting the whole body. Defaults to `false` (reject).
   */
  readonly allowUnnamedParts?: boolean;
}

export interface MultipartPartHeaders {
  readonly contentDisposition?: string;
  readonly contentType?: string;
  readonly contentTransferEncoding?: string;
}

/**
 * One decoded part of a multipart body.
 *
 * This is the single representation every multipart entry point in the
 * package is built on, so the field names, file names and bytes a caller sees
 * cannot depend on which entry point they happened to use.
 */
export interface MultipartPart {
  readonly name: string;
  readonly filename?: string;
  readonly contentType?: string;
  readonly transferEncoding?: string;
  readonly data: Buffer;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_MULTIPART_LIMIT = 10 * 1024 * 1024;

export const DEFAULT_MULTIPART_FILE_LIMIT = 10 * 1024 * 1024;

export const DEFAULT_MULTIPART_FIELD_LIMIT = 1024 * 1024;

export const DEFAULT_MULTIPART_MAX_FILES = 20;

export const DEFAULT_MULTIPART_MAX_FIELDS = 100;

/**
 * Hard cap on the number of parts scanned out of one body, applied before any
 * part is decoded so a body made entirely of empty delimiters cannot allocate
 * without bound.
 */
export const DEFAULT_MULTIPART_MAX_PARTS = 1000;

/**
 * Longest filename retained after sanitisation, in bytes.
 *
 * `NAME_MAX` is 255 on every mainstream filesystem; a longer name produces an
 * `ENAMETOOLONG` that most upload handlers turn into a 500.
 */
export const MAX_FILENAME_BYTES = 255;

const CRLF = Buffer.from("\r\n", "utf8");

const CRLF_CRLF = Buffer.from("\r\n\r\n", "utf8");

const LF_LF = Buffer.from("\n\n", "utf8");

/* -------------------------------------------------------------------------- */
/* Multipart Parser                                                           */
/* -------------------------------------------------------------------------- */

export async function parseMultipart(
  request: IncomingMessage,
  options: MultipartOptions = {},
): Promise<MultipartForm> {
  const contentType = getMultipartContentType(request);

  const boundary = extractBoundary(contentType);

  if (!boundary) {
    throw new MultipartParseError("Multipart boundary is missing.");
  }

  const body = await readMultipartBody(
    request,
    options.limit ?? DEFAULT_MULTIPART_LIMIT,
  );

  return parseMultipartBuffer(body, boundary, options);
}

/* -------------------------------------------------------------------------- */
/* Buffer Parser                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Splits a multipart body into its parts.
 *
 * The delimiter is matched only where RFC 2046 §5.1.1 allows one — at the
 * very start of the body, or immediately after a CRLF — so a `--boundary`
 * sequence occurring inside a part's content cannot forge a new part or
 * truncate the body. A body whose closing delimiter is missing is rejected
 * rather than silently treated as complete.
 */
export function parseMultipartParts(
  body: Buffer,
  boundary: string,
  options: MultipartOptions = {},
): MultipartPart[] {
  validateBoundary(boundary);

  const maxParts = options.maxParts ?? DEFAULT_MULTIPART_MAX_PARTS;

  const encoding = options.encoding ?? "utf8";

  const delimiter = Buffer.from(`--${boundary}`, "utf8");

  const crlfDelimiter = Buffer.concat([CRLF, delimiter]);

  let cursor = findOpeningDelimiter(body, delimiter, crlfDelimiter);

  const parts: MultipartPart[] = [];

  let closed = false;

  while (cursor <= body.length) {
    if (body[cursor] === 45 && body[cursor + 1] === 45) {
      closed = true;

      break;
    }

    const contentStart = skipDelimiterEOL(body, cursor);

    const next = body.indexOf(crlfDelimiter, contentStart);

    if (next === -1) {
      throw new MultipartParseError(
        "Multipart closing delimiter was not found.",
      );
    }

    if (parts.length >= maxParts) {
      throw new MultipartLimitError(
        "Maximum number of multipart parts exceeded.",
      );
    }

    const parsed = parseMultipartPart(
      body.subarray(contentStart, next),
      encoding,
      options.allowUnnamedParts === true,
    );

    if (parsed) {
      parts.push(parsed);
    }

    cursor = next + crlfDelimiter.length;
  }

  if (!closed) {
    throw new MultipartParseError("Multipart closing delimiter was not found.");
  }

  return parts;
}

export function parseMultipartBuffer(
  body: Buffer,
  boundary: string,
  options: MultipartOptions = {},
): MultipartForm {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MULTIPART_FILE_LIMIT;

  const maxFieldSize = options.maxFieldSize ?? DEFAULT_MULTIPART_FIELD_LIMIT;

  const maxFiles = options.maxFiles ?? DEFAULT_MULTIPART_MAX_FILES;

  const maxFields = options.maxFields ?? DEFAULT_MULTIPART_MAX_FIELDS;

  /*
   * A null-prototype container: a part named `__proto__` can neither replace
   * the returned object's prototype nor be read back as an inherited member.
   */
  const fields = Object.create(null) as Record<string, string | string[]>;

  const files: MultipartFile[] = [];

  let fieldCount = 0;

  for (const part of parseMultipartParts(body, boundary, options)) {
    if (part.filename !== undefined) {
      if (files.length >= maxFiles) {
        throw new MultipartLimitError(
          "Maximum number of uploaded files exceeded.",
        );
      }

      if (part.data.length > maxFileSize) {
        throw new MultipartLimitError(
          "Uploaded file exceeds the configured file size limit.",
        );
      }

      files.push({
        fieldName: part.name,
        filename: sanitizeFilename(part.filename),
        contentType: part.contentType ?? "application/octet-stream",
        encoding: part.transferEncoding ?? "binary",
        size: part.data.length,
        data: part.data,
      });

      continue;
    }

    fieldCount += 1;

    if (fieldCount > maxFields) {
      throw new MultipartLimitError(
        "Maximum number of multipart fields exceeded.",
      );
    }

    if (part.data.length > maxFieldSize) {
      throw new MultipartLimitError(
        "Multipart field exceeds the configured size limit.",
      );
    }

    appendField(
      fields,
      part.name,
      part.data.toString(options.encoding ?? "utf8"),
    );
  }

  return {
    fields,
    files,
  };
}

/* -------------------------------------------------------------------------- */
/* Multipart Request Body                                                     */
/* -------------------------------------------------------------------------- */

async function readMultipartBody(
  request: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError(
      "Multipart body limit must be a non-negative safe integer.",
    );
  }

  const contentLength = getContentLength(request);

  if (contentLength !== undefined && contentLength > limit) {
    request.resume();

    throw new MultipartLimitError(
      "Multipart request exceeds the configured body limit.",
    );
  }

  const chunks: Buffer[] = [];

  let total = 0;

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      request.removeListener("data", onData);

      request.removeListener("end", onEnd);

      request.removeListener("error", onError);

      request.removeListener("aborted", onAborted);

      request.removeListener("close", onClose);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();
      request.resume();

      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      total += buffer.length;

      if (total > limit) {
        fail(
          new MultipartLimitError(
            "Multipart request exceeds the configured body limit.",
          ),
        );

        return;
      }

      chunks.push(buffer);
    };

    const onEnd = () => {
      if (settled) {
        return;
      }

      /*
       * A body shorter than its declared Content-Length means the client
       * stopped sending. Resolving it would hand a silently truncated upload
       * to the caller as if it were complete.
       */
      if (contentLength !== undefined && total !== contentLength) {
        fail(
          new MultipartParseError(
            "Multipart request body length does not match Content-Length.",
          ),
        );

        return;
      }

      settled = true;

      cleanup();

      resolve(Buffer.concat(chunks, total));
    };

    const onError = (error: Error) => {
      fail(error);
    };

    const onAborted = () => {
      fail(new MultipartParseError("Multipart request was aborted."));
    };

    const onClose = () => {
      if (!settled && request.readableEnded !== true) {
        fail(
          new MultipartParseError(
            "Multipart request closed before completion.",
          ),
        );
      }
    };

    request.on("data", onData);

    request.once("end", onEnd);

    request.once("error", onError);

    request.once("aborted", onAborted);

    request.once("close", onClose);
  });
}

/* -------------------------------------------------------------------------- */
/* Content Type                                                               */
/* -------------------------------------------------------------------------- */

export function getMultipartContentType(
  request: IncomingMessage,
): string | undefined {
  const header = request.headers["content-type"];

  if (Array.isArray(header)) {
    return header[0];
  }

  return typeof header === "string" ? header : undefined;
}

export function isMultipartRequest(request: IncomingMessage): boolean {
  const contentType = getMultipartContentType(request);

  return Boolean(
    contentType && contentType.toLowerCase().startsWith("multipart/"),
  );
}

/* -------------------------------------------------------------------------- */
/* Boundary                                                                   */
/* -------------------------------------------------------------------------- */

export function extractBoundary(
  contentType: string | undefined,
): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const match = /(?:^|;)\s*boundary=(?:"([^"]*)"|([^;]*))/i.exec(contentType);

  if (!match) {
    return undefined;
  }

  const boundary = (match[1] ?? match[2] ?? "").trim();

  return boundary.length > 0 ? boundary : undefined;
}

function validateBoundary(boundary: string): void {
  if (boundary.length === 0 || boundary.length > 70) {
    throw new MultipartParseError("Invalid multipart boundary.");
  }
}

/* -------------------------------------------------------------------------- */
/* Part Parsing                                                               */
/* -------------------------------------------------------------------------- */

function parseMultipartPart(
  part: Buffer,
  encoding: BufferEncoding,
  allowUnnamed: boolean,
): MultipartPart | undefined {
  const separator = findHeaderSeparator(part);

  if (separator === undefined) {
    if (part.length === 0 || allowUnnamed) {
      return undefined;
    }

    throw new MultipartParseError(
      "Multipart part has no header/body separator.",
    );
  }

  const headerBuffer = part.subarray(0, separator.index);

  /*
   * The body is taken verbatim. The delimiter's own CRLF was already excluded
   * by the split, so stripping again here would silently delete two bytes
   * from any upload whose content genuinely ends in CRLF.
   */
  const body = part.subarray(separator.index + separator.length);

  const headers = parsePartHeaders(headerBuffer.toString(encoding));

  const disposition = headers.contentDisposition;

  if (!disposition) {
    if (allowUnnamed) {
      return undefined;
    }

    throw new MultipartParseError(
      "Multipart part is missing Content-Disposition.",
    );
  }

  const name = getDispositionParameter(disposition, "name");

  if (!name) {
    if (allowUnnamed) {
      return undefined;
    }

    throw new MultipartParseError("Multipart part is missing a field name.");
  }

  const filename = getDispositionParameter(disposition, "filename");

  return {
    name,
    filename: filename === null ? undefined : filename,
    contentType: headers.contentType,
    transferEncoding: headers.contentTransferEncoding,
    data: body,
  };
}

/* -------------------------------------------------------------------------- */
/* Header Parsing                                                             */
/* -------------------------------------------------------------------------- */

function parsePartHeaders(headerBlock: string): MultipartPartHeaders {
  const headers = Object.create(null) as Record<string, string>;

  for (const line of headerBlock.split(/\r?\n/)) {
    const separator = line.indexOf(":");

    if (separator <= 0) {
      continue;
    }

    const name = line.slice(0, separator).trim().toLowerCase();

    const value = line.slice(separator + 1).trim();

    headers[name] = value;
  }

  return {
    contentDisposition: ownHeader(headers, "content-disposition"),
    contentType: ownHeader(headers, "content-type"),
    contentTransferEncoding: ownHeader(headers, "content-transfer-encoding"),
  };
}

function ownHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(headers, name)
    ? headers[name]
    : undefined;
}

/**
 * Reads one Content-Disposition parameter.
 *
 * The RFC 5987 / RFC 2231 extended form (`filename*=UTF-8''%2e%2e%2fetc`) is
 * preferred over the plain form when present, matching what browsers send for
 * non-ASCII names — and, more importantly, so a traversal hidden behind
 * percent-encoding is decoded here and sanitised by the caller rather than
 * being handed through untouched.
 */
function getDispositionParameter(
  disposition: string,
  parameter: string,
): string | null {
  const extended = matchDispositionParameter(disposition, `${parameter}*`);

  if (extended !== null) {
    const decoded = decodeExtendedParameter(extended);

    if (decoded !== undefined) {
      return decoded;
    }
  }

  return matchDispositionParameter(disposition, parameter);
}

function matchDispositionParameter(
  disposition: string,
  parameter: string,
): string | null {
  const expression = new RegExp(
    `(?:^|;)\\s*${escapeRegExp(parameter)}\\s*=\\s*(?:"([^"]*)"|([^;]*))`,
    "i",
  );

  const match = expression.exec(disposition);

  if (!match) {
    return null;
  }

  return match[1] ?? match[2]?.trim() ?? "";
}

function decodeExtendedParameter(value: string): string | undefined {
  const match = /^([^']*)'([^']*)'(.*)$/.exec(value);

  if (!match) {
    return undefined;
  }

  const [, rawCharset, , encoded] = match;

  if (rawCharset === undefined || encoded === undefined) {
    return undefined;
  }

  const charset = rawCharset.toLowerCase();

  if (charset !== "utf-8" && charset !== "iso-8859-1" && charset !== "") {
    return undefined;
  }

  try {
    if (charset === "iso-8859-1") {
      return Buffer.from(percentDecodeBytes(encoded)).toString("latin1");
    }

    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function percentDecodeBytes(value: string): Buffer {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === undefined) {
      continue;
    }

    if (character === "%" && index + 2 < value.length) {
      const hex = value.slice(index + 1, index + 3);

      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));

        index += 2;

        continue;
      }
    }

    bytes.push(character.charCodeAt(0) & 0xff);
  }

  return Buffer.from(bytes);
}

/* -------------------------------------------------------------------------- */
/* Multipart Splitting                                                        */
/* -------------------------------------------------------------------------- */

function findOpeningDelimiter(
  body: Buffer,
  delimiter: Buffer,
  crlfDelimiter: Buffer,
): number {
  if (body.subarray(0, delimiter.length).equals(delimiter)) {
    return delimiter.length;
  }

  const position = body.indexOf(crlfDelimiter);

  if (position === -1) {
    throw new MultipartParseError("Multipart opening delimiter was not found.");
  }

  return position + crlfDelimiter.length;
}

/**
 * Skips the transport padding and line break that follow a delimiter.
 *
 * RFC 2046 allows linear whitespace between the delimiter and its CRLF.
 */
function skipDelimiterEOL(body: Buffer, position: number): number {
  let cursor = position;

  while (body[cursor] === 32 || body[cursor] === 9) {
    cursor += 1;
  }

  if (body[cursor] === 13 && body[cursor + 1] === 10) {
    return cursor + 2;
  }

  if (body[cursor] === 10) {
    return cursor + 1;
  }

  throw new MultipartParseError("Invalid multipart delimiter line ending.");
}

interface HeaderSeparator {
  readonly index: number;
  readonly length: number;
}

/**
 * Locates the blank line between a part's headers and its body.
 *
 * Both the CRLF form and the bare-LF form some non-browser clients emit are
 * recognised. A part with neither is an error rather than a silent discard.
 */
function findHeaderSeparator(buffer: Buffer): HeaderSeparator | undefined {
  const crlf = buffer.indexOf(CRLF_CRLF);

  const lf = buffer.indexOf(LF_LF);

  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return { index: crlf, length: CRLF_CRLF.length };
  }

  if (lf !== -1) {
    return { index: lf, length: LF_LF.length };
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Field Utilities                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Key names that would mutate a prototype chain if used as a field name.
 */
const FORBIDDEN_FIELD_NAMES: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function appendField(
  fields: Record<string, string | string[]>,
  name: string,
  value: string,
): void {
  if (FORBIDDEN_FIELD_NAMES.has(name)) {
    return;
  }

  const existing = Object.prototype.hasOwnProperty.call(fields, name)
    ? fields[name]
    : undefined;

  if (existing === undefined) {
    fields[name] = value;

    return;
  }

  if (Array.isArray(existing)) {
    existing.push(value);

    return;
  }

  fields[name] = [existing, value];
}

/* -------------------------------------------------------------------------- */
/* Filename Utilities                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Reduces an uploaded filename to a safe basename.
 *
 * Neutralises every form of path escape the name can carry: POSIX and Windows
 * separators, the `.` and `..` entries (which `path.join` resolves to the
 * upload directory and its **parent**), a Windows drive-relative prefix such
 * as `C:evil.txt`, control characters including NUL, and a name long enough
 * to blow past `NAME_MAX`. A name that reduces to nothing usable is replaced
 * with a generated one rather than returned empty.
 */
export function sanitizeFilename(filename: string): string {
  const normalized = filename.replace(/\\/g, "/");

  let basename = normalized.slice(normalized.lastIndexOf("/") + 1);

  /* A drive-relative name resolves against that drive's own directory. */
  basename = basename.replace(/^[A-Za-z]:/, "");

  basename = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  /* Leading dots would produce a hidden file or a traversal token. */
  basename = basename.replace(/^\.+/, "");

  basename = truncateToBytes(basename, MAX_FILENAME_BYTES);

  basename = basename.trim();

  if (basename.length === 0 || basename === "." || basename === "..") {
    return `upload-${randomUUID()}`;
  }

  return basename;
}

function truncateToBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  const buffer = Buffer.from(value, "utf8").subarray(0, maxBytes);

  /* Drop a trailing partial UTF-8 sequence rather than emitting U+FFFD. */
  return new TextDecoder("utf-8", { fatal: false })
    .decode(buffer)
    .replace(/\ufffd+$/, "");
}

/* -------------------------------------------------------------------------- */
/* Request Utilities                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reads `Content-Length`, rejecting the framings RFC 9112 requires a server
 * to refuse: a duplicated header whose values disagree, and a message that
 * carries both `Content-Length` and `Transfer-Encoding`.
 */
function getContentLength(request: IncomingMessage): number | undefined {
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
    const parsed = Number(value.trim());

    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed)) {
      throw new MultipartParseError("Invalid Content-Length header.");
    }

    if (length !== undefined && parsed !== length) {
      throw new MultipartParseError("Conflicting Content-Length headers.");
    }

    length = parsed;
  }

  if (request.headers["transfer-encoding"] !== undefined) {
    throw new MultipartParseError(
      "Content-Length and Transfer-Encoding must not both be present.",
    );
  }

  return length;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

import {
  MultipartError,
  MultipartParseError,
  MultipartLimitError,
} from "@zudojs/errors";

export { MultipartError, MultipartParseError, MultipartLimitError };

/* -------------------------------------------------------------------------- */
/* Generic Helpers                                                            */
/* -------------------------------------------------------------------------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

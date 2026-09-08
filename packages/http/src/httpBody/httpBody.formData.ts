import type { IncomingMessage } from "node:http";
import { readBody } from "./http.body.js";

import {
  parseMultipartParts,
  sanitizeFilename as sanitizeMultipartFilename,
  type MultipartOptions,
} from "../httpMultipart/http.multipart.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface HTTPFormDataFile {
  readonly fieldName: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly data: Buffer;
}

export interface HTTPFormDataField {
  readonly name: string;
  readonly value: string;
}

export type HTTPFormDataValue = string | HTTPFormDataFile;

export interface HTTPFormData {
  readonly fields: ReadonlyMap<string, HTTPFormDataValue[]>;

  readonly fieldNames: readonly string[];

  get(name: string): HTTPFormDataValue | undefined;

  getAll(name: string): readonly HTTPFormDataValue[];

  has(name: string): boolean;

  entries(): IterableIterator<readonly [string, HTTPFormDataValue]>;

  keys(): IterableIterator<string>;

  values(): IterableIterator<HTTPFormDataValue>;

  forEach(callback: (value: HTTPFormDataValue, name: string) => void): void;

  toObject(): Record<string, HTTPFormDataValue | HTTPFormDataValue[]>;
}

export interface HTTPFormDataParseOptions {
  readonly request: IncomingMessage;

  readonly limit?: number;

  readonly maxFields?: number;

  readonly maxFieldSize?: number;

  readonly maxFileSize?: number;

  readonly maxFiles?: number;

  readonly strict?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_FORM_DATA_LIMIT = 10 * 1024 * 1024;

export const DEFAULT_MAX_FIELDS = 1000;

export const DEFAULT_MAX_FIELD_SIZE = 1024 * 1024;

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const DEFAULT_MAX_FILES = 100;

/* -------------------------------------------------------------------------- */
/* Content Type                                                               */
/* -------------------------------------------------------------------------- */

export function isMultipartContentType(
  contentType: string | undefined,
): boolean {
  if (!contentType) {
    return false;
  }

  return (
    contentType.split(";", 1)[0]?.trim().toLowerCase() === "multipart/form-data"
  );
}

export function getMultipartBoundary(
  contentType: string | undefined,
): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const parts = contentType.split(";");

  if (parts[0]?.trim().toLowerCase() !== "multipart/form-data") {
    return undefined;
  }

  for (const part of parts.slice(1)) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim().toLowerCase();

    if (key !== "boundary") {
      continue;
    }

    let boundary = part.slice(index + 1).trim();

    if (
      boundary.length >= 2 &&
      boundary.startsWith('"') &&
      boundary.endsWith('"')
    ) {
      boundary = boundary.slice(1, -1);
    }

    if (boundary.length === 0) {
      return undefined;
    }

    return boundary;
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

export async function parseFormData(
  options: HTTPFormDataParseOptions,
): Promise<HTTPFormData> {
  const {
    request,
    limit = DEFAULT_FORM_DATA_LIMIT,
    maxFields = DEFAULT_MAX_FIELDS,
    maxFieldSize = DEFAULT_MAX_FIELD_SIZE,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxFiles = DEFAULT_MAX_FILES,
    strict = true,
  } = options;

  validateLimit(limit, "Form-data");

  validateLimit(maxFields, "Maximum field count");

  validateLimit(maxFieldSize, "Maximum field size");

  validateLimit(maxFileSize, "Maximum file size");

  validateLimit(maxFiles, "Maximum file count");

  const contentType = request.headers["content-type"];

  const normalizedContentType = Array.isArray(contentType)
    ? contentType[0]
    : contentType;

  const boundary = getMultipartBoundary(normalizedContentType);

  if (!boundary) {
    throw new HTTPFormDataParseError(
      "Multipart boundary is missing or invalid.",
    );
  }

  if (boundary.length > 200) {
    throw new HTTPFormDataParseError("Multipart boundary is too long.");
  }

  const body = await readBody({
    request,
    limit,
  });

  return parseMultipartBody(body, boundary, {
    maxFields,
    maxFieldSize,
    maxFileSize,
    maxFiles,
    strict,
  });
}

/* -------------------------------------------------------------------------- */
/* Multipart Parser                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Parses a multipart body into an {@link HTTPFormData}.
 *
 * The parsing itself is delegated to `httpMultipart`, which is the package's
 * single multipart engine. This function only applies the form-data limits
 * and shapes the result. Routing both entry points through one parser is what
 * guarantees two components in the same application cannot see different
 * field names, different filenames or different bytes for the same request.
 */
export function parseMultipartBody(
  body: Buffer,
  boundary: string,
  options: Omit<HTTPFormDataParseOptions, "request" | "limit">,
): HTTPFormData {
  const {
    maxFields = DEFAULT_MAX_FIELDS,
    maxFieldSize = DEFAULT_MAX_FIELD_SIZE,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxFiles = DEFAULT_MAX_FILES,
    strict = true,
  } = options;

  const multipartOptions: MultipartOptions = {
    maxFields,
    maxFieldSize,
    maxFileSize,
    maxFiles,
    maxParts: maxFields + maxFiles,
    allowUnnamedParts: !strict,
  };

  const result = new HTTPFormDataImpl();

  let fieldCount = 0;

  let fileCount = 0;

  for (const part of parseMultipartParts(body, boundary, multipartOptions)) {
    if (part.filename !== undefined) {
      fileCount += 1;

      if (fileCount > maxFiles) {
        throw new HTTPFormDataLimitError("Maximum file count exceeded.");
      }

      if (part.data.length > maxFileSize) {
        throw new HTTPFormDataLimitError(
          "Multipart file exceeds the configured size limit.",
        );
      }

      result.append(part.name, {
        fieldName: part.name,
        filename: sanitizeFilename(part.filename),
        contentType: part.contentType ?? "application/octet-stream",
        size: part.data.length,
        data: Buffer.from(part.data),
      });

      continue;
    }

    fieldCount += 1;

    if (fieldCount > maxFields) {
      throw new HTTPFormDataLimitError("Maximum field count exceeded.");
    }

    if (part.data.length > maxFieldSize) {
      throw new HTTPFormDataLimitError(
        "Multipart field exceeds the configured size limit.",
      );
    }

    result.append(part.name, decodePartText(part.data, part.contentType));
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* HTTPFormData Implementation                                                */
/* -------------------------------------------------------------------------- */

class HTTPFormDataImpl implements HTTPFormData {
  private readonly data = new Map<string, HTTPFormDataValue[]>();

  public get fields(): ReadonlyMap<string, HTTPFormDataValue[]> {
    return this.data;
  }

  public get fieldNames(): readonly string[] {
    return Array.from(this.data.keys());
  }

  public get(name: string): HTTPFormDataValue | undefined {
    return this.data.get(name)?.[0];
  }

  public getAll(name: string): readonly HTTPFormDataValue[] {
    return this.data.get(name) ?? [];
  }

  public has(name: string): boolean {
    return this.data.has(name);
  }

  public entries(): IterableIterator<readonly [string, HTTPFormDataValue]> {
    return this.entryIterator();
  }

  public keys(): IterableIterator<string> {
    return this.keyIterator();
  }

  public values(): IterableIterator<HTTPFormDataValue> {
    return this.valueIterator();
  }

  public forEach(
    callback: (value: HTTPFormDataValue, name: string) => void,
  ): void {
    for (const [name, values] of this.data) {
      for (const value of values) {
        callback(value, name);
      }
    }
  }

  public toObject(): Record<string, HTTPFormDataValue | HTTPFormDataValue[]> {
    const result: Record<string, HTTPFormDataValue | HTTPFormDataValue[]> = {};

    for (const [name, values] of this.data) {
      const single = values.length === 1 ? values[0] : undefined;

      result[name] = single === undefined ? [...values] : single;
    }

    return result;
  }

  public append(name: string, value: HTTPFormDataValue): void {
    const existing = this.data.get(name);

    if (existing) {
      existing.push(value);
      return;
    }

    this.data.set(name, [value]);
  }

  private *entryIterator(): IterableIterator<
    readonly [string, HTTPFormDataValue]
  > {
    for (const [name, values] of this.data) {
      for (const value of values) {
        yield [name, value];
      }
    }
  }

  private *keyIterator(): IterableIterator<string> {
    for (const [name, values] of this.data) {
      for (let index = 0; index < values.length; index += 1) {
        yield name;
      }
    }
  }

  private *valueIterator(): IterableIterator<HTTPFormDataValue> {
    for (const values of this.data.values()) {
      yield* values;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Filename Security                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reduces an uploaded filename to a safe basename.
 *
 * Delegates to the single implementation in `httpMultipart` so the three
 * copies that used to exist cannot drift apart.
 */
export function sanitizeFilename(filename: string): string {
  return sanitizeMultipartFilename(filename);
}

/* -------------------------------------------------------------------------- */
/* Charset                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Decodes a field's bytes using the charset the part declared.
 *
 * `TextDecoder` covers the whole WHATWG encoding set, so `utf-16le`,
 * `shift_jis` and the rest decode correctly instead of being silently
 * mangled into UTF-8 replacement characters. A charset no decoder recognises
 * is reported rather than swallowed.
 */
function decodePartText(data: Buffer, contentType: string | undefined): string {
  const charset = getCharset(contentType);

  if (charset === undefined) {
    return data.toString("utf8");
  }

  try {
    return new TextDecoder(charset).decode(data);
  } catch {
    throw new HTTPFormDataParseError(
      "Multipart part declares an unsupported charset.",
    );
  }
}

/**
 * Reads the `charset` parameter of a media type.
 *
 * The parameter name is anchored to a parameter boundary so a `charset=`
 * substring inside another parameter's quoted value cannot be mistaken for
 * the real one.
 */
function getCharset(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const match = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|([^;"\s]+))/i.exec(
    contentType,
  );

  const charset = (match?.[1] ?? match?.[2])?.trim().toLowerCase();

  return charset && charset.length > 0 ? charset : undefined;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validateLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

import {
  HttpFormDataError as HTTPFormDataError,
  HttpFormDataLimitError as HTTPFormDataLimitError,
  HttpFormDataParseError as HTTPFormDataParseError,
} from "@zudojs/errors";

export { HTTPFormDataError, HTTPFormDataLimitError, HTTPFormDataParseError };

/* -------------------------------------------------------------------------- */
/* Factory                                                                     */
/* -------------------------------------------------------------------------- */

export function createFormData(): HTTPFormData {
  return new HTTPFormDataImpl();
}

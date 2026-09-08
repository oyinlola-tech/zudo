/**
 * HTTP protocol helpers.
 *
 * This module contains the low level HTTP primitives shared by the HTTP
 * server, client, router, request, and response layers.
 */

import type { HTTPMethod } from "../httpMethods/http.methods.js";
import {
  isHTTPMethod,
  normalizeHTTPMethod,
} from "../httpMethods/http.methods.js";
import {
  isValidHeaderName,
  isValidHeaderValue,
  isValidStatusCode,
  isValidHTTPURL,
  isValidRequestTarget,
} from "../httpValidation/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface HTTPVersion {
  readonly major: number;
  readonly minor: number;
}

export interface HTTPRequestLine {
  readonly method: HTTPMethod;
  readonly target: string;
  readonly version: HTTPVersion;
}

export interface HTTPStatusLine {
  readonly version: HTTPVersion;
  readonly statusCode: number;
  readonly reasonPhrase: string;
}

export interface HTTPHeader {
  readonly name: string;
  readonly value: string;
}

export interface HTTPMessage {
  readonly version: HTTPVersion;
  readonly headers: readonly HTTPHeader[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const HTTP_1_0: HTTPVersion = {
  major: 1,
  minor: 0,
};

export const HTTP_1_1: HTTPVersion = {
  major: 1,
  minor: 1,
};

export const HTTP_2_0: HTTPVersion = {
  major: 2,
  minor: 0,
};

export const HTTP_3_0: HTTPVersion = {
  major: 3,
  minor: 0,
};

export const DEFAULT_HTTP_VERSION = HTTP_1_1;

/* -------------------------------------------------------------------------- */
/* Version Helpers                                                            */
/* -------------------------------------------------------------------------- */

export function formatHTTPVersion(version: HTTPVersion): string {
  return `HTTP/${version.major}.${version.minor}`;
}

export function parseHTTPVersion(value: string): HTTPVersion {
  const match = /^HTTP\/(\d+)\.(\d+)$/.exec(value.trim());

  if (!match) {
    throw new TypeError(`Invalid HTTP version: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

export function isHTTPVersion(value: string): boolean {
  try {
    parseHTTPVersion(value);
    return true;
  } catch {
    return false;
  }
}

export function compareHTTPVersions(
  left: HTTPVersion,
  right: HTTPVersion,
): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  return left.minor - right.minor;
}

export function isHTTP11(version: HTTPVersion): boolean {
  return version.major === 1 && version.minor === 1;
}

export function isHTTP10(version: HTTPVersion): boolean {
  return version.major === 1 && version.minor === 0;
}

/* -------------------------------------------------------------------------- */
/* Request Line                                                               */
/* -------------------------------------------------------------------------- */

export function formatRequestLine(request: HTTPRequestLine): string {
  if (!isHTTPMethod(request.method)) {
    throw new TypeError(`Invalid HTTP method: ${request.method}`);
  }

  if (!isValidRequestTarget(request.target)) {
    throw new TypeError(`Invalid HTTP request target: ${request.target}`);
  }

  return [
    normalizeHTTPMethod(request.method),
    request.target,
    formatHTTPVersion(request.version),
  ].join(" ");
}

export function parseRequestLine(line: string): HTTPRequestLine {
  const parts = line.trim().split(/\s+/);

  if (parts.length !== 3) {
    throw new TypeError("Invalid HTTP request line.");
  }

  const [method, target, version] = parts;

  if (method === undefined || target === undefined || version === undefined) {
    throw new TypeError("Invalid HTTP request line.");
  }

  if (!isHTTPMethod(method)) {
    throw new TypeError(`Invalid HTTP method: ${method}`);
  }

  if (!isValidRequestTarget(target)) {
    throw new TypeError(`Invalid HTTP request target: ${target}`);
  }

  return {
    method: normalizeHTTPMethod(method),
    target,
    version: parseHTTPVersion(version),
  };
}

/* -------------------------------------------------------------------------- */
/* Status Line                                                                */
/* -------------------------------------------------------------------------- */

export function formatStatusLine(status: HTTPStatusLine): string {
  if (!isValidStatusCode(status.statusCode)) {
    throw new RangeError(`Invalid HTTP status code: ${status.statusCode}`);
  }

  return [
    formatHTTPVersion(status.version),
    String(status.statusCode),
    status.reasonPhrase,
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function parseStatusLine(line: string): HTTPStatusLine {
  const trimmed = line.trim();

  const match = /^(HTTP\/\d+\.\d+) (\d{3})(?: (.+))?$/.exec(trimmed);

  if (!match) {
    throw new TypeError("Invalid HTTP status line.");
  }

  const [, rawVersion, rawStatusCode] = match;

  if (rawVersion === undefined || rawStatusCode === undefined) {
    throw new TypeError("Invalid HTTP status line.");
  }

  const statusCode = Number(rawStatusCode);

  if (!isValidStatusCode(statusCode)) {
    throw new RangeError(`Invalid HTTP status code: ${statusCode}`);
  }

  return {
    version: parseHTTPVersion(rawVersion),
    statusCode,
    reasonPhrase: match[3] ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/* Header Formatting                                                          */
/* -------------------------------------------------------------------------- */

export function formatHeader(header: HTTPHeader): string {
  if (!isValidHeaderName(header.name)) {
    throw new TypeError(`Invalid HTTP header name: ${header.name}`);
  }

  if (!isValidHeaderValue(header.value)) {
    throw new TypeError(`Invalid HTTP header value for ${header.name}`);
  }

  return `${header.name}: ${header.value}`;
}

export function parseHeader(line: string): HTTPHeader {
  const separator = line.indexOf(":");

  if (separator <= 0) {
    throw new TypeError("Invalid HTTP header line.");
  }

  const name = line.slice(0, separator).trim();

  const value = line.slice(separator + 1).trim();

  if (!isValidHeaderName(name)) {
    throw new TypeError(`Invalid HTTP header name: ${name}`);
  }

  if (!isValidHeaderValue(value)) {
    throw new TypeError(`Invalid HTTP header value for ${name}`);
  }

  return {
    name,
    value,
  };
}

/* -------------------------------------------------------------------------- */
/* Header Collection                                                          */
/* -------------------------------------------------------------------------- */

export function formatHeaders(headers: readonly HTTPHeader[]): string {
  return headers.map(formatHeader).join("\r\n");
}

export function parseHeaders(value: string): HTTPHeader[] {
  if (value.length === 0) {
    return [];
  }

  return value
    .split(/\r\n/)
    .filter((line) => line.length > 0)
    .map(parseHeader);
}

export function getHeader(
  headers: readonly HTTPHeader[],
  name: string,
): string | undefined {
  const normalized = name.toLowerCase();

  const header = headers.find((item) => item.name.toLowerCase() === normalized);

  return header?.value;
}

export function getHeaders(
  headers: readonly HTTPHeader[],
  name: string,
): string[] {
  const normalized = name.toLowerCase();

  return headers
    .filter((item) => item.name.toLowerCase() === normalized)
    .map((item) => item.value);
}

export function hasHeader(
  headers: readonly HTTPHeader[],
  name: string,
): boolean {
  return getHeader(headers, name) !== undefined;
}

/* -------------------------------------------------------------------------- */
/* Header Mutation                                                            */
/* -------------------------------------------------------------------------- */

export function setHeader(
  headers: readonly HTTPHeader[],
  name: string,
  value: string,
): HTTPHeader[] {
  if (!isValidHeaderName(name)) {
    throw new TypeError(`Invalid HTTP header name: ${name}`);
  }

  if (!isValidHeaderValue(value)) {
    throw new TypeError(`Invalid HTTP header value for ${name}`);
  }

  const normalized = name.toLowerCase();

  const result: HTTPHeader[] = [];
  let replaced = false;

  for (const header of headers) {
    if (header.name.toLowerCase() === normalized) {
      if (!replaced) {
        result.push({
          name,
          value,
        });

        replaced = true;
      }

      continue;
    }

    result.push(header);
  }

  if (!replaced) {
    result.push({
      name,
      value,
    });
  }

  return result;
}

export function appendHeader(
  headers: readonly HTTPHeader[],
  name: string,
  value: string,
): HTTPHeader[] {
  if (!isValidHeaderName(name)) {
    throw new TypeError(`Invalid HTTP header name: ${name}`);
  }

  if (!isValidHeaderValue(value)) {
    throw new TypeError(`Invalid HTTP header value for ${name}`);
  }

  return [
    ...headers,
    {
      name,
      value,
    },
  ];
}

export function deleteHeader(
  headers: readonly HTTPHeader[],
  name: string,
): HTTPHeader[] {
  const normalized = name.toLowerCase();

  return headers.filter((header) => header.name.toLowerCase() !== normalized);
}

/* -------------------------------------------------------------------------- */
/* Request URL Helpers                                                        */
/* -------------------------------------------------------------------------- */

export function isAbsoluteHTTPURL(value: string): boolean {
  return isValidHTTPURL(value);
}

export function isOriginFormTarget(target: string): boolean {
  return target.startsWith("/") && target !== "";
}

export function isAbsoluteFormTarget(target: string): boolean {
  return isValidHTTPURL(target);
}

export function isAsteriskFormTarget(target: string): boolean {
  return target === "*";
}

export function isAuthorityFormTarget(target: string): boolean {
  return (
    !target.startsWith("/") &&
    !target.startsWith("*") &&
    !target.includes("://") &&
    /^[^/\s:]+:\d+$/.test(target)
  );
}

/* -------------------------------------------------------------------------- */
/* Connection Semantics                                                       */
/* -------------------------------------------------------------------------- */

export function shouldKeepAlive(
  version: HTTPVersion,
  connectionHeader?: string,
): boolean {
  const tokens =
    connectionHeader?.split(",").map((token) => token.trim().toLowerCase()) ??
    [];

  if (tokens.includes("close")) {
    return false;
  }

  if (tokens.includes("keep-alive")) {
    return true;
  }

  return isHTTP11(version);
}

export function shouldCloseConnection(
  version: HTTPVersion,
  connectionHeader?: string,
): boolean {
  return !shouldKeepAlive(version, connectionHeader);
}

/* -------------------------------------------------------------------------- */
/* Transfer Encoding                                                          */
/* -------------------------------------------------------------------------- */

export function parseTransferEncoding(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function hasChunkedTransferEncoding(value: string | undefined): boolean {
  return parseTransferEncoding(value).includes("chunked");
}

/* -------------------------------------------------------------------------- */
/* Connection Header                                                           */
/* -------------------------------------------------------------------------- */

export function parseConnectionTokens(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function hasConnectionToken(
  value: string | undefined,
  token: string,
): boolean {
  const normalized = token.trim().toLowerCase();

  return parseConnectionTokens(value).includes(normalized);
}

/* -------------------------------------------------------------------------- */
/* Content Length                                                             */
/* -------------------------------------------------------------------------- */

export function parseContentLength(
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new TypeError("Invalid Content-Length header.");
  }

  const length = Number(trimmed);

  if (!Number.isSafeInteger(length)) {
    throw new RangeError("Content-Length exceeds the safe integer range.");
  }

  return length;
}

/* -------------------------------------------------------------------------- */
/* HTTP Message Serialization                                                 */
/* -------------------------------------------------------------------------- */

export function serializeRequestHead(
  request: HTTPRequestLine,
  headers: readonly HTTPHeader[],
): string {
  return (
    formatRequestLine(request) + "\r\n" + formatHeaders(headers) + "\r\n\r\n"
  );
}

export function serializeResponseHead(
  status: HTTPStatusLine,
  headers: readonly HTTPHeader[],
): string {
  return (
    formatStatusLine(status) + "\r\n" + formatHeaders(headers) + "\r\n\r\n"
  );
}

/* -------------------------------------------------------------------------- */
/* Reason Phrase                                                              */
/* -------------------------------------------------------------------------- */

const STANDARD_REASON_PHRASES: Readonly<Record<number, string>> = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",

  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",

  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",

  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Content Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Content",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",

  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required",
};

export function getReasonPhrase(statusCode: number): string {
  return STANDARD_REASON_PHRASES[statusCode] ?? "";
}

export function createStatusLine(
  statusCode: number,
  version: HTTPVersion = DEFAULT_HTTP_VERSION,
  reasonPhrase?: string,
): HTTPStatusLine {
  if (!isValidStatusCode(statusCode)) {
    throw new RangeError(`Invalid HTTP status code: ${statusCode}`);
  }

  return {
    version,
    statusCode,
    reasonPhrase: reasonPhrase ?? getReasonPhrase(statusCode),
  };
}

/* -------------------------------------------------------------------------- */
/* Status Classification                                                      */
/* -------------------------------------------------------------------------- */

export function isInformationalStatus(statusCode: number): boolean {
  return statusCode >= 100 && statusCode < 200;
}

export function isSuccessfulStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function isRedirectionStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

export function isClientErrorStatus(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

export function isServerErrorStatus(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

export function isErrorStatus(statusCode: number): boolean {
  return isClientErrorStatus(statusCode) || isServerErrorStatus(statusCode);
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                    */
/* -------------------------------------------------------------------------- */

export function cloneHeaders(headers: readonly HTTPHeader[]): HTTPHeader[] {
  return headers.map((header) => ({
    name: header.name,
    value: header.value,
  }));
}

export function headersToRecord(
  headers: readonly HTTPHeader[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const header of headers) {
    const key = header.name.toLowerCase();

    const existing = result[key];

    result[key] =
      existing === undefined ? header.value : `${existing}, ${header.value}`;
  }

  return result;
}

export function recordToHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): HTTPHeader[] {
  if (!headers) {
    return [];
  }

  return Object.entries(headers).map(([name, value]) => {
    if (!isValidHeaderName(name)) {
      throw new TypeError(`Invalid HTTP header name: ${name}`);
    }

    if (!isValidHeaderValue(value)) {
      throw new TypeError(`Invalid HTTP header value for ${name}`);
    }

    return {
      name,
      value,
    };
  });
}

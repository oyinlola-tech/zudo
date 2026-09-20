/**
 * HTTP keep-alive utilities.
 *
 * Provides framework-agnostic helpers for connection persistence,
 * Keep-Alive header parsing, timeout handling, and connection policy.
 *
 * Transport-specific socket management belongs to the server/client adapter
 * layer. This module only handles HTTP-level semantics.
 */

import {
  assertSafeHeaderValue,
  escapeHeaderQuotedString,
} from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface KeepAliveOptions {
  readonly enabled?: boolean;
  readonly timeout?: number;
  readonly maxRequests?: number;
  readonly maxIdleTime?: number;
}

export interface KeepAliveConfig {
  readonly enabled: boolean;
  readonly timeout: number | undefined;
  readonly maxRequests: number | undefined;
  readonly maxIdleTime: number | undefined;
}

export interface KeepAliveParameters {
  readonly timeout?: number;
  readonly max?: number;
  readonly extensions: Readonly<Record<string, string | undefined>>;
}

export interface KeepAliveState {
  readonly requests: number;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly closed: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_KEEP_ALIVE_ENABLED = true;

export const DEFAULT_KEEP_ALIVE_TIMEOUT = 5_000;

export const DEFAULT_KEEP_ALIVE_MAX_REQUESTS = 100;

export const MIN_KEEP_ALIVE_TIMEOUT = 0;

export const MAX_KEEP_ALIVE_TIMEOUT = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

export function createKeepAliveConfig(
  options: KeepAliveOptions | undefined = {},
): KeepAliveConfig {
  const enabled = options.enabled ?? DEFAULT_KEEP_ALIVE_ENABLED;

  const timeout = normalizeTimeout(options.timeout);

  const maxRequests = normalizeMaxRequests(options.maxRequests);

  const maxIdleTime = normalizeTimeout(options.maxIdleTime);

  return {
    enabled,
    timeout,
    maxRequests,
    maxIdleTime,
  };
}

export function normalizeTimeout(
  timeout: number | undefined,
): number | undefined {
  if (timeout === undefined) {
    return undefined;
  }

  if (
    !Number.isFinite(timeout) ||
    timeout < MIN_KEEP_ALIVE_TIMEOUT ||
    timeout > MAX_KEEP_ALIVE_TIMEOUT
  ) {
    throw new RangeError(
      `Keep-alive timeout must be between ${MIN_KEEP_ALIVE_TIMEOUT} and ${MAX_KEEP_ALIVE_TIMEOUT} milliseconds.`,
    );
  }

  return Math.floor(timeout);
}

export function normalizeMaxRequests(
  maxRequests: number | undefined,
): number | undefined {
  if (maxRequests === undefined) {
    return undefined;
  }

  if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
    throw new RangeError("maxRequests must be a positive integer.");
  }

  return maxRequests;
}

/* -------------------------------------------------------------------------- */
/* Keep-Alive Header Parsing                                                  */
/* -------------------------------------------------------------------------- */

export function parseKeepAliveHeader(
  value: string | undefined | null,
): KeepAliveParameters {
  const extensions: Record<string, string | undefined> = {};

  if (!value || value.trim().length === 0) {
    return {
      extensions,
    };
  }

  let timeout: number | undefined;

  let max: number | undefined;

  for (const part of splitHeaderParameters(value)) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      const key = part.trim().toLowerCase();

      if (key.length > 0) {
        extensions[key] = undefined;
      }

      continue;
    }

    const key = part.slice(0, separator).trim().toLowerCase();

    const rawValue = part.slice(separator + 1).trim();

    const parsedValue = unquote(rawValue);

    if (key === "timeout") {
      const seconds = Number(parsedValue);

      if (Number.isFinite(seconds) && seconds >= 0) {
        timeout = Math.floor(seconds);
      }

      continue;
    }

    if (key === "max") {
      const requests = Number(parsedValue);

      if (Number.isInteger(requests) && requests >= 0) {
        max = requests;
      }

      continue;
    }

    extensions[key] = parsedValue;
  }

  return {
    timeout,
    max,
    extensions,
  };
}

/* -------------------------------------------------------------------------- */
/* Keep-Alive Header Formatting                                                */
/* -------------------------------------------------------------------------- */

export function formatKeepAliveHeader(
  parameters: Partial<KeepAliveParameters> | undefined = {},
): string {
  const parts: string[] = [];

  if (parameters.timeout !== undefined) {
    if (!Number.isFinite(parameters.timeout) || parameters.timeout < 0) {
      throw new RangeError(
        "Keep-alive timeout must be a non-negative finite number.",
      );
    }

    parts.push(`timeout=${Math.floor(parameters.timeout)}`);
  }

  if (parameters.max !== undefined) {
    if (!Number.isInteger(parameters.max) || parameters.max < 0) {
      throw new RangeError("Keep-alive max must be a non-negative integer.");
    }

    parts.push(`max=${parameters.max}`);
  }

  for (const [key, value] of Object.entries(parameters.extensions ?? {})) {
    if (value === undefined) {
      parts.push(key);
    } else {
      parts.push(`${key}=${quoteIfNeeded(value)}`);
    }
  }

  const header = parts.join(", ");

  assertSafeHeaderValue(header);

  return header;
}

/* -------------------------------------------------------------------------- */
/* Connection Header                                                          */
/* -------------------------------------------------------------------------- */

export function parseConnectionHeader(
  value: string | undefined | null,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function hasConnectionToken(
  value: string | undefined | null,
  token: string,
): boolean {
  const normalized = token.trim().toLowerCase();

  return parseConnectionHeader(value).includes(normalized);
}

export function isConnectionCloseRequested(
  value: string | undefined | null,
): boolean {
  return hasConnectionToken(value, "close");
}

export function isConnectionKeepAliveRequested(
  value: string | undefined | null,
): boolean {
  return hasConnectionToken(value, "keep-alive");
}

/* -------------------------------------------------------------------------- */
/* HTTP Version Semantics                                                     */
/* -------------------------------------------------------------------------- */

export function supportsPersistentConnections(httpVersion: string): boolean {
  const normalized = httpVersion.trim().toUpperCase();

  return (
    normalized === "HTTP/1.1" ||
    normalized === "HTTP/2" ||
    normalized === "HTTP/3"
  );
}

export function defaultConnectionPersistence(httpVersion: string): boolean {
  const normalized = httpVersion.trim().toUpperCase();

  if (normalized === "HTTP/1.0") {
    return false;
  }

  if (
    normalized === "HTTP/1.1" ||
    normalized === "HTTP/2" ||
    normalized === "HTTP/3"
  ) {
    return true;
  }

  return false;
}

export function shouldKeepAlive(
  httpVersion: string,
  connectionHeader: string | undefined | null,
  options: KeepAliveOptions | undefined = {},
): boolean {
  const config = createKeepAliveConfig(options);

  if (!config.enabled) {
    return false;
  }

  if (isConnectionCloseRequested(connectionHeader)) {
    return false;
  }

  if (defaultConnectionPersistence(httpVersion)) {
    return true;
  }

  return isConnectionKeepAliveRequested(connectionHeader);
}

/* -------------------------------------------------------------------------- */
/* Response Connection Policy                                                */
/* -------------------------------------------------------------------------- */

export function createConnectionHeader(keepAlive: boolean): string {
  return keepAlive ? "keep-alive" : "close";
}

export function shouldSendKeepAliveHeader(httpVersion: string): boolean {
  const normalized = httpVersion.trim().toUpperCase();

  /*
   * HTTP/1.1 defaults to persistence, but explicitly sending the
   * Keep-Alive header is still useful when advertising timeout/max values.
   */
  return normalized === "HTTP/1.0" || normalized === "HTTP/1.1";
}

/* -------------------------------------------------------------------------- */
/* Keep-Alive State                                                           */
/* -------------------------------------------------------------------------- */

export function createKeepAliveState(now = Date.now()): KeepAliveState {
  return {
    requests: 0,
    createdAt: now,
    lastUsedAt: now,
    closed: false,
  };
}

export function recordKeepAliveRequest(
  state: KeepAliveState,
  now = Date.now(),
): KeepAliveState {
  if (state.closed) {
    return state;
  }

  return {
    ...state,
    requests: state.requests + 1,
    lastUsedAt: now,
  };
}

export function closeKeepAlive(
  state: KeepAliveState,
  now = Date.now(),
): KeepAliveState {
  return {
    ...state,
    closed: true,
    lastUsedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* State Limits                                                               */
/* -------------------------------------------------------------------------- */

export function hasExceededMaxRequests(
  state: KeepAliveState,
  maxRequests: number | undefined,
): boolean {
  if (maxRequests === undefined) {
    return false;
  }

  return state.requests >= maxRequests;
}

export function hasExceededIdleTimeout(
  state: KeepAliveState,
  maxIdleTime: number | undefined,
  now = Date.now(),
): boolean {
  if (maxIdleTime === undefined) {
    return false;
  }

  return now - state.lastUsedAt >= maxIdleTime;
}

export function shouldCloseKeepAlive(
  state: KeepAliveState,
  options: KeepAliveOptions | undefined = {},
  now = Date.now(),
): boolean {
  const config = createKeepAliveConfig(options);

  if (state.closed) {
    return true;
  }

  if (!config.enabled) {
    return true;
  }

  if (hasExceededMaxRequests(state, config.maxRequests)) {
    return true;
  }

  if (
    hasExceededIdleTimeout(state, config.maxIdleTime ?? config.timeout, now)
  ) {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Timeout Conversion                                                         */
/* -------------------------------------------------------------------------- */

export function millisecondsToSeconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError("Milliseconds must be a non-negative finite number.");
  }

  return Math.ceil(milliseconds / 1_000);
}

export function secondsToMilliseconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("Seconds must be a non-negative finite number.");
  }

  return Math.floor(seconds * 1_000);
}

/* -------------------------------------------------------------------------- */
/* Header Configuration                                                       */
/* -------------------------------------------------------------------------- */

export function createKeepAliveHeader(
  options: KeepAliveOptions | undefined = {},
): string | undefined {
  const config = createKeepAliveConfig(options);

  if (!config.enabled) {
    return undefined;
  }

  const parameters: Partial<KeepAliveParameters> = {};

  const params = { ...parameters };

  if (config.timeout !== undefined) {
    params.timeout = millisecondsToSeconds(config.timeout);
  }

  if (config.maxRequests !== undefined) {
    params.max = config.maxRequests;
  }

  return formatKeepAliveHeader(params);
}

/* -------------------------------------------------------------------------- */
/* Header Token Helpers                                                       */
/* -------------------------------------------------------------------------- */

export function addConnectionToken(
  value: string | undefined | null,
  token: string,
): string {
  const normalizedToken = token.trim().toLowerCase();

  if (normalizedToken.length === 0) {
    return value ?? "";
  }

  if (hasConnectionToken(value, normalizedToken)) {
    return value?.trim() ?? "";
  }

  const existing = value?.trim();

  return existing ? `${existing}, ${normalizedToken}` : normalizedToken;
}

export function removeConnectionToken(
  value: string | undefined | null,
  token: string,
): string {
  const normalizedToken = token.trim().toLowerCase();

  return parseConnectionHeader(value)
    .filter((item) => item !== normalizedToken)
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function splitHeaderParameters(value: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }

    if ((character === "," || character === ";") && !quoted) {
      result.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) {
    result.push(current);
  }

  return result;
}

function unquote(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return trimmed;
}

/**
 * Emits a Keep-Alive parameter value.
 *
 * Quoting does not neutralise a CR or LF, so the control character used to
 * survive into the field value. `escapeHeaderQuotedString` rejects it, the
 * same helper every other quoted-parameter emitter in this package uses.
 *
 * @throws {TypeError} If the value contains a forbidden control character.
 */
function quoteIfNeeded(value: string): string {
  if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    return value;
  }

  return `"${escapeHeaderQuotedString(value)}"`;
}

/**
 * The one place this package talks to a provider.
 *
 * @module oauthClient/oauthHttp
 *
 * An OAuth provider is an untrusted remote. Every request made here is
 * bounded three ways:
 *
 * - **Time** — `AbortSignal.timeout(config.timeoutMs)`, default 10s.
 * - **Size** — the body is streamed and abandoned the moment it exceeds
 *   `config.maxResponseBytes` (default 256 KiB), and a `Content-Length` over
 *   the cap is refused before reading at all.
 * - **Reach** — `redirect: "manual"`, so a 3xx cannot walk the request to a
 *   host that never passed the SSRF guard.
 */

import {
  OAuthError,
  OAuthNetworkError,
  OAuthProviderError,
  OAuthResponseError,
  OAuthResponseTooLargeError,
} from "../oauthErrors/index.js";
import { parseJsonObject, parseJsonValue } from "../oauthSecurity/index.js";
import type { ResolvedOAuthConfig } from "./oauthConfig.resolve.js";

/** Provider `error` codes are echoed only if they look like OAuth error codes. */
const SAFE_ERROR_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Read a response body, refusing to buffer more than `maxBytes`. */
async function readCappedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new OAuthResponseTooLargeError(maxBytes);
  }
  const body = response.body;
  if (body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new OAuthResponseTooLargeError(maxBytes);
    }
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const value = chunk.value;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new OAuthResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Extract a provider `error` code that is safe to put in a message. */
function safeProviderError(
  payload: Record<string, unknown> | undefined,
): string | undefined {
  const value = payload?.["error"];
  if (typeof value === "string" && SAFE_ERROR_CODE.test(value)) return value;
  if (value !== null && typeof value === "object") {
    const nested = (value as Record<string, unknown>)["code"];
    if (typeof nested === "string" && SAFE_ERROR_CODE.test(nested)) return nested;
  }
  return undefined;
}

/** One request to a provider endpoint. */
export interface ProviderRequest {
  readonly url: URL;
  readonly method: "GET" | "POST";
  readonly headers: Record<string, string>;
  readonly body?: string;
  /** Endpoint name for error messages. Never contains a secret. */
  readonly label: string;
}

/**
 * Perform a bounded request and return the parsed, sanitized JSON object.
 *
 * A non-2xx status, a 3xx, or a payload carrying an OAuth `error` member all
 * raise {@link OAuthProviderError}. Only the provider's `error` code reaches
 * the message, and only after passing a strict character filter — an
 * `error_description` is never interpolated, so a hostile or misconfigured
 * provider cannot echo request material into your logs.
 */
export async function requestProviderJson(
  resolved: ResolvedOAuthConfig,
  request: ProviderRequest,
): Promise<Record<string, unknown>> {
  const value = await requestProviderValue(resolved, request);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthResponseError(
      `The ${request.label} endpoint did not return a JSON object.`,
    );
  }
  return value as Record<string, unknown>;
}

/**
 * As {@link requestProviderJson}, but allows a top-level JSON array (GitHub's
 * `/user/emails`). Same time, size and redirect bounds.
 */
export async function requestProviderValue(
  resolved: ResolvedOAuthConfig,
  request: ProviderRequest,
): Promise<unknown> {
  let response: Response;
  try {
    response = await resolved.fetchImpl(request.url.toString(), {
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(resolved.timeoutMs),
    });
  } catch (cause) {
    throw toNetworkError(cause, request.label, resolved.timeoutMs);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new OAuthProviderError(
      `The ${request.label} endpoint returned an unexpected redirect.`,
      { providerStatus: response.status },
    );
  }

  let text: string;
  try {
    text = await readCappedText(response, resolved.maxResponseBytes);
  } catch (cause) {
    // The timeout signal also aborts the body stream, and a transport can
    // fail mid-body. Both surfaced here as a raw `DOMException` /
    // transport error rather than the documented `OAuthNetworkError`.
    if (cause instanceof OAuthError) throw cause;
    throw toNetworkError(cause, request.label, resolved.timeoutMs);
  }

  if (!response.ok) {
    let code: string | undefined;
    try {
      code = safeProviderError(parseJsonObject(text, request.label));
    } catch {
      code = undefined;
    }
    throw new OAuthProviderError(
      code === undefined
        ? `The ${request.label} endpoint returned HTTP ${response.status}.`
        : `The ${request.label} endpoint returned HTTP ${response.status} (${code}).`,
      {
        providerStatus: response.status,
        ...(code !== undefined ? { providerError: code } : {}),
      },
    );
  }

  const payload = parseJsonValue(text, request.label);
  const code = safeProviderError(
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined,
  );
  if (code !== undefined) {
    throw new OAuthProviderError(
      `The ${request.label} endpoint returned an OAuth error (${code}).`,
      { providerError: code, providerStatus: response.status },
    );
  }
  return payload;
}

/** Wrap a transport or timeout failure in the documented error type. */
function toNetworkError(
  cause: unknown,
  label: string,
  timeoutMs: number,
): OAuthNetworkError {
  const name = cause instanceof Error ? cause.name : "";
  const timedOut = name === "TimeoutError" || name === "AbortError";
  return new OAuthNetworkError(
    timedOut
      ? `The ${label} request timed out after ${timeoutMs}ms.`
      : `The ${label} request could not be completed.`,
    { cause },
  );
}

/** Build the `Authorization: Basic` header for client authentication. */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  // RFC 6749 §2.3.1: both halves are form-urlencoded before base64.
  const encoded = Buffer.from(
    `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
    "utf8",
  ).toString("base64");
  return `Basic ${encoded}`;
}

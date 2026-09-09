/**
 * Shared fixtures for the OAuth2 client tests.
 */

import type { FetchLike, OAuthConfig } from "../src/index.js";

/** A distinctive secret so leak assertions cannot pass by accident. */
export const SECRET = "s3cr3t-CLIENT-SECRET-do-not-leak-9f2a";
/** Redirect URI used across the suite. */
export const REDIRECT = "https://app.example.com/auth/callback";

const BASE: OAuthConfig = {
  provider: "google",
  clientId: "client-id-123",
  clientSecret: SECRET,
  allowedRedirectUris: [REDIRECT],
};

/** Build a config, overriding any field. */
export function makeConfig(overrides: Partial<OAuthConfig> = {}): OAuthConfig {
  return { ...BASE, ...overrides };
}

/** A record of what a stub fetch was asked to do. */
export interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

/** A stub fetch returning a fixed JSON body, recording every call. */
export function stubFetch(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): { fetch: FetchLike; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchImpl: FetchLike = (url, requestInit) => {
    calls.push({ url, init: requestInit });
    return Promise.resolve(
      new Response(body, {
        status: init.status ?? 200,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      }),
    );
  };
  return { fetch: fetchImpl, calls };
}

/** A stub fetch returning a different body per call, in order. */
export function stubFetchSequence(
  responses: readonly { body: string; status?: number }[],
): { fetch: FetchLike; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchImpl: FetchLike = (url, requestInit) => {
    const index = calls.length;
    calls.push({ url, init: requestInit });
    const next = responses[index] ?? responses[responses.length - 1];
    return Promise.resolve(
      new Response(next?.body ?? "{}", {
        status: next?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return { fetch: fetchImpl, calls };
}

/** Read the form body a stub fetch received. */
export function formOf(request: CapturedRequest | undefined): URLSearchParams {
  const body = request?.init.body;
  return new URLSearchParams(typeof body === "string" ? body : "");
}

/** Read a header a stub fetch received. */
export function headerOf(
  request: CapturedRequest | undefined,
  name: string,
): string | undefined {
  const headers = request?.init.headers;
  if (headers === undefined || headers === null) return undefined;
  const record = headers as Record<string, string>;
  return record[name];
}

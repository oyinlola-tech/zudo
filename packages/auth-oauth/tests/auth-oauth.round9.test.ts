/**
 * Audit round 9 regressions for @zudojs/auth-oauth.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  OAuthConfigurationError,
  OAuthEndpointNotAllowedError,
  OAuthNetworkError,
  OAuthResponseTooLargeError,
  assertSafeUrl,
  createAuthorizationUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  generateCodeVerifier,
  generateState,
  isBlockedFetchHost,
  refreshAccessToken,
  verifyState,
  type FetchLike,
  type OAuthConfig,
} from "../src/index.js";

import { REDIRECT, makeConfig, stubFetch } from "./helpers.js";

/** A fetch whose response body errors with `reason` on the first read. */
function erroringBodyFetch(reason: unknown): FetchLike {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(reason);
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

const EXCHANGE = {
  code: "auth-code",
  codeVerifier: generateCodeVerifier(),
  redirectUri: REDIRECT,
};

describe("AUTH-OAUTH-R9-01 trailing-dot hostnames cannot bypass the SSRF guard", () => {
  it.each([
    "localhost.",
    "metadata.google.internal.",
    "metadata.",
    "instance-data.",
    "api.internal.",
    "db.local.",
    "svc.home.arpa.",
    "box.localhost.",
    "LOCALHOST..",
  ])("blocks %s", (host) => {
    expect(isBlockedFetchHost(host)).toBe(true);
    expect(() => assertSafeUrl(`https://${host}/token`, "tokenUrl", "fetch")).toThrow(
      OAuthEndpointNotAllowedError,
    );
  });

  it("still allows a public name with a trailing dot", () => {
    expect(isBlockedFetchHost("oauth2.googleapis.com.")).toBe(false);
    expect(
      assertSafeUrl("https://oauth2.googleapis.com./token", "tokenUrl", "fetch")
        .hostname,
    ).toBe("oauth2.googleapis.com.");
  });

  it("is rejected end to end on a config override", async () => {
    const { fetch } = stubFetch("{}");
    const config = makeConfig({
      tokenUrl: "https://metadata.google.internal./computeMetadata/v1/token",
      fetch,
    });

    await expect(exchangeCodeForToken(config, EXCHANGE)).rejects.toBeInstanceOf(
      OAuthEndpointNotAllowedError,
    );
  });
});

describe("AUTH-OAUTH-R9-02 body-read failures surface as OAuthNetworkError", () => {
  it("wraps a timeout that fires while the body is streaming", async () => {
    const config = makeConfig({
      timeoutMs: 50,
      fetch: erroringBodyFetch(new DOMException("aborted", "TimeoutError")),
    });

    const error = await exchangeCodeForToken(config, EXCHANGE).catch(
      (e: unknown) => e,
    );

    // Previously the raw DOMException escaped.
    expect(error).toBeInstanceOf(OAuthNetworkError);
    expect((error as OAuthNetworkError).message).toBe(
      "The token request timed out after 50ms.",
    );
    expect((error as OAuthNetworkError).cause).toBeInstanceOf(DOMException);
  });

  it("wraps a transport failure mid-body", async () => {
    const config = makeConfig({
      fetch: erroringBodyFetch(new Error("socket hang up")),
    });

    const error = await refreshAccessToken(config, "refresh-token").catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OAuthNetworkError);
    expect((error as OAuthNetworkError).message).toBe(
      "The token request could not be completed.",
    );
  });

  it("does not re-wrap the package's own size-limit error", async () => {
    const config = makeConfig({
      maxResponseBytes: 1024,
      fetch: async () =>
        new Response("x".repeat(2048), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(fetchUserInfo(config, "token")).rejects.toBeInstanceOf(
      OAuthResponseTooLargeError,
    );
  });
});

describe("AUTH-OAUTH-R9-03 per-request scopes are validated like config scopes", () => {
  const options = { state: generateState(), redirectUri: REDIRECT };

  it.each([[""], ["open id"], ['x"y'], ["a\\b"], ["tab\tscope"]])(
    "rejects the per-request scope %j",
    (scope) => {
      expect(() =>
        createAuthorizationUrl(makeConfig(), { ...options, scopes: [scope] }),
      ).toThrow(OAuthConfigurationError);
    },
  );

  it("rejects a non-string per-request scope", () => {
    expect(() =>
      createAuthorizationUrl(makeConfig(), {
        ...options,
        scopes: [42 as unknown as string],
      }),
    ).toThrow(OAuthConfigurationError);
  });

  it("still accepts valid per-request scopes", () => {
    const { url } = createAuthorizationUrl(makeConfig(), {
      ...options,
      scopes: ["openid", "https://www.googleapis.com/auth/drive.readonly"],
    });

    expect(new URL(url).searchParams.get("scope")).toBe(
      "openid https://www.googleapis.com/auth/drive.readonly",
    );
  });
});

describe("README flow", () => {
  it("runs the documented authorize -> verify state -> exchange -> profile sequence", async () => {
    const { fetch, calls } = stubFetch(
      JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3600 }),
    );
    const config: OAuthConfig = {
      provider: "google",
      clientId: "id",
      clientSecret: "secret-secret-secret",
      allowedRedirectUris: [REDIRECT],
      fetch,
    };

    const state = generateState();
    const { url, codeVerifier } = createAuthorizationUrl(config, {
      state,
      redirectUri: REDIRECT,
    });
    expect(new URL(url).searchParams.get("code_challenge_method")).toBe("S256");

    expect(verifyState(state, String(state))).toBe(true);
    expect(verifyState(state, "")).toBe(false);

    const tokens = await exchangeCodeForToken(config, {
      code: "the-code",
      codeVerifier,
      redirectUri: REDIRECT,
    });
    expect(tokens.accessToken).toBe("at");

    calls.length = 0;
    const profileFetch = stubFetch(
      JSON.stringify({ sub: "123", email: "a@example.com", email_verified: true }),
    );
    const profile = await fetchUserInfo(
      { ...config, fetch: profileFetch.fetch },
      tokens.accessToken,
    );
    expect(profile).toMatchObject({ providerId: "123", email: "a@example.com" });

    const fresh = await refreshAccessToken(config, "stored-refresh");
    expect(fresh.refreshToken).toBeUndefined();
  });
});

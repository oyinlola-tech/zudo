import { describe, expect, it } from "vitest";

import {
  exchangeCodeForToken,
  generateCodeVerifier,
  OAuthConfigurationError,
  OAuthNetworkError,
  OAuthProviderError,
  OAuthResponseError,
  OAuthResponseTooLargeError,
  parseTokenResponse,
  refreshAccessToken,
  type FetchLike,
} from "../src/index.js";
import {
  formOf,
  headerOf,
  makeConfig,
  REDIRECT,
  SECRET,
  stubFetch,
} from "./helpers.js";

const VERIFIER = generateCodeVerifier();

const GOOD_TOKEN = JSON.stringify({
  access_token: "at-123",
  token_type: "Bearer",
  expires_in: 3599,
  refresh_token: "rt-456",
  scope: "openid email profile",
  id_token: "idt-789",
});

describe("exchangeCodeForToken", () => {
  it("POSTs a urlencoded authorization_code grant with the PKCE verifier", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    const tokens = await exchangeCodeForToken(makeConfig({ fetch }), {
      code: "auth-code",
      codeVerifier: VERIFIER,
      redirectUri: REDIRECT,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]?.init.method).toBe("POST");
    expect(headerOf(calls[0], "Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const form = formOf(calls[0]);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBe(VERIFIER);
    expect(form.get("redirect_uri")).toBe(REDIRECT);
    expect(form.get("client_secret")).toBe(SECRET);

    expect(tokens.accessToken).toBe("at-123");
    expect(tokens.expiresIn).toBe(3599);
    expect(tokens.refreshToken).toBe("rt-456");
    expect(tokens.scope).toEqual(["openid", "email", "profile"]);
    expect(tokens.idToken).toBe("idt-789");
  });

  it("sends the secret via HTTP Basic where the provider expects it", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    await exchangeCodeForToken(
      makeConfig({
        provider: "discord",
        fetch,
      }),
      { code: "c", codeVerifier: VERIFIER, redirectUri: REDIRECT },
    );
    const auth = headerOf(calls[0], "Authorization") ?? "";
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(
      Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8"),
    ).toContain(encodeURIComponent(SECRET));
    // ...and not duplicated into the body.
    expect(formOf(calls[0]).get("client_secret")).toBeNull();
  });

  it("never places the secret or the code in the request URL", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    await exchangeCodeForToken(makeConfig({ fetch }), {
      code: "auth-code",
      codeVerifier: VERIFIER,
      redirectUri: REDIRECT,
    });
    expect(calls[0]?.url).not.toContain(SECRET);
    expect(calls[0]?.url).not.toContain("auth-code");
  });

  it("enforces the redirect allowlist and the verifier shape before calling out", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    await expect(
      exchangeCodeForToken(makeConfig({ fetch }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: "https://attacker.example.com/cb",
      }),
    ).rejects.toThrow();
    await expect(
      exchangeCodeForToken(makeConfig({ fetch }), {
        code: "c",
        codeVerifier: "short",
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow();
    await expect(
      exchangeCodeForToken(makeConfig({ fetch }), {
        code: "",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthConfigurationError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a provider error code but never its description", async () => {
    const { fetch } = stubFetch(
      JSON.stringify({
        error: "invalid_grant",
        error_description: `secret echo ${SECRET}`,
      }),
      { status: 400 },
    );
    const promise = exchangeCodeForToken(makeConfig({ fetch }), {
      code: "c",
      codeVerifier: VERIFIER,
      redirectUri: REDIRECT,
    });
    await expect(promise).rejects.toThrow(OAuthProviderError);
    await promise.catch((error: unknown) => {
      const err = error as OAuthProviderError;
      expect(err.providerError).toBe("invalid_grant");
      expect(err.message).toContain("invalid_grant");
      expect(err.message).not.toContain(SECRET);
      expect(err.message).not.toContain("secret echo");
    });
  });

  it("treats a 200 body carrying an OAuth error as a failure", async () => {
    const { fetch } = stubFetch(JSON.stringify({ error: "bad_verification_code" }));
    await expect(
      exchangeCodeForToken(makeConfig({ provider: "github", fetch }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthProviderError);
  });

  it("refuses to follow a redirect from the token endpoint", async () => {
    const fetchImpl: FetchLike = (_url, init) => {
      expect(init.redirect).toBe("manual");
      return Promise.resolve(
        new Response("{}", {
          status: 302,
          headers: { Location: "http://169.254.169.254/" },
        }),
      );
    };
    await expect(
      exchangeCodeForToken(makeConfig({ fetch: fetchImpl }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthProviderError);
  });
});

describe("token response validation", () => {
  it.each([
    ["missing access_token", { token_type: "Bearer" }],
    ["blank access_token", { access_token: "   " }],
    ["non-string access_token", { access_token: 12345 }],
    ["null access_token", { access_token: null }],
    ["non-numeric expires_in", { access_token: "a", expires_in: "soon" }],
    ["fractional expires_in", { access_token: "a", expires_in: 1.5 }],
    ["negative expires_in", { access_token: "a", expires_in: -1 }],
    ["object expires_in", { access_token: "a", expires_in: { v: 1 } }],
    ["non-string refresh_token", { access_token: "a", refresh_token: 7 }],
    ["non-string id_token", { access_token: "a", id_token: [] }],
    ["non-string scope", { access_token: "a", scope: 3 }],
    ["non-string token_type", { access_token: "a", token_type: 1 }],
  ])("rejects a response with a %s", (_label, payload) => {
    expect(() => parseTokenResponse(payload as Record<string, unknown>)).toThrow(
      OAuthResponseError,
    );
  });

  it("rejects a non-object body from the token endpoint", async () => {
    for (const body of ["[]", '"a string"', "42", "null", "not json at all"]) {
      const { fetch } = stubFetch(body);
      await expect(
        exchangeCodeForToken(makeConfig({ fetch }), {
          code: "c",
          codeVerifier: VERIFIER,
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(OAuthResponseError);
    }
  });

  it("defaults token_type and tolerates a numeric-string expires_in", () => {
    const tokens = parseTokenResponse({ access_token: "a", expires_in: "3600" });
    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresIn).toBe(3600);
  });

  it("strips prototype-polluting keys from the parsed response", async () => {
    const { fetch } = stubFetch(
      '{"access_token":"at","__proto__":{"polluted":"yes"},"constructor":{"x":1},"prototype":{"y":2},"nested":{"__proto__":{"deep":"yes"}}}',
    );
    const tokens = await exchangeCodeForToken(makeConfig({ fetch }), {
      code: "c",
      codeVerifier: VERIFIER,
      redirectUri: REDIRECT,
    });
    const probe: Record<string, unknown> = {};
    expect(probe["polluted"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(tokens.raw, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tokens.raw, "constructor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tokens.raw, "prototype")).toBe(false);
    const nested = tokens.raw["nested"] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(nested, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(tokens.raw)).toBe(Object.prototype);
  });
});

describe("response bounds", () => {
  it("refuses a body larger than maxResponseBytes", async () => {
    const big = JSON.stringify({ access_token: "a", pad: "x".repeat(4096) });
    const { fetch } = stubFetch(big);
    await expect(
      exchangeCodeForToken(makeConfig({ fetch, maxResponseBytes: 1024 }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthResponseTooLargeError);
  });

  it("refuses a declared Content-Length over the cap before reading", async () => {
    const { fetch } = stubFetch(GOOD_TOKEN, {
      headers: { "Content-Length": "999999999" },
    });
    await expect(
      exchangeCodeForToken(makeConfig({ fetch, maxResponseBytes: 2048 }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthResponseTooLargeError);
  });

  it("aborts a slow provider via AbortSignal.timeout", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation timed out.", "TimeoutError"));
        });
      });
    const started = Date.now();
    await expect(
      exchangeCodeForToken(makeConfig({ fetch: hanging, timeoutMs: 30 }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow(OAuthNetworkError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("rejects out-of-range bounds instead of silently clamping", async () => {
    for (const overrides of [
      { timeoutMs: 0 },
      { timeoutMs: 10 ** 7 },
      { maxResponseBytes: 10 },
      { maxResponseBytes: 10 ** 9 },
      { maxResponseBytes: 1.5 },
    ]) {
      await expect(
        exchangeCodeForToken(makeConfig(overrides), {
          code: "c",
          codeVerifier: VERIFIER,
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(OAuthConfigurationError);
    }
  });
});

describe("refreshAccessToken", () => {
  it("sends a refresh_token grant", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    const tokens = await refreshAccessToken(makeConfig({ fetch }), "rt-456");
    const form = formOf(calls[0]);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rt-456");
    expect(tokens.accessToken).toBe("at-123");
  });

  it("refuses providers that issue no refresh token", async () => {
    const { fetch, calls } = stubFetch(GOOD_TOKEN);
    await expect(
      refreshAccessToken(makeConfig({ provider: "github", fetch }), "rt"),
    ).rejects.toThrow(OAuthConfigurationError);
    expect(calls).toHaveLength(0);
  });

  it("requires a refresh token", async () => {
    const { fetch } = stubFetch(GOOD_TOKEN);
    await expect(refreshAccessToken(makeConfig({ fetch }), "")).rejects.toThrow(
      OAuthConfigurationError,
    );
  });
});

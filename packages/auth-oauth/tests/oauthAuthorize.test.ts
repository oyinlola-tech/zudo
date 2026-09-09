import { describe, expect, it } from "vitest";

import {
  createAuthorizationUrl,
  deriveCodeChallenge,
  generateState,
  OAuthConfigurationError,
  OAuthRedirectUriError,
} from "../src/index.js";
import { makeConfig, REDIRECT } from "./helpers.js";

describe("createAuthorizationUrl", () => {
  const state = generateState();

  it("builds a complete authorization-code request with PKCE S256", () => {
    const result = createAuthorizationUrl(makeConfig(), {
      state,
      redirectUri: REDIRECT,
    });
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id-123");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      deriveCodeChallenge(result.codeVerifier),
    );
  });

  it("never emits a plain code challenge and never omits PKCE", () => {
    for (const provider of ["google", "github", "microsoft", "apple", "discord"] as const) {
      const url = new URL(
        createAuthorizationUrl(makeConfig({ provider }), {
          state,
          redirectUri: REDIRECT,
        }).url,
      );
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
    }
  });

  it("returns the verifier and state the caller must persist", () => {
    const result = createAuthorizationUrl(makeConfig(), {
      state,
      redirectUri: REDIRECT,
    });
    expect(result.state).toBe(state);
    expect(result.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    // The verifier itself is never in the URL — only its hash.
    expect(result.url).not.toContain(result.codeVerifier);
  });

  it("never puts the client secret in the authorization URL", () => {
    const result = createAuthorizationUrl(makeConfig(), {
      state,
      redirectUri: REDIRECT,
    });
    expect(result.url).not.toContain("client_secret");
    expect(result.url).not.toContain(makeConfig().clientSecret);
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["too short", "abc123"],
  ])("refuses to build a URL with %s state", (_label, value) => {
    expect(() =>
      createAuthorizationUrl(makeConfig(), {
        state: value as unknown as string,
        redirectUri: REDIRECT,
      }),
    ).toThrow(OAuthConfigurationError);
  });

  it("enforces the redirect-uri allowlist", () => {
    expect(() =>
      createAuthorizationUrl(makeConfig(), {
        state,
        redirectUri: "https://attacker.example.com/cb",
      }),
    ).toThrow(OAuthRedirectUriError);
    // Same host, different path is still not allowlisted.
    expect(() =>
      createAuthorizationUrl(makeConfig(), {
        state,
        redirectUri: "https://app.example.com/auth/callback/../../evil",
      }),
    ).toThrow(OAuthRedirectUriError);
    // Extra query string is not allowlisted either.
    expect(() =>
      createAuthorizationUrl(makeConfig(), {
        state,
        redirectUri: `${REDIRECT}?next=//attacker`,
      }),
    ).toThrow(OAuthRedirectUriError);
  });

  it("matches allowlisted redirect URIs case-insensitively on host only", () => {
    const result = createAuthorizationUrl(makeConfig(), {
      state,
      redirectUri: "https://APP.example.com/auth/callback",
    });
    expect(new URL(result.url).searchParams.get("redirect_uri")).toBe(REDIRECT);
  });

  it("requires a non-empty allowlist", () => {
    expect(() =>
      createAuthorizationUrl(makeConfig({ allowedRedirectUris: [] }), {
        state,
        redirectUri: REDIRECT,
      }),
    ).toThrow(OAuthConfigurationError);
  });

  it("refuses to let additionalParams override a security parameter", () => {
    for (const key of ["state", "code_challenge", "code_challenge_method", "redirect_uri", "response_type"]) {
      expect(() =>
        createAuthorizationUrl(makeConfig(), {
          state,
          redirectUri: REDIRECT,
          additionalParams: { [key]: "x" },
        }),
      ).toThrow(OAuthConfigurationError);
    }
  });

  it("applies provider defaults and caller extras", () => {
    const url = new URL(
      createAuthorizationUrl(makeConfig(), {
        state,
        redirectUri: REDIRECT,
        scopes: ["openid", "email"],
        nonce: "n-0S6_WzA2Mj",
        additionalParams: { login_hint: "user@example.com" },
      }).url,
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("nonce")).toBe("n-0S6_WzA2Mj");
    expect(url.searchParams.get("login_hint")).toBe("user@example.com");
  });
});

/**
 * Audit round 10 phase 2 regressions for @zudojs/auth-oauth: the shared
 * IPv6 helpers (security/SEC-06) and the shared error base (CONV-02).
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  BaseError,
  ErrorCode,
  OAuthError as SharedOAuthError,
} from "@zudojs/errors";

import {
  OAuthConfigurationError,
  OAuthError,
  OAuthErrorCode,
  OAuthProviderError,
} from "../src/oauthErrors/index.js";
import { isBlockedFetchHost } from "../src/oauthSecurity/index.js";

describe("security/SEC-06 (phase 2): no mirrored IPv6 guard", () => {
  it("the local copy is gone and the guard still judges embedded IPv4", () => {
    const copy = fileURLToPath(
      new URL("../src/oauthSecurity/oauthIpv6.guard.ts", import.meta.url),
    );
    expect(existsSync(copy)).toBe(false);
    expect(isBlockedFetchHost("[::ffff:7f00:1]")).toBe(true);
    expect(isBlockedFetchHost("[2606:4700::1111]")).toBe(false);
  });
});

describe("security/CONV-02 (phase 2): OAuthError is a @zudojs/errors class", () => {
  it("every OAuth error is a BaseError and a shared OAuthError", () => {
    const err = new OAuthConfigurationError("bad config");
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toBeInstanceOf(SharedOAuthError);
    expect(err).toBeInstanceOf(BaseError);
    expect(err.name).toBe("OAuthConfigurationError");
    expect(err.code).toBe(OAuthErrorCode.CONFIGURATION_INVALID);
    expect(err.statusCode).toBe(500);
    expect(err.expose).toBe(false);
  });

  it("keeps the defaults and codes, which equal ErrorCode.OAUTH_*", () => {
    const base = new OAuthError("x");
    expect(base.name).toBe("OAuthError");
    expect(base.code).toBe(ErrorCode.OAUTH_PROVIDER_REJECTED);
    expect(base.statusCode).toBe(400);
    expect(base.expose).toBe(true);
    const provider = new OAuthProviderError("no", { providerStatus: 401 });
    expect(provider.statusCode).toBe(502);
    expect(provider.providerStatus).toBe(401);
    for (const code of Object.values(OAuthErrorCode)) {
      expect(Object.values(ErrorCode)).toContain(code);
    }
  });

  it("keeps a cause", () => {
    const cause = new Error("socket");
    expect(new OAuthError("x", { cause }).cause).toBe(cause);
  });
});

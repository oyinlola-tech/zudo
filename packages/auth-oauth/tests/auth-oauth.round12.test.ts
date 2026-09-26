/**
 * Round 12 regressions for @zudojs/auth-oauth (academy finding #76).
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "fixtures", "hangingFetch.script.ts");
const tsx = path.resolve(here, "../../../node_modules/.bin/tsx");

describe("#76 request timeout keeps the event loop alive", () => {
  it("a hanging fetch in a short script times out instead of exiting with code 13", () => {
    const result = spawnSync(tsx, [script], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/CAUGHT OAuthNetworkError: .*timed out after 100ms/);
  });
});

describe("#76 the deadline holds for a fetch that ignores the signal", () => {
  it("rejects with OAuthNetworkError even when config.fetch never settles", async () => {
    const { exchangeCodeForToken, OAuthNetworkError } = await import(
      "../src/index.js"
    );
    const REDIRECT = "https://app.example.com/auth/callback";
    const started = Date.now();
    await expect(
      exchangeCodeForToken(
        {
          provider: "google",
          clientId: "client-id-123",
          clientSecret: "s3cr3t-CLIENT-SECRET-do-not-leak-9f2a",
          allowedRedirectUris: [REDIRECT],
          fetch: () => new Promise<Response>(() => {}),
          timeoutMs: 50,
        },
        { code: "c", codeVerifier: "a".repeat(64), redirectUri: REDIRECT },
      ),
    ).rejects.toBeInstanceOf(OAuthNetworkError);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

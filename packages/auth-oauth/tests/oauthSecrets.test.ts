/**
 * The client secret must never reach a log, a thrown value, or a stack.
 */

import { describe, expect, it } from "vitest";

import {
  createAuthorizationUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  generateCodeVerifier,
  generateState,
  refreshAccessToken,
  type FetchLike,
} from "../src/index.js";
import { makeConfig, REDIRECT, SECRET, stubFetch } from "./helpers.js";

const VERIFIER = generateCodeVerifier();
const STATE = generateState();

/**
 * Every string an error surfaces on its own: the name, the message, the
 * stack (whose first line is the message) and its string coercion.
 *
 * `cause` is deliberately not included. When a caller supplies their own
 * `config.fetch`, its rejection is attached as `cause` untouched, so it can
 * carry whatever that transport chose to put in it. Nothing this package
 * writes ever ends up there.
 */
function surfaceOf(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack ?? "", String(error)].join("\n");
  }
  return String(error);
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return surfaceOf(error);
  }
  throw new Error("expected the operation to fail");
}

describe("secret hygiene", () => {
  const failing = stubFetch(
    JSON.stringify({ error: "invalid_client", error_description: SECRET }),
    { status: 401 },
  ).fetch;

  const throwing: FetchLike = () => Promise.reject(new Error(`connect failed ${SECRET}`));

  const cases: readonly [string, () => Promise<unknown>][] = [
    [
      "token exchange rejected by provider",
      () =>
        exchangeCodeForToken(makeConfig({ fetch: failing }), {
          code: "c",
          codeVerifier: VERIFIER,
          redirectUri: REDIRECT,
        }),
    ],
    [
      "token exchange with a disallowed redirect",
      () =>
        exchangeCodeForToken(makeConfig({ fetch: failing }), {
          code: "c",
          codeVerifier: VERIFIER,
          redirectUri: "https://attacker.example.com/cb",
        }),
    ],
    [
      "token exchange against a blocked endpoint",
      () =>
        exchangeCodeForToken(
          makeConfig({
            provider: "custom",
            tokenUrl: "https://169.254.169.254/token",
            fetch: failing,
          }),
          { code: "c", codeVerifier: VERIFIER, redirectUri: REDIRECT },
        ),
    ],
    [
      "malformed token response",
      () =>
        exchangeCodeForToken(makeConfig({ fetch: stubFetch("{}").fetch }), {
          code: "c",
          codeVerifier: VERIFIER,
          redirectUri: REDIRECT,
        }),
    ],
    [
      "refresh rejected by provider",
      () => refreshAccessToken(makeConfig({ fetch: failing }), "rt"),
    ],
    [
      "user-info rejected by provider",
      () => fetchUserInfo(makeConfig({ fetch: failing }), "at"),
    ],
    [
      "bad configuration",
      () =>
        Promise.resolve().then(() =>
          createAuthorizationUrl(makeConfig({ allowedRedirectUris: [] }), {
            state: STATE,
            redirectUri: REDIRECT,
          }),
        ),
    ],
  ];

  it.each(cases)("keeps the client secret out of the error from %s", async (_label, run) => {
    const surface = await captureError(run);
    expect(surface).not.toContain(SECRET);
  });

  it("keeps the secret out of the error when the transport itself leaks it", async () => {
    // A caller-supplied fetch may put anything in its rejection; it is passed
    // through as `cause`, but this package's own message and stack stay clean.
    const surface = await captureError(() =>
      exchangeCodeForToken(makeConfig({ fetch: throwing }), {
        code: "c",
        codeVerifier: VERIFIER,
        redirectUri: REDIRECT,
      }),
    );
    expect(surface).not.toContain(SECRET);
  });

  it("keeps the PKCE verifier out of the authorization URL and of errors", async () => {
    const result = createAuthorizationUrl(makeConfig(), {
      state: STATE,
      redirectUri: REDIRECT,
    });
    expect(result.url).not.toContain(result.codeVerifier);
    const surface = await captureError(() =>
      exchangeCodeForToken(makeConfig({ fetch: failing }), {
        code: "c",
        codeVerifier: result.codeVerifier,
        redirectUri: REDIRECT,
      }),
    );
    expect(surface).not.toContain(result.codeVerifier);
  });
});

/**
 * Repro for finding #76: a provider request whose fetch never settles must
 * end in an OAuthNetworkError and a normal exit, not "unsettled top-level
 * await" (exit code 13). Run under tsx by auth-oauth.round12.test.ts.
 */

import { exchangeCodeForToken } from "../../src/index.js";

const REDIRECT = "https://app.example.com/auth/callback";
const hanging = (): Promise<Response> => new Promise<Response>(() => {});

try {
  await exchangeCodeForToken(
    {
      provider: "google",
      clientId: "client-id-123",
      clientSecret: "s3cr3t-CLIENT-SECRET-do-not-leak-9f2a",
      allowedRedirectUris: [REDIRECT],
      fetch: hanging,
      timeoutMs: 100,
    },
    { code: "code-1", codeVerifier: "a".repeat(64), redirectUri: REDIRECT },
  );
  process.stdout.write("RESOLVED\n");
} catch (error) {
  const failure = error as { name?: string; message?: string };
  process.stdout.write(`CAUGHT ${failure.name}: ${failure.message}\n`);
}

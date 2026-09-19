---
"@zudojs/auth": minor
---

Round 10 security fixes:

- AUTH-01: `refreshAccessToken` / `jwt.refreshAccessToken` now carry the refresh token's `sid` into the new pair, so the result still dies with `logout()` / `logoutAll()`. **Behaviour change:** `createAuthService().verifyToken()` and `.refresh()` now reject tokens with no `sid` (`TokenInvalidError: Token is not bound to a session`). Set the new opt-in `allowSessionlessTokens: true` to accept tokens minted with the standalone `createTokenPair()`.
- AUTH-02: login lockout is no longer check-then-act. A failure is reserved before the password is verified and cleared on success, so a parallel burst gets `maxFailedAttempts` guesses per lockout instead of `maxAttemptsPerWindow`. Concurrent attempts past the limit get `AccountLockedError` without their password being checked. An attempt that throws for another reason keeps its reservation.
- AUTH-03: `createMemoryLoginAttemptStore` accepts `failureTtlSeconds` (default 900) and `maxEntries` (default 100 000). An unlocked failure streak is forgotten after that much inactivity and its entry is evicted, and at the cap the oldest unlocked entry goes first. Spraying identifiers can no longer grow the store without bound.
- AUTH-04: the JWT signature segment is compared as the canonical base64url string, so a token has exactly one accepted spelling (no trailing-bit variants, no appended junk).
- AUTH-05: `maxAttemptsPerWindow` is documented as a per-identifier budget, with a recommendation to put a per-IP limiter in front of `login()`.
- CRYPTO-01: new password hashes use scrypt N=2^14, r=8, p=5 (OWASP). Existing `scrypt$16384$8$1$…` hashes and the param-less legacy format still verify, and `needsRehash()` now returns `true` for them.
- XPKG-01 (partial): the local `generateCsrfToken` is marked `@deprecated` in favour of `@zudojs/security`. Delegating hashing to `@zudojs/crypto` waits on adding the dependency.

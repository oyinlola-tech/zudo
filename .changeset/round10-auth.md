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

Round 10 phase 2:

- XPKG-01: `hashPassword` delegates to `@zudojs/crypto` and returns its `v1$scrypt$16384$8$5$<salt>.<hash>` format (32-byte salt, 64-byte key). `verifyPassword` sends `v1$…` hashes to `@zudojs/crypto` and keeps a legacy verifier for `scrypt$N$r$p$…` and the param-less `scrypt<salt>$…` format, so every stored hash still verifies. `needsRehash()` returns `true` for every hash that is not a current-parameter crypto scrypt hash (all legacy hashes, PBKDF2, other salt/key sizes). The unknown-user dummy hash is a crypto-format hash. Session ids come from `@zudojs/crypto` `randomHex`. **Behaviour change:** new hash strings start with `v1$scrypt$`, and `hashPassword("")` now throws `AuthError` (`INVALID_INPUT`). `generateRandomToken`, `generateTokenId` and the deprecated `generateCsrfToken` stay on `node:crypto` because they are synchronous and every `@zudojs/crypto` random helper is async.
- CONV-02: `AuthError` and `AuthErrorOptions` are now re-exported from `@zudojs/errors`; every auth error subclass extends the shared class.

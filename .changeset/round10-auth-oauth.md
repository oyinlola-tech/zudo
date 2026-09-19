---
"@zudojs/auth-oauth": minor
---

Round 10 security fix:

- SEC-06: the SSRF guard on server-fetched endpoints judges IPv6 literals that embed an IPv4 address as that IPv4 address. This covers IPv4-compatible `[::127.0.0.1]` (serialised as `[::7f00:1]`), mapped, translated `[::ffff:0:a9fe:a9fe]`, NAT64 `[64:ff9b::169.254.169.254]` and 6to4 `2002::/16`. It also refuses the local-use NAT64 prefix `64:ff9b:1::/48` and fails closed on an unparseable literal.

Round 10 phase 2:

- SEC-06: the SSRF guard imports `expandIpv6` / `embeddedIpv4` / `isNonPublicIpv6Range` from `@zudojs/security`; the mirrored `oauthIpv6.guard.ts` is deleted. No behaviour change.
- CONV-02: `OAuthError` now extends the shared `OAuthError` from `@zudojs/errors` (a `BaseError`) instead of `Error`. Names, codes, `statusCode` and `expose` defaults are unchanged. **Behaviour change:** OAuth errors gain `category` (`authentication`), `severity`, `isOperational`, `metadata`, `toJSON()` and `toLogObject()`, and `JSON.stringify(err)` now emits the structured BaseError shape. The package now depends on `@zudojs/errors` and `@zudojs/security`.

---
"@zudojs/security": minor
---

Round 10 security fixes:

- SEC-01: `extractClientIp` strips any port and IPv6 brackets, so `client-ip:port` entries no longer produce one bucket per TCP connection. The default rate-limit key maps IPv4-mapped IPv6 to IPv4 and buckets other IPv6 addresses by /64. **Behaviour change:** `defaultKeyGenerator` (and so `createRateLimiter` without a `keyGenerator`) throws `ConfigurationError` when `request.ip` is missing or is not an IP address, including `"unknown"`, instead of putting every such request into one shared bucket. `getCount(ip)` and `reset(ip)` accept raw addresses. New exports: `createIpKeyGenerator({ ipv6PrefixLength })`, `ipRateLimitKey`, `parseClientIp`, `DEFAULT_IPV6_PREFIX_LENGTH`, `IpKeyOptions`.
- SEC-02: CSRF `methods` are matched case-insensitively, so `methods: ["post"]` now protects POST instead of failing open.
- SEC-03: a `NaN`, infinite or non-positive body limit no longer disables size checks. `validateBodySize`, `validateContentLength` and `createBodySizeChecker` throw `ConfigurationError`, `validateBodyLimitConfig` reports the limit, and a non-finite body size is rejected.
- SEC-04: `validateCsrfToken` and `verifyDoubleSubmit` enforce the same 32-character secret minimum as `generateCsrfToken` and throw `ConfigurationError` otherwise.
- SEC-05: `stripSensitiveCookies` matches whole words anywhere in the name, after dropping a `__Host-`/`__Secure-` prefix. The defaults (new export `DEFAULT_SENSITIVE_COOKIE_NAMES`) add `sid`, `sess`, `sessionid`, `phpsessid`, `jsessionid`, `csrf` and `xsrf`, so `connect.sid`, `__Host-session`, `next-auth.session-token`, `access_token`, `refresh_token` and `PHPSESSID` are all stripped. New export: `isSensitiveCookieName`.
- SEC-06: `isSafeUrl` / `isPrivateHostname` judge IPv4-compatible (`::/96`), mapped, translated, NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) addresses as the IPv4 address they embed, whatever their spelling. They also refuse `64:ff9b:1::/48`, `fec0::/10` and `ff00::/8`, and an unparseable IPv6 literal fails closed.
- SEC-07: `containsXss` decodes HTML character references and ignores whitespace inside a scheme (catching `jav&#x61;script:`, `javascript&colon;` and `java&#x09;script:`). `containsSqlInjection` catches `' OR 1=1`, `' ||` and time-based probes (`pg_sleep`, `SLEEP`, `BENCHMARK`, `WAITFOR DELAY`). Both are still heuristics.
- CONV-02 (partial): configuration and cookie-serialisation failures now throw `ConfigurationError` / `ValidationError` from `@zudojs/errors` instead of a bare `Error`. Both still extend `Error`. Existing `RangeError` throws are unchanged.
- SEC-06 (phase 2): new exports `expandIpv6`, `embeddedIpv4` and `isNonPublicIpv6Range`, the IPv6 helpers behind `isSafeUrl` / `isPrivateHostname`, so `@zudojs/auth-oauth` shares them instead of keeping a copy.

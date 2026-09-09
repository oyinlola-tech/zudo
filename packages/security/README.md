# @zudojs/security

Security primitives for input validation, header security, CORS, CSRF protection, rate limiting, and security headers.

## Installation

```bash
npm install @zudojs/security
```

## Quick Start

These are **functions, not middleware**. They compute answers and header values;
wiring them into a request pipeline is the caller's job, which keeps the package
framework-agnostic.

```typescript
import {
  createRateLimiter,
  extractClientIp,
  retryAfterSeconds,
  generateSimpleHeaders,
  generateSecurityHeaders,
} from "@zudojs/security";

const limiter = createRateLimiter({ windowMs: 60_000, max: 100 });

function handle(request, response) {
  // Forwarding headers are only trusted when you say how many proxies you run.
  const ip = extractClientIp(request.headers, {
    trustProxy: 1,
    remoteAddress: request.socket.remoteAddress,
  });

  const limit = limiter.check({ ip });
  if (!limit.allowed) {
    // `resetAt` is a Date; `Retry-After` is a whole number of seconds.
    return respond(429, { retryAfter: retryAfterSeconds(limit) });
  }

  const headers = {
    ...generateSecurityHeaders(),
    ...generateSimpleHeaders(request.headers.origin, {
      origin: ["https://example.com"],
      credentials: true,
    }),
  };

  return respond(200, body, headers);
}
```

## Rate limiting

A genuine sliding window: each check prunes entries older than `windowMs` and
decides against what remains, so a client cannot spend a full allowance either
side of a fixed boundary. Only allowed requests consume an allowance slot, so a
client being limited cannot grow its own bucket.

```typescript
const limiter = createRateLimiter({
  windowMs: 60_000,
  max: 100,
  maxKeys: 100_000, // LRU-evicted ceiling on tracked keys
});

const ip = "203.0.113.7";

limiter.check({ ip }); // { allowed, remaining, resetAt: Date, total }
limiter.getCount(ip);
limiter.reset(ip);
limiter.destroy(); // clears the cleanup timer
```

`middleware` fills a response for you, and the default handler now derives
`Retry-After` from the decision rather than emitting a fixed `60`. It also
honours `message`:

```typescript
const limiter = createRateLimiter({
  windowMs: 3_600_000,
  max: 10,
  message: "Hourly quota exhausted.",
});

const response = { statusCode: 200, headers: {} as Record<string, string> };
const result = limiter.middleware({ ip }, response);
// response.headers["Retry-After"]  → seconds until the window frees up
// response.headers["X-RateLimit-Limit"], ["X-RateLimit-Remaining"], ["X-RateLimit-Reset"]
// response.body                    → { error: { code, message: "Hourly quota exhausted." } }
```

A custom `handler` receives the same decision as a third argument, so it can do
the arithmetic too. Two-parameter handlers written against the previous
signature still work.

**`extractClientIp` does not trust `X-Forwarded-For` by default.** Any client can
send that header, so taking its leftmost entry hands the caller control of their
own rate-limit bucket. Set `trustProxy` to the number of proxies you actually
operate; entries are then read in from the right, and everything to the left of
your own hops is ignored.

## CORS

```typescript
import {
  generatePreflightHeaders,
  generateSimpleHeaders,
} from "@zudojs/security";

const config = { origin: ["https://app.example.com"], credentials: true };

// `Access-Control-Request-Headers` is a comma-separated list; split it
// yourself — the package takes a `string[]`, not the raw header.
const requested = (request.headers["access-control-request-headers"] ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => h.length > 0);

// Preflight — optionally validating what the browser asked for.
generatePreflightHeaders(request.headers.origin, config, {
  method: request.headers["access-control-request-method"],
  headers: requested,
});
```

`Vary: Origin` is emitted whenever the allowed origin is reflected (array, regex
or predicate), including on rejection — without it a shared cache can serve one
origin's `Access-Control-Allow-Origin` to another. A wildcard origin combined
with `credentials` throws, since browsers reject that pairing outright.

## CSRF

Two patterns, both on the same HMAC-SHA256 token. Bind the token to a session
wherever you have one — an unbound token is valid for every user.

The shortest correct version binds your configuration once. `secret` must be at
least 32 characters — the signature is HMAC-SHA256, so a shorter one adds no
strength:

```typescript
import { createCsrfProtection } from "@zudojs/security";

const csrf = createCsrfProtection({
  secret: process.env.CSRF_SECRET, // >= 32 chars
  cookieName: "app_csrf",
  headerName: "x-app-csrf",
  expiration: 3600,
});

// Issue
const { token, setCookie } = csrf.issue({ sessionId });
setHeader("Set-Cookie", setCookie);

// Verify — safe to call on every request; safe methods return true.
if (!csrf.verify(
  { method: request.method, headers: request.headers, cookieHeader: request.headers.cookie },
  { sessionId },
)) {
  return respond(403);
}
```

The same thing with the primitives, if you would rather hold the pieces:

```typescript
import {
  generateCsrfToken,
  generateCsrfCookie,
  verifyDoubleSubmit,
  extractCsrfTokenFromCookies,
  extractCsrfTokenFromHeaders,
  requiresCsrfProtection,
} from "@zudojs/security";

// Issue
const token = generateCsrfToken(secret, { sessionId, expiration: 3600 });
setHeader("Set-Cookie", generateCsrfCookie(token));

// Verify
if (requiresCsrfProtection(request.method)) {
  const ok = verifyDoubleSubmit(
    extractCsrfTokenFromCookies(request.headers.cookie ?? ""),
    extractCsrfTokenFromHeaders(request.headers),
    secret,
    { sessionId },
  );
  if (!ok) return respond(403);
}
```

The cookie is `Secure` and `HttpOnly` by default, which suits the synchroniser
token pattern where the server renders the token into the page. For the
double-submit pattern — where client script reads the cookie back — pass
`httpOnly: false`, and accept that XSS on the origin can then read the token.

## URLs and SSRF

```typescript
import {
  isSafeUrl,
  isPrivateHostname,
  validateRequestTarget,
} from "@zudojs/security";

isSafeUrl("http://169.254.169.254/"); // false — cloud metadata
isSafeUrl("http://[::ffff:127.0.0.1]/"); // false — v4-mapped loopback
isSafeUrl("gopher://internal/"); // false — protocol not allowlisted
```

Addresses are range-checked numerically (127/8, 10/8, 172.16/12, 192.168/16,
169.254/16, 100.64/10, 0/8, `::1`, `fc00::/7`, `fe80::/10`), and only `http:`
and `https:` are permitted unless you widen `allowedProtocols`.

**This cannot stop DNS rebinding.** A public hostname may resolve to a private
address, and may resolve differently between the check and the connection. For
outbound requests that must be safe, resolve the hostname yourself, run
`isPrivateHostname` against the resolved address, and connect to that address.

`validateRequestTarget` rejects CR and LF — literal or percent-encoded — and
detects traversal by decoding to a fixed point rather than pattern-matching
encoded forms. It also enforces `maxLength` and rejects invalid percent
encoding; a single trailing `%` used to abort decoding altogether, so
`/a/%2e%2e/etc/passwd%` and `/a%0d%0aX-Evil:1%` were both reported valid.

It takes a `RequestTargetConfig` rather than the full `UrlValidationConfig`: a
request target is origin-form and carries no scheme, so `allowedProtocols`
could never apply to it.

## Cookies

`serializeCookie` validates before it writes: the value is percent-encoded, and
an unsafe name, attribute, `Max-Age` or `Expires` throws. `SameSite=None` and
`Partitioned` require `Secure`.

`parseCookieHeader` validates on the way in too. A name that is not an RFC 6265
token, or a value carrying a control character, is reported in `errors` and
kept out of `cookies` — it used to check only length, so a malformed cookie
reached the caller with `errors: []`. Values are otherwise accepted leniently
(spaces, commas and quoted-string wrappers are common in the wild); use
`validateCookieValue` where you want the strict `cookie-octet` rule.

```typescript
createSecureCookie("sid", value, { maxAge: 3600 });
// sid=…; Max-Age=3600; Secure; HttpOnly; SameSite=Lax
```

## Input sanitization

```typescript
import { sanitizeObject, detectThreats, escapeHtml } from "@zudojs/security";

sanitizeObject(payload, { maxDepth: 32 }); // cycle-safe, arrays stay arrays
detectThreats(input); // ordered: SQL_INJECTION, XSS, NULL_BYTE, CONTROL_CHARACTERS
escapeHtml(text);
```

`detectThreats` and `containsSqlInjection` are heuristics with a high
false-positive rate on ordinary prose — useful for logging and alerting, never a
substitute for parameterised queries or contextual output encoding.
`escapeHtml` covers element text and quoted attribute values; unquoted
attributes, `<script>` bodies and URL positions need their own encoding.

## Features

- Sliding-window rate limiting with proxy-aware client IP extraction
- CORS with `Vary: Origin` and wildcard/credentials validation
- CSRF tokens: HMAC-SHA256, session-bound, constant-time double-submit
- URL validation, traversal detection and SSRF range checks
- Cookie parsing and injection-safe serialization
- Header validation, CRLF stripping and opt-in hop-by-hop rejection
- Body size limits, `Content-Length` validation and request-smuggling framing checks
- Security headers with a restrictive default CSP and HSTS

## Use Cases

- Securing HTTP endpoints
- Preventing injection attacks
- Rate limiting public APIs
- Compliance with security headers standards

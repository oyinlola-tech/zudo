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
    return respond(429, { retryAfter: limit.resetAt });
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

limiter.check({ ip }); // { allowed, remaining, resetAt, total }
limiter.getCount(ip);
limiter.reset(ip);
limiter.destroy(); // clears the cleanup timer
```

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

// Preflight — optionally validating what the browser asked for.
generatePreflightHeaders(request.headers.origin, config, {
  method: request.headers["access-control-request-method"],
  headers: parseList(request.headers["access-control-request-headers"]),
});
```

`Vary: Origin` is emitted whenever the allowed origin is reflected (array, regex
or predicate), including on rejection — without it a shared cache can serve one
origin's `Access-Control-Allow-Origin` to another. A wildcard origin combined
with `credentials` throws, since browsers reject that pairing outright.

## CSRF

Two patterns, both on the same HMAC-SHA256 token. Bind the token to a session
wherever you have one — an unbound token is valid for every user.

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
encoded forms.

## Cookies

`serializeCookie` validates before it writes: the value is percent-encoded, and
an unsafe name, attribute, `Max-Age` or `Expires` throws. `SameSite=None` and
`Partitioned` require `Secure`.

```typescript
createSecureCookie("sid", value, { maxAge: 3600 });
// sid=…; Max-Age=3600; Secure; HttpOnly; SameSite=Lax
```

## Input sanitization

```typescript
import { sanitizeObject, detectThreats, escapeHtml } from "@zudojs/security";

sanitizeObject(payload, { maxDepth: 32 }); // cycle-safe, arrays stay arrays
detectThreats(input); // ["XSS", "NULL_BYTE", …]
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
- Header validation, CRLF stripping and hop-by-hop detection
- Body size limits, `Content-Length` validation and request-smuggling framing checks
- Security headers with a restrictive default CSP and HSTS

## Use Cases

- Securing HTTP endpoints
- Preventing injection attacks
- Rate limiting public APIs
- Compliance with security headers standards

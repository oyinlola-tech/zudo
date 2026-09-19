---
title: "@zudojs/security — Security Primitives Documentation"
description: "Complete documentation for @zudojs/security — input validation, CORS, CSRF, rate limiting, security headers, and more."
source: https://zudojs.oyinlola.site/docs/packages-security
---

v1.1.0

# @zudojs/security

Security primitives for input validation, header security, CORS, CSRF protection, rate limiting, and security headers with secure defaults.

SECURITY INPUT VALIDATION CORS CSRF RATE LIMITING HEADERS SANITIZATION

## OVERVIEW

A web server receives data it did not write: URLs, headers, cookies, bodies, form fields. Some of that data is sent by people trying to break the server. `@zudojs/security` is a set of small functions that inspect that data and build the response headers browsers use to protect your users.

Everything here is a **plain function**, not middleware. You call it, and it hands back a boolean, a string, a list of error messages, or a set of headers. Deciding what to do with that answer — reject the request, log it, carry on — is your job. That is what lets the package work with any HTTP layer.

Here is what each protection is for, in one sentence each:

| Protection | What it is for |
| --- | --- |
| **Security headers** | Response headers that tell the browser to switch on its own defences, such as refusing to run scripts from other sites. |
| **CORS** | Decides which *other* websites are allowed to read responses from your API inside a browser. |
| **CSRF** | Stops a page on another site from making a logged-in user's browser send a state-changing request to your site. |
| **Rate limiting** | Caps how many requests one client may make in a time window, so nobody can hammer your API. |
| **Input sanitization** | Removes characters that have no business being in user input, and *flags* input that looks like an attack. |
| **URL validation** | Rejects request paths that try to escape their directory or inject a header, and refuses outbound URLs that point back into your own network. |
| **Secure cookies** | Writes `Set-Cookie` values a browser will protect, and refuses to write one an attacker could tamper with. |

### When you need it

- You are building an HTTP server or adapter and have to decide what to accept.
- You want CORS, CSRF or rate limiting without pulling in a framework's middleware stack.
- Your service fetches URLs supplied by users and must not be tricked into calling internal addresses.

### When you don't

- You want ready-made middleware. These are functions; you wire them up yourself.
- You need rate limits shared across several servers. The limiter here counts in one process's memory.
- You need to accept HTML from users. Use a real HTML sanitizer; nothing here does that job.
- You need password hashing, encryption or signing in general. That is [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md).

> **Danger:** no function on this page makes a value "safe" everywhere. A string that is safe inside HTML text is not safe inside a SQL query, a shell command, or a URL. Safety depends on where the value is going, so every destination needs its own treatment.

## INSTALLATION

```bash
$ npm install @zudojs/security
```

The package depends on `@zudojs/errors` and `@zudojs/constants`, so your package manager installs those for you. Nothing else is needed: the code uses only Node's built-in `node:crypto`. Node 24 or newer.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## QUICK START

This is a complete Node server that does two things: it caps each client at five requests a minute, and it sends the default security headers on every response.

```ts
import { createServer } from "node:http";
import {
  createRateLimiter,
  extractClientIp,
  generateSecurityHeaders,
} from "@zudojs/security";

// max = requests allowed, windowMs = the window they are counted in.
const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });

const server = createServer((req, res) => {
  // No proxy in front of us, so trust the socket address only.
  const ip = extractClientIp(req.headers, {
    remoteAddress: req.socket.remoteAddress,
  });

  const limit = limiter.check({ ip });
  const headers = generateSecurityHeaders();

  if (!limit.allowed) {
    res.writeHead(429, { ...headers, "Retry-After": "60" });
    res.end("Too many requests");
    return;
  }

  res.writeHead(200, { ...headers, "Content-Type": "text/plain" });
  res.end("You have " + limit.remaining + " requests left.");
});

server.listen(3000);
```

Run it, then call it six times in a row:

```bash
$ curl -i http://localhost:3000/
```

**What you should see:** the first five responses are `200 OK`, with bodies counting down from *4 requests left* to *0 requests left*. Every one of them carries `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a `Content-Security-Policy` and the other defaults. The sixth is `429 Too Many Requests`. A minute later the first request ages out and you are allowed again.

## SECURITY HEADERS

Security headers are response headers that ask the browser to enforce rules on your behalf: do not put this page in a frame, do not guess file types, do not run scripts from other origins. The browser does the work; you only have to send the headers.

`generateSecurityHeaders()` returns a plain object of header names and values. Called with no argument you get the defaults; anything you pass overrides just that one header.

```ts
import { generateSecurityHeaders } from "@zudojs/security";

const headers = generateSecurityHeaders();
console.log(headers["X-Frame-Options"]);        // "DENY"
console.log(headers["X-Content-Type-Options"]); // "nosniff"
console.log(headers["X-XSS-Protection"]);       // "0"

// A UI that loads scripts from a CDN needs its own policy.
const uiHeaders = generateSecurityHeaders({
  contentSecurityPolicy: "default-src 'self'; script-src 'self' https://cdn.example.com",
});
console.log(uiHeaders["Content-Security-Policy"]);
// "default-src 'self'; script-src 'self' https://cdn.example.com"
```

These are the defaults you get when you pass nothing:

| Header | Default | What it does |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Restricts where scripts, styles and images may come from. Deliberately strict. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Tells the browser to use HTTPS for this domain for the next two years. |
| `X-Content-Type-Options` | `nosniff` | Stops the browser guessing a file's type and running an upload as a script. |
| `X-Frame-Options` | `DENY` | Stops other sites embedding your pages in a frame (clickjacking). |
| `X-XSS-Protection` | `0` | Switches off the old browser XSS filter, which caused bugs of its own. CSP replaced it. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Stops full URLs, which may hold tokens, leaking to other sites. |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` | Denies access to device features the page does not need. |
| `X-DNS-Prefetch-Control` | `off` | Stops the browser resolving links ahead of time. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cuts the link between your page and windows it opens. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Stops other origins loading your responses as resources. |

> **Watch out:** the default CSP forbids inline scripts and every external origin. That is right for a JSON API and wrong for most web UIs — if your pages go blank, replace `contentSecurityPolicy` rather than deleting the header. And do not send the HSTS default from a site still served over plain HTTP; two years is a long time to be locked out.

Three helpers go with it. `getMissingSecurityHeaders(headers)` tells you which of the ten are absent from a response you already built. `generateCspNonce()` returns a fresh random base64 string for a `'nonce-...'` CSP entry. `validateCspDirective(directive)` returns a warning when a policy contains `'unsafe-inline'`, `'unsafe-eval'` or `'unsafe-hashes'`, and `undefined` otherwise. It is advice, not a gate: it does not parse the policy.

```ts
import {
  getMissingSecurityHeaders,
  generateCspNonce,
  validateCspDirective,
} from "@zudojs/security";

console.log(getMissingSecurityHeaders({ "x-frame-options": "DENY" }).length); // 9

const nonce = generateCspNonce();
console.log(nonce.length); // 24 — 16 random bytes written in base64

console.log(validateCspDirective("default-src 'self'"));         // undefined
console.log(validateCspDirective("script-src 'unsafe-inline'")); // "unsafe-inline weakens CSP"
```

> **Common mistake:** building a header value out of user input. `generateSecurityHeaders` throws if any config value contains a line break or a null byte, because such a value would let the caller append headers of their own. `generateCspNonce` throws a `RangeError` below 16 bytes.

## CORS

By default a browser will not let JavaScript on `https://app.example.com` read a response from `https://api.example.com`. CORS — Cross-Origin Resource Sharing — is how your API says "this particular site may read my responses", using `Access-Control-*` headers.

An *origin* is the scheme, host and port of a page, such as `https://app.example.com`. The browser puts the calling page's origin in the `Origin` request header, and you answer with headers saying whether it is allowed.

There are two kinds of cross-origin request. A **simple** one is sent straight away. Anything else — a `DELETE`, a custom header — makes the browser send an `OPTIONS` **preflight** first, to ask permission. There is a function for each.

```ts
import {
  generateSimpleHeaders,
  generatePreflightHeaders,
} from "@zudojs/security";

const config = {
  origin: ["https://app.example.com"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// A normal request from an allowed origin.
console.log(generateSimpleHeaders("https://app.example.com", config));
// {
//   Vary: "Origin",
//   "Access-Control-Allow-Origin": "https://app.example.com",
//   "Access-Control-Allow-Credentials": "true"
// }

// A request from anywhere else: no Allow-Origin, so the browser blocks it.
console.log(generateSimpleHeaders("https://evil.example", config));
// { Vary: "Origin", "Access-Control-Allow-Credentials": "true" }

// A preflight, checking what the browser actually asked for.
console.log(
  generatePreflightHeaders("https://app.example.com", config, {
    method: "POST",
    headers: ["content-type"],
  }),
);
// Adds Access-Control-Allow-Methods, -Allow-Headers and -Max-Age: "86400".
```

The third argument to `generatePreflightHeaders` is optional. When you pass it, a preflight asking for a method or header you did not allow gets *no* CORS headers back at all, instead of a policy the browser then has to reject.

> **In plain words:** `origin` accepts a single string, an array of strings, a `RegExp`, or a function `(origin) => boolean`. Whenever the answer depends on who asked — anything but a single fixed string — the result carries `Vary: Origin`, which stops a shared cache handing one site's permission slip to another.

> **Danger:** `credentials: true` combined with `origin: "*"` throws an `Error`. Browsers refuse that pairing outright, so a policy built that way would silently never work. List your origins instead.

Three smaller functions let you make the same checks yourself: `isOriginAllowed` returns the origin value to send or `undefined`, `isMethodAllowed` returns a boolean, and `getDisallowedHeaders` returns the header names that are not permitted. All five are also reachable through the `cors` namespace object.

```ts
import { cors } from "@zudojs/security";

const policy = { origin: "https://app.example.com", allowedHeaders: ["Content-Type"] };

console.log(cors.isOriginAllowed("https://app.example.com", policy)); // "https://app.example.com"
console.log(cors.isOriginAllowed("https://evil.example", policy));     // undefined
console.log(cors.getDisallowedHeaders(["X-Secret"], policy));       // [ "X-Secret" ]
```

> **Common mistake:** assuming CORS protects your API. It does not. It only limits what *browser JavaScript on other sites* can read. Any script, server or command line can still call your endpoints, so keep your authentication and authorization checks.

## CSRF

Browsers attach your site's cookies to requests your site did not start. So a form on `evil.example` can post to `yourbank.example/transfer` and arrive fully logged in. That is Cross-Site Request Forgery.

The fix is to require something the other site cannot know: a token. You issue it, the browser sends it back in a header or form field, and you check it before doing anything that changes state.

A token here looks like `expiresAt:random:signature`. The signature is an HMAC-SHA256 over the other two parts plus a session id, keyed with your secret, so nobody without the secret can make one.

Issuing a token when a page is rendered:

```ts
import { generateCsrfToken, generateCsrfCookie } from "@zudojs/security";

const secret = process.env.CSRF_SECRET ?? "a-long-random-string";

// sessionId binds the token to one logged-in user.
const token = generateCsrfToken(secret, { sessionId: "user-42", expiration: 3600 });
console.log(token.split(":").length); // 3

const setCookie = generateCsrfCookie(token);
console.log(setCookie);
// "_csrf=<the token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600"
```

Checking it on the way back in:

```ts
import {
  requiresCsrfProtection,
  extractCsrfTokenFromCookies,
  extractCsrfTokenFromHeaders,
  verifyDoubleSubmit,
} from "@zudojs/security";

function checkCsrf(method, headers, sessionId, secret) {
  // GET, HEAD, OPTIONS and TRACE do not change state, so they are skipped.
  if (!requiresCsrfProtection(method)) return true;

  const fromCookie = extractCsrfTokenFromCookies(headers.cookie ?? "");
  const fromRequest = extractCsrfTokenFromHeaders(headers);

  return verifyDoubleSubmit(fromCookie, fromRequest, secret, { sessionId });
}

console.log(checkCsrf("GET", {}, "user-42", "s3cret"));  // true — nothing to check
console.log(checkCsrf("POST", {}, "user-42", "s3cret")); // false — no token present
```

`verifyDoubleSubmit` passes only when both tokens are present, byte-for-byte equal (compared in constant time), correctly signed, unexpired, and bound to the session id you pass. Comparing the two alone would not be enough. `validateCsrfToken` and `verifyDoubleSubmit` throw on a secret shorter than 32 characters, and the protected `methods` list is matched case-insensitively.

> **Watch out:** without `sessionId`, a token minted for one user validates for every other user — an attacker can get a token with their own account and replay it against a victim. Pass a session id whenever you have one, and pass the *same* one at generation and at validation.

> **In plain words:** the cookie is `HttpOnly` by default, so page scripts cannot read it. That fits the *synchroniser token* pattern, where the server renders the token into the page or form. If you want the browser's own script to read the cookie and echo it back — the *double-submit* pattern — pass `generateCsrfCookie(token, { httpOnly: false })`, and accept that any XSS on your origin can then steal the token.

> **Common mistake:** validating with a shorter `expiration` than the token was issued with. `validateCsrfToken` treats `expiration` as the maximum lifetime it is willing to honour, so a token minted for a day fails a check that expects an hour. Use the same number on both sides.

## RATE LIMITING

Rate limiting caps how many requests one client may make in a period of time. It is what stops someone guessing passwords a thousand times a second, or running your bill up by calling an expensive endpoint in a loop.

`createRateLimiter` returns an object that remembers, in this process's memory, when each client was last allowed through. The window *slides*: every check throws away timestamps older than `windowMs` and decides against what is left.

```ts
import { createRateLimiter } from "@zudojs/security";

const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });

for (let i = 0; i < 4; i++) {
  const result = limiter.check({ ip: "203.0.113.7" });
  console.log(result.allowed, result.remaining);
}
// true 2
// true 1
// true 0
// false 0

console.log(limiter.getCount("203.0.113.7")); // 3 — denied requests are not counted

limiter.destroy(); // clears the internal cleanup timer
```

The object you get back has these members:

| Member | What it does | Notes |
| --- | --- | --- |
| `check(request)` | Decides one request and records it. | Returns `{ allowed, remaining, resetAt, total }`; `resetAt` is a `Date`. |
| `middleware(request, response?)` | Same as `check`, but on a denial it also fills in the response object. | Sets status 429, `Retry-After` and a JSON error body, unless you configured your own `handler`. |
| `reset(key)` | Forgets one client's history. | The key is whatever your `keyGenerator` returns — by default the IP (IPv6 by /64); passing the raw IP works too. |
| `clear()` | Forgets every client. | Useful between tests. |
| `getCount(key)` | How many allowed requests are still inside the window. | Never exceeds `max`. |
| `destroy()` | Stops the cleanup timer and empties the store. | Call it on shutdown, and in tests. |
| `size` | How many keys are currently tracked. | A getter, not a method. |

The config takes `max` and `windowMs` (both required; a non-positive value throws a `RangeError`), plus optional `keyGenerator`, `handler`, `skip`, `message` and `maxKeys`. Once the store passes `maxKeys` (100,000 by default) the least recently seen keys are dropped, so a client rotating its identity cannot grow the map without limit. The default key generator strips ports, keys IPv4-mapped IPv6 as IPv4, buckets other IPv6 by /64 (`DEFAULT_IPV6_PREFIX_LENGTH`; build your own with `createIpKeyGenerator` / `ipRateLimitKey`), and throws a `ConfigurationError` when `request.ip` is missing or not an address (including `"unknown"`).

### Finding the client's IP

A limiter is only as good as the key it counts against. `extractClientIp` deliberately **ignores forwarding headers unless you opt in**, because anyone can put anything in `X-Forwarded-For`.

```ts
import { extractClientIp } from "@zudojs/security";

const headers = { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" };

// No proxies trusted: the header is ignored entirely.
console.log(extractClientIp(headers));                          // "unknown"
console.log(extractClientIp(headers, { remoteAddress: "9.9.9.9" })); // "9.9.9.9"

// One proxy of your own: read one entry in from the right.
console.log(extractClientIp(headers, { trustProxy: 1 }));         // "3.3.3.3"
console.log(extractClientIp(headers, { trustProxy: 2 }));         // "2.2.2.2"
```

> **In plain words:** each proxy appends the address it saw, so the entries on the right were written by *your* infrastructure and the ones on the left came from the caller. Set `trustProxy` to the number of proxies you actually run — not more. A value that is too high starts reading attacker-supplied text again.

> **Watch out:** the counters live in one process. Two instances behind a load balancer each allow `max` requests, so the real limit is doubled. A shared limit needs a store outside the process, which this package does not provide.

> **Common mistake:** creating a limiter inside your request handler. That makes a fresh, empty limiter — and a fresh timer — on every request, so nothing is ever limited. Create it once at startup.

## INPUT SANITIZATION

Input sanitization here means two separate things, and it matters that you keep them apart. **Cleaning** removes characters that should never be in text at all, such as null bytes. **Detecting** looks for shapes that resemble an attack and tells you what it saw.

> **Danger — read this before using anything below.** None of these functions makes a value safe for every destination. `sanitizeString` strips control characters; it does not make the result safe to put in HTML, a SQL query, a shell command, a file path, a URL or a log line. `containsSqlInjection` and `containsXss` are guesses based on regular expressions: they miss real attacks and they flag innocent text. The only real defences are parameterised queries for SQL and correct encoding at each output point.

### Cleaning values

`sanitizeString` removes null bytes and control characters, and can optionally normalise Unicode, truncate, and run a function of yours.

```ts
import { sanitizeString, sanitizeObject } from "@zudojs/security";

// \u0000 is a null byte, \u0007 a control character. Both are removed.
console.log(sanitizeString("he\u0000l\u0007lo"));           // "hello"
console.log(sanitizeString("abcdef", { maxStringLength: 3 })); // "abc"

// sanitizeObject walks a whole payload, cleaning every string it finds.
const payload = JSON.parse('{"__proto__":{"admin":true},"name":"a\\u0000b","tags":["x","y"]}');
const clean = sanitizeObject(payload);

console.log(Object.keys(clean)); // [ "name", "tags" ]
console.log(clean.name);          // "ab"
console.log(clean.tags);          // [ "x", "y" ] — still an array
```

`sanitizeObject` drops keys named `__proto__`, `constructor` and `prototype`, which are the keys used to poison JavaScript's prototype chain. Arrays stay arrays, a `Date` or class instance is passed through untouched, a value that refers back to itself becomes `undefined` instead of crashing, and recursion stops at `maxDepth` (32 by default).

### Escaping for HTML

`escapeHtml` replaces `&`, `<`, `>`, `"`, `'` and the backtick with their HTML entities. That is enough for element text and for a *quoted* attribute value.

```ts
import { escapeHtml, stripHtml } from "@zudojs/security";

console.log(escapeHtml("<b>hi</b>")); // "&lt;b&gt;hi&lt;/b&gt;"
console.log(stripHtml("<b>hi</b>"));  // "hi"
```

> **Watch out:** `escapeHtml` is *not* enough inside an unquoted attribute, inside a `<script>` or `<style>` block, or where the value becomes a URL — a `javascript:` href survives escaping untouched. Those places need their own encoding. And `stripHtml` only removes tag syntax; the plain text it returns must still be escaped before you put it back in a page. Neither is an HTML sanitizer, so do not use them to accept rich text from users.

### Detecting suspicious input

`detectThreats` returns a list of labels for what it recognised. Treat the result as a signal for logging and alerting, never as an authorisation decision.

```ts
import { detectThreats, isSafeString } from "@zudojs/security";

console.log(detectThreats("<script>alert(1)</script>")); // [ "XSS" ]
console.log(detectThreats("a\u0000b"));              // [ "NULL_BYTE", "CONTROL_CHARACTERS" ]

// A false positive: ordinary prose containing a SQL keyword.
console.log(detectThreats("Please update my address")); // [ "SQL_INJECTION" ]

// isSafeString: no null bytes, no control characters, and — if you pass one —
// the whole string matches your own pattern.
console.log(isSafeString("order-123", /^[a-z0-9-]+$/)); // true
console.log(isSafeString("order 123", /^[a-z0-9-]+$/)); // false
```

> **In plain words:** an allowlist beats a blocklist. Saying "an order id is lowercase letters, digits and dashes" rules out every attack at once; hunting for the word `DROP` rules out one spelling of one attack and blocks a customer named O'Brien. Reach for `isSafeString` with your own pattern first.

> **Common mistake:** reusing a regular expression that carries the `g` or `y` flag for repeated boolean tests. Such a pattern remembers where it stopped, so it reports `false` every other call. `isSafeString` and the CORS origin check strip those flags for you, and `withoutStickyFlags(pattern)` is exported so you can do the same to your own patterns.

## URL VALIDATION

There are two very different URL problems, and this package handles both. One is *incoming*: a request path that tries to climb out of its directory or smuggle a newline into your response headers. The other is *outgoing*: a URL a user gave you, which you are about to fetch, that secretly points back into your own network.

### Incoming request targets

A *request target* is the path and query of a request, such as `/users?page=1`. `validateRequestTarget` rejects carriage return and line feed (written literally or percent-encoded), null bytes, and directory traversal.

```ts
import { validateRequestTarget, normalizePath } from "@zudojs/security";

console.log(validateRequestTarget("/users?page=1").valid); // true

const bad = validateRequestTarget("/files/%2e%2e/%2e%2e/etc/passwd");
console.log(bad.valid);  // false
console.log(bad.errors); // [ "Request target contains path traversal attempts" ]

console.log(validateRequestTarget("/a%0d%0aX-Injected:%201").valid); // false

// Ask for a tidied path back with normalizePaths.
const tidied = validateRequestTarget("/a//b/./c?x=1", { normalizePaths: true });
console.log(tidied.normalized); // "/a/b/c?x=1"

console.log(normalizePath("/a/b/../c")); // "/a/c"
```

> **In plain words:** `..` means "go up one directory", so `/files/../../etc/passwd` reaches a file you never meant to serve. Attackers hide it by encoding: `%2e%2e`, `.%2e`, `%252e%252e`. Rather than listing every spelling, `containsTraversal` decodes the path over and over until it stops changing (that is `fullyDecodeUri`) and then looks for a plain `..` segment. Input still changing after eight rounds is treated as hostile.

`validateUrl` does the same job for a complete absolute URL, and also checks the length (2048 characters by default), the protocol, and percent-encoding.

```ts
import { validateUrl } from "@zudojs/security";

console.log(validateUrl("https://example.com/docs").valid); // true
console.log(validateUrl("ftp://example.com/x").errors);
// [ 'Protocol "ftp:" is not allowed (allowed: http:, https:)' ]
console.log(validateUrl("not a url").errors);             // [ "URL is malformed" ]
```

> **Watch out:** protocols in `allowedProtocols` are written with the trailing colon — `["http:", "https:"]`, not `["http"]`. That is the form Node's `URL` parser produces, and a list without colons matches nothing.

### Outgoing URLs and SSRF

SSRF — Server-Side Request Forgery — is when a user hands you a URL and your server fetches it for them. Your server usually sits inside a private network, so `http://169.254.169.254/` reaches the cloud metadata service and the credentials it hands out.

`isSafeUrl` answers "does this URL point somewhere public?" It allows only `http:` and `https:`, refuses URLs carrying a username or password, and range-checks the address numerically. IPv6 forms embedding an IPv4 address (`::a.b.c.d`, `::ffff:0:a.b.c.d`, `64:ff9b::/96`, `2002::/16`) are judged as that IPv4 address; `expandIpv6(address)`, `embeddedIpv4(groups)` and `isNonPublicIpv6Range(groups)` are exported.

```ts
import { isSafeUrl, isPrivateHostname } from "@zudojs/security";

console.log(isSafeUrl("https://example.com/logo.png"));   // true
console.log(isSafeUrl("http://169.254.169.254/"));        // false — cloud metadata
console.log(isSafeUrl("http://127.0.0.2/"));              // false — loopback
console.log(isSafeUrl("http://2130706433/"));             // false — 127.0.0.1 written as one number
console.log(isSafeUrl("http://[::ffff:127.0.0.1]/"));    // false — loopback via IPv6
console.log(isSafeUrl("file:///etc/passwd"));            // false — protocol not allowed
console.log(isSafeUrl("http://user:pass@example.com/")); // false — credentials in the URL

// The hostname check on its own, for an address you resolved yourself.
console.log(isPrivateHostname("10.1.2.3")); // true
console.log(isPrivateHostname("1.1.1.1"));  // false
```

> **Danger:** `isSafeUrl` cannot stop DNS rebinding. A hostname like `totally-public.example` may resolve to `127.0.0.1`, and may resolve differently a second later — between your check and your connection. If an outbound fetch really must be safe, resolve the hostname yourself, run `isPrivateHostname` against the address you got back, and connect to *that address* rather than to the name.

## SECURE COOKIES

A cookie is a small named value the browser stores for your site and sends back on every request. Because session ids usually live in one, how you write the `Set-Cookie` header decides how well that session is protected.

Three attributes do most of the work:

- **Secure** — only send it over HTTPS, so it cannot be read off the wire.
- **HttpOnly** — hide it from page scripts, so a cross-site scripting bug cannot steal it.
- **SameSite** — do not send it on requests started by other sites, which blunts CSRF.

`createSecureCookie` turns those on by default, so you have to opt out rather than remember to opt in.

```ts
import { createSecureCookie, parseCookieHeader } from "@zudojs/security";

console.log(createSecureCookie("sid", "abc123", { maxAge: 3600 }));
// "sid=abc123; Max-Age=3600; Secure; HttpOnly; SameSite=Lax"

// A value with a space is percent-encoded so it survives the round trip.
console.log(createSecureCookie("greeting", "hello there"));
// "greeting=hello%20there; Secure; HttpOnly; SameSite=Lax"

// Reading the Cookie header a browser sent back.
const parsed = parseCookieHeader("sid=abc123; theme=dark");
console.log(parsed.cookies); // [ { name: "sid", value: "abc123" }, { name: "theme", value: "dark" } ]
console.log(parsed.errors); // []
```

`serializeCookie` takes the same attributes as one object instead of separate arguments, and both functions **throw** rather than write something dangerous.

```ts
import { serializeCookie } from "@zudojs/security";

// A newline in an attribute would let the caller add headers of their own.
try {
  serializeCookie({ name: "sid", value: "v", domain: "a\\r\\nX-Evil: 1" });
} catch (error) {
  console.log(error.message); // 'Cookie Domain contains invalid characters (injection risk): …'
}
```

> **Watch out:** `parseCookieHeader` splits and trims; it does *not* percent-decode. If you wrote a value with `createSecureCookie` and it contained anything outside the plain cookie character set, call `decodeURIComponent` on the value yourself after parsing.

Two more helpers. `validateCookieName` and `validateCookieValue` return an error message or `undefined`, if you want to check before serializing. `stripSensitiveCookies` removes session-like cookies from a header before you forward it somewhere else or write it to a log.

```ts
import { validateCookieName, stripSensitiveCookies } from "@zudojs/security";

console.log(validateCookieName("sid"));   // undefined — fine
console.log(validateCookieName("a b"));   // "Cookie name contains invalid characters: a b"

console.log(stripSensitiveCookies("session_id=abc; theme=dark")); // "theme=dark"
```

> **In plain words:** `stripSensitiveCookies` drops any cookie whose name contains `session`, `sessionid`, `sess`, `sid`, `token`, `auth`, `jwt`, `csrf`, `xsrf` (and `PHPSESSID`/`JSESSIONID`) as a whole word, after ignoring a `__Host-`/`__Secure-` prefix, e.g. `connect.sid`, `access_token`, `__Host-session`. Pass your own list as the second argument if your cookies are named differently — a cookie it does not recognise is kept.

## HEADERS AND BODY LIMITS

These two groups matter if you are writing an HTTP adapter or a proxy. They check the parts of a request that arrive before your route handler ever runs.

### Headers

Header values must never contain a carriage return or line feed: those characters end a header, so a value carrying one can append headers or a whole second response. That is called response splitting.

```ts
import {
  validateHeaders,
  sanitizeHeaderValue,
  isHopByHopHeader,
} from "@zudojs/security";

console.log(validateHeaders({ "content-type": "application/json" }));
// { valid: true, errors: [] }

console.log(validateHeaders({ "x-forwarded-for": "1.1.1.1" }).errors);
// [ 'Header "x-forwarded-for" is blocked by security policy' ]

// Returns undefined when nothing is left after stripping.
console.log(sanitizeHeaderValue("one line only")); // "one line only"

// Hop-by-hop headers belong to a single connection and must not be forwarded.
console.log(isHopByHopHeader("Connection"));   // true
console.log(isHopByHopHeader("Content-Type")); // false
```

`validateHeaders` also caps the number of headers (50), each value's size (8 KB) and the total (64 KB). All four limits are configurable through `HeaderSecurityConfig`.

> **Watch out:** by default `validateHeaders` *blocks* `x-forwarded-for`, `x-forwarded-host` and `x-forwarded-proto` outright — the assumption is that no proxy sits in front of you, so those headers can only have come from the client. If you do run a proxy, pass your own `blockedHeaders` list, and keep trusting them only through `extractClientIp` with a `trustProxy` count.

### Body limits and framing

A body limit stops one request eating your memory. *Framing* is the separate question of where the body ends: a request that answers that question twice, differently, can be split into two by a proxy that reads one answer while your server reads the other. That is request smuggling, and it is why the contradictory combinations are rejected outright.

```ts
import {
  validateBodyFraming,
  validateContentLength,
  getBodyLimitForContentType,
  DEFAULT_BODY_LIMITS,
} from "@zudojs/security";

// undefined means "no problem found".
console.log(validateBodyFraming({ "content-length": "120" })); // undefined

console.log(
  validateBodyFraming({ "content-length": "120", "transfer-encoding": "chunked" }),
);
// "Request specifies both Content-Length and Transfer-Encoding (request smuggling risk)"

console.log(validateContentLength("100abc")); // "Content-Length is not a valid number: 100abc"
console.log(validateContentLength("2000", 1000)); // "Content-Length 2000 exceeds maximum 1000 bytes"

// Pick a size limit from the Content-Type.
console.log(getBodyLimitForContentType("application/json; charset=utf-8")); // 1048576
console.log(getBodyLimitForContentType("multipart/form-data; boundary=x")); // 104857600
console.log(DEFAULT_BODY_LIMITS.auth); // 262144
```

> **In plain words:** the four presets are `json` (1 MB), `auth` (256 KB), `upload` (100 MB) and `webhook` (2 MB). A login form looks exactly like any other form on the wire, so the Content-Type cannot tell you it is a login. On those routes pass the purpose yourself: `getBodyLimitForContentType(type, undefined, "auth")`.

Once you know the limit, `validateBodySize(actualSize, maxSize, contentType?)` checks one size, and `createBodySizeChecker(maxSize, contentType?)` returns a reusable `(size) => { allowed, error? }` function for a streaming read. A limit that is `NaN`, infinite, zero or negative throws a `ConfigurationError` instead of silently allowing everything.

## API REFERENCE

Everything below is exported from the package root, `@zudojs/security`.

### Security headers

| Name | What it does | Notes |
| --- | --- | --- |
| `generateSecurityHeaders(config?)` | Builds the ten security response headers. | Returns `Record<string, string>`. Throws if a config value holds a newline or null byte. |
| `getMissingSecurityHeaders(headers)` | Lists which of the ten are absent. | Case-insensitive. Returns `string[]`. |
| `generateCspNonce(nonceLength?)` | Random base64 nonce for a CSP entry. | Default 16 bytes; fewer throws a `RangeError`. |
| `validateCspDirective(directive)` | Warns about `'unsafe-inline'` and friends. | Returns a message or `undefined`. Advice only, not a parser. |
| `SECURITY_HEADER_NAMES` | The ten header names as constants. | Frozen object literal. |

### CORS

| Name | What it does | Notes |
| --- | --- | --- |
| `isOriginAllowed(origin, config)` | Decides one origin. | Returns the value to send, or `undefined`. |
| `generateSimpleHeaders(origin, config)` | Headers for a non-preflight request. | Returns `CorsHeaders`. |
| `generatePreflightHeaders(origin, config, request?)` | Headers for an `OPTIONS` preflight. | With `request` it also validates the requested method and headers. |
| `isMethodAllowed(method, config)` | Is this method in the policy? | Case-insensitive. |
| `getDisallowedHeaders(headers, config)` | Which requested headers are not permitted. | Returns `string[]`; empty means all allowed. |
| `cors` | Namespace holding the five functions above. | For callers who prefer `cors.isOriginAllowed(...)`. |

### CSRF

| Name | What it does | Notes |
| --- | --- | --- |
| `generateCsrfToken(secret, options?)` | Mints a signed token. | `options` is `{ expiration?, sessionId? }` or a plain number of seconds. Empty secret throws. |
| `validateCsrfToken(token, secret, options?)` | Checks signature, expiry and session binding. | Returns `boolean`. `expiration` is the maximum lifetime you accept. |
| `verifyDoubleSubmit(cookieToken, requestToken, secret, options?)` | Checks that both copies match and are valid. | Constant-time comparison. The usual entry point. |
| `requiresCsrfProtection(method, config?)` | Does this method change state? | `false` for GET, HEAD, OPTIONS, TRACE. |
| `extractCsrfTokenFromHeaders(headers, headerName?)` | Reads the token from headers. | Default `x-csrf-token`; lookup is case-insensitive. |
| `extractCsrfTokenFromCookies(cookieHeader, cookieName?)` | Reads the token from a raw Cookie header. | Default cookie name `_csrf`. |
| `generateCsrfCookie(token, config?)` | Builds the `Set-Cookie` value. | `HttpOnly`, `Secure`, `SameSite=Strict` by default. |

### Rate limiting

| Name | What it does | Notes |
| --- | --- | --- |
| `createRateLimiter(config)` | Builds an in-memory sliding-window limiter. | Returns `{ check, middleware, reset, clear, getCount, destroy, size }`. Create once, at startup. |
| `extractClientIp(headers, options?)` | Works out the client address. | Ignores forwarding headers unless `trustProxy` is set. Falls back to `remoteAddress`, then `"unknown"`. Ports and IPv6 brackets are stripped from the result. |
| `defaultKeyGenerator(request)` | Uses `request.ip` as the key (port stripped, IPv6 by /64); throws `ConfigurationError` when it is missing or not an IP. | Used when you pass no `keyGenerator`. |
| `defaultHandler(request, response)` | Fills in a 429 response. | Sets status, `Retry-After: 60` and a JSON error body. |
| `rateLimit` | Namespace holding the four functions above. | — |

### Input sanitization

| Name | What it does | Notes |
| --- | --- | --- |
| `sanitizeString(input, config?)` | Strips null bytes and control characters. | Optionally normalises Unicode, truncates, runs your `customSanitizer`. |
| `sanitizeObject(obj, config?)` | Cleans every string in a payload. | Drops prototype-pollution keys; cycle-safe; stops at `maxDepth` (32). |
| `escapeHtml(input)` | Escapes six HTML characters. | Safe for element text and quoted attributes only. |
| `stripHtml(input)` | Removes tag syntax. | Not a sanitizer. Escape the result before rendering. |
| `isSafeString(input, allowedPattern?)` | No null bytes, no control characters, matches your pattern. | The allowlist approach. Strips `g`/`y` from your pattern first. |
| `detectThreats(input)` | Labels what it recognised. | Any of `"SQL_INJECTION"`, `"XSS"`, `"NULL_BYTE"`, `"CONTROL_CHARACTERS"`. Heuristic. |
| `containsSqlInjection(input)` | Regex guess at SQL injection. | High false-positive rate. Never a substitute for parameterised queries. |
| `containsXss(input)` | Regex guess at XSS. | Misses real attacks. Encode on output instead. |
| `containsPrototypePollution(input)` | Is this string one of the three dangerous keys? | Exact match only. |
| `withoutStickyFlags(pattern)` | Copies a regex without `g` and `y`. | Use before repeated `.test()` calls. |
| `PROTOTYPE_POLLUTION_KEYS`, `SQL_INJECTION_PATTERNS`, `XSS_PATTERNS` | The lists behind those checks. | None carries the `g` flag, by design. |

### URLs

| Name | What it does | Notes |
| --- | --- | --- |
| `validateUrl(url, config?)` | Checks a full absolute URL. | Returns `{ valid, normalized?, errors }`. Protocols include the colon. |
| `validateRequestTarget(target, config?)` | Checks an incoming path and query. | Rejects CR, LF, null bytes and traversal. |
| `normalizePath(pathname)` | Resolves `.` and `..`. | `..` can never climb above the root. |
| `containsTraversal(path)` | Is there a `..` segment? | Decodes first, so encoded forms are caught. |
| `fullyDecodeUri(value)` | Percent-decodes to a fixed point. | Returns `{ decoded, truncated }`; `truncated` means it gave up after eight rounds. |
| `isSafeUrl(url, allowedProtocols?)` | Is this URL safe to fetch? | Blocks private ranges, non-HTTP protocols and embedded credentials. Cannot stop DNS rebinding. |
| `isPrivateHostname(hostname)` | Is this host internal? | Run it against an address you resolved yourself. |

### Cookies, headers and bodies

| Name | What it does | Notes |
| --- | --- | --- |
| `createSecureCookie(name, value, options?, config?)` | Builds a `Set-Cookie` value. | Secure, HttpOnly, SameSite=Lax by default. Throws on unsafe input. |
| `serializeCookie(cookie, config?)` | Same, taking a `ParsedCookie`. | Percent-encodes the value; validates every attribute. |
| `parseCookieHeader(header, config?)` | Splits a Cookie header. | Returns `{ cookies, errors }`. Does not percent-decode. |
| `validateCookieName(name)` / `validateCookieValue(value)` | Check one part. | Error message, or `undefined` when fine. |
| `stripSensitiveCookies(header, names?)` | Removes session-like cookies. | Defaults to `DEFAULT_SENSITIVE_COOKIE_NAMES`, matched as whole words anywhere in the name (`isSensitiveCookieName`). |
| `validateHeaders(headers, config?)` | Checks names, values, counts and sizes. | Returns `{ valid, errors }`. Blocks `x-forwarded-*` by default. |
| `validateHeaderName(name)` / `validateHeaderValue(name, value, config?)` | Check one header. | Error message, or `undefined`. |
| `sanitizeHeaderValue(value)` | Strips null bytes and line breaks. | Returns `undefined` if nothing is left. |
| `isHopByHopHeader(name)` | Should this header not be forwarded? | Connection, Upgrade, TE, and the rest. |
| `validateBodyFraming(headers, maxSize?)` | Rejects ambiguous body framing. | Message, or `undefined`. Guards against request smuggling. |
| `validateContentLength(value, maxSize?)` | Digits only, safe integer, within a maximum. | Message, or `undefined`. |
| `validateBodySize(actual, maxSize?, contentType?)` | Is this body too big? | Message, or `undefined`. Default limit 1 MB. |
| `createBodySizeChecker(maxSize, contentType?)` | Reusable size check. | Returns `(size) => { allowed, error? }`. |
| `getBodyLimitForContentType(type, presets?, purpose?)` | Picks a preset limit. | Pass `purpose` to override the type-based guess. |
| `parseMediaType(contentType)` | Strips parameters and lowercases. | `undefined` when absent or malformed. |
| `validateBodyLimitConfig(config)` | Sanity-checks a limit. | Must be positive and at most 1 GB. |
| `DEFAULT_BODY_LIMITS` | The four presets. | `json`, `auth`, `upload`, `webhook`. |

### Types

These are TypeScript types only; they disappear at runtime. Each is the config or result shape of the functions above: `HeaderSecurityConfig`, `HeaderValidationResult`, `BodyLimitConfig`, `BodyLimitPresets`, `UrlValidationConfig`, `UrlValidationResult`, `CookieSecurityConfig`, `ParsedCookie`, `CorsConfig`, `CorsHeaders`, `CsrfConfig`, `CsrfTokenOptions`, `CsrfCookieOptions`, `RateLimitConfig`, `RateLimiterOptions`, `ClientIpOptions`, `RateLimitRequest`, `RateLimitResponse`, `RateLimitResult`, `SecurityHeadersConfig`, `RequestValidationConfig` and `InputSanitizationConfig`.

> **In plain words:** `RequestValidationConfig` is exported as a type but no function in this package reads it. It is a shape for your own request-validation code, not a switch you can turn on.

> **Errors:** there is no `SecurityError` class here. Most functions report problems in their return value — a boolean, a message string, or an `errors` array. The few that throw use plain `Error` and `RangeError`: cookie serialization, `generateSecurityHeaders`, `generateCspNonce`, `generateCsrfToken`, `createRateLimiter`, and any CORS call pairing a wildcard origin with credentials.

## COMMON MISTAKES

- **Treating `sanitizeString` as an all-purpose cleaner.** It strips control characters and nothing more, so the "clean" value still injects into SQL or HTML. Fix: parameterise queries, and encode at the point of output — `escapeHtml` for HTML text, and the right encoder for every other destination.
- **Blocking input because `detectThreats` flagged it.** The word "update" in a support message trips `SQL_INJECTION`, so real users get rejected while a crafted payload slips past. Fix: use it for logging and alerting; validate with `isSafeString` and your own allowlist pattern.
- **Calling `createRateLimiter` inside the request handler.** Every request gets an empty limiter and its own timer, so nothing is limited and timers pile up. Fix: create it once at module level and call `destroy()` on shutdown.
- **Setting `trustProxy` higher than the number of proxies you run.** The count reaches past your own hops into text the client wrote, so anyone can pick their own rate-limit bucket. Fix: count your real proxies, and pass `remoteAddress` so there is a trustworthy fallback.
- **Issuing CSRF tokens without a `sessionId`.** An attacker signs up, gets a valid token, and replays it against your users; every token is valid for everyone. Fix: pass the same session id to `generateCsrfToken` and to `verifyDoubleSubmit`.
- **Expecting CORS to keep attackers out.** It only limits what browser scripts on other origins can read; `curl` ignores it entirely. Fix: keep authentication and authorization on every endpoint, and treat CORS as a browser convenience.

## RELATED PACKAGES

- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the HTTP server these checks are meant to sit in front of.
- [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md) — sessions, tokens and login, which is what the CSRF and cookie helpers protect.
- [@zudojs/crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md) — hashing, encryption and signing, for anything beyond the HMAC used here.
- [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) — checking that a payload has the shape and types you expect, which belongs before any of this.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the error types to raise once one of these checks fails.

## COMPLETE EXPORT INDEX

Every name `@zudojs/security` exports from its package root at v1.1.0 — **102** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 102 exports**

Functions (65)

`containsPrototypePollution` `containsSqlInjection` `containsTraversal` `containsXss` `createBodySizeChecker` `createCsrfProtection` `createIpKeyGenerator` `createRateLimiter` `createSecureCookie` `defaultHandler` `defaultKeyGenerator` `detectThreats` `embeddedIpv4` `escapeHtml` `expandIpv6` `extractClientIp` `extractCsrfTokenFromCookies` `extractCsrfTokenFromHeaders` `fullyDecodeUri` `generateCspNonce` `generateCsrfCookie` `generateCsrfToken` `generatePreflightHeaders` `generateSecurityHeaders` `generateSimpleHeaders` `getBodyLimitForContentType` `getDisallowedHeaders` `getMissingSecurityHeaders` `ipRateLimitKey` `isHopByHopHeader` `isMethodAllowed` `isNonPublicIpv6Range` `isOriginAllowed` `isPrivateHostname` `isSafeString` `isSafeUrl` `isSensitiveCookieName` `normalizePath` `parseClientIp` `parseCookieHeader` `parseMediaType` `requiresCsrfProtection` `resolveBodyLimit` `retryAfterSeconds` `sanitizeHeaderValue` `sanitizeObject` `sanitizeString` `serializeCookie` `stripHtml` `stripSensitiveCookies` `validateBodyFraming` `validateBodyLimitConfig` `validateBodySize` `validateContentLength` `validateCookieName` `validateCookieValue` `validateCspDirective` `validateCsrfToken` `validateHeaderName` `validateHeaders` `validateHeaderValue` `validateRequestTarget` `validateUrl` `verifyDoubleSubmit` `withoutStickyFlags`

Interfaces (26)

`BodyLimitConfig` `BodyLimitPresets` `ClientIpOptions` `CookieSecurityConfig` `CorsConfig` `CorsHeaders` `CsrfConfig` `CsrfCookieOptions` `CsrfProtection` `CsrfProtectionOptions` `CsrfTokenOptions` `CsrfVerifiableRequest` `HeaderSecurityConfig` `HeaderValidationResult` `InputSanitizationConfig` `IpKeyOptions` `IssuedCsrfToken` `ParsedCookie` `RateLimitConfig` `RateLimiterOptions` `RateLimitRequest` `RateLimitResponse` `RateLimitResult` `SecurityHeadersConfig` `UrlValidationConfig` `UrlValidationResult`

Type aliases (1)

`RequestTargetConfig`

Constants (10)

`cors` `DEFAULT_BODY_LIMITS` `DEFAULT_IPV6_PREFIX_LENGTH` `DEFAULT_SENSITIVE_COOKIE_NAMES` `MIN_CSRF_SECRET_LENGTH` `PROTOTYPE_POLLUTION_KEYS` `rateLimit` `SECURITY_HEADER_NAMES` `SQL_INJECTION_PATTERNS` `XSS_PATTERNS`

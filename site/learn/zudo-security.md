---
title: "Security for every public API — ZudoJS Academy"
description: "Protect the Task API from the open internet with @zudojs/security: rate limiting, CORS, CSRF, security headers, secure cookies, body limits, SSRF checks."
source: https://zudojs.oyinlola.site/learn/zudo-security
---

LEVEL 13 · LESSON 10 OF 12

Security and identity Core

# Security for every public API

Protect the Task API from the open internet with @zudojs/security: rate limiting, CORS, CSRF, security headers, secure cookies, body limits, SSRF checks.

- **50 min** to read and try
- **You need:** The Task API project, and the authentication and permissions lessons
- **You build:** A Task API that refuses login floods, other websites, oversized bodies and SSRF URLs, and sends safe headers on every response

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Rate limit logins strictly and the whole API generously, keyed on a real connection address
- Allow-list origins with CORS instead of a wildcard, and bind CSRF tokens to the session
- Send secure cookies and security headers, including a strict CSP and HSTS, on every response
- Enforce body-size limits with values checked as real numbers
- Refuse SSRF targets by URL, by resolved address and by redirect target, not by URL alone
- Treat threat detectors as a logging last line, with parameterized SQL and schema validation as the real defence

## Defense in depth

Your Task API now knows who is calling ([authentication](https://zudojs.oyinlola.site/learn/zudo-auth)) and what they may do ([permissions](https://zudojs.oyinlola.site/learn/zudo-permissions)). But once it is on the internet, anyone can send it anything: a million login attempts, a 2 GB body, a request from a web page on another site, a URL that points into your own network.

No single check stops all of that. Instead, you put several independent checks in a row, so that an attack that gets past one layer is stopped by the next. This is called **defense in depth**. Here are the layers of a public API, in the order a request meets them:

| Layer | Stops | In this lesson |
| --- | --- | --- |
| HTTPS and HSTS | Reading or changing traffic on the network. | Security headers |
| Request guard and body limit | Malformed requests, huge bodies (`413`). | Request limits |
| Rate limit | Password guessing, floods (`429`). | Rate limiting |
| CORS and CSRF | Other websites using your users' browsers. | CORS, CSRF, cookies |
| Authentication, then permissions | Unknown users (`401`), forbidden actions (`403`). | Previous two lessons |
| Validation | Bad input (`400`). | [Validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation) |
| Safe use of the input | SQL injection, XSS, SSRF. | SSRF, input checks |
| Response headers | Browsers misusing your responses. | Security headers |

ZudoJS splits this work between two packages:

- `@zudojs/security` has the **building blocks**: plain functions that answer questions like "is this origin allowed?" or "is this URL safe to fetch?". They know nothing about HTTP servers.
- `@zudojs/http` has **middleware** built on those blocks, ready to put in front of your routes: rate limiting, CORS and security headers, plus a request guard and a body limit that are on by default.

Add the building blocks to the Task API:

Terminal on your computer

```bash
$ npm install @zudojs/security
up to date, audited 7 packages in 4s

found 0 vulnerabilities
```

"up to date" is not an error. @zudojs/http already uses @zudojs/security for its own middleware, so the code was on your disk. The command adds it to your `package.json`, because your own code is about to import it directly.

> NOTE
>
> @zudojs/security uses Node.js features, so the examples in this lesson run on your computer, not in the browser terminal. Save each one in the `task-api` folder and run it with `npx tsx`, like `npx tsx rate-limit.ts`. You should see exactly the output shown under it.

## Rate limiting

A login endpoint answers one question: is this password right? An attacker who can ask a million times a minute will eventually guess. **Rate limiting** counts how many requests each client made recently and refuses the rest with `429 Too Many Requests`.

The limiter needs to know who the client is. On the internet the only thing you know for sure is the **IP address** of the connection. Here an attacker tries seven passwords from one address. To dodge the limit, they also send a different `X-Forwarded-For` header each time, a header that proxies use to say "I am forwarding for this address":

rate-limit.tsNode.js only

```ts
import { createRateLimiter, extractClientIp, retryAfterSeconds } from "@zudojs/security";

const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });

for (let attempt = 1; attempt <= 7; attempt++) {
  const headers = { "x-forwarded-for": `198.51.100.${attempt}` };
  const ip = extractClientIp(headers, { remoteAddress: "203.0.113.7" });
  const result = loginLimiter.check({ ip });
  const answer = result.allowed ? "check the password" : `429, retry in ${retryAfterSeconds(result)} seconds`;
  console.log(`attempt ${attempt} from ${ip}: ${answer}`);
}
loginLimiter.destroy();
```

Output of `npx tsx rate-limit.ts`

```ts
attempt 1 from 203.0.113.7: check the password
attempt 2 from 203.0.113.7: check the password
attempt 3 from 203.0.113.7: check the password
attempt 4 from 203.0.113.7: check the password
attempt 5 from 203.0.113.7: check the password
attempt 6 from 203.0.113.7: 429, retry in 900 seconds
attempt 7 from 203.0.113.7: 429, retry in 900 seconds
```

Five attempts in 15 minutes were allowed, then every further attempt got `429`. The fake header changed nothing: `extractClientIp` used `remoteAddress`, the real address of the connection, because anyone can type any `X-Forwarded-For` they like.

If your API runs behind a proxy or load balancer that you operate, every request seems to come from that proxy. Then pass `trustProxy: 1` (the number of proxies *you* run), and the function reads the address your proxy added, ignoring whatever the client wrote before it.

> ONE PROCESS ONLY
>
> The counts live in the memory of one process. If you run three copies of the Task API, an attacker gets `3 × max` attempts. It still slows guessing down a lot, but for an exact limit across servers you need a shared store such as Redis.

## CORS: which websites may call you

Your users log in to the Task API from your web app at `https://app.example.com`. Their browser also visits other websites. Could JavaScript on `https://evil.example` call your API and read the answer? By default the browser says no: it enforces the **same-origin policy**. An **origin** is the scheme, host and port of a page, like `https://app.example.com`.

**CORS** (Cross-Origin Resource Sharing) is how your API tells the browser "this other origin may read my responses". The browser sends an `Origin` header, and your API answers with `Access-Control-Allow-Origin` if that origin is on your list. The list must be exact. Watch how attackers try to look like your app:

cors.tsNode.js only

```ts
import { generateSimpleHeaders, isOriginAllowed } from "@zudojs/security";

const config = { origin: ["https://app.example.com"], credentials: true };

for (const origin of [
  "https://app.example.com",
  "https://app.example.com.evil.example",
  "https://evil-app.example.com",
  "http://app.example.com",
  "null",
]) {
  console.log(origin.padEnd(38), isOriginAllowed(origin, config) ?? "refused");
}
console.log(generateSimpleHeaders("https://evil.example", config));

try {
  generateSimpleHeaders("https://evil.example", { origin: "*", credentials: true });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx cors.ts`

```ts
https://app.example.com                https://app.example.com
https://app.example.com.evil.example   refused
https://evil-app.example.com           refused
http://app.example.com                 refused
null                                   refused
{ Vary: 'Origin', 'Access-Control-Allow-Credentials': 'true' }
ConfigurationError - CORS: credentials cannot be combined with a wildcard origin ("*"). Enumerate the allowed origins, or supply a function or RegExp.
```

Only the exact origin passes. A longer name that *starts* with yours, a look-alike, plain `http` and the special `null` origin (sent by sandboxed pages and local files) are all refused. For a refused origin there is no `Access-Control-Allow-Origin` header, so the browser hides the response from the evil page.

`credentials: true` means the browser may send cookies with the request. Combining it with `"*"` ("any origin may read") would let every website on the internet act as your logged-in user, so the package refuses to build that configuration at all.

> SECURITY: REGULAR EXPRESSIONS AS ORIGINS
>
> You may also pass a `RegExp`. Anchor it with `^` and `$`: `/^https:\/\/app\.example\.com$/`. Without the anchors, `/https:\/\/app\.example\.com/` also matches `https://app.example.com.evil.example`. An array of exact strings is the safest choice.

Remember what CORS is: a rule the *browser* follows. It does not stop `curl`, a script or another server from calling your API. Those are stopped by authentication, permissions and rate limits.

## CSRF: forged requests

If your web app keeps the session in a **cookie**, the browser attaches that cookie to *every* request to your API, even one started by another website. A hidden form on `evil.example` can post to `/tasks/3/delete`, and it arrives with the victim's session. The page cannot read the answer (CORS), but the damage is done. This is **Cross-Site Request Forgery**, or **CSRF**.

The defence is a **CSRF token**: a signed random value your server gives to your own pages. Every request that changes something must send it back in a header. The evil page cannot know it. A CSRF token is signed with a secret, and that secret comes from the environment. Here is what happens when it is missing:

csrf-secret.tsNode.js only

```ts
import { createCsrfProtection } from "@zudojs/security";

try {
  createCsrfProtection({ secret: process.env.CSRF_SECRET ?? "" });
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx csrf-secret.ts`

```ts
ConfigurationError - CSRF secret cannot be empty: pass a random string of at least 32 characters, e.g. randomBytes(32).toString("hex")
```

It refuses to start rather than sign tokens with an empty key. Generate a real secret once, with `openssl rand -hex 32` or the `randomBytes` call the message shows, and store it in your environment like your JWT secret. The next example makes a fresh one just for the demo, then plays four requests against a logged-in user:

csrf.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createCsrfProtection } from "@zudojs/security";

const csrf = createCsrfProtection({ secret: randomBytes(32).toString("hex") });

const ada = csrf.issue({ sessionId: "session-ada" });
const mallory = csrf.issue({ sessionId: "session-mallory" });
const cookieHeader = ada.setCookie.split(";")[0];

const attempts = [
  { name: "GET, no token needed      ", method: "GET", headers: {} },
  { name: "forged POST, no token     ", method: "POST", headers: {} },
  { name: "forged POST, mallory token", method: "POST", headers: { "x-csrf-token": mallory.token } },
  { name: "ada's own page            ", method: "POST", headers: { "x-csrf-token": ada.token } },
];
for (const { name, method, headers } of attempts) {
  console.log(name, csrf.verify({ method, headers, cookieHeader }, { sessionId: "session-ada" }));
}
console.log(ada.setCookie.replace(ada.token, "<token>"));
```

Output of `npx tsx csrf.ts`

```ts
GET, no token needed       true
forged POST, no token      false
forged POST, mallory token false
ada's own page             true
_csrf=<token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
```

Only the request that carries Ada's own token passes. The attacker cannot use a token from their own account either, because each token is tied to one session by `sessionId`: always pass it, at issue time and at verify time. Safe methods like `GET` pass without a token, so **never change data in a GET handler**.

Look at the cookie the package writes: `HttpOnly` (page scripts cannot read it), `Secure` (HTTPS only) and `SameSite=Strict` (not sent at all on requests from other sites). `SameSite` alone already blocks most CSRF in modern browsers; the token is the second layer.

> DO I NEED CSRF TOKENS?
>
> Only if the browser sends your credentials automatically, which means cookies. The Task API from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth) sends its JWT in an `Authorization` header that your own JavaScript adds. Another website cannot make the browser add that header, so that API is not open to CSRF. The moment you move the token into a cookie, add CSRF protection.

## Secure cookies

Whenever you do set a cookie, three attributes do most of the work: `Secure`, `HttpOnly` and `SameSite`. `createSecureCookie` turns all three on, and `serializeCookie` refuses combinations a browser would reject:

cookies.tsNode.js only

```ts
import { createSecureCookie, serializeCookie } from "@zudojs/security";
import type { ParsedCookie } from "@zudojs/security";

console.log(createSecureCookie("sid", "f3a9c1", { maxAge: 3600 }));

const userInput = "x; Domain=evil.example";
console.log(createSecureCookie("theme", userInput));

function attempt(cookie: ParsedCookie): void {
  try {
    console.log(serializeCookie(cookie));
  } catch (error) {
    if (error instanceof Error) console.log(error.name, "-", error.message);
  }
}
attempt({ name: "sid", value: "f3a9c1", sameSite: "none", secure: false });
attempt({ name: "sid", value: "f3a9c1", path: userInput });
attempt({ name: "sid", value: "f3a9c1", domain: "https://tasks.example" });
```

Output of `npx tsx cookies.ts`

```ts
sid=f3a9c1; Max-Age=3600; Secure; HttpOnly; SameSite=Lax
theme=x%3B%20Domain%3Devil.example; Secure; HttpOnly; SameSite=Lax
ValidationError - Cannot serialize cookie "sid": SameSite=None requires the Secure attribute
ValidationError - Cookie Path contains invalid characters (injection risk): only printable ASCII is allowed (percent-encode anything else), and ";" and "," are not, got "x; Domain=evil.example"
ValidationError - Cookie Domain contains invalid characters (injection risk): it must be a hostname (letters, digits, hyphens and dots, optionally with a leading dot), got "https://tasks.example"
```

The second line is an attack: a value that tries to add its own `Domain` attribute. It was percent-encoded into harmless text. The third call wanted a cookie sent to every site (`SameSite=None`) over plain HTTP, which is refused. The last two put text where an attribute goes: a `Path` with a `;` would start a new attribute, and a `Domain` must be a plain host name. Both are refused instead of written.

## Security headers, HSTS and CSP

**Security headers** are response headers that ask the browser to protect your users. `generateSecurityHeaders()` returns a strict default set:

headers.tsNode.js only

```ts
import { generateSecurityHeaders, validateCspDirective } from "@zudojs/security";

console.log(generateSecurityHeaders());
console.log(validateCspDirective("script-src 'self' 'unsafe-inline'"));
```

Output of `npx tsx headers.ts`

```json
{
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
}
unsafe-inline weakens CSP
```

The important ones:

- **Content-Security-Policy** (CSP) lists where a page may load scripts, styles and images from. `script-src 'self'` means "only scripts from my own origin", so a script an attacker injected into a page will not run. It is the strongest defence against XSS in the browser. `validateCspDirective` warns when a policy weakens it with `'unsafe-inline'`.
- **Strict-Transport-Security** (HSTS) tells the browser "use only HTTPS for this site for the next two years". After the first visit, nobody on the network can downgrade your users to plain HTTP. Browsers ignore it on plain HTTP responses. Only send it once your whole domain works over HTTPS, and think before keeping `preload`: it asks browsers to hard-code your domain as HTTPS-only, which is hard to undo.
- **X-Frame-Options: DENY** and `frame-ancestors 'none'` stop other sites from showing your pages inside a frame to trick users into clicking (clickjacking).
- **X-Content-Type-Options: nosniff** stops the browser from guessing that an uploaded text file is really a script.

In the Task API you do not copy these by hand: `createSecurityMiddleware()` from @zudojs/http adds a similar set to every response. You will see it in the final server.

## Request limits

Reading a request body costs memory. Without a limit, one client can send a body of several gigabytes and take your server down. The Node adapter of @zudojs/http has a limit on by default (10 MB) and answers `413 Payload Too Large` above it. A JSON API rarely needs more than a few kilobytes per request, so set `maxBodySize` much lower. Upload routes are the exception, and usually live in a separate service.

If you read bodies yourself, the security package has the same checks as functions. Be careful where the number comes from:

limits.tsNode.js only

```ts
import { createBodySizeChecker, validateContentLength } from "@zudojs/security";

console.log(validateContentLength("20000", 16_384));
console.log(validateContentLength("12abc", 16_384));
console.log(validateContentLength("512", 16_384));

try {
  createBodySizeChecker(Number(process.env.BODY_LIMIT));
} catch (error) {
  if (error instanceof Error) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx limits.ts`

```ts
Content-Length 20000 exceeds maximum 16384 bytes
Content-Length is not a valid number: 12abc
undefined
ConfigurationError - Body limit maxSize must be a finite number of bytes above 0, got: NaN
```

Each check returns an error message, or `undefined` when all is well. The last one is a classic bug: `BODY_LIMIT` is not set, `Number(undefined)` is `NaN`, and a comparison with `NaN` is always false, so a naive `size > limit` check would let every body through. The package refuses to build a checker with that limit.

## SSRF: URLs your server fetches

Imagine a feature: "paste a link, and the Task API shows a preview of the page". Your server fetches the URL. But your server sits *inside* your network. A user can paste a URL that points to something only your server can reach:

- `http://169.254.169.254/latest/meta-data/`: the cloud metadata service, which hands out the server's cloud credentials;
- `http://localhost:5432/`: your database;
- `http://10.0.0.8/admin`: an internal admin panel.

Making your server send requests for an attacker is called **Server-Side Request Forgery**, or **SSRF**. `isSafeUrl` refuses private, loopback and link-local addresses, however they are written:

ssrf.tsNode.js only

```ts
import { isSafeUrl } from "@zudojs/security";

for (const url of [
  "https://example.com/article",
  "http://169.254.169.254/latest/meta-data/",
  "http://localhost:5432/",
  "http://10.0.0.8/admin",
  "http://2130706433/",
  "http://0x7f000001/",
  "http://[::ffff:127.0.0.1]/",
  "http://user:pass@example.com/",
  "file:///etc/passwd",
]) {
  console.log(isSafeUrl(url) ? "allowed" : "blocked", url);
}
```

Output of `npx tsx ssrf.ts`

```ts
allowed https://example.com/article
blocked http://169.254.169.254/latest/meta-data/
blocked http://localhost:5432/
blocked http://10.0.0.8/admin
blocked http://2130706433/
blocked http://0x7f000001/
blocked http://[::ffff:127.0.0.1]/
blocked http://user:pass@example.com/
blocked file:///etc/passwd
```

`2130706433` and `0x7f000001` are `127.0.0.1` written as one decimal or hexadecimal number, and `[::ffff:127.0.0.1]` is the same address in IPv6 form. They are all refused, as are URLs with a password in them and every scheme except `http` and `https`.

There is one thing `isSafeUrl` cannot see: **DNS**. An attacker can register a normal-looking name, like `preview.attacker.example`, and point it at `169.254.169.254`. The URL looks public. So after the URL check, look up the name yourself and check every address it resolves to with `isPrivateHostname`. The example passes in a fake DNS table so it gives the same answer on every computer. In your app you use the real `lookup` shown in the comment:

ssrf-dns.tsNode.js only

```ts
import { isPrivateHostname, isSafeUrl } from "@zudojs/security";

type Resolver = (hostname: string) => Promise<string[]>;
// Real app: import { lookup } from "node:dns/promises";
// const resolve: Resolver = async (h) => (await lookup(h, { all: true })).map((a) => a.address);

async function checkPreviewUrl(url: string, resolve: Resolver): Promise<string> {
  if (!isSafeUrl(url)) return "blocked: not a public http(s) URL";
  const addresses = await resolve(new URL(url).hostname);
  if (addresses.length === 0 || addresses.some(isPrivateHostname)) return "blocked: resolves to a private address";
  return `ok: ${addresses.join(", ")}`;
}

const fakeDns: Record<string, string[]> = {
  "news.example.org": ["93.184.215.14"],
  "preview.attacker.example": ["169.254.169.254"],
  "mixed.attacker.example": ["93.184.215.14", "10.0.0.8"],
};
const resolve: Resolver = async (hostname) => fakeDns[hostname] ?? [];

for (const host of ["news.example.org", "preview.attacker.example", "mixed.attacker.example"]) {
  console.log(host.padEnd(25), await checkPreviewUrl(`https://${host}/page`, resolve));
}
```

Output of `npx tsx ssrf-dns.ts`

```ts
news.example.org          ok: 93.184.215.14
preview.attacker.example  blocked: resolves to a private address
mixed.attacker.example    blocked: resolves to a private address
```

> TWO MORE HOLES TO CLOSE
>
> A clever DNS server can answer "public" to your check and "private" a moment later, when `fetch` looks the name up again (**DNS rebinding**). And a public page can answer with a redirect to `http://169.254.169.254/`. So when you fetch: use `redirect: "manual"` and check every redirect target the same way, and for high-risk features connect to the exact address you checked, or send outbound requests through a proxy that only reaches the public internet.

REASON IT OUT

### checkPreviewUrl already resolved the name and found only public addresses. Is the fetch that follows now safe?

`checkPreviewUrl` resolved `preview.example`, saw a public address, and returned `ok`. Your code then calls `fetch(url)`, which resolves the same hostname *again*, on its own, to actually connect. The attacker controls the DNS server for their own domain and can answer differently each time it is asked. What does that let them do, and does resolving the name yourself before fetching actually close the hole?

**Show the reasoning**

It closes the naive version of the hole (a hostname that always points at a private address) but not the general one. Because `checkPreviewUrl` and `fetch` each do their own DNS lookup, at their own moment in time, an attacker's name server can give a public address to the first lookup and a private one to the second — the check passes, and the connection that follows goes somewhere else entirely. This is a time-of-check-to-time-of-use gap, and it exists precisely because "check the URL" and "use the URL" are two separate operations against a resource (a DNS answer) that the attacker controls and can change between them.

Closing it for real means removing the second, independent lookup: resolve the name once, verify that address, and then connect to *that exact IP* instead of letting `fetch` re-resolve the hostname — or route the request through a proxy that enforces the same allow-list at connection time, so no path to the private network exists even if a check is skipped. The general lesson is not specific to DNS: whenever a check and the action it guards are not atomic, the resource being checked can change in between.

## Input checks are the last line, not the first

@zudojs/security can look at text and guess whether it is an attack. `detectThreats` returns labels such as `SQL_INJECTION` or `XSS`. These are **heuristics**: patterns that often appear in attacks. See how well they guess:

detect.tsNode.js only

```ts
import { detectThreats, escapeHtml } from "@zudojs/security";

for (const input of [
  "Buy milk",
  "1' OR '1'='1",
  "<img src=x onerror=alert(1)>",
  "Please select a date and update the notes",
  "Meet at 5 -- bring snacks",
  "1 or true",
]) {
  console.log(JSON.stringify(input).padEnd(46), detectThreats(input));
}
console.log(escapeHtml("<img src=x onerror=alert(1)>"));
```

Output of `npx tsx detect.ts`

```ts
"Buy milk"                                     []
"1' OR '1'='1"                                 [ 'SQL_INJECTION' ]
"<img src=x onerror=alert(1)>"                 [ 'XSS' ]
"Please select a date and update the notes"    [ 'SQL_INJECTION' ]
"Meet at 5 -- bring snacks"                    [ 'SQL_INJECTION' ]
"1 or true"                                    []
&lt;img src=x onerror=alert(1)&gt;
```

Two innocent task titles were flagged as SQL injection, just for containing the words "select" and "update", or `--`. And `1 or true`, which really is an attack, was not flagged at all. Here it is against a real database, using PGlite from [the database lesson](https://zudojs.oyinlola.site/learn/zudo-database):

injection.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  CREATE TABLE tasks (id integer PRIMARY KEY, user_id text NOT NULL, title text NOT NULL);
  INSERT INTO tasks VALUES (1, 'ada', 'Buy milk'), (3, 'linus', 'Fix bug'), (4, 'grace', 'Rotate keys');
`);
const id = "1 or true"; // what the attacker put in GET /tasks/:id

// INSECURE: the id is pasted into the SQL text.
const leaked = await db.query(`SELECT id, user_id FROM tasks WHERE user_id = 'ada' AND id = ${id}`);
console.log("string-built:", leaked.rows);

// SECURE: the id is sent separately, as a value.
try {
  await db.query("SELECT id, user_id FROM tasks WHERE user_id = $1 AND id = $2", ["ada", id]);
} catch (error) {
  if (error instanceof Error) console.log("parameterized:", error.message);
}
await db.close();
```

Output of `npx tsx injection.ts`

```ts
string-built: [
  { id: 1, user_id: 'ada' },
  { id: 3, user_id: 'linus' },
  { id: 4, user_id: 'grace' }
]
parameterized: invalid input syntax for type integer: "1 or true"
```

The string-built query turned the attacker's text into SQL, and Ada received every user's tasks. The parameterized query sent `1 or true` as a *value* for an integer column, and the database refused it. That is the whole defence: no detector needed.

### Prototype pollution

One more attack hides in plain JSON. Every JavaScript object has a **prototype**, a hidden parent that it gets missing properties from. `JSON.parse` keeps a key named `__proto__` as an ordinary key. If your code then copies the keys into another object, that assignment replaces the new object's prototype, and properties the attacker chose appear out of nowhere. This is **prototype pollution**. `findUnsafeKey` looks through a parsed body, nested objects and arrays included, and returns the first `__proto__`, `constructor` or `prototype` key:

prototype.tsNode.js only

```ts
import { findUnsafeKey } from "@zudojs/security";

const text = '{"title":"Buy milk","__proto__":{"isAdmin":true}}';
const body: Record<string, unknown> = JSON.parse(text);
console.log("keys:", Object.keys(body));

// INSECURE: copy every key of the body into a new object.
const task: Record<string, unknown> = {};
for (const key of Object.keys(body)) task[key] = body[key];
console.log("BAD task.isAdmin:", task.isAdmin);

// SECURE: refuse the body before you use it.
const unsafe = findUnsafeKey(body);
if (unsafe !== undefined) console.log(`400 Bad Request: key "${unsafe}" is not allowed`);
console.log(findUnsafeKey({ title: "Buy milk", tags: [{ name: "home" }] }));
```

Output of `npx tsx prototype.ts`

```ts
keys: [ 'title', '__proto__' ]
BAD task.isAdmin: true
400 Bad Request: key "__proto__" is not allowed
undefined
```

The copy never wrote `isAdmin`, yet `task.isAdmin` is `true`: it comes from the new prototype. Code that later checks `if (task.isAdmin)` is fooled. A schema that lists the allowed keys protects you too, because it drops unknown keys. When you must handle free-form JSON, call `findUnsafeKey` first and answer 400.

So use each tool for what it is good at:

- **SQL injection**: parameterized queries, always. Nothing else.
- **XSS**: encode output for where it goes. `escapeHtml` turns `<` into `&lt;`, so text shows as text in HTML. Add a strict CSP as the second layer.
- **Bad input**: validate with a schema that says what *is* allowed ([the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation)). An allow-list beats any block-list.
- **Prototype pollution**: a schema with known keys, or `findUnsafeKey` before you merge free-form JSON.
- **Detectors**: log and alert on what `detectThreats` finds, to spot someone probing your API. Never block a request only because of it, and never treat "no threats found" as "safe".

## Put it together: the Task API under attack

Now wire the layers into the Task API with the middleware from @zudojs/http. You met the pipeline and the router in [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware). The layers that apply to every route go in the pipeline. The login rate limit goes on the login route only, because it should be much stricter than a limit for the whole API:

app.tsNode.js only

```ts
import {
  HttpMiddlewarePipeline, badRequest, createCorsMiddleware, createHttpServer, createNodeHttpAdapter,
  createRateLimitMiddleware, createResponseContext, createRouter, createSecurityMiddleware, unauthorized,
} from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";
import { isSafeUrl } from "@zudojs/security";

const router = createRouter();
const loginLimit = createRateLimitMiddleware({ windowMs: 15 * 60_000, max: 5 });

router.post("/login", () => {
  throw unauthorized("Wrong email or password"); // the attacker never guesses right
}, { middleware: [loginLimit] });
router.get("/tasks", () => createResponseContext().json([{ id: 1, title: "Buy milk" }]));
router.post("/tasks", () => createResponseContext().setStatus(201).json({ created: true }));
router.post("/previews", (ctx) => {
  const body: unknown = JSON.parse(new TextDecoder().decode(ctx.request.body as Uint8Array));
  const url = (body as { url?: unknown }).url;
  if (typeof url !== "string" || !isSafeUrl(url)) throw badRequest("That URL cannot be previewed");
  return createResponseContext().setStatus(202).json({ queued: url });
});

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(createSecurityMiddleware());
pipeline.use(createCorsMiddleware({
  allowOrigin: ["https://app.example.com"],
  credentials: true,
  allowMethods: "GET,POST",
  allowHeaders: "content-type,authorization",
}));
pipeline.use(async (context) => (await router.dispatch(context.request)).response);

export const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0, maxBodySize: 16_384 }),
  handler: (request: HttpRequestContext) => pipeline.execute(request, createResponseContext()),
});
```

The body limit is set on the adapter: 16 KB is plenty for a task. The adapter also runs a **request guard** by default, which refuses malformed requests (bad paths like `/../`, oversized headers, request-smuggling tricks) with `400` before your code sees them. The preview route only accepts a URL and queues it; the DNS check from the SSRF section runs right before the real fetch. Now attack it:

attack.tsNode.js only

```ts
import { server } from "./app.js";

await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

console.log("1. Password guessing with a fake X-Forwarded-For");
for (let i = 1; i <= 7; i++) {
  const res = await post("/login", { email: "ada@example.com", password: `guess${i}` }, { "x-forwarded-for": `198.51.100.${i}` });
  console.log(`   try ${i}:`, res.status, res.headers.get("retry-after") ?? "");
}
console.log("2. A page on another website reads /tasks");
for (const origin of ["https://app.example.com", "https://evil.example"]) {
  const res = await fetch(`${base}/tasks`, { headers: { origin } });
  console.log(`   ${origin}:`, res.status, "allow-origin =", res.headers.get("access-control-allow-origin"));
}
console.log("3. A 50 KB task title");
const big = await post("/tasks", { title: "x".repeat(50_000) });
console.log("  ", big.status, await big.text());
console.log("4. SSRF through the preview feature");
for (const url of ["http://169.254.169.254/latest/meta-data/", "http://[::ffff:10.0.0.8]/", "https://example.com/article"]) {
  const res = await post("/previews", { url });
  console.log("  ", res.status, await res.text());
}
console.log("5. Headers on every response");
const res = await fetch(`${base}/tasks`);
for (const name of ["x-frame-options", "x-content-type-options", "strict-transport-security"]) {
  console.log(`   ${name}: ${res.headers.get(name)}`);
}
await server.stop();
```

Output of `npx tsx attack.ts`

```ts
1. Password guessing with a fake X-Forwarded-For
   try 1: 401
   try 2: 401
   try 3: 401
   try 4: 401
   try 5: 401
   try 6: 429 900
   try 7: 429 900
2. A page on another website reads /tasks
   https://app.example.com: 200 allow-origin = https://app.example.com
   https://evil.example: 200 allow-origin = null
3. A 50 KB task title
   413 {"error":"Payload Too Large"}
4. SSRF through the preview feature
   400 {"error":"That URL cannot be previewed","code":"BAD_REQUEST"}
   400 {"error":"That URL cannot be previewed","code":"BAD_REQUEST"}
   202 {"queued":"https://example.com/article"}
5. Headers on every response
   x-frame-options: DENY
   x-content-type-options: nosniff
   strict-transport-security: max-age=31536000; includeSubDomains; preload
```

Every attack was stopped by a different layer:

1. Five wrong passwords got `401`, then the limiter answered `429` with `Retry-After: 900` (seconds). Changing `X-Forwarded-For` did not help: the adapter does not trust that header unless you configure `trustProxy`, so it keyed the limit on the real connection address.
2. The evil origin got its data sent, but no `Access-Control-Allow-Origin` header (`null` is what `headers.get` returns for a missing header), so the browser hides the response from its script. The status is still `200` because CORS is enforced by the browser, not by the server.
3. The oversized body was refused with `413` before any route ran.
4. The metadata address and the IPv6 form of a private address got `400`. A public URL was accepted.
5. The security middleware added its headers to every response.

> THAT HEADER CHECK ONLY ASKED A 200
>
> Step 5 above only asks a plain `200` response for its headers. In the published `@zudojs/http` 1.4.4, a response built outside the normal route return — the `401` from a thrown `unauthorized()`, the adapter's own `413` for an oversized body, or an uncaught `500` — comes back without `createSecurityMiddleware()`'s headers, because the pipeline never gets to run on it. [A production security review](https://zudojs.oyinlola.site/learn/zudo-production-security) covers checking every status code a route can return, not just its happy path.

Run it on your computer. Both files go in the same folder:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx attack.ts
```

`tsc` prints nothing, and `attack.ts` prints the report above.

## Practice

TRY IT YOURSELF

### A second limiter for the whole API

Besides the strict login limit, add a generous limit for every route: 3 requests per minute for this exercise (use something like 300 in real life). Build it with `createRateLimiter` from @zudojs/security and check it for one IP, four times.

**Show a solution**

api-limit.tsNode.js only

```ts
import { createRateLimiter } from "@zudojs/security";

const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });
for (let request = 1; request <= 4; request++) {
  const result = apiLimiter.check({ ip: "203.0.113.7" });
  console.log(request, result.allowed ? "ok" : "429", "remaining:", result.remaining);
}
apiLimiter.destroy();
```

Output of `npx tsx api-limit.ts`

```ts
1 ok remaining: 2
2 ok remaining: 1
3 ok remaining: 0
4 429 remaining: 0
```

In the Task API, pass the same options to `createRateLimitMiddleware` and add it to the pipeline with `pipeline.use`, so it runs for every route.

TRY IT YOURSELF

### Allow a staging app

Your team also runs a staging copy of the web app at `https://staging.app.example.com`. Change the CORS configuration so it is allowed too, and prove that `https://staging.app.example.com.evil.example` is still refused.

**Show a solution**

staging.tsNode.js only

```ts
import { isOriginAllowed } from "@zudojs/security";

const config = {
  origin: ["https://app.example.com", "https://staging.app.example.com"],
  credentials: true,
};
for (const origin of ["https://staging.app.example.com", "https://staging.app.example.com.evil.example"]) {
  console.log(origin, isOriginAllowed(origin, config) ?? "refused");
}
```

Output of `npx tsx staging.ts`

```ts
https://staging.app.example.com https://staging.app.example.com
https://staging.app.example.com.evil.example refused
```

Adding another exact string is the safe way. In a real app, read the list from configuration, one origin per environment.

TRY IT YOURSELF

### Which layer stops it?

For each attack, name the layer that stops it: (a) a script on `evil.example` reads a user's tasks with `fetch`; (b) a hidden form on `evil.example` posts to the API using the user's session cookie; (c) a user sets their avatar URL to `http://localhost:6379/`; (d) a task title contains `<script>`.

**Show a solution**

(a) CORS: the browser hides the response because the origin is not on the allow-list. (b) CSRF protection: the form cannot send the token, and a `SameSite` cookie is not sent at all. (c) SSRF checks: `isSafeUrl` refuses `localhost`, and the DNS check refuses names that point to private addresses. (d) Output encoding: `escapeHtml` (or your frontend framework) shows it as text, and the CSP stops injected scripts from running. A detector may log it, but it is not the defence.

## Recap

- Defense in depth: several independent layers, so one mistake is not a breach.
- Rate limit logins strictly, and the whole API generously. Key on the real connection address; trust `X-Forwarded-For` only from proxies you run (`trustProxy`).
- CORS is an exact allow-list of origins. Never `*` with credentials, and anchor any `RegExp`. CORS only binds browsers.
- Cookie sessions need CSRF tokens bound to the session. Cookies should be `Secure`, `HttpOnly` and `SameSite`. Secrets come from the environment.
- Send security headers on every response: a strict CSP, HSTS once you are fully on HTTPS, `nosniff`, and frame protection.
- Limit body size, and check that limits read from the environment are real numbers.
- Before fetching a user's URL: `isSafeUrl`, then resolve the name and check every address, and handle redirects.
- Threat detectors are a last line for logging. Parameterized SQL, output encoding and schema validation are the real defences.

The Task API is now protected at every layer. Next, [Caching](https://zudojs.oyinlola.site/learn/zudo-cache) keeps copies of slow results so it can also answer fast.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

---
title: "Browser attacks and defences — ZudoJS Academy"
description: "Find and fix CSRF, CORS mistakes and XSS in small Node.js apps, add a Content-Security-Policy and security headers, and prove every fix with a test."
source: https://zudojs.oyinlola.site/learn/sec-web
---

LEVEL 10 · LESSON 3 OF 6

Attacks and defences Core

# Browser attacks and defences

Find and fix CSRF, CORS mistakes and XSS in small Node.js apps, add a Content-Security-Policy and security headers, and prove every fix with a test.

- **60 min** to read and try
- **You need:** Networking from JavaScript, The DOM, and Security for every public API
- **You build:** A small wallet app and a shop review page, first vulnerable, then fixed, each fix proven by node:test tests and a code-review checklist

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why the browser's automatic cookies make CSRF possible, and fix it with SameSite cookies, CSRF tokens and origin checks
- Recognise a CORS policy that reflects any origin with credentials, and replace it with an exact allow-list
- Tell stored, reflected and DOM XSS apart, and encode output for the context it lands in
- Add a nonce-based Content-Security-Policy and the other security headers, and know what each one stops
- Write tests that prove each fix, and spot each weakness in code review

## A transfer nobody clicked

Ada uses a small wallet app. She logs in, checks that she has ₦80,000, and leaves the tab open. Later she opens a link to a page of shopping deals on a completely different website. She clicks nothing there. When she comes back to the wallet, ₦50,000 has gone to an account called `mallory`.

Nobody stole her password. Nobody broke into the server. Her own browser sent the transfer request, with her own login cookie, because a page on another site asked it to. The wallet server saw a valid session and did what it was told.

This lesson is about the attacks that use the browser like that: a victim's browser, holding the victim's credentials, made to act for someone else. There are three families, and each has a well-known fix:

- **CSRF** (cross-site request forgery): another site makes the browser *send* a request to your app.
- **CORS misconfiguration**: your app tells the browser that another site may *read* its responses.
- **XSS** (cross-site scripting): someone gets their script to *run inside* your pages.

Each section follows the same five steps, the way a security review works: the vulnerable pattern in a tiny local app, why it is unsafe (shown against that toy app only), the fix, a test that proves the fix, and how to spot the pattern in code review. You met the building blocks already: the same-origin policy and CORS in [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking), `textContent` versus `innerHTML` in [The DOM](https://zudojs.oyinlola.site/learn/browser-dom), and the ZudoJS middleware that applies these defences in [Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security). Here you go underneath: what exactly goes wrong, and why each fix works.

REASON IT OUT

### What does the browser do on its own?

Before you look at any code, think about Ada's browser:

- Ada is logged in to the wallet. A page on another site submits a form to `http://wallet.localhost/transfer`. Which parts of that request does the other site control, and which does the browser add by itself?
- Can the other page read the wallet's answer? Does it need to?
- What could the wallet server look at to tell "Ada clicked Send on our page" from "another site made her browser send this"?
- Which of those signals could the other site fake?

**Show the reasoning**

The other site controls the URL, the method (`GET` or `POST` for a form) and the form fields: `to=mallory&amount=50000`. The browser adds the wallet's cookies, because cookies are attached to every request to the wallet's host, whoever started it. That is called **ambient authority**: the credential travels with the request automatically. The browser also adds headers the page cannot change, such as `Origin` and `Sec-Fetch-Site`.

The other page cannot read the answer (the same-origin policy blocks that), but it does not need to: the transfer already happened. So the server must decide *before acting*. It can check something the other site cannot know (a secret CSRF token in the form), something the browser sets and pages cannot fake (`Origin`, `Sec-Fetch-Site`), and it can ask the browser not to send the cookie on cross-site requests at all (`SameSite`). The form fields and the URL prove nothing, because the other site wrote them.

## CSRF: requests your user never meant to send

### The vulnerable pattern

Here is the wallet. It is a plain `node:http` server, like the one from [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http), kept small so the security logic stands out. A login stores a random session id in a cookie; `POST /transfer` moves money for whoever the cookie says you are:

wallet-v1.js

```ts
// INSECURE: this is the version with the bugs.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const balances = new Map([["ada", 80_000], ["mallory", 0]]);
const sessions = new Map(); // session id -> user name

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value;
  }
  return undefined;
}

async function readForm(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}

export function createWallet() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://wallet.localhost");
    if (req.method === "POST" && url.pathname === "/login") {
      const form = await readForm(req); // the password check is left out of this toy
      const sid = randomBytes(16).toString("hex");
      sessions.set(sid, form.get("user"));
      res.writeHead(204, { "set-cookie": `sid=${sid}; Path=/; HttpOnly` }).end();
      return;
    }
    const user = sessions.get(readCookie(req, "sid"));
    if (user === undefined) return res.writeHead(401).end("log in first");

    if (req.method === "POST" && url.pathname === "/transfer") {
      const form = await readForm(req);
      const to = form.get("to");
      const amount = Number(form.get("amount"));
      if (!balances.has(to) || !Number.isInteger(amount) || amount <= 0 || amount > balances.get(user)) {
        return res.writeHead(400).end("bad transfer");
      }
      balances.set(user, balances.get(user) - amount);
      balances.set(to, balances.get(to) + amount);
      return res.writeHead(303, { location: "/" }).end();
    }
    if (url.pathname === "/api/balance") {
      const headers = { "content-type": "application/json" };
      if (req.headers.origin) {
        headers["access-control-allow-origin"] = req.headers.origin; // INSECURE: see the CORS section
        headers["access-control-allow-credentials"] = "true";
      }
      return res.writeHead(200, headers).end(JSON.stringify({ user, balance: balances.get(user) }));
    }
    res.writeHead(404).end();
  });
}
```

The transfer handler checks the amount carefully. It still has a hole, and the hole is not in any single line: it is that the handler trusts the cookie to mean "Ada wants this".

### Why it is unsafe

When the deals page submits its hidden form, Ada's browser sends a request like this. Everything except the `Cookie`, `Origin` and `Sec-Fetch-Site` lines was written by the other site:

```ts
POST /transfer HTTP/1.1
Host: wallet.localhost
Cookie: sid=9f2c…
Origin: http://deals.example
Sec-Fetch-Site: cross-site
Content-Type: application/x-www-form-urlencoded

to=mallory&amount=50000
```

Node.js is not a browser, so the demonstration below plays Ada's browser: it logs in, keeps the cookie, and then sends exactly that request to the toy wallet on your own computer:

csrf-demo.jsNode.js only

```ts
import { once } from "node:events";
import { balances, createWallet } from "./wallet-v1.js";

const server = createWallet().listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}`;

const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ user: "ada" }) });
const setCookie = login.headers.get("set-cookie");
console.log("cookie attributes:", setCookie.split("; ").slice(1));
const cookie = setCookie.split(";")[0];

// What Ada's browser sends when the other site's form is submitted:
const forged = await fetch(`${base}/transfer`, {
  method: "POST",
  redirect: "manual",
  headers: {
    cookie,
    origin: "http://deals.example",
    "sec-fetch-site": "cross-site",
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "to=mallory&amount=50000",
});
console.log("forged request:", forged.status);
console.log(Object.fromEntries(balances));
server.close();
```

Output of `node csrf-demo.js`

```ts
cookie attributes: [ 'Path=/', 'HttpOnly' ]
forged request: 303
{ ada: 30000, mallory: 50000 }
```

The server answered `303` ("done, go back to the home page") and moved the money. From its point of view nothing was wrong: the session was valid and the amount was fine. Look at the cookie attributes too: `HttpOnly` stops page scripts from *reading* the cookie, but it does nothing about the browser *sending* it.

Three facts make CSRF possible, and each fix removes one of them:

1. The browser attaches the cookie to cross-site requests. Fix: `SameSite`.
2. Everything in the request is predictable, so another site can write it. Fix: a secret **CSRF token** the other site cannot know.
3. The server does not ask where the request came from. Fix: check `Origin` and `Sec-Fetch-Site`.

### Fix 1: SameSite cookies

The `SameSite` cookie attribute tells the browser when to leave the cookie off. A **site** is the scheme plus the registrable domain: `https://app.wallet.example` and `https://api.wallet.example` are the same site, `https://deals.example` is another one.

| Value | Cookie sent on requests started by another site? | Good for |
| --- | --- | --- |
| `Strict` | Never, not even when the user follows a link to you | Cookies that authorise money moves or admin actions |
| `Lax` | Only on top-level `GET` navigation (clicking a link) | Normal session cookies: links from email still arrive logged in |
| `None` | Always (requires `Secure`) | Only cookies that must work inside other sites, such as an embedded widget |

With `SameSite=Lax`, the forged `POST` above arrives without a cookie and gets `401`. `Lax` still sends the cookie on a cross-site `GET` link, which is one more reason why a `GET` handler must never change anything. Always write the attribute explicitly: Chromium treats a cookie without `SameSite` as `Lax`, but not every browser does, and Chromium makes a short exception for fresh cookies on cross-site `POST`.

> SAMESITE IS NOT ENOUGH ON ITS OWN
>
> "Same site" includes every subdomain of your domain. If `blog.wallet.example` runs someone else's code, or a forgotten subdomain can be taken over, requests from it count as same-site. Old browsers ignore the attribute. Treat `SameSite` as the first layer and add a token or an origin check.

### Fix 2: a CSRF token

A **CSRF token** is a random value the server creates for each session and puts into its own forms as a hidden field. A state-changing request is accepted only if it carries the token of *this* session. Another site cannot read your pages (same-origin policy), so it cannot learn the token. This design is called the **synchronizer token pattern**. Compare the token with `timingSafeEqual` from [node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#timing), so the comparison time does not reveal how many characters matched.

### Fix 3: check where the request came from

Browsers add two headers that page JavaScript cannot set or change. `Origin` is the origin of the page that started a request; browsers send it on every `POST`. `Sec-Fetch-Site` (one of the **Fetch Metadata** headers) says how the request relates to the target: `same-origin`, `same-site`, `cross-site`, or `none` when the user typed the address. A server can refuse every state-changing request that does not come from its own origin, before it even reads the body.

Here is the fixed wallet with all three layers. Only the changed parts are new; the helpers are the same as before:

wallet-v2.js

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const APP_ORIGIN = "http://wallet.localhost"; // from configuration in a real app
const TRUSTED_ORIGINS = new Set([APP_ORIGIN, "http://mobile.wallet.localhost"]);

export const balances = new Map([["ada", 80_000], ["mallory", 0]]);
const sessions = new Map(); // session id -> { user, csrf }

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === name) return value;
  }
  return undefined;
}

async function readForm(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}

function sameSecret(a, b) {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b ?? "");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

function fromOurOwnPage(req) {
  if (req.headers.origin !== undefined) return req.headers.origin === APP_ORIGIN;
  const site = req.headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

function corsHeaders(req) {
  const headers = { vary: "Origin" };
  if (TRUSTED_ORIGINS.has(req.headers.origin)) {
    headers["access-control-allow-origin"] = req.headers.origin;
    headers["access-control-allow-credentials"] = "true";
  }
  return headers;
}

export function createWallet() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, APP_ORIGIN);
    const changesState = req.method !== "GET" && req.method !== "HEAD";
    if (changesState && !fromOurOwnPage(req)) return res.writeHead(403).end("cross-site request refused");

    if (req.method === "POST" && url.pathname === "/login") {
      const form = await readForm(req);
      const sid = randomBytes(16).toString("hex");
      sessions.set(sid, { user: form.get("user"), csrf: randomBytes(32).toString("base64url") });
      const cookie = `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax`;
      return res.writeHead(204, { "set-cookie": cookie }).end();
    }
    const session = sessions.get(readCookie(req, "sid"));
    if (session === undefined) return res.writeHead(401).end("log in first");
    const { user } = session;

    if (req.method === "GET" && url.pathname === "/transfer") {
      const form = `<form method="post" action="/transfer">
  <input type="hidden" name="_csrf" value="${session.csrf}">
  <input name="to"> <input name="amount"> <button>Send</button>
</form>`;
      return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(form);
    }
    if (req.method === "POST" && url.pathname === "/transfer") {
      const form = await readForm(req);
      if (!sameSecret(form.get("_csrf"), session.csrf)) return res.writeHead(403).end("bad CSRF token");
      const to = form.get("to");
      const amount = Number(form.get("amount"));
      if (!balances.has(to) || !Number.isInteger(amount) || amount <= 0 || amount > balances.get(user)) {
        return res.writeHead(400).end("bad transfer");
      }
      balances.set(user, balances.get(user) - amount);
      balances.set(to, balances.get(to) + amount);
      return res.writeHead(303, { location: "/" }).end();
    }
    if (url.pathname === "/api/balance") {
      const headers = { "content-type": "application/json", ...corsHeaders(req) };
      return res.writeHead(200, headers).end(JSON.stringify({ user, balance: balances.get(user) }));
    }
    res.writeHead(404).end();
  });
}
```

The session id is still random, but the cookie now carries `Secure` and `SameSite=Lax`. Every non-`GET` request is checked for its origin first. A request with no `Origin` and no `Sec-Fetch-Site` (such as `curl` or an old browser) passes this layer, because it cannot be a forged browser request with Ada's cookie, and the token check still applies to it.

### A test that proves the fix

A fix you cannot demonstrate is a fix you will lose in the next refactor. This test uses `node:test` (from [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics)) and plays every request from the attack, plus the legitimate one:

wallet-v2.test.jsNode.js only

```ts
import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { balances, createWallet } from "./wallet-v2.js";

const server = createWallet();
let base = "";
let cookie = "";

before(async () => {
  server.listen(0);
  await once(server, "listening");
  base = `http://localhost:${server.address().port}`;
  const own = { origin: "http://wallet.localhost", "sec-fetch-site": "same-origin" };
  const login = await fetch(`${base}/login`, { method: "POST", headers: own, body: "user=ada" });
  cookie = login.headers.get("set-cookie").split(";")[0];
});
after(() => server.close());

function transfer(headers, body) {
  return fetch(`${base}/transfer`, {
    method: "POST", redirect: "manual", body,
    headers: { cookie, "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}
const ownPage = { origin: "http://wallet.localhost", "sec-fetch-site": "same-origin" };

test("a cross-site POST is refused before it is read", async () => {
  const res = await transfer({ origin: "http://deals.example", "sec-fetch-site": "cross-site" }, "to=mallory&amount=50000");
  assert.equal(res.status, 403);
  assert.equal(balances.get("ada"), 80_000);
});

test("our own origin without the token is refused", async () => {
  const res = await transfer(ownPage, "to=mallory&amount=50000");
  assert.equal(res.status, 403);
});

test("the form page carries the token, and the transfer works with it", async () => {
  const page = await (await fetch(`${base}/transfer`, { headers: { cookie } })).text();
  const token = page.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await transfer(ownPage, new URLSearchParams({ _csrf: token, to: "mallory", amount: "5000" }));
  assert.equal(res.status, 303);
  assert.equal(balances.get("ada"), 75_000);
});
```

Output of `node wallet-v2.test.js`

```ts
✔ a cross-site POST is refused before it is read (60.603169ms)
✔ our own origin without the token is refused (4.240197ms)
✔ the form page carries the token, and the transfer works with it (8.283538ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 87.98418
```

Notice the second test. It sends a request that passes the origin check, to prove the token check works on its own. Each layer gets its own test, so that removing one layer by accident makes a test fail even though the other layer still blocks the attack.

### Spotting CSRF in code review

- Any route that changes data on `GET`. Search for handlers that write, delete or send inside a `GET` branch.
- `Set-Cookie` for a session without `SameSite`, or with `SameSite=None`.
- Cookie-authenticated `POST`, `PUT`, `PATCH` and `DELETE` routes with no token check and no origin check. Ask: "which middleware refuses a request from another site, and where is its test?"
- Token comparisons with `===`, tokens not tied to a session, or one token shared by all users.
- APIs that take their token from an `Authorization` header that your own JavaScript adds are not open to CSRF: another site cannot make the browser add that header. The risk returns the moment the token moves into a cookie.

## CORS misconfiguration: letting other sites read

### The vulnerable pattern

The wallet has a JSON endpoint, `/api/balance`, for its mobile web app on another origin. Getting CORS to "just work" during development, someone wrote the version in `wallet-v1.js`: copy whatever `Origin` the request has into `Access-Control-Allow-Origin`, and allow credentials. It works for the mobile app. It also works for everyone else.

### Why it is unsafe

From [Networking from JavaScript](https://zudojs.oyinlola.site/learn/browser-networking#cors) you know the browser's rule: a page may read a credentialed cross-origin response only if `Access-Control-Allow-Origin` names exactly that page's origin and `Access-Control-Allow-Credentials` is `true`. Reflecting the origin satisfies that rule for *every* origin. Ask the toy wallet as the deals page would:

cors-demo.jsNode.js only

```ts
import { once } from "node:events";
import { createWallet as createV1 } from "./wallet-v1.js";
import { createWallet as createV2 } from "./wallet-v2.js";

async function ask(createWallet, origin) {
  const server = createWallet().listen(0);
  await once(server, "listening");
  const base = `http://localhost:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: "POST", body: "user=ada", headers: { origin: "http://wallet.localhost" },
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const res = await fetch(`${base}/api/balance`, { headers: { cookie, origin } });
  server.close();
  return `allow-origin=${res.headers.get("access-control-allow-origin")} credentials=${res.headers.get("access-control-allow-credentials")}`;
}

for (const origin of ["http://mobile.wallet.localhost", "http://deals.example"]) {
  console.log("v1", origin.padEnd(31), await ask(createV1, origin));
}
for (const origin of ["http://mobile.wallet.localhost", "http://deals.example"]) {
  console.log("v2", origin.padEnd(31), await ask(createV2, origin));
}
```

Output of `node cors-demo.js`

```ts
v1 http://mobile.wallet.localhost  allow-origin=http://mobile.wallet.localhost credentials=true
v1 http://deals.example            allow-origin=http://deals.example credentials=true
v2 http://mobile.wallet.localhost  allow-origin=http://mobile.wallet.localhost credentials=true
v2 http://deals.example            allow-origin=null credentials=null
```

With v1, the deals page gets permission to read Ada's balance with her cookie. CSRF only let the other site *act* blindly; this lets it *read* everything the API returns: balances, names, and any CSRF token an endpoint hands out, which then defeats the token defence too. With v2, the deals page gets no CORS headers, so the browser hides the answer from it.

### The fix: an exact allow-list

The fixed `corsHeaders` in `wallet-v2.js` does three things. It compares the origin against a `Set` of exact strings, loaded from configuration. It adds `Vary: Origin` in every case, so a shared cache never serves one origin's answer (with its permission header) to another. And it adds nothing at all for an unknown origin. The allow-list check is where hand-written code usually goes wrong, so test the check on its own, with the near misses that fool common shortcuts:

origin-check.js

```ts
const TRUSTED = new Set(["https://wallet.example", "https://mobile.wallet.example"]);

const checks = {
  "endsWith (buggy) ": (origin) => origin.endsWith("wallet.example"),
  "includes (buggy) ": (origin) => origin.includes("wallet.example"),
  "regex, no anchors": (origin) => /https:\/\/(mobile\.)?wallet\.example/.test(origin),
  "exact Set        ": (origin) => TRUSTED.has(origin),
};
const origins = [
  "https://wallet.example",
  "https://evilwallet.example",
  "https://wallet.example.deals.test",
  "http://wallet.example",
  "null",
];

for (const [name, allowed] of Object.entries(checks)) {
  console.log(name, origins.map((o) => (allowed(o) ? "Y" : ".")).join(" "));
}
```

Output of `node origin-check.js` and of the browser terminal

```ts
endsWith (buggy)  Y Y . Y .
includes (buggy)  Y Y Y Y .
regex, no anchors Y . Y . .
exact Set         Y . . . .
```

Read the columns as the five origins in order. `endsWith` accepts any domain that happens to end in the same letters, and plain `http`. `includes` accepts all of those plus a domain that merely contains yours. The unanchored regular expression accepts `https://wallet.example.deals.test`. Only the exact set accepts exactly one origin. Never allow the `null` origin either: sandboxed frames and local files send it, and an attacker can produce it on purpose.

### Spotting CORS mistakes in code review

- `req.headers.origin` copied into a response header without a lookup in a fixed list.
- `Access-Control-Allow-Credentials: true` anywhere near `*`, a reflected origin, or `null`.
- Origin checks built from `endsWith`, `includes`, `startsWith` or a regular expression without `^` and `$`.
- A missing `Vary: Origin` when the answer depends on the origin.
- CORS treated as access control. CORS only instructs browsers; `curl` ignores it. Authentication and permissions protect the data; CORS only decides which browser pages may read it.

## XSS: someone else's script in your page

**Cross-site scripting** (**XSS**) happens when data from a user ends up in a page as *markup or code* instead of as text. Once an attacker's script runs in your origin, the same-origin policy protects the attacker: their script can read the page, read CSRF tokens, and send requests with the user's cookies. That is why XSS defeats every defence in the two sections above. There are three forms, told apart by where the data comes from:

| Form | Where the data comes from | Where it becomes markup |
| --- | --- | --- |
| **Stored** | Saved earlier (a review, a task title, a display name) | Server-side HTML, for every visitor |
| **Reflected** | The current request (a search box, an error message) | Server-side HTML, for whoever opens the link |
| **DOM-based** | The page's own URL, `postMessage`, `localStorage` | The browser, when page JavaScript writes it with `innerHTML` or similar |

The fix is the same idea in all three: **encode output for the context it goes into**, and prefer APIs that cannot interpret text as markup at all.

### Stored and reflected: the vulnerable pattern

A shop shows customer reviews on a product page and has a search page. Both build HTML with template strings:

pages-v1.js

```ts
// INSECURE: data is pasted into HTML.
export function productPage(product, reviews) {
  const items = reviews.map((r) => `<li><b>${r.author}</b>: ${r.text}</li>`).join("\n");
  return `<h1>${product}</h1>\n<ul>\n${items}\n</ul>`;
}

export function searchPage(query, results) {
  return `<p>${results.length} results for ${query}</p>`;
}
```

### Why it is unsafe

The smallest demonstration is enough: text that contains a tag comes out as a tag. A browser would build a real element from it, and an element can carry attributes that run code:

xss-demo.js

```ts
import { productPage, searchPage } from "./pages-v1.js";

const reviews = [
  { author: "Bola", text: "Arrived in two days." },
  { author: "Kemi", text: "Good rice, <u>but</u> the bag was torn." },
];
console.log(productPage("Rice 50kg", reviews));

const query = new URL("http://shop.localhost/search?q=%3Ci%3Erice%3C/i%3E").searchParams.get("q");
console.log(searchPage(query, []));
```

Output of `node xss-demo.js` and of the browser terminal

```ts
<h1>Rice 50kg</h1>
<ul>
<li><b>Bola</b>: Arrived in two days.</li>
<li><b>Kemi</b>: Good rice, <u>but</u> the bag was torn.</li>
</ul>
<p>0 results for <i>rice</i></p>
```

Kemi's `<u>` is **stored** XSS: every visitor's browser gets it as markup. The search term is **reflected** XSS: it comes from the link itself, so anyone who can get a victim to open a link decides what markup appears. An underline is harmless; the point is that the *user* decides which elements your page contains. You saw in [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#content) how an element with an event-handler attribute then runs code.

### The fix: encode by default

**Output encoding** replaces the characters that mean something in the target language with a form that means "this character, as text". For HTML text and quoted attribute values that is five characters. Rather than remembering to call an escape function at every `${…}`, make escaping the default: a **tagged template** that escapes every value unless it is already safe HTML. That is how template engines and JSX work:

html.js

```ts
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

function encode(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(encode).join("");
  return escapeHtml(value);
}

/** Every ${value} is escaped, unless it is a SafeHtml made by this same function. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => (out += encode(value) + strings[i + 1]));
  return new SafeHtml(out);
}
```

pages-v2.js

```ts
import { html } from "./html.js";

export function productPage(product, reviews) {
  const items = reviews.map((r) => html`<li><b>${r.author}</b>: ${r.text}</li>\n`);
  return html`<h1>${product}</h1>\n<ul>\n${items}</ul>`.toString();
}

export function searchPage(query, results) {
  return html`<p>${results.length} results for ${query}</p>`.toString();
}
```

Nested templates (the list items) are `SafeHtml` and pass through; every plain string is escaped. There is no `raw()` function to "turn escaping off": a way out is where the next bug would hide.

### A test that proves the fix

The test checks two things: dangerous characters never reach the output as markup, and the text still reads the same to the user (escaping must not corrupt data). The helper `decode` plays the part of the browser turning entities back into characters:

pages.test.jsNode.js only

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { productPage, searchPage } from "./pages-v2.js";

const decode = (s) =>
  s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]);

test("review text cannot add tags", () => {
  const page = productPage("Rice 50kg", [{ author: "Kemi", text: "Good rice, <u>but</u> torn" }]);
  assert.equal(page.match(/<u>/g), null);
  assert.ok(decode(page).includes("Good rice, <u>but</u> torn"));
});

test("the search term is shown as text", () => {
  const page = searchPage(`<i>rice</i> & "beans"`, []);
  assert.equal(page, "<p>0 results for &lt;i&gt;rice&lt;/i&gt; &amp; &quot;beans&quot;</p>");
});

test("our own markup survives", () => {
  assert.match(productPage("Rice", [{ author: "Bola", text: "ok" }]), /<li><b>Bola<\/b>: ok<\/li>/);
});
```

Output of `node pages.test.js`

```ts
✔ review text cannot add tags (2.012034ms)
✔ the search term is shown as text (0.368414ms)
✔ our own markup survives (0.41686ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 15.235085
```

### One encoding does not fit every context

HTML escaping is right for text between tags and for attribute values in quotes. Data lands in other places too, and each has its own rules:

| Context | Example | What to do |
| --- | --- | --- |
| HTML text | `<p>${name}</p>` | HTML-escape (`& < > " '`) |
| Quoted attribute | `<input value="${name}">` | HTML-escape, and always quote the attribute |
| URL attribute | `<a href="${site}">` | Parse with `URL`, allow only `https:` (and `http:`), then HTML-escape |
| Inside `<script>` | initial page data | `JSON.stringify`, then replace `<` with `\u003c` |
| Event attributes, `style`, unquoted attributes | `onclick="${…}"` | Never put data there |

The script context is a classic trap. `JSON.stringify` makes a valid JavaScript value, but the HTML parser runs *first*, and it ends the script at the first `</script` it sees, even inside a string:

script-context.js

```ts
const state = { cart: [{ item: "Rice 50kg", note: "leave at gate </script><b>hi</b>" }] };

const unsafe = `<script>window.STATE = ${JSON.stringify(state)}</script>`;
const safe = `<script>window.STATE = ${JSON.stringify(state).replaceAll("<", "\\u003c")}</script>`;

console.log("unsafe closes the script early:", unsafe.indexOf("</script>") < unsafe.length - 9);
console.log("safe closes it only at the end: ", safe.indexOf("</script>") === safe.length - 9);
console.log(JSON.parse(JSON.stringify(state).replaceAll("<", "\\u003c")).cart[0].note);
```

`\u003c` is how JSON writes `<` as an escape sequence, so the data reads back unchanged (last line), while the HTML parser never sees a closing tag.

### DOM-based XSS

In DOM-based XSS the server may send a perfectly safe page. The page's own JavaScript takes a **source** an attacker can influence (the URL, `location.hash`, a `postMessage`, stored data) and writes it into a **sink** that interprets markup or code: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout` with a string, or an `href`/`src` that can hold a `javascript:` URL. Here is a profile card that shows a name and a website from the URL:

index.html

```ts
<!DOCTYPE html>
<html>
<body>
  <div class="card">
    <h2 id="name"></h2>
    <a id="site">website</a>
  </div>
</body>
</html>
```

dom-xss.js

```ts
const params = new URLSearchParams("?name=Ada%20%3Cb%3EObi%3C/b%3E&site=javascript:void(0)");
const heading = document.querySelector("#name");
const link = document.querySelector("#site");

// INSECURE: markup sink, and a URL used without checking its scheme
heading.innerHTML = params.get("name");
link.setAttribute("href", params.get("site"));
console.log("elements inside the heading:", heading.children.length);
console.log("link scheme:", link.protocol);

// FIXED: a text sink, and an allow-list of URL schemes
function safeHref(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
heading.textContent = params.get("name");
const href = safeHref(params.get("site"));
if (href === null) link.removeAttribute("href");
else link.href = href;
console.log("elements inside the heading:", heading.children.length);
console.log("text shown:", heading.textContent);
console.log("link has href:", link.hasAttribute("href"));
console.log(safeHref("https://ada.example/about"));
```

What the browser terminal prints

```ts
elements inside the heading: 1
link scheme: javascript:
elements inside the heading: 0
text shown: Ada <b>Obi</b>
link has href: false
https://ada.example/about
```

The unsafe version turned the name into a real `<b>` element, and gave the link a `javascript:` URL, which runs code when clicked. The fixed version shows exactly what was in the URL, as text, and refuses any scheme except `http` and `https`. The URL check parses with `URL` instead of testing whether the string *starts with* `https`: parsing is how the browser will read it, so parsing is what you check.

### When you really must accept HTML

A rich-text editor for product descriptions needs bold, lists and links. Then escaping is wrong, because the markup is the content. Use a well-maintained **HTML sanitizer** such as DOMPurify: it parses the HTML and keeps only an allow-list of harmless tags and attributes. Never write your own with regular expressions; HTML parsing has too many edge cases, and the sanitizer libraries have spent years on them.

### Spotting XSS in code review

- Search for the sinks: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string `setTimeout`. In frameworks: React's `dangerouslySetInnerHTML`, Vue's `v-html`, Angular's `bypassSecurityTrust…`.
- Server-side HTML built with plain template strings or `+`, instead of an auto-escaping template engine.
- `href`, `src` or `action` set from user data without a scheme allow-list.
- `JSON.stringify` inside a `<script>` without escaping `<`.
- User data in responses sent as `text/html` by a JSON API: always send `application/json`, so the browser never renders it as a page.

## Content-Security-Policy: the second layer

Output encoding is the real fix, but one missed `innerHTML` in a large app is enough for an XSS bug. A **Content-Security-Policy** (CSP) is a response header that tells the browser which scripts it may run in this page. If the policy allows only scripts you marked, an injected script or event-handler attribute is refused even when the encoding bug exists. It turns "attacker's code runs" into "the browser logs a violation".

### Seeing CSP work

This preview page has a policy in a `<meta>` tag that allows no inline scripts at all. The code below then repeats the classic mistake on purpose: it writes user text with `innerHTML`, and the text contains an `<img>` whose `onerror` attribute would set a variable:

index.html

```ts
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'">
</head>
<body>
  <ul id="reviews"></ul>
</body>
</html>
```

csp-demo.js

```ts
const blocked = new Promise((resolve) =>
  document.addEventListener("securitypolicyviolation", (event) => resolve(event.violatedDirective), { once: true }),
);

const review = `Great rice <img src="data:," onerror="window.injected = true">`;
document.querySelector("#reviews").innerHTML = `<li>${review}</li>`; // the bug is still here

console.log("refused by:", await blocked);
console.log("injected code ran:", window.injected === true);
```

What the browser terminal prints

```ts
refused by: script-src-attr
injected code ran: false
```

The bug created the `<img>`, the image failed to load, and the browser refused to run the `onerror` attribute because the policy forbids inline script. The `securitypolicyviolation` event says which directive stopped it: `script-src-attr`, the part of `script-src` that covers event-handler attributes.

### A strict policy with nonces

Real pages have their own inline scripts. The recommended **strict CSP** allows a script only if its tag carries a **nonce** ("number used once"): a fresh random value the server puts both in the header and in its own `<script nonce="…">` tags, different on every response. An attacker who injects markup cannot know the nonce of the page the victim will get:

csp-server.js

```ts
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

export function createShop() {
  return createServer((req, res) => {
    const nonce = randomBytes(16).toString("base64");
    const policy = [
      `script-src 'nonce-${nonce}' 'strict-dynamic'`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": policy,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "cross-origin-opener-policy": "same-origin",
    });
    res.end(`<!DOCTYPE html><h1>Shop</h1><script nonce="${nonce}">console.log("our script")</script>`);
  });
}
```

Each directive closes a door: `script-src` with the nonce allows only your tagged scripts (`'strict-dynamic'` lets those scripts load further scripts, so bundlers keep working); `object-src 'none'` blocks old plugin content; `base-uri 'none'` stops an injected `<base>` tag from redirecting your relative script URLs; `frame-ancestors 'none'` stops other sites from framing the page (clickjacking). A test proves the properties that matter: the nonce in the header matches the script tag, it is long enough, and it changes on every response:

csp.test.jsNode.js only

```ts
import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createShop } from "./csp-server.js";

test("every response has a fresh nonce that matches its own script tag", async () => {
  const server = createShop().listen(0);
  await once(server, "listening");
  const nonces = [];
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`http://localhost:${server.address().port}/`);
    const policy = res.headers.get("content-security-policy");
    const nonce = policy.match(/'nonce-([^']+)'/)[1];
    assert.ok(Buffer.from(nonce, "base64").length >= 16);
    assert.ok((await res.text()).includes(`<script nonce="${nonce}">`));
    assert.match(policy, /object-src 'none'/);
    assert.equal(policy.includes("unsafe-inline"), false);
    nonces.push(nonce);
  }
  assert.notEqual(nonces[0], nonces[1]);
  server.close();
});
```

A few rules for CSP in practice:

- Send it as a response header. A `<meta>` policy (as in the preview) cannot use `frame-ancestors` or reporting, and only applies from the point where the parser reads it.
- `'unsafe-inline'` in `script-src` switches off most of the protection. A nonce that never changes is no better.
- Roll a new policy out with `Content-Security-Policy-Report-Only` first: the browser reports what it *would* block without blocking it, so you can find your own inline scripts before they break.

### The other security headers

Each of these headers asks the browser to switch off one dangerous default. [Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security#headers) shows `@zudojs/security` producing the full set; this table says what each one stops, so you can judge a list in review:

| Header | Stops |
| --- | --- |
| `Strict-Transport-Security: max-age=63072000; includeSubDomains` | Downgrade to plain HTTP after the first visit. Send it only once the whole domain works over HTTPS. |
| `X-Content-Type-Options: nosniff` | The browser guessing that an uploaded text file is really HTML or a script. |
| `frame-ancestors 'none'` (CSP) and `X-Frame-Options: DENY` | Clickjacking: your page shown invisibly inside another site's frame. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Full URLs, with ids or tokens in them, leaking to other sites in the `Referer` header. |
| `Cross-Origin-Opener-Policy: same-origin` | A page you opened (or that opened you) keeping a handle to your window. |
| `Permissions-Policy: camera=(), geolocation=()` | Your pages, or scripts injected into them, using browser features you never use. |

Cookies have their own hardening. Besides `HttpOnly`, `Secure` and `SameSite`, the name prefix `__Host-` (as in `__Host-sid`) makes the browser accept the cookie only if it is `Secure`, has `Path=/` and no `Domain`. A sibling subdomain can then never set or overwrite your session cookie.

## A code-review checklist

Everything above, as questions to ask of a pull request that touches the web layer:

| Look for | Ask |
| --- | --- |
| A new state-changing route | Is it `POST`/`PUT`/`PATCH`/`DELETE`? Which layer checks origin and CSRF token? Is there a test that a cross-site request gets 403? |
| `Set-Cookie` | `HttpOnly`, `Secure`, explicit `SameSite`? `__Host-` prefix for the session? |
| CORS configuration | Exact allow-list from configuration? `Vary: Origin`? Credentials only for listed origins, never `*` or `null`? |
| HTML built from strings | Does the template engine escape by default? Is every opt-out (`raw`, `\| safe`, `dangerouslySetInnerHTML`) justified and sanitised? |
| DOM sinks | Can any `innerHTML` and friends receive data? Could it be `textContent`? |
| URLs from users | Parsed with `URL`, scheme allow-listed? |
| Response headers | CSP without `'unsafe-inline'`, `nosniff`, frame protection, correct `Content-Type`? |

Tools help: linters flag `innerHTML` and `eval`, browser developer tools show CSP violations in the console, and security scanners probe for reflected XSS. None of them replace the habit of asking, for every value you write into a page: "who controls this, and what will the browser do with it?"

## In production

- **Use your framework's defences, and know their gaps.** React, Vue and most server template engines escape by default; the XSS bugs live in their opt-outs. ZudoJS gives you CORS, CSRF, cookies and headers as tested building blocks ([Security for every public API](https://zudojs.oyinlola.site/learn/zudo-security)); use them instead of the hand-written versions in this lesson, which exist to show you how they work.
- **Keep configuration in configuration.** Allowed origins, the app origin and the CSP differ between development, staging and production. Load them from config, and test the production values.
- **Collect CSP reports.** The `report-to` directive sends violations to an endpoint you run. A sudden spike is often the first sign that someone found an injection point.
- **Plan for mistakes.** Assume one XSS bug will ship one day. `HttpOnly` cookies stop it from stealing the session; short sessions limit how long it matters; a strict CSP stops the script from running at all. Each layer is there for the day another fails.

## Practice

TRY IT YOURSELF

### Review this handler

A colleague adds a "close my account" feature to the wallet. List every problem you can find, and say which section's fix applies to each:

```ts
if (req.method === "GET" && url.pathname === "/account/close") {
  closeAccount(user);
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<p>Goodbye ${url.searchParams.get("name")}</p>`);
}
```

**Show a solution**

- It changes state on `GET`. A link or an image tag on any site can close the account, and `SameSite=Lax` still sends the cookie on top-level `GET` navigation. Make it a `POST` behind the origin check and the CSRF token (CSRF section).
- It reflects `name` from the URL into HTML without encoding: reflected XSS. Use the escaping `html` template, or better, take the name from the session instead of the URL (XSS section).
- No test proves either property. Add one that a cross-site request gets 403 and one that the name comes back escaped.

TRY IT YOURSELF

### Allow a second origin, safely

Write `isTrustedOrigin(origin)` that reads its list from a comma-separated setting such as `"https://wallet.example, https://mobile.wallet.example"`, trims spaces, ignores empty entries, and accepts only exact matches. Show that `https://wallet.example.evil.test`, `null` and an empty string are refused.

**Show a solution**

trusted-origins.js

```ts
function loadTrustedOrigins(setting) {
  return new Set(setting.split(",").map((s) => s.trim()).filter((s) => s !== ""));
}

const trusted = loadTrustedOrigins("https://wallet.example, https://mobile.wallet.example,");
const isTrustedOrigin = (origin) => trusted.has(origin);

for (const origin of ["https://mobile.wallet.example", "https://wallet.example.evil.test", "null", ""]) {
  console.log(JSON.stringify(origin), isTrustedOrigin(origin));
}
```

Output of `node trusted-origins.js` and of the browser terminal

```ts
"https://mobile.wallet.example" true
"https://wallet.example.evil.test" false
"null" false
"" false
```

The trailing comma in the setting would otherwise have added `""` to the list, and a request with an empty `Origin` would have matched it. Filtering empty entries is the kind of detail a test catches and a reader misses.

TRY IT YOURSELF

### Encode for an attribute

A task list shows each task as `<input value="…">` so it can be edited in place. Use the `html` template from this lesson and prove that the title `Buy "fresh" bread` cannot close the attribute early.

**Show a solution**

attribute.js

```ts
import { html } from "./html.js";

const title = 'Buy "fresh" bread';
const field = html`<input name="title" value="${title}">`.toString();
console.log(field);
const value = field.slice(field.indexOf('value="') + 7, field.lastIndexOf('"'));
console.log("quotes inside the value:", value.includes('"'));
```

Output of `node attribute.js` and of the browser terminal

```ts
<input name="title" value="Buy &quot;fresh&quot; bread">
quotes inside the value: false
```

The quotes became `&quot;`, so the attribute value ends only at the closing quote the template wrote. This works because the template always puts the value inside quotes: an unquoted attribute would end at the first space, which HTML escaping does not touch.

## Summary

- The browser attaches cookies to requests other sites start. CSRF uses that. Fix it in layers: `SameSite` cookies, a per-session CSRF token compared with `timingSafeEqual`, an `Origin`/`Sec-Fetch-Site` check, and no state changes on `GET`.
- CORS decides which other origins may *read* your responses. Reflecting any origin with credentials hands your users' data to every site. Use an exact allow-list, `Vary: Origin`, and never `null` or `*` with credentials.
- XSS is data becoming markup or code. Stored and reflected XSS happen in server-built HTML, DOM XSS in page JavaScript. Encode for the context, make escaping the default, prefer `textContent`, allow-list URL schemes, and escape `<` in JSON inside scripts.
- A nonce-based CSP stops injected scripts when an encoding bug slips through. The other security headers each switch off one dangerous browser default.
- Every fix gets a test that sends the attack and checks it fails, one test per layer.

Next: [Writing injection-safe code](https://zudojs.oyinlola.site/learn/sec-injection), where the untrusted data reaches your database, your shell, your file system and your outbound requests.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

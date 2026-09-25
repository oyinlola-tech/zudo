---
title: "Networking from JavaScript — ZudoJS Academy"
description: "Connect a page to your Node.js Task API: the request lifecycle, JSON, the same-origin policy, CORS and preflight, HttpOnly session cookies and cancellation."
source: https://zudojs.oyinlola.site/learn/browser-networking
---

LEVEL 4 · LESSON 13 OF 20

JavaScript in the browser Core

# Networking from JavaScript

Connect a page to your Node.js Task API: the request lifecycle, JSON, the same-origin policy, CORS and preflight, HttpOnly session cookies and cancellation.

- **60 min** to read and try
- **You need:** Build a plain Node.js Task API, Browser APIs and Events
- **You build:** A Task API with CORS and HttpOnly cookie sessions, a typed-error API client, and a browser front end that logs in, lists and creates tasks, verified against real server responses

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Follow a request from fetch() to the parsed body, and say which headers the browser controls
- Send and receive JSON with the right headers, and turn HTTP errors into clear application errors
- Explain the same-origin policy: what it blocks and what it does not
- Configure CORS on a Node.js server, including preflight and credentials, and read a CORS error
- Log in with an HttpOnly session cookie and explain why page JavaScript cannot read it
- Cancel stale requests with AbortController and time out slow ones

## The front end that could not see its API

In [Build a plain Node.js Task API](https://zudojs.oyinlola.site/learn/node-task-api) you built a Task API and called it with `curl` and from Node.js. Now Ada wants a real front end: a web page, served from `http://localhost:5173` by a development server, that talks to the API on `http://localhost:3000`. Her first attempt copies the Node.js code into the page:

```ts
const response = await fetch("http://localhost:3000/tasks", {
  headers: { Authorization: "Bearer 3f9c…the API key…" },
});
console.log(await response.json());
```

Two things go wrong. First, the browser's console shows a red error and the code never gets the tasks:

Access to fetch at 'http://localhost:3000/tasks' from origin 'http://localhost:5173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.

Second, and worse, the API key is now in a JavaScript file that every visitor downloads. Anyone can open the developer tools, copy it, and do anything the key allows. A key that sits in the browser is not a secret.

Neither problem exists in Node.js, because the rules behind them are enforced by the **browser**, to protect its user. This lesson explains those rules: what a request from a page contains and who controls each part, why a page may not read another site's responses unless that site agrees (the **same-origin policy** and **CORS**), and how a browser app proves who the user is without holding a secret in JavaScript (an **HttpOnly session cookie**). At the end, the Task API gets a proper browser front end.

The server side is Node.js, so those examples run on your computer (Node.js only). The browser side runs here in the preview.

## What happens during fetch()

A single `await fetch(url)` hides a lot of work. In order:

```ts
page code            browser                                server
─────────            ───────                                ──────
fetch(url, opts) ──▶ parse and resolve the URL
                     check the rules (same-origin? CORS?)
                     look up the host name (DNS)
                     open or reuse a connection (TCP, TLS)
                     add its own headers (Origin, Cookie,
                     User-Agent, Accept-Language, …)
                     send method + path + headers + body ──▶ read the request
                                                            run the handler
                     receive status + headers  ◀──────────── send status + headers
promise fulfils ◀─── check CORS on the response
(response.status,
 response.headers)
response.json() ───▶ keep reading the body stream  ◀─────── send the body
promise fulfils ◀─── parse it as JSON
```

The request lifecycle as seen from a page. The first promise fulfils when the headers arrive, the second when the body has been read and parsed.

Two things in that picture matter every day. The browser adds headers itself, and some headers only the browser may set. And the browser checks the rules *before* it hands the response to your code.

### Headers: yours and the browser's

**Headers** are the named values that travel with a request or response (you met them in [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http#request)). A page sets its own with the `headers` option. But some header names are **forbidden** for page JavaScript: the browser sets them, and silently drops them if your code tries. `Cookie`, `Origin` and `Host` are among them, because a page that could forge them could pretend to be another site or steal another user's session. Likewise, a page can never read a response's `Set-Cookie` header. Watch the browser strip them:

index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Tasks</title></head>
<body>
  <label>Search products <input type="search" id="search"></label>
  <ul id="results"></ul>
</body>
</html>
```

forbidden.js

```ts
const request = new Request("https://api.tasks.example/tasks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Request-Id": "req-81",
    Cookie: "session=stolen-from-someone",
    Origin: "https://bank.example",
    Host: "bank.example",
  },
  body: JSON.stringify({ title: "Buy detergent" }),
});
console.log("headers the page may send:", [...request.headers.keys()]);
console.log("mode:", request.mode, "credentials:", request.credentials);

const response = new Response("{}", {
  headers: { "Content-Type": "application/json", "Set-Cookie": "session=abc; HttpOnly", "X-Total-Count": "3" },
});
console.log("headers the page may read:", [...response.headers.keys()]);
console.log("Set-Cookie:", response.headers.get("set-cookie"));
```

What the browser terminal prints

```ts
headers the page may send: [ 'content-type', 'x-request-id' ]
mode: cors credentials: same-origin
headers the page may read: [ 'content-type', 'x-total-count' ]
Set-Cookie: null
```

Run the same lines in Node.js and all five request headers survive, and `Set-Cookie` is readable: a server-side program speaks only for itself, so there is nobody to protect. In the browser, the page is running code from one site inside a user's browser that is logged in to many sites, and these restrictions keep them apart. Note also the two defaults: `mode: "cors"` (cross-origin requests follow the CORS rules below) and `credentials: "same-origin"` (cookies are sent only to the page's own origin).

## The API for this lesson

The server in this lesson is the Task API from the Node.js module, trimmed to the routes a front end needs, plus the two things this lesson adds: sessions and CORS. Skim it now; each part is explained in the sections that follow. First the CORS module, explained in [CORS](#cors). It returns `true` when it has answered the request completely (a preflight), and otherwise only adds headers:

src/cors.jsNode.js only

```ts
export function cors({ allowedOrigins, methods = ["GET", "POST", "PATCH"], headers = ["Content-Type"] }) {
  return (req, res) => {
    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");
    const allowed = origin !== undefined && allowedOrigins.includes(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method !== "OPTIONS") return false;
    if (allowed) {
      res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", headers.join(", "));
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.writeHead(204).end();
    return true;
  };
}
```

Then the API. It keeps users, sessions and tasks in memory, and has four routes: `POST /login`, `GET /tasks`, `POST /tasks` and `PATCH /tasks/:id`. Passwords are checked with `scrypt` and `timingSafeEqual`, as [Cryptography with node:crypto](https://zudojs.oyinlola.site/learn/node-crypto#passwords) explains, and the body is read with a size limit, as in [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http#body). A successful login creates a random session id, remembers which user it belongs to, and sends it to the browser in a cookie:

src/api.jsNode.js only

```ts
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cors } from "./cors.js";

const scryptAsync = promisify(scrypt);

function send(res, status, body, headers = {}) {
  const type = body === undefined ? {} : { "Content-Type": "application/json" };
  res.writeHead(status, { "Cache-Control": "no-store", ...type, ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new HttpError(413, "Body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

function sessionIdOf(req) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === "session") return value;
  }
  return undefined;
}

export function createApi({ allowedOrigins, users }) {
  const accounts = new Map();
  for (const [email, password] of Object.entries(users)) {
    const salt = randomBytes(16);
    accounts.set(email, { salt, hash: scryptSync(password, salt, 32) });
  }
  const sessions = new Map();
  const tasks = [];
  const handleCors = cors({ allowedOrigins });
  const sessionCookie = (id) => `session=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;

  async function route(req, res, url) {
    if (req.method === "POST" && url.pathname === "/login") {
      const body = await readJson(req);
      const account = accounts.get(body?.email);
      const given = await scryptAsync(String(body?.password ?? ""), account?.salt ?? randomBytes(16), 32);
      if (!account || !timingSafeEqual(given, account.hash)) return send(res, 401, { error: "Wrong email or password" });
      const id = randomBytes(32).toString("hex");
      sessions.set(id, body.email);
      return send(res, 204, undefined, { "Set-Cookie": sessionCookie(id) });
    }

    const user = sessions.get(sessionIdOf(req));
    if (!user) return send(res, 401, { error: "Log in first" });
    const mine = tasks.filter((t) => t.owner === user);

    if (req.method === "GET" && url.pathname === "/tasks") {
      return send(res, 200, mine.map(({ owner, ...task }) => task));
    }
    if (req.method === "POST" && url.pathname === "/tasks") {
      const body = await readJson(req);
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      if (title === "" || title.length > 200) return send(res, 400, { error: "title must be 1 to 200 characters" });
      const task = { id: tasks.length + 1, title, done: false, owner: user };
      tasks.push(task);
      return send(res, 201, { id: task.id, title: task.title, done: task.done });
    }
    const match = url.pathname.match(/^\/tasks\/([0-9]+)$/);
    if (req.method === "PATCH" && match) {
      const task = mine.find((t) => t.id === Number(match[1]));
      if (!task) return send(res, 404, { error: `Task ${match[1]} not found` });
      const body = await readJson(req);
      if (typeof body?.done !== "boolean") return send(res, 400, { error: "done must be true or false" });
      task.done = body.done;
      return send(res, 200, { id: task.id, title: task.title, done: task.done });
    }
    return send(res, 404, { error: "Not Found" });
  }

  return async (req, res) => {
    if (handleCors(req, res)) return;
    try {
      await route(req, res, new URL(req.url, "http://localhost"));
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error(error);
      send(res, 500, { error: "Internal Server Error" });
    }
  };
}
```

A few details to notice now, and understand fully by the end of the lesson:

- A user only ever sees their own tasks: every task route filters by the session's user, and `PATCH` looks the task up in `mine`. A task id belonging to someone else is simply "not found".
- The password check runs `scrypt` even for an unknown email (against a random salt), so a wrong email takes as long as a wrong password and the timing does not reveal which emails have accounts. The demo accounts are hashed once at startup with `scryptSync`, before the server takes requests; the login check uses the async `scrypt`, so a login never blocks other requests. (The demo keeps scrypt's default cost to stay fast; a real server uses the stronger settings from that lesson.)
- CORS runs first, before the session check. The reason is in [When networking fails](#failures).

### JSON in both directions

To send JSON, set the body to a string and say what it is with `Content-Type: application/json`; say what you want back with `Accept: application/json`. Here is the API receiving JSON with and without that header, sent the way the browser will send it. `start` runs the API on a free port for the example; a request is a `fetch` with an `Origin` header, which a browser adds automatically:

json.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { createApi } from "./src/api.js";

const server = createServer(createApi({ allowedOrigins: ["http://localhost:5173"], users: { "ada@tasks.example": "correct horse battery staple" } }));
server.listen(0);
await once(server, "listening");
const api = `http://localhost:${server.address().port}`;

const login = await fetch(`${api}/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ada@tasks.example", password: "correct horse battery staple" }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
console.log("login:", login.status);

const withoutType = await fetch(`${api}/tasks`, { method: "POST", headers: { Cookie: cookie }, body: '{"title":"Buy detergent"}' });
console.log("no Content-Type:", withoutType.status, await withoutType.json());

const created = await fetch(`${api}/tasks`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ title: "Buy detergent" }),
});
console.log("with JSON:", created.status, created.headers.get("content-type"), await created.json());

server.close();
```

Output of `node json.js`

```ts
login: 204
no Content-Type: 415 { error: 'Send JSON with Content-Type: application/json' }
with JSON: 201 application/json { id: 1, title: 'Buy detergent', done: false }
```

Without `Content-Type`, a string body is labelled `text/plain`, and the API answers 415 Unsupported Media Type. With it, 201 Created, and a JSON body back. Node.js's `fetch` let the example set `Cookie` by hand; in a browser, only the browser does that.

## The same-origin policy

An **origin** is the scheme, host and port of a URL together. Two URLs have the **same origin** only if all three match:

| Page | Request to | Same origin? |
| --- | --- | --- |
| `https://tasks.example/app` | `https://tasks.example/api/tasks` | yes: only the path differs |
| `https://tasks.example` | `http://tasks.example` | no: scheme differs |
| `https://tasks.example` | `https://api.tasks.example` | no: host differs |
| `http://localhost:5173` | `http://localhost:3000` | no: port differs |

The browser runs pages from many sites at once, for a user who is logged in to their bank, their email and their shop. The **same-origin policy** stops one site's page from reading another origin's data with the user's identity. Without it, any page you visit could `fetch("https://mail.example/inbox")`, the browser would attach your mail cookies, and the page would read your email.

It is important to know what the policy blocks and what it does not:

- **Blocked by default**: *reading* a cross-origin response in JavaScript (`fetch`), reading the DOM of a cross-origin frame, reading another origin's storage and cookies.
- **Allowed**: *sending* many kinds of cross-origin requests. A page may embed another origin's images, scripts and styles, submit a form to it, and even send a "simple" `fetch` to it. The request arrives; only the page's ability to *read* the answer is blocked.

That second point has a consequence: a malicious page can make the user's browser send a request, with the user's cookies, to your API. It cannot see the response, but the request itself may do damage ("transfer ₦50,000", "delete my tasks"). That attack is **cross-site request forgery** (**CSRF**), and it is why the session cookie below uses `SameSite`, and why state-changing routes must never be `GET`. [Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web) covers CSRF defences in full.

## CORS: the server's permission

**Cross-Origin Resource Sharing** (**CORS**) is how a server tells browsers "pages from these origins may read my responses". The browser sends an `Origin` header with every cross-origin request, and looks for `Access-Control-Allow-*` headers in the response. The check is done by the browser, for the user; the server only states its policy. This is why `curl` and Node.js never see CORS errors: they are not browsers, and they have no user to protect.

### Simple requests and preflight

For some requests, the browser first asks permission with a separate **preflight** request: an `OPTIONS` request that describes the real one. Only if the server's answer allows it does the browser send the real request. A request skips the preflight only if it could have been sent by an old-fashioned HTML form anyway (a **simple request**): method `GET`, `HEAD` or `POST`, only a few safe headers, and a `Content-Type` that forms can send. Anything a form could not send, like `PATCH`, `DELETE`, JSON bodies or an `Authorization` header, is preflighted, because servers written before CORS never expected to receive such requests from another site:

preflight-rules.js

```ts
const SIMPLE_METHODS = ["GET", "HEAD", "POST"];
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const SAFE_HEADERS = ["accept", "accept-language", "content-language", "content-type"];

function needsPreflight(method, headers = {}) {
  if (!SIMPLE_METHODS.includes(method.toUpperCase())) return true;
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (!SAFE_HEADERS.includes(key)) return true;
    if (key === "content-type" && !FORM_TYPES.includes(value.split(";")[0].trim().toLowerCase())) return true;
  }
  return false;
}

const requests = [
  ["GET /tasks", "GET", {}],
  ["GET /tasks with Accept", "GET", { Accept: "application/json" }],
  ["POST a form", "POST", { "Content-Type": "application/x-www-form-urlencoded" }],
  ["POST JSON", "POST", { "Content-Type": "application/json" }],
  ["GET with a Bearer token", "GET", { Authorization: "Bearer abc" }],
  ["PATCH /tasks/1", "PATCH", { "Content-Type": "application/json" }],
];
for (const [label, method, headers] of requests) {
  console.log(`${needsPreflight(method, headers) ? "preflight" : "simple   "}  ${label}`);
}
```

Output of `node preflight-rules.js` and of the browser terminal

```ts
simple     GET /tasks
simple     GET /tasks with Accept
simple     POST a form
preflight  POST JSON
preflight  GET with a Bearer token
preflight  PATCH /tasks/1
```

These are the rules browsers follow (simplified: header values have a few more limits). Now watch the real Task API answer preflights. The first comes from the front end's origin, which is on the allow-list; the second from a page on another site:

preflight.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { createApi } from "./src/api.js";

const server = createServer(createApi({ allowedOrigins: ["http://localhost:5173"], users: {} }));
server.listen(0);
await once(server, "listening");
const api = `http://localhost:${server.address().port}`;

for (const origin of ["http://localhost:5173", "https://evil.example"]) {
  const response = await fetch(`${api}/tasks/1`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" },
  });
  console.log(`preflight from ${origin}: ${response.status}`);
  for (const [name, value] of response.headers) {
    if (name.startsWith("access-control-") || name === "vary") console.log(`  ${name}: ${value}`);
  }
}
server.close();
```

Output of `node preflight.js`

```ts
preflight from http://localhost:5173: 204
  access-control-allow-credentials: true
  access-control-allow-headers: Content-Type
  access-control-allow-methods: GET, POST, PATCH
  access-control-allow-origin: http://localhost:5173
  access-control-max-age: 600
  vary: Origin
preflight from https://evil.example: 204
  vary: Origin
```

The allowed origin gets its own origin echoed back, the allowed methods and headers, and `Max-Age: 600`, which lets the browser remember the answer for ten minutes instead of preflighting every request. The other site gets a 204 with no permissions at all, so its browser will refuse to send the `PATCH`. `Vary: Origin` tells caches that the answer depends on the `Origin` header, so a cache never hands one origin's permission to another.

### What the browser checks

After the real request, the browser checks the response before your code sees it. The whole check fits in a few lines:

cors-check.js

```ts
function corsAllows(headers, origin, withCredentials) {
  const allowOrigin = headers.get("access-control-allow-origin");
  if (allowOrigin === "*" && !withCredentials) return true;
  if (allowOrigin !== origin) return false;
  return !withCredentials || headers.get("access-control-allow-credentials") === "true";
}

const page = "http://localhost:5173";
const cases = [
  ["no CORS headers", {}, false],
  ["* for a public API", { "access-control-allow-origin": "*" }, false],
  ["* with cookies", { "access-control-allow-origin": "*" }, true],
  ["another origin", { "access-control-allow-origin": "https://tasks.example" }, true],
  ["exact origin, no credentials flag", { "access-control-allow-origin": page }, true],
  ["exact origin + credentials", { "access-control-allow-origin": page, "access-control-allow-credentials": "true" }, true],
];
for (const [label, headers, withCredentials] of cases) {
  console.log(`${corsAllows(new Headers(headers), page, withCredentials) ? "readable" : "BLOCKED "}  ${label}`);
}
```

Output of `node cors-check.js` and of the browser terminal

```ts
BLOCKED   no CORS headers
readable  * for a public API
BLOCKED   * with cookies
BLOCKED   another origin
BLOCKED   exact origin, no credentials flag
readable  exact origin + credentials
```

The wildcard `*` is allowed only for requests without credentials: a truly public API, like a list of exchange rates, can say "anyone may read this". A response to a request that carried cookies must name the exact origin and add `Access-Control-Allow-Credentials: true`. That is why the API's CORS module echoes the origin after checking it against an allow-list. Never echo back *any* origin: that is the same as allowing every site on the internet to read your users' data.

> NOTE
>
> A blocked response is not a network failure: the request usually reached the server, which may have acted on it, and the response came back. The browser simply refuses to show it to your code. Your code sees a `TypeError` ("Failed to fetch" in Chromium), and the real reason appears only in the developer console. Check the console and the Network tab, never guess.

## Sessions with HttpOnly cookies

Back to the second problem: the API key in the page. A browser app should not hold a long-lived secret at all. Instead, the user logs in, and the server gives the browser a **session cookie**: a random id that stands for "this user, logged in". The browser stores it and sends it back with every request to the API, and the server looks the id up. [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#cookies) lists the cookie attributes; the API's cookie uses five of them:

```ts
Set-Cookie: session=4f1c…(64 hex characters)…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

- **`HttpOnly`**: page JavaScript cannot read or write this cookie. It is sent with requests, but `document.cookie` does not show it. An XSS attacker who runs code in the page cannot steal the session id.
- **`Secure`**: sent only over HTTPS (browsers make an exception for `http://localhost`, so development still works).
- **`SameSite=Lax`**: not sent with requests started by pages from *other sites*, apart from top-level link navigation. That blocks most CSRF.
- **`Path=/`** and **`Max-Age=3600`**: send it for every path, and forget it after an hour.

Here is what page JavaScript can and cannot do with cookies. A page may set ordinary cookies through `document.cookie`, but a cookie marked `HttpOnly` can only come from a server:

document-cookie.js

```ts
document.cookie = "academy-demo-theme=dark; Path=/; SameSite=Lax; Max-Age=60";
document.cookie = "academy-demo-session=forged; HttpOnly; Path=/; Max-Age=60";

const visible = document.cookie.split("; ").filter((c) => c.startsWith("academy-demo-"));
console.log("cookies this page can see:", visible);

document.cookie = "academy-demo-theme=; Path=/; Max-Age=0";
console.log("after deleting:", document.cookie.split("; ").filter((c) => c.startsWith("academy-demo-")));
```

What the browser terminal prints

```ts
cookies this page can see: [ 'academy-demo-theme=dark' ]
after deleting: []
```

The browser ignored the attempt to create an `HttpOnly` cookie from script. Deleting a cookie means setting it again with `Max-Age=0`. (This preview shares this website's cookies, so the example uses `academy-demo-` names, a one-minute lifetime, and cleans up.)

### Cookies and fetch: credentials

Whether `fetch` sends and stores cookies is decided by its `credentials` option:

| `credentials` | Cookies sent and stored for… |
| --- | --- |
| `"same-origin"` (default) | requests to the page's own origin only |
| `"include"` | cross-origin requests too, if the server's CORS answer allows credentials |
| `"omit"` | never |

The front end on `localhost:5173` calls the API on `localhost:3000`, a different origin, so it must use `credentials: "include"`, and the API must answer with its exact origin and `Access-Control-Allow-Credentials: true`. Cookies have one more filter: `SameSite` is about **sites**, not origins. A site is roughly the registrable domain (`tasks.example`), ignoring subdomains and ports. `localhost:5173` and `localhost:3000` are the same site, and so are `app.tasks.example` and `api.tasks.example`, so a `SameSite=Lax` cookie works between them. An API on a completely different domain would need `SameSite=None; Secure`, and many browsers now block such third-party cookies anyway. Keep the front end and the API on the same site.

## Before you build: connecting the front end

REASON IT OUT

### Who is protected from whom?

Before writing the client and the CORS configuration, answer these:

- Which origins should the API allow, and what would `Access-Control-Allow-Origin: *` or "echo any origin" mean for your users?
- Where does the proof of identity live, and what can an XSS bug on the front end steal in each design (API key in JS, token in `localStorage`, HttpOnly cookie)?
- CORS stops other sites from *reading* responses. What stops another site from *sending* `POST /tasks` with the user's cookie?
- The front end shows an error. How does the code tell "wrong password", "session expired", "the server is down" and "the request took too long" apart, and what should the user see for each?
- A `POST /tasks` times out. Did the task get created? Is it safe to send it again automatically?

**Show the reasoning**

- Allow exactly the front end's origins (development and production), from configuration. `*` cannot be used with cookies at all; echoing any origin would let every website read every logged-in user's tasks.
- An API key in JavaScript is readable by everyone, XSS or not. A token in `localStorage` can be read and sent away by any XSS payload. An HttpOnly cookie cannot be read by script; XSS can still *use* it while the user has the page open, but cannot take it away. HttpOnly cookies are the safest of the three, and XSS must still be prevented.
- `SameSite=Lax` stops the browser from attaching the cookie to requests started by other sites. The JSON `Content-Type` helps too: a cross-site JSON `POST` needs a preflight, which the API refuses for unknown origins. [Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web) adds CSRF tokens for extra safety.
- By status: 401 from `/login` is a wrong password; 401 elsewhere means "log in again"; 400 carries the server's message; 5xx means "try again later"; a `TypeError` from `fetch` means the server could not be reached (or CORS blocked it); a `TimeoutError` means it was too slow. The client turns each into one error type with a clear message.
- Unknown: the server may have created it and the answer got lost. Retrying a `GET` is safe; retrying a `POST` can create a duplicate. Only retry non-idempotent requests with an idempotency key, which [a later lesson](https://zudojs.oyinlola.site/learn/api-idempotency) builds.

## Build: Browser → API → Server

The front end talks to the API through one small module, the **API client**. Every request goes through one function, which adds the headers, sends cookies, sets a time limit, and turns every kind of failure into an `ApiError` with a status and a message the page can show. It takes `fetch` as a parameter, so it runs unchanged in the browser, in Node.js, and in tests:

src/client.jsNode.js only

```ts
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function createTaskClient(baseUrl, { fetch: fetchFn = fetch, timeoutMs = 5000 } = {}) {
  async function request(method, path, body) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetchFn(new URL(path, baseUrl).href, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error.name === "TimeoutError") throw new ApiError(0, "The server took too long to answer. Try again.");
      throw new ApiError(0, "Could not reach the server. Check your connection.");
    }
    const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (response.ok) return data;
    if (response.status === 401 && path !== "/login") throw new ApiError(401, "Your session has ended. Please log in again.");
    if (response.status >= 500) throw new ApiError(response.status, "Something went wrong on our side. Try again later.");
    throw new ApiError(response.status, data?.error ?? `Request failed (${response.status})`);
  }

  return {
    login: (email, password) => request("POST", "/login", { email, password }),
    listTasks: () => request("GET", "/tasks"),
    createTask: (title) => request("POST", "/tasks", { title }),
    setDone: (id, done) => request("PATCH", `/tasks/${encodeURIComponent(id)}`, { done }),
  };
}
```

Node.js's `fetch` is not a browser: it keeps no cookies and checks no CORS rules. To run the whole flow here, `browser.js` stands in for the browser's network layer, with the two behaviours this lesson is about: a cookie jar, and the CORS checks from above (preflight and response), including the console message a browser would print. It is a teaching model, not a browser; the real browser's output follows after it:

browser.jsNode.js only

```ts
const SIMPLE_METHODS = ["GET", "HEAD", "POST"];
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];

function needsPreflight(method, headers) {
  if (!SIMPLE_METHODS.includes(method)) return true;
  return Object.entries(headers).some(([name, value]) => {
    const key = name.toLowerCase();
    if (key === "content-type") return !FORM_TYPES.includes(value.split(";")[0].trim());
    return key !== "accept" && key !== "accept-language" && key !== "content-language";
  });
}

function corsAllows(headers, origin, withCredentials) {
  const allowOrigin = headers.get("access-control-allow-origin");
  if (allowOrigin === "*" && !withCredentials) return true;
  if (allowOrigin !== origin) return false;
  return !withCredentials || headers.get("access-control-allow-credentials") === "true";
}

export function createBrowser(pageOrigin) {
  const jar = new Map();
  const blocked = (message) => {
    console.log(`  [console] blocked by CORS policy: ${message}`);
    return new TypeError("Failed to fetch");
  };

  async function browserFetch(href, { method = "GET", headers = {}, body, credentials = "same-origin" } = {}) {
    const url = new URL(href);
    const crossOrigin = url.origin !== pageOrigin;
    const withCredentials = credentials === "include" || (credentials === "same-origin" && !crossOrigin);
    const sent = { ...headers };
    if (crossOrigin) {
      sent.Origin = pageOrigin;
      if (needsPreflight(method, headers)) {
        const preflight = await fetch(url, {
          method: "OPTIONS",
          headers: { Origin: pageOrigin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": Object.keys(headers).join(",").toLowerCase() },
        });
        const methods = preflight.headers.get("access-control-allow-methods") ?? "";
        if (!corsAllows(preflight.headers, pageOrigin, withCredentials) || !methods.includes(method)) {
          throw blocked(`preflight for ${method} ${url.pathname} was not allowed`);
        }
      }
    }
    const cookies = jar.get(url.origin);
    if (withCredentials && cookies) sent.Cookie = cookies;
    const response = await fetch(url, { method, headers: sent, body });
    if (crossOrigin && !corsAllows(response.headers, pageOrigin, withCredentials)) {
      throw blocked(`no permission for ${pageOrigin} to read ${method} ${url.pathname}`);
    }
    const setCookie = response.headers.get("set-cookie");
    if (withCredentials && setCookie) jar.set(url.origin, setCookie.split(";")[0]);
    return response;
  }

  return { fetch: browserFetch, hasCookieFor: (origin) => jar.has(origin) };
}
```

And the whole flow: start the API, open "the page" on the allowed origin, log in, create and list tasks, then try the same things with a wrong password, from a page on a site the API does not allow, without a session, and against a server that is not running:

flow.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";
import { createApi } from "./src/api.js";
import { createTaskClient } from "./src/client.js";
import { createBrowser } from "./browser.js";

const users = { "ada@tasks.example": "correct horse battery staple" };
const server = createServer(createApi({ allowedOrigins: ["http://localhost:5173"], users }));
server.listen(0);
await once(server, "listening");
const apiUrl = `http://localhost:${server.address().port}`;

async function show(label, action) {
  try {
    const result = await action();
    console.log(`${label}: ${result === undefined ? "ok" : JSON.stringify(result)}`);
  } catch (error) {
    console.log(`${label}: ${error.name} ${error.status} - ${error.message}`);
  }
}

console.log("--- page on http://localhost:5173");
const browser = createBrowser("http://localhost:5173");
const client = createTaskClient(apiUrl, { fetch: browser.fetch });
await show("login, wrong password", () => client.login("ada@tasks.example", "password123"));
await show("list before login", () => client.listTasks());
await show("login", () => client.login("ada@tasks.example", "correct horse battery staple"));
console.log("the browser holds a session cookie:", browser.hasCookieFor(apiUrl));
await show("create", () => client.createTask("Buy detergent"));
await show("create empty", () => client.createTask("   "));
await show("mark done", () => client.setDone(1, true));
await show("list", () => client.listTasks());

console.log("--- page on https://evil.example, same browser, same cookie jar");
const evil = createTaskClient(apiUrl, { fetch: createBrowser("https://evil.example").fetch });
await show("list", () => evil.listTasks());
await show("mark not done", () => evil.setDone(1, false));

server.close();
console.log("--- server stopped");
await show("list", () => client.listTasks());
```

Output of `node flow.js`

```ts
--- page on http://localhost:5173
login, wrong password: ApiError 401 - Wrong email or password
list before login: ApiError 401 - Your session has ended. Please log in again.
login: ok
the browser holds a session cookie: true
create: {"id":1,"title":"Buy detergent","done":false}
create empty: ApiError 400 - title must be 1 to 200 characters
mark done: {"id":1,"title":"Buy detergent","done":true}
list: [{"id":1,"title":"Buy detergent","done":true}]
--- page on https://evil.example, same browser, same cookie jar
  [console] blocked by CORS policy: no permission for https://evil.example to read GET /tasks
list: ApiError 0 - Could not reach the server. Check your connection.
  [console] blocked by CORS policy: preflight for PATCH /tasks/1 was not allowed
mark not done: ApiError 0 - Could not reach the server. Check your connection.
--- server stopped
list: ApiError 0 - Could not reach the server. Check your connection.
```

Read the results against the rules:

- The wrong password shows the server's message; listing before login shows the friendlier "session has ended" message the client chose for 401s.
- After login, the cookie jar holds the session, and every later request carried it: `credentials: "include"` plus the API's CORS answer.
- The page on `evil.example` got nowhere. Its `GET` reached the server, but the response was hidden from it. Its `PATCH` needed a preflight, which the API refused, so the real request was never sent. (In a real browser, `SameSite=Lax` would also have kept the cookie off both requests; this stand-in does not model it.)
- With the server gone, `fetch` itself rejected, and the client turned it into a message a user can act on.

### The real front end

In the browser, the page loads the same `client.js` as a module and passes the browser's own `fetch`. The rendering follows [The DOM](https://zudojs.oyinlola.site/learn/browser-dom#build): build rows from data with `textContent`.

public/index.html

```ts
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ada's tasks</title>
  <link rel="icon" href="data:,">
  <script type="module" src="app.js"></script>
</head>
<body>
  <form id="login">
    <label>Email <input name="email" type="email" autocomplete="username" required></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
    <button>Log in</button>
  </form>
  <form id="new-task" hidden>
    <label>New task <input name="title" required maxlength="200"></label>
    <button>Add</button>
  </form>
  <p id="message" role="status"></p>
  <ul id="tasks"></ul>
</body>
</html>
```

public/app.js

```ts
import { ApiError, createTaskClient } from "./client.js";

const api = createTaskClient("http://localhost:3000", { fetch: (...args) => fetch(...args) });
const $ = (selector) => document.querySelector(selector);
const say = (text) => ($("#message").textContent = text);

async function refresh() {
  const tasks = await api.listTasks();
  $("#tasks").replaceChildren(...tasks.map((task) => {
    const li = document.createElement("li");
    li.textContent = `${task.done ? "[x]" : "[ ]"} ${task.title}`;
    return li;
  }));
}

async function run(action) {
  try {
    await action();
    say("");
  } catch (error) {
    say(error instanceof ApiError ? error.message : "Unexpected error");
    if (!(error instanceof ApiError)) console.error(error);
  }
}

$("#login").addEventListener("submit", (event) => {
  event.preventDefault();
  const { email, password } = Object.fromEntries(new FormData(event.target));
  run(async () => {
    await api.login(email, password);
    $("#login").hidden = true;
    $("#new-task").hidden = false;
    await refresh();
  });
});

$("#new-task").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  run(async () => {
    await api.createTask(form.elements.title.value);
    form.reset();
    await refresh();
  });
});
```

Run the API on port 3000 with `allowedOrigins: ["http://localhost:5173"]`, copy `src/client.js` into `public/`, and serve `public/` on port 5173 with any static server, for example `npx serve public -l 5173`. Log in as Ada and add a task. Then serve the same folder on port 5174, which is not on the allow-list, and try again. This is what Chromium printed in its console when the lesson was tested that way:

```ts
Page on http://localhost:5173: log in as Ada, add "Buy detergent"
  list on the page:     [ ] Buy detergent
  console:              (no messages)
  document.cookie:      ""

Page on http://localhost:5174: log in as Ada
  console:              Access to fetch at 'http://localhost:3000/login' from origin 'http://localhost:5174' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
  console:              Failed to load resource: net::ERR_FAILED
  message on the page:  Could not reach the server. Check your connection.
```

On the allowed origin everything worked, and `document.cookie` is empty although the browser holds a session: the cookie is `HttpOnly`. On port 5174, the login request (JSON, so preflighted) never got past the preflight. Same code, same server, one different port number: the browser refused, and the page's `ApiError` said "Could not reach the server", because a CORS block and a network failure look identical to JavaScript. The console, which only a developer sees, gives the real reason.

## Cancelling stale requests

The debounced search box from [Events](https://zudojs.oyinlola.site/learn/browser-events#debounce) still has one bug. The user types "ric", pauses, and a search starts. They type "e", and a second search starts. If the server answers "rice" quickly and "ric" slowly (a bigger result, a busier server), the old answer arrives last and overwrites the new one: the box says "rice" and the list shows results for "ric". Responses do not arrive in the order requests were sent. Here is the race against a real server whose answer for "ric" is slow:

race.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const products = ["Rice 5kg", "Rice 10kg", "Rice bran oil", "Palm oil 1L"];
const server = createServer(async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams.get("q") ?? "";
  await new Promise((resolve) => setTimeout(resolve, q === "ric" ? 150 : 20));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(products.filter((p) => p.toLowerCase().includes(q))));
});
server.listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}/search?q=`;

async function searchWithoutCancel(terms) {
  let shown;
  await Promise.all(terms.map(async (term, i) => {
    await new Promise((resolve) => setTimeout(resolve, i * 40));
    const results = await (await fetch(base + encodeURIComponent(term))).json();
    shown = { term, results };
  }));
  return shown;
}

async function searchWithCancel(terms) {
  let shown;
  let controller;
  await Promise.all(terms.map(async (term, i) => {
    await new Promise((resolve) => setTimeout(resolve, i * 40));
    controller?.abort();
    controller = new AbortController();
    try {
      const response = await fetch(base + encodeURIComponent(term), { signal: controller.signal });
      shown = { term, results: await response.json() };
    } catch (error) {
      if (error.name !== "AbortError") throw error;
      console.log(`  cancelled the search for "${term}"`);
    }
  }));
  return shown;
}

console.log("without cancelling:", await searchWithoutCancel(["ric", "rice 1"]));
console.log("with cancelling:", await searchWithCancel(["ric", "rice 1"]));
server.close();
```

Output of `node race.js`

```ts
without cancelling: { term: 'ric', results: [ 'Rice 5kg', 'Rice 10kg', 'Rice bran oil' ] }
  cancelled the search for "ric"
with cancelling: { term: 'rice 1', results: [ 'Rice 10kg' ] }
```

Without cancelling, the page ends up showing the slow, stale answer for "ric" (all three rice products) although the user typed "rice 1". With an `AbortController` per search, starting a new search aborts the previous request: its `fetch` rejects with an `AbortError`, which is expected and ignored, and only the latest answer is shown. Aborting also frees the browser's connection and, if the server listens for it, lets the server stop working on an answer nobody wants.

In the page, the same idea joins the debounce from Events. Here the "server" is a function with the same contract as `fetch` (it takes a `signal` and rejects with an `AbortError` when aborted), with simulated delays, because the preview has no search API to call:

search-box.js

```ts
const products = ["Rice 5kg", "Rice 10kg", "Rice bran oil", "Palm oil 1L"];
function searchApi(term, { signal }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(products.filter((p) => p.toLowerCase().includes(term))), term === "ric" ? 300 : 50);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

const input = document.querySelector("#search");
const list = document.querySelector("#results");
let controller;
let timer;

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const term = input.value.trim().toLowerCase();
    controller?.abort();
    controller = new AbortController();
    try {
      const results = await searchApi(term, { signal: controller.signal });
      list.replaceChildren(...results.map((name) => Object.assign(document.createElement("li"), { textContent: name })));
      console.log(`showing ${results.length} of ${products.length} products for "${term}"`);
    } catch (error) {
      if (error.name === "AbortError") console.log(`cancelled "${term}"`);
      else console.log("search failed:", error.message);
    }
  }, 100);
});

const type = (value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
type("ric");
await sleep(150);
type("rice 1");
await sleep(400);
console.log("list shows:", [...list.children].map((li) => li.textContent));
```

What the browser terminal prints

```ts
cancelled "ric"
showing 1 of 4 products for "rice 1"
list shows: [ 'Rice 10kg' ]
```

Two more tools from the same family. `AbortSignal.timeout(ms)` makes a signal that aborts by itself after `ms` milliseconds, with a `TimeoutError`; the API client uses it so that no request can hang forever. `AbortSignal.any([a, b])` combines signals, for a request that should stop on a timeout *or* when the user leaves the page. [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency) covers cancellation in depth.

## When networking fails

| Symptom | Usual cause |
| --- | --- |
| "No 'Access-Control-Allow-Origin' header is present" | The server does not allow this origin, or an error happened before the CORS headers were added (a crash, a proxy's error page). Check the server's log too. |
| "Response to preflight request doesn't pass access control check" | The `OPTIONS` request was rejected: often by an authentication check that runs before CORS and answers 401. Preflights never carry cookies, so CORS must answer them before any auth middleware. |
| "The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*' when the request's credentials mode is 'include'" | `*` with cookies. Echo the checked origin and add `Access-Control-Allow-Credentials: true`. |
| 401 on every request after a successful login | The cookie is not sent: `credentials: "include"` missing, a cross-site API with `SameSite=Lax`, or `Secure` cookies on plain HTTP outside localhost. |
| Code reads a header the Network tab shows, but gets `null` | Cross-origin responses expose only a few headers to JavaScript. The server must list others in `Access-Control-Expose-Headers`. `Set-Cookie` is never readable. |
| `response.json()` fails with a `SyntaxError` | The body is an HTML error page (404, a proxy's 502). Check `response.ok` and the content type first. |
| Old results replace new ones | A race between requests. Abort the previous one. |

> WATCH OUT
>
> `fetch(url, { mode: "no-cors" })` does not switch CORS off. It sends the request and gives you an **opaque** response: status 0, no headers, an empty body. It exists for caching things like images, not for reading APIs. When a CORS error appears, fix the server's headers.

## Testing networked code

- **Unit tests with a fake fetch.** `createTaskClient` accepts any `fetch`. A test passes a function that returns `new Response(…)` objects (or throws a `TypeError`, or waits past the timeout) and checks the `ApiError` that comes out.
- **Integration tests against the real server.** Start the API on port 0, call it with real HTTP, and close it, as every Node.js example in this lesson did. Test the headers too: that an unknown origin gets no `Access-Control-Allow-Origin`, that the session cookie is `HttpOnly`, that a preflight is answered without a session.
- **End-to-end tests in a real browser.** Only a real browser applies CORS, SameSite and cookie storage exactly. Tools such as Playwright drive Chromium, Firefox and WebKit through the front end and fail on console errors. A few such tests catch configuration mistakes that no unit test can.

## In production

- **Avoid CORS when you can.** Serve the front end and the API from one origin, with a reverse proxy sending `/api/*` to the Node.js server. Development servers such as Vite have a `proxy` setting that does the same on your machine. No cross-origin requests, no preflights, no CORS configuration to get wrong.
- **When you need CORS**, read the allowed origins from configuration, compare exactly (never with `startsWith` or a loose regular expression: `https://tasks.example.evil.com` starts with `https://tasks.example`), send `Vary: Origin`, and set `Access-Control-Max-Age` to cut preflights.
- **HTTPS everywhere**, with `Secure` cookies. Rotate the session id after login, expire sessions on the server, and delete them on logout.
- **CSRF**: `SameSite` cookies, JSON-only APIs and a check of the `Origin` header on state-changing requests, plus CSRF tokens for forms. See [Browser attacks and defences](https://zudojs.oyinlola.site/learn/sec-web).
- **Timeouts and retries.** Every request has a time limit. Retry only idempotent requests (`GET`, `PUT`, `DELETE`) automatically, with increasing delays; retry `POST` only with an idempotency key.
- **Rate limits** on `/login` and every public route, and error messages that do not reveal whether an email has an account.

## Practice

TRY IT YOURSELF

### Decide the CORS headers

Write `corsHeadersFor(request, allowedOrigins)`, a pure function that takes `{ method, origin, requestMethod }` and returns the headers the API should add. Unknown origins get only `Vary`. Preflights (`OPTIONS`) from allowed origins also get methods, headers and max-age.

**Show a solution**

cors-headers.js

```ts
function corsHeadersFor({ method, origin }, allowedOrigins) {
  const headers = { Vary: "Origin" };
  if (!origin || !allowedOrigins.includes(origin)) return headers;
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  if (method === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

const allowed = ["https://tasks.example", "http://localhost:5173"];
console.log(corsHeadersFor({ method: "GET", origin: "https://tasks.example" }, allowed));
console.log(corsHeadersFor({ method: "OPTIONS", origin: "http://localhost:5173" }, allowed));
console.log(corsHeadersFor({ method: "GET", origin: "https://tasks.example.evil.com" }, allowed));
console.log(corsHeadersFor({ method: "GET" }, allowed));
```

Output of `node cors-headers.js` and of the browser terminal

```json
{
  Vary: 'Origin',
  'Access-Control-Allow-Origin': 'https://tasks.example',
  'Access-Control-Allow-Credentials': 'true'
}
{
  Vary: 'Origin',
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600'
}
{ Vary: 'Origin' }
{ Vary: 'Origin' }
```

A pure function like this is trivial to test for every case, including the look-alike origin, and the middleware only copies its result onto the response.

TRY IT YOURSELF

### Retry safely

Write `withRetry(send, { method, attempts, delayMs })`. It calls `send()`, and retries after a network error (a `TypeError`) or a 503, waiting `delayMs`, then twice as long each time, up to `attempts` tries in total. It never retries a `POST`. Test it with fake responses.

**Show a solution**

retry.js

```ts
const IDEMPOTENT = ["GET", "HEAD", "PUT", "DELETE"];

async function withRetry(send, { method = "GET", attempts = 3, delayMs = 10 } = {}) {
  const tries = IDEMPOTENT.includes(method) ? attempts : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await send();
      if (response.status !== 503 || attempt === tries) return response;
      console.log(`  attempt ${attempt}: 503, retrying`);
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === tries) throw error;
      console.log(`  attempt ${attempt}: ${error.message}, retrying`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
  }
}

function flakyServer(script) {
  let call = 0;
  return async () => {
    const next = script[Math.min(call++, script.length - 1)];
    if (next === "down") throw new TypeError("Failed to fetch");
    return new Response(null, { status: next });
  };
}

console.log("GET:", (await withRetry(flakyServer(["down", 503, 200]))).status);
console.log("POST:", (await withRetry(flakyServer([503, 200]), { method: "POST" })).status);
try {
  await withRetry(flakyServer(["down"]), { attempts: 2 });
} catch (error) {
  console.log("gave up:", error.message);
}
```

Output of `node retry.js` and of the browser terminal

```ts
  attempt 1: Failed to fetch, retrying
  attempt 2: 503, retrying
GET: 200
POST: 503
  attempt 1: Failed to fetch, retrying
gave up: Failed to fetch
```

The `POST` got its 503 back after one attempt: the caller decides, and a real client would show "try again" rather than risk a duplicate order. Doubling the delay (**exponential backoff**) avoids hammering a server that is already struggling; production code also adds a little randomness so thousands of clients do not retry in step.

TRY IT YOURSELF

### Can JavaScript read this cookie?

Write `describeCookie(setCookieLine)` that parses a `Set-Cookie` value and reports its name, whether page JavaScript can read it, whether it is limited to HTTPS, and its `SameSite` value. When the attribute is missing, Chromium-based browsers treat the cookie as `Lax`, but not every browser does, so report it as not set.

**Show a solution**

describe-cookie.js

```ts
function describeCookie(line) {
  const [pair, ...attributes] = line.split(";").map((part) => part.trim());
  const name = pair.slice(0, pair.indexOf("="));
  const flags = new Map(attributes.map((a) => {
    const [key, value = ""] = a.split("=");
    return [key.toLowerCase(), value];
  }));
  return {
    name,
    readableByJs: !flags.has("httponly"),
    httpsOnly: flags.has("secure"),
    sameSite: flags.get("samesite") || "not set (Lax in Chromium)",
  };
}

console.log(describeCookie("session=4f1c9e; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600"));
console.log(describeCookie("theme=dark; Path=/"));
console.log(describeCookie("tracker=x1; SameSite=None; Secure"));
```

Output of `node describe-cookie.js` and of the browser terminal

```json
{
  name: 'session',
  readableByJs: false,
  httpsOnly: true,
  sameSite: 'Lax'
}
{
  name: 'theme',
  readableByJs: true,
  httpsOnly: false,
  sameSite: 'not set (Lax in Chromium)'
}
{
  name: 'tracker',
  readableByJs: true,
  httpsOnly: true,
  sameSite: 'None'
}
```

The theme cookie is fine to leave readable: the page needs it and it is not secret. A session cookie must always be `HttpOnly` and `Secure`, and should set `SameSite` explicitly rather than rely on a browser default.

## Summary

- A `fetch` resolves when the headers arrive; the body is read separately. The browser adds headers itself, forbids pages from setting `Cookie`, `Origin` and `Host`, and never shows them `Set-Cookie`.
- Send JSON with `Content-Type: application/json`, ask for it with `Accept`, and turn every failure (network, timeout, 4xx, 5xx, bad JSON) into one clear error type in a single API client.
- The same-origin policy stops pages from *reading* other origins' responses; it does not stop them from *sending* requests, which is why CSRF defences exist.
- CORS is the server's permission, checked by the browser: an exact `Access-Control-Allow-Origin` (never `*` with cookies), `Allow-Credentials`, and preflight answers for non-simple requests, handled before authentication.
- Browser apps prove identity with an `HttpOnly; Secure; SameSite` session cookie, not a key in JavaScript. Cross-origin requests need `credentials: "include"`.
- Abort stale requests with `AbortController`, and give every request a time limit with `AbortSignal.timeout`.

Next: [Real-time and background work](https://zudojs.oyinlola.site/learn/browser-realtime): the order-status page that updates itself, with WebSockets, Server-Sent Events and Web Workers.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

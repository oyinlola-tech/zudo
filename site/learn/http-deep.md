---
title: "HTTP in depth — ZudoJS Academy"
description: "See the exact bytes of an HTTP request and response, then learn the headers, content types, cookies, methods and status codes every backend relies on."
source: https://zudojs.oyinlola.site/learn/http-deep
---

LEVEL 7 · LESSON 1 OF 15

HTTP and REST Core

# HTTP in depth

See the exact bytes of an HTTP request and response, then learn the headers, content types, cookies, methods and status codes every backend relies on.

- **40 min** to read and try
- **You need:** An HTTP server with no framework, and Build a plain Node.js Task API
- **You build:** A small server that checks content types, reads JSON safely and sets a secure session cookie

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Read a raw HTTP request and response and name every part
- Watch any API conversation with curl -v
- Check Content-Type, parse JSON safely and answer 415 or 400 when the body is wrong
- Set a session cookie with HttpOnly, Secure, SameSite and Max-Age, and keep only a random id in it
- Decide from safety and idempotency whether a request may be retried
- Choose the right status code, including 401 vs 403 and 404 vs 405

## What a request really looks like

In [An HTTP server with no framework](https://zudojs.oyinlola.site/learn/node-http) you wrote a server, and `node:http` handed you a neat `req` object. Under that object there is only text, sent over a network connection. That text follows a set of rules called **HTTP** (HyperText Transfer Protocol). A **protocol** is an agreement about who says what, and in which format.

This course starts with the parts every backend shares, whatever language it is written in: HTTP, REST design and SQL. So the first lessons use short, plain JavaScript examples that you can read at a glance. From [TypeScript on Node.js](https://zudojs.oyinlola.site/learn/ts-node) on, everything is typed, and you build the BookStore API in TypeScript.

To see the text itself, skip `node:http` and use `node:net`, which gives you the raw connection. This server prints every byte it receives, then answers by writing an HTTP response by hand. `fetch` plays the client:

raw-request.jsNode.js only

```ts
import net from "node:net";

const server = net.createServer((socket) => {
  socket.once("data", (bytes) => {
    console.log("--- the exact bytes fetch sent ---");
    console.log(bytes.toString().replaceAll("\r\n", "\\r\\n\n"));
    socket.end("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello");
  });
});

server.listen(0, async () => {
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/tasks?done=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Buy milk" }),
  });
  console.log("--- what fetch understood ---");
  console.log(res.status, res.statusText, res.headers.get("content-type"));
  console.log(await res.text());
  server.close();
});
```

Output of `node raw-request.js`

```ts
--- the exact bytes fetch sent ---
POST /tasks?done=false HTTP/1.1\r\n
host: localhost:41855\r\n
connection: keep-alive\r\n
Content-Type: application/json\r\n
accept: */*\r\n
accept-language: *\r\n
sec-fetch-mode: cors\r\n
user-agent: node\r\n
accept-encoding: gzip, deflate\r\n
content-length: 20\r\n
\r\n
{"title":"Buy milk"}
--- what fetch understood ---
200 OK text/plain
hello
```

`listen(0)` asks the operating system for any free port, so the example never clashes with another program. We print `\r\n` where the real text has a line break, because HTTP ends every line with two invisible characters: carriage return (`\r`) and line feed (`\n`).

A request has four parts:

1. The **request line**: the **method** (`POST`), the **path** with its query string (`/tasks?done=false`) and the **version** (`HTTP/1.1`).
2. **Headers**: one `name: value` pair per line. They describe the request. `host` says which site you want, `content-type` says what the body is, `content-length` says how many bytes it has.
3. An **empty line**. It means "the headers are finished".
4. The **body**: exactly `content-length` bytes. Here, 20 bytes of JSON.

`fetch` added several headers you did not ask for, like `user-agent: node` (which program is asking) and `accept-encoding` (which compressions it can undo).

## What a response really looks like

Now the other direction. This time `node:http` is the server, and a raw `node:net` connection sends a request typed by hand and prints the answer byte for byte:

raw-response.jsNode.js only

```ts
import http from "node:http";
import net from "node:net";

const server = http.createServer((req, res) => {
  res.sendDate = false;
  const body = JSON.stringify([{ id: 1, title: "Buy milk", done: false }]);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
});

server.listen(0, () => {
  const socket = net.connect(server.address().port, "localhost");
  socket.write("GET /tasks HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
  let raw = "";
  socket.on("data", (bytes) => (raw += bytes));
  socket.on("end", () => {
    console.log(raw.replaceAll("\r\n", "\\r\\n\n"));
    server.close();
  });
});
```

Output of `node raw-response.js`

```ts
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
Content-Length: 42\r\n
Connection: close\r\n
\r\n
[{"id":1,"title":"Buy milk","done":false}]
```

`res.sendDate = false` only stops Node from adding a `Date` header, so the output is the same every time you run it. A response has the same shape as a request:

1. The **status line**: the version, a **status code** (`200`) and a short **reason phrase** (`OK`) for humans.
2. Headers.
3. An empty line.
4. The body.

`Content-Length` counts **bytes**, not characters. `Buffer.byteLength` gets it right even when the text has letters like `é` that take two bytes. If you leave the header out, Node sends the body in pieces instead (`Transfer-Encoding: chunked`), which is also valid.

## Watching HTTP with curl

**curl** is a command-line HTTP client. It comes with macOS, Windows 10 and later, and most Linux systems. Its `-v` (verbose) flag prints the whole conversation, which makes it the first tool to reach for when an API does something strange.

Save this small server, a trimmed-down version of your Task API, and start it with `node server.js`. It keeps running until you press Ctrl+C:

server.jsNode.js only

```ts
import http from "node:http";

const tasks = [{ id: 1, title: "Buy milk", done: false }];

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/tasks") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(tasks));
    return;
  }
  if (req.method === "POST" && req.url === "/tasks") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let title;
    try {
      title = JSON.parse(body).title;
    } catch {
      title = undefined;
    }
    if (typeof title !== "string" || title.trim() === "") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Send JSON with a non-empty title" }));
      return;
    }
    const task = { id: tasks.length + 1, title: title.trim(), done: false };
    tasks.push(task);
    res.writeHead(201, { "Content-Type": "application/json", Location: `/tasks/${task.id}` });
    res.end(JSON.stringify(task));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(3000, () => console.log("Listening on http://localhost:3000"));
```

In a second terminal:

Terminal on your computer

```bash
$ curl -v http://localhost:3000/tasks
* Host localhost:3000 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:3000...
* Established connection to localhost (::1 port 3000) from ::1 port 36778
* using HTTP/1.x
> GET /tasks HTTP/1.1
> Host: localhost:3000
> User-Agent: curl/8.21.0
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 200 OK
< Content-Type: application/json
< Date: Wed, 23 Sep 2026 13:13:21 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
< Transfer-Encoding: chunked
<
* Connection #0 to host localhost:3000 left intact
[{"id":1,"title":"Buy milk","done":false}]
```

Lines starting with `*` are curl's own notes: it looked up `localhost` and opened a connection. Lines starting with `>` are the request it sent, and lines starting with `<` are the response it got. The last line is the body. Node added `Date`, `Connection` and `Keep-Alive` by itself; `keep-alive` means the connection stays open for the next request instead of being rebuilt each time.

To send a body, give curl a method with `-X`, a header with `-H` and the data with `-d`. `-i` prints the response headers without curl's notes:

Terminal on your computer

```bash
$ curl -i -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Call Ada"}'
HTTP/1.1 201 Created
Content-Type: application/json
Location: /tasks/2
Date: Wed, 23 Sep 2026 13:13:21 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"id":2,"title":"Call Ada","done":false}
```

> NOTE
>
> On Windows PowerShell, `curl` may be a different command. Type `curl.exe` instead, and put the JSON in double quotes with the inner quotes escaped: `-d "{\"title\":\"Call Ada\"}"`.

## Headers and content types

Header names are not case sensitive: `Content-Type` and `content-type` are the same header. `node:http` gives you `req.headers` with every name in lower case, so always read them in lower case.

The most important header for an API is `Content-Type`. It names the format of the body with a **media type**: `application/json` for JSON, `text/plain` for plain text, `text/html` for a web page, `application/x-www-form-urlencoded` for a classic HTML form. It may carry extra parameters after a semicolon, like `application/json; charset=utf-8`.

A body is outside input, so a server must not trust it. This server accepts a new task only if the client says the body is JSON, the JSON is valid, and the title is a non-empty string. Each failure gets its own status code:

json-body.jsNode.js only

```ts
import http from "node:http";

const tasks = [];

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (type !== "application/json") {
    return send(res, 415, { error: "Send the body as application/json" });
  }
  let text = "";
  for await (const chunk of req) text += chunk;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return send(res, 400, { error: "The body is not valid JSON" });
  }
  if (typeof body?.title !== "string" || body.title.trim() === "") {
    return send(res, 400, { error: "title must be a non-empty string" });
  }
  const task = { id: tasks.length + 1, title: body.title.trim(), done: false };
  tasks.push(task);
  send(res, 201, task);
});

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/tasks`;
  const tries = [
    ["text/plain", "Buy milk"],
    ["application/json", "{title: 'Buy milk'}"],
    ["application/json; charset=utf-8", '{"title": 42}'],
    ["application/json", '{"title": "  Buy milk  "}'],
  ];
  for (const [type, body] of tries) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": type }, body });
    console.log(res.status, await res.json());
  }
  server.close();
});
```

Output of `node json-body.js`

```ts
415 { error: 'Send the body as application/json' }
400 { error: 'The body is not valid JSON' }
400 { error: 'title must be a non-empty string' }
201 { id: 1, title: 'Buy milk', done: false }
```

Read the four answers:

- **415 Unsupported Media Type**: the client sent plain text to an endpoint that only speaks JSON.
- **400 Bad Request**: `{title: 'Buy milk'}` is valid JavaScript but not valid JSON. JSON needs double quotes around names and strings. Without the `try`/`catch`, `JSON.parse` would throw and crash the request.
- **400 Bad Request** again: the JSON is fine, but a title must be text. The `; charset=utf-8` part was accepted because the server compares only the part before the semicolon.
- **201 Created**: everything is valid, and the title was trimmed.

The body is read with `for await` because it arrives in pieces over the connection, as you saw in [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams). A real server also limits how many bytes it reads, so nobody can send a gigabyte of "JSON".

### Headers that control caching

Browsers, proxies and CDNs keep copies of responses to avoid asking again. The server decides what they may keep with the `Cache-Control` response header:

- `Cache-Control: no-store`: never keep a copy. Use it for anything personal, such as an account page or an API answer with a user's orders.
- `Cache-Control: private, max-age=60`: only the user's own browser may keep it, for 60 seconds.
- `Cache-Control: public, max-age=86400`: anyone, including a shared CDN, may keep it for a day. Right for a logo or a product photo.

With an `ETag` header (a version label for the response), a browser can later ask "has it changed?" by sending that label back in `If-None-Match`. If it has not, the server answers **304 Not Modified** with no body, and the browser reuses its copy. [Caching](https://zudojs.oyinlola.site/learn/backend-caching), later in this course, builds caches inside your own server.

## Cookies

HTTP does not remember anything between two requests. Each one stands alone. A **cookie** is how a server asks the browser to remember a small piece of text and send it back on every later request. It is how "you are still logged in" works.

The server sets a cookie with a `Set-Cookie` response header. The browser sends it back in a `Cookie` request header. The attributes after the value are rules for the browser:

| Attribute | What it does |
| --- | --- |
| `HttpOnly` | JavaScript on the page cannot read the cookie. If an attacker manages to run a script on your site, it still cannot steal the session. |
| `Secure` | The browser sends the cookie only over HTTPS, never over plain HTTP where anyone on the network could read it. (Browsers make an exception for `http://localhost`, so it works while you develop.) |
| `SameSite=Lax` | The browser does not send the cookie with most requests started by other sites. This blocks many cross-site request forgery (CSRF) attacks. `Strict` is even tighter; `None` turns the protection off and needs `Secure`. |
| `Max-Age=3600` | The cookie expires after 3600 seconds. Without it (or an `Expires` date), it is a *session cookie*, which the browser drops when it closes. |
| `Path=/` | Send the cookie for every path on the site. |

Writing and reading these headers is plain string work, so it runs in the browser too:

cookie.js

```ts
function serializeCookie(name, value, maxAgeSeconds) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

console.log(serializeCookie("theme", "dark mode", 3600));
console.log(parseCookies("theme=dark%20mode; lang=en"));
console.log(parseCookies(undefined));
```

Output of `node cookie.js` and of the browser terminal

```ts
theme=dark%20mode; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax
{ theme: 'dark mode', lang: 'en' }
{}
```

`encodeURIComponent` turns characters that are not allowed in a cookie, like the space, into `%20`. `parseCookies` splits on the first `=` only, because a value may contain one.

Now a login flow. The server stores sessions in a `Map`, gives each one a random id nobody can guess, and sends only that id in the cookie. The user's data never leaves the server. A real login checks a password first; this one skips that step to keep the focus on cookies. The browser would send the cookie back by itself; here `fetch` plays the browser, so the example copies it by hand:

session.jsNode.js only

```ts
import http from "node:http";
import { randomUUID } from "node:crypto";

const sessions = new Map();

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/login") {
    const id = randomUUID();
    sessions.set(id, { user: "ada" });
    res.setHeader("Set-Cookie", `sid=${id}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`);
    res.writeHead(204).end();
    return;
  }
  const sid = (req.headers.cookie ?? "").match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
  const session = sessions.get(sid);
  res.writeHead(session ? 200 : 401, { "Content-Type": "application/json" });
  res.end(JSON.stringify(session ?? { error: "Log in first" }));
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const login = await fetch(`${base}/login`, { method: "POST" });
  const setCookie = login.headers.get("set-cookie");
  console.log(login.status, setCookie);

  const cookie = setCookie.split(";")[0];
  const me = await fetch(`${base}/me`, { headers: { Cookie: cookie } });
  console.log(me.status, await me.json());

  const stranger = await fetch(`${base}/me`);
  console.log(stranger.status, await stranger.json());
  server.close();
});
```

Output of `node session.js`

```ts
204 sid=560ddd14-acff-481e-ab70-e68c4f621a66; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax
200 { user: 'ada' }
401 { error: 'Log in first' }
```

The id is different on every run. **204 No Content** means "it worked and there is no body". The request without the cookie got **401 Unauthorized**. The `Secure` attribute did not stop this example, because only browsers enforce the attributes; `fetch` in Node ignores them.

> A cookie is not a place for data
>
> Never put a user id, a role or anything you trust into a cookie as plain text: the user can edit their own cookies. Send a long random id and look it up on the server, as above. [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication), in the Security course, comes back to sessions and tokens in depth, and `@zudojs/auth` provides ready-made, tested code for them.

## Methods: safe and idempotent

The method says what the client wants to do. Two properties matter when you design an API:

- A **safe** method only reads. It never changes anything on the server, so browsers, caches and search engines may call it freely.
- An **idempotent** method has the same effect whether you send it once or ten times. If a network error hides the answer, the client can simply send it again.

| Method | Used for | Safe | Idempotent |
| --- | --- | --- | --- |
| `GET` | Read a resource | Yes | Yes |
| `HEAD` | Like GET, but headers only, no body | Yes | Yes |
| `OPTIONS` | Ask which methods are allowed | Yes | Yes |
| `POST` | Create something, or run an action | No | No |
| `PUT` | Replace a resource completely | No | Yes |
| `PATCH` | Change part of a resource | No | Not guaranteed |
| `DELETE` | Remove a resource | No | Yes |

See the difference with an array standing in for the database. Sending the same `POST` twice creates two tasks. Sending the same `PUT` twice leaves one task in the same state:

idempotent.js

```ts
const tasks = [];

function post(body) {
  tasks.push({ id: tasks.length + 1, ...body });
}

function put(id, body) {
  const i = tasks.findIndex((t) => t.id === id);
  tasks[i] = { id, ...body };
}

post({ title: "Buy milk", done: false });
post({ title: "Buy milk", done: false });
console.log("after two POSTs:", tasks.length, "tasks");

put(1, { title: "Buy oat milk", done: true });
put(1, { title: "Buy oat milk", done: true });
console.log("after two PUTs:", tasks);
```

Output of `node idempotent.js` and of the browser terminal

```ts
after two POSTs: 2 tasks
after two PUTs: [
  { id: 1, title: 'Buy oat milk', done: true },
  { id: 2, title: 'Buy milk', done: false }
]
```

That is why a browser warns you before it resends a form (a `POST`), but reloads a normal page (a `GET`) without asking. Never change data in a `GET` handler: a link preview or a search engine could trigger it.

REASON IT OUT

### The answer never arrived

A mobile app sends a request, the train enters a tunnel, and the connection drops before the response arrives. The app does not know whether the server did the work. For each request, decide: may the app simply send it again?

- `GET /tasks/7`
- `PUT /tasks/7` with `{"title": "Buy oat milk", "done": true}`
- `DELETE /tasks/7`. The first attempt did delete it; what does the retry answer?
- `POST /transfers` with `{"to": "0123456789", "amountKobo": 500000}`

**Show the reasoning**

`GET` is safe: it changed nothing, so repeating it is harmless. `PUT` is idempotent: the second one sets the task to the same state again, so the result is the same whether the first one arrived or not.

`DELETE` is idempotent too, but look closely at what that means. The retry probably answers **404 Not Found**, because the task is already gone. Idempotency is about the *state of the server* (after one or two deletes, task 7 is gone either way), not about getting the same status code back. A client that retries a `DELETE` should treat 404 as "done".

`POST /transfers` is neither safe nor idempotent. If the first request arrived, a retry sends ₦5,000 a second time. The app must not retry it blindly. The standard fix is an **idempotency key**: the client sends a unique id with the request, and the server remembers which ids it has already carried out. [Idempotency and safe retries](https://zudojs.oyinlola.site/learn/api-idempotency) builds that.

## Status codes

The first digit of a status code gives its **class**, so a client knows roughly what happened even for a code it has never seen:

- **1xx** informational: "keep going". You rarely handle these yourself.
- **2xx** success.
- **3xx** redirection: the thing is somewhere else; look in the `Location` header.
- **4xx** client error: the request was wrong. Sending it again unchanged will fail again.
- **5xx** server error: the request may be fine, the server failed. Trying again later can work.

Node knows the reason phrase for every standard code in `http.STATUS_CODES`. These are the ones you will use most:

status.jsNode.js only

```ts
import { STATUS_CODES } from "node:http";

const classes = { 1: "informational", 2: "success", 3: "redirection", 4: "client error", 5: "server error" };
const common = [200, 201, 204, 301, 304, 400, 401, 403, 404, 405, 409, 415, 422, 429, 500, 503];

for (const code of common) {
  const kind = classes[Math.floor(code / 100)];
  console.log(code, STATUS_CODES[code].padEnd(24), kind);
}
```

Output of `node status.js`

```ts
200 OK                       success
201 Created                  success
204 No Content               success
301 Moved Permanently        redirection
304 Not Modified             redirection
400 Bad Request              client error
401 Unauthorized             client error
403 Forbidden                client error
404 Not Found                client error
405 Method Not Allowed       client error
409 Conflict                 client error
415 Unsupported Media Type   client error
422 Unprocessable Entity     client error
429 Too Many Requests        client error
500 Internal Server Error    server error
503 Service Unavailable      server error
```

A few that beginners often mix up:

- **401 Unauthorized** means "I do not know who you are": log in. **403 Forbidden** means "I know who you are, and you may not do this".
- **400 Bad Request** is for a request the server cannot read. **422 Unprocessable Content** (Node still prints its older name, Unprocessable Entity) is sometimes used when the server can read the request but the values break a rule. Pick one style and use it everywhere.
- **404 Not Found**: no such resource. **405 Method Not Allowed**: the resource exists, but not with this method. Send an `Allow` header listing the methods that work.
- **409 Conflict**: the request clashes with the current state, like a duplicate title.
- **429 Too Many Requests**: slow down. It is what a rate limiter sends.
- **500 Internal Server Error**: your bug. Log the details on the server, but never send the stack trace to the client.

## Practice

TRY IT YOURSELF

### Allow only GET and POST

Write a server for `/tasks` that answers `GET` with 200 and a JSON list, and any other method except `POST` with **405**, an `Allow: GET, POST` header and a JSON error. Test it with `fetch` for `GET` and `DELETE`, then close the server.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Check `req.method`: handle `"GET"` first, then treat everything that is not `"POST"` as not allowed.

HINT 2

The 405 branch needs both the header and a JSON body: `res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST" })`, then `res.end(JSON.stringify({ error: \`${req.method} is not allowed here\` }))`.

SOLUTION

allow.jsNode.js only

```ts
import http from "node:http";

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify([]));
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST" });
    return res.end(JSON.stringify({ error: `${req.method} is not allowed here` }));
  }
  res.writeHead(201).end();
});

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/tasks`;
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(url, { method });
    console.log(method, res.status, res.headers.get("allow"), await res.json());
  }
  server.close();
});
```

Output of `node allow.js`

```ts
GET 200 null []
DELETE 405 GET, POST { error: 'DELETE is not allowed here' }
```

TRY IT YOURSELF

### A session cookie builder

Write `sessionCookie(id)` that returns a `Set-Cookie` value for a cookie named `sid`, valid for 7 days, with all the safe attributes from this lesson. Then write `clearSessionCookie()` that logs the user out. Hint: a cookie with `Max-Age=0` is deleted at once.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Build the string with a template literal: start with `sid=`, then `encodeURIComponent(id)`, then the shared attributes joined with `; `.

HINT 2

`Max-Age` is in seconds: `7 * DAY` for the session, `0` to clear it. Keep `Path=/; HttpOnly; Secure; SameSite=Lax` the same in both functions.

SOLUTION

session-cookie.js

```ts
const DAY = 24 * 60 * 60;

function sessionCookie(id) {
  return `sid=${encodeURIComponent(id)}; Path=/; Max-Age=${7 * DAY}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return "sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

console.log(sessionCookie("3f9c2a"));
console.log(clearSessionCookie());
```

Output of `node session-cookie.js` and of the browser terminal

```ts
sid=3f9c2a; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax
sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax
```

The cookie that clears must have the same name and `Path` as the one that set it, or the browser treats it as a different cookie.

TRY IT YOURSELF

### Which status code?

For each situation, pick a status code: (a) a task was created; (b) `DELETE /tasks/9` worked and there is nothing to return; (c) the client is logged in but tries to delete another user's task; (d) the client sent `{"title": ""}`; (e) the database is down.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Which of these responses carries a body, and which is deliberately empty?

HINT 2

For (c), consider whether telling an attacker "that task exists, but it isn't yours" is safe, or whether hiding its existence is better.

HINT 3

Re-read the [Status codes](#status) section above for the 2xx, 4xx and 5xx ranges before you commit to an answer.

SOLUTION

(a) 201 Created, with a `Location` header. (b) 204 No Content. (c) 403 Forbidden, or 404 Not Found if you do not want to reveal that the task exists. (d) 400 Bad Request (or 422, if that is your API's style). (e) 503 Service Unavailable, or 500.

## Recap

- An HTTP request is text: a request line (method, path, version), headers, an empty line and an optional body. A response has a status line, headers, an empty line and a body.
- `curl -v` shows the whole conversation. Use it whenever an API surprises you.
- `Content-Type` names the body's format. Check it, parse JSON inside `try`/`catch`, and validate every field.
- Cookies carry a random session id, never trusted data. Set `HttpOnly`, `Secure`, `SameSite=Lax` and a `Max-Age`.
- GET, HEAD and OPTIONS are safe. PUT and DELETE are idempotent. POST is neither.
- `Cache-Control` tells browsers and CDNs what they may keep: `no-store` for personal data, `max-age` for the rest.
- 2xx success, 3xx look elsewhere, 4xx the client's mistake, 5xx the server's.

Next: [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design), where you turn these building blocks into an API that other developers can guess.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

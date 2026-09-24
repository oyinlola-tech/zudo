---
title: "An HTTP server with no framework"
description: "Build a web server with nothing but Node.js's node:http module. Read the method, path, headers, query and body of each request, send JSON back with the right status code, and route requests by hand."
source: https://zudojs.oyinlola.site/learn/node-http
---

LESSON 23 OF 84

Node.js and npm Foundation

# An HTTP server with no framework

Build a web server with nothing but Node.js's node:http module. Read the method, path, headers, query and body of each request, send JSON back with the right status code, and route requests by hand.

- **40 min** to read and try
- **You need:** npm and packages
- **You build:** A small tasks server that lists, finds and creates tasks, tested with fetch and curl

  [Test yourself](#test)

## Your first server

In [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works) you saw that a browser or an app sends a **request** to a server, and the server sends back a **response** with a status code and a body. Node.js can be that server with its built-in `node:http` module, and no packages at all.

`createServer` takes one function, the **request handler**. Node.js calls it once for every request, with two objects: `req` (the request that arrived) and `res` (the response you are building). `server.listen(port)` starts listening on a port.

A server runs until you stop it, which makes it hard to show its output on a page. So every example in this lesson does the same four things: start the server on port `0`, which means "any free port", call itself with `fetch`, print what came back, and close the server. You will run a real, long-lived server at the end.

hello-server.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Hello from Node.js\n");
});

server.listen(0);
await once(server, "listening");
const { port } = server.address();

const response = await fetch(`http://localhost:${port}/`);
console.log(response.status, response.headers.get("content-type"));
console.log(await response.text());

server.close();
```

Output of `node hello-server.js`

```ts
200 text/plain; charset=utf-8
Hello from Node.js
```

- `res.statusCode` sets the status code. 200 means OK.
- `res.setHeader(name, value)` adds a **header**, a named piece of information about the response. `Content-Type` tells the client what kind of data the body is.
- `res.end(body)` sends the body and finishes the response. Every request must end with exactly one `res.end`, or the client waits forever.
- `once(server, "listening")` waits until the server is ready. `server.address().port` is the free port the system picked.

## What a request contains

The `req` object tells you what the client wants: the **method** (`GET` to read, `POST` to create, and others), the **URL** (the path and query after the host name) and the **headers**. This server sends those three things back as JSON:

echo.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const server = createServer((req, res) => {
  const info = {
    method: req.method,
    url: req.url,
    accept: req.headers.accept,
    userAgent: req.headers["user-agent"],
  };
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(info));
});

server.listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}`;

const response = await fetch(`${base}/tasks?done=true`, {
  method: "DELETE",
  headers: { Accept: "application/json" },
});
console.log(await response.json());

server.close();
```

Output of `node echo.js`

```json
{
  method: 'DELETE',
  url: '/tasks?done=true',
  accept: 'application/json',
  userAgent: 'node'
}
```

Header names arrive in lower case, whatever case the client used, so you always read `req.headers.accept` or `req.headers["user-agent"]`. `fetch` in Node.js calls itself `node`; a browser or `curl` sends its own name.

A JSON response is text too: `JSON.stringify` turns the object into text, and `Content-Type: application/json` tells the client how to read it. On the other side, `response.json()` turns it back into an object.

## Routes by hand

A **route** is a method plus a path that the server knows how to answer, such as `GET /tasks`. With no framework, routing is an `if` for each route. Anything else gets **404 Not Found**, and a known path with the wrong method gets **405 Method Not Allowed**:

routes.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write report", done: true },
];

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.url === "/tasks" && req.method === "GET") {
    return sendJson(res, 200, tasks);
  }
  if (req.url === "/tasks") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }
  sendJson(res, 404, { error: "Not Found" });
});

server.listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}`;

for (const [method, path] of [["GET", "/tasks"], ["PUT", "/tasks"], ["GET", "/users"]]) {
  const response = await fetch(base + path, { method });
  console.log(method, path, response.status, await response.text());
}

server.close();
```

Output of `node routes.js`

```ts
GET /tasks 200 [{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Write report","done":true}]
PUT /tasks 405 {"error":"Method Not Allowed"}
GET /users 404 {"error":"Not Found"}
```

`sendJson` is a small helper so every JSON answer sets its status and header the same way. The 405 answer also sends an `Allow` header saying which methods would have worked.

## Route parameters and query parameters

### Route parameters

To fetch one task, the id goes in the path: `/tasks/2`. The varying part of a path is called a **route parameter**. Without a framework, you match it yourself. This function compares a pattern like `/tasks/:id` with a real path, part by part. It is plain JavaScript, so you can run it in the browser:

match.js

```ts
function matchRoute(pattern, path) {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

console.log(matchRoute("/tasks/:id", "/tasks/42"));
console.log(matchRoute("/tasks/:id", "/tasks"));
console.log(matchRoute("/users/:userId/tasks/:id", "/users/7/tasks/3"));
console.log(matchRoute("/tasks/:id", "/tasks/buy%20milk"));
```

Output of `node match.js` and of the browser terminal

```json
{ id: '42' }
null
{ userId: '7', id: '3' }
{ id: 'buy milk' }
```

A parameter is always text, and it is input from a stranger. `"42"` is not the number 42, and the last call shows that anything can arrive, even with spaces encoded as `%20`. Always check it before use:

parse-id.js

```ts
function parseId(text) {
  if (!/^[1-9][0-9]{0,8}$/.test(text)) return null;
  return Number(text);
}

for (const input of ["42", "0", "-3", "4.5", "abc", "12abc", "99999999999"]) {
  console.log(JSON.stringify(input), "->", parseId(input));
}
```

Output of `node parse-id.js` and of the browser terminal

```ts
"42" -> 42
"0" -> null
"-3" -> null
"4.5" -> null
"abc" -> null
"12abc" -> null
"99999999999" -> null
```

The pattern accepts only whole numbers from 1 up to nine digits. `Number("12abc")` would give `NaN` and `Number("")` gives `0`, so checking the text first is safer than converting and hoping.

### Query parameters

The part of a URL after `?` is the **query string**, used for options such as filters: `/tasks?done=true&limit=10`. `req.url` contains it, and the global `URL` class takes it apart. `req.url` is only the path, so give `URL` a base to complete it:

query.js

```ts
const url = new URL("/tasks?done=true&limit=10&tag=home&tag=urgent", "http://localhost");

console.log(url.pathname);
console.log(url.searchParams.get("done"));
console.log(url.searchParams.get("limit"));
console.log(url.searchParams.get("page"));
console.log(url.searchParams.getAll("tag"));
```

Output of `node query.js` and of the browser terminal

```ts
/tasks
true
10
null
[ 'home', 'urgent' ]
```

Route on `url.pathname`, not on `req.url`, or `/tasks?done=true` would not match `/tasks`. Query values are text too (`"true"`, `"10"`), and a missing one is `null`.

## Reading a request body

A `POST` request carries data in its **body**, usually JSON. You met streams in [Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams): `req` is a readable stream, so the body arrives in chunks. Collect them, join them, then decode. Three things can go wrong, and each has its own status code:

- The body is too big: **413 Content Too Large**. Without a limit, anyone can send gigabytes and fill your server's memory.
- The body is not JSON: **415 Unsupported Media Type** when the `Content-Type` is wrong, or **400 Bad Request** when the text does not parse.

body.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const LIMIT = 1024;

async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    return { status: 415, error: "Send JSON with Content-Type: application/json" };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMIT) return { status: 413, error: `Body larger than ${LIMIT} bytes` };
    chunks.push(chunk);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { status: 400, error: "Body is not valid JSON" };
  }
}

const server = createServer(async (req, res) => {
  const result = await readJson(req);
  res.statusCode = result.error ? result.status : 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result.error ? { error: result.error } : { received: result.body }));
});

server.listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}`;
const json = { "Content-Type": "application/json" };

const tries = [
  { headers: json, body: '{"title":"Buy milk"}' },
  { headers: json, body: "{title: Buy milk" },
  { headers: { "Content-Type": "text/plain" }, body: "Buy milk" },
  { headers: json, body: JSON.stringify({ title: "x".repeat(2000) }) },
];
for (const options of tries) {
  const response = await fetch(base, { method: "POST", ...options });
  console.log(response.status, await response.text());
}

server.close();
```

Output of `node body.js`

```ts
200 {"received":{"title":"Buy milk"}}
400 {"error":"Body is not valid JSON"}
415 {"error":"Send JSON with Content-Type: application/json"}
413 {"error":"Body larger than 1024 bytes"}
```

The chunks are joined as bytes with `Buffer.concat` before decoding, so a character cut in half between two chunks is decoded correctly. The loop stops reading as soon as the limit is passed, instead of reading everything first. Real limits are larger, often 100 KB to 1 MB for JSON, but never missing.

> NOTE
>
> The error message the client sees is short and written by you. The `SyntaxError` from `JSON.parse` stays on the server. Error messages you did not write can reveal details about your code, so never send them to clients as they are.

## Status codes you will use

The status code is the first thing a client checks. The first digit says what kind of answer it is: 2xx success, 4xx the client made a mistake, 5xx the server failed. These cover almost everything a JSON API does:

- **200 OK**: here is what you asked for.
- **201 Created**: a new record was made. Often sent with a `Location` header pointing to it.
- **204 No Content**: done, nothing to send back (typical for a delete).
- **400 Bad Request**: the input is broken or invalid.
- **401 Unauthorized**: who are you? Log in first. **403 Forbidden**: I know who you are, and you may not do this.
- **404 Not Found**: no such route or record. **405 Method Not Allowed**: the path exists, but not with this method.
- **413 Content Too Large** and **415 Unsupported Media Type**: the body is too big or of the wrong type.
- **500 Internal Server Error**: something broke on the server. Not the client's fault.

`node:http` knows the standard phrase for each code:

codes.jsNode.js only

```ts
import { STATUS_CODES } from "node:http";

for (const code of [200, 201, 204, 400, 401, 403, 404, 405, 413, 415, 500]) {
  console.log(code, STATUS_CODES[code]);
}
```

Output of `node codes.js`

```ts
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
405 Method Not Allowed
413 Payload Too Large
415 Unsupported Media Type
500 Internal Server Error
```

Node.js still uses the older name for 413, "Payload Too Large". The current HTTP standard calls it "Content Too Large"; the number is what counts. [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep) covers the rest.

## Build: a small tasks server

Put everything together: list tasks with an optional `?done=` filter, fetch one by id, and create one from a JSON body. Save it as `server.js`. It exports a `createTaskServer` function and, only when you run it directly, starts listening on port 3000:

server.jsNode.js only

```ts
import { createServer } from "node:http";

const tasks = [{ id: 1, title: "Buy milk", done: false }];
let nextId = 2;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 10_000) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    return { status: 415, error: "Send JSON with Content-Type: application/json" };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return { status: 413, error: `Body larger than ${limit} bytes` };
    chunks.push(chunk);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { status: 400, error: "Body is not valid JSON" };
  }
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const idMatch = url.pathname.match(/^\/tasks\/([1-9][0-9]{0,8})$/);

  if (url.pathname === "/tasks" && req.method === "GET") {
    const done = url.searchParams.get("done");
    const list = done === null ? tasks : tasks.filter((t) => String(t.done) === done);
    return sendJson(res, 200, list);
  }
  if (url.pathname === "/tasks" && req.method === "POST") {
    const { body, status, error } = await readJson(req);
    if (error) return sendJson(res, status, { error });
    if (typeof body?.title !== "string" || body.title.trim() === "" || body.title.length > 200) {
      return sendJson(res, 400, { error: "title must be a non-empty string of at most 200 characters" });
    }
    const task = { id: nextId++, title: body.title.trim(), done: false };
    tasks.push(task);
    res.setHeader("Location", `/tasks/${task.id}`);
    return sendJson(res, 201, task);
  }
  if (idMatch && req.method === "GET") {
    const task = tasks.find((t) => t.id === Number(idMatch[1]));
    return task ? sendJson(res, 200, task) : sendJson(res, 404, { error: "Task not found" });
  }
  sendJson(res, 404, { error: "Not Found" });
}

export function createTaskServer() {
  return createServer(handle);
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 3000);
  createTaskServer().listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
```

A few details:

- `req.setEncoding("utf8")` makes the stream decode bytes to text for you, and it handles characters split between chunks correctly.
- The route for one task uses a regular expression that only matches a valid id, so `/tasks/abc` falls through to 404.
- The title is validated: it must be text, not empty, and not absurdly long. `body?.title` also copes with a body of `null`.
- `process.argv[1] === import.meta.filename` is true only when you run `node server.js`, not when another file imports it. That lets the next file test the server without starting it on port 3000.

The test file starts it on a free port and exercises every route:

try-server.jsNode.js only

```ts
import { once } from "node:events";
import { createTaskServer } from "./server.js";

const server = createTaskServer().listen(0);
await once(server, "listening");
const base = `http://localhost:${server.address().port}`;

async function call(method, path, body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) options.body = body;
  const response = await fetch(base + path, options);
  const location = response.headers.get("location");
  console.log(method, path, "->", response.status, await response.text(), location ?? "");
}

await call("POST", "/tasks", JSON.stringify({ title: "  Write report  " }));
await call("POST", "/tasks", JSON.stringify({ title: "" }));
await call("POST", "/tasks", "not json");
await call("GET", "/tasks/2");
await call("GET", "/tasks/9");
await call("GET", "/tasks/abc");
await call("GET", "/tasks?done=false");

server.close();
```

Output of `node try-server.js`

```ts
POST /tasks -> 201 {"id":2,"title":"Write report","done":false} /tasks/2
POST /tasks -> 400 {"error":"title must be a non-empty string of at most 200 characters"}
POST /tasks -> 400 {"error":"Body is not valid JSON"}
GET /tasks/2 -> 200 {"id":2,"title":"Write report","done":false}
GET /tasks/9 -> 404 {"error":"Task not found"}
GET /tasks/abc -> 404 {"error":"Not Found"}
GET /tasks?done=false -> 200 [{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Write report","done":false}]
```

### Run it for real

Now start it as a real server. It keeps running until you press Ctrl + C:

Terminal on your computer

```bash
$ node server.js
Listening on http://localhost:3000
```

Open [http://localhost:3000/tasks](http://localhost:3000/tasks) in your browser, or use `curl` from a second terminal. `-i` prints the status line and headers, `-X` sets the method, `-H` adds a header and `-d` sends a body:

Terminal on your computer

```bash
$ curl -i http://localhost:3000/tasks
HTTP/1.1 200 OK
Content-Type: application/json
Date: Wed, 23 Sep 2026 13:52:43 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 42

[{"id":1,"title":"Buy milk","done":false}]
$ curl -i -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Call Ada"}'
HTTP/1.1 201 Created
Location: /tasks/2
Content-Type: application/json
Date: Wed, 23 Sep 2026 13:52:43 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 40

{"id":2,"title":"Call Ada","done":false}
$ curl http://localhost:3000/tasks/2
{"id":2,"title":"Call Ada","done":false}
$ curl http://localhost:3000/nothing
{"error":"Not Found"}
```

Node.js added `Date`, `Connection`, `Keep-Alive` and `Content-Length` by itself. `Keep-Alive` lets a client reuse the same connection for its next request, which is faster. On Windows PowerShell, type `curl.exe` instead of `curl`, and put the JSON in double quotes with the inner quotes doubled or escaped; or simply use the test file above.

The tasks live in an array in memory, so they are gone when you stop the server. The next lesson grows this into a complete Task API, and shows what starts to hurt when you build everything by hand.

## Practice

TRY IT YOURSELF

### Delete a task

Add `DELETE /tasks/:id` to a server: answer **204** with no body when the task existed, and 404 otherwise. Test it by deleting the same task twice.

**Show a solution**

delete.jsNode.js only

```ts
import { once } from "node:events";
import { createServer } from "node:http";

const tasks = [{ id: 1, title: "Buy milk", done: false }];

const server = createServer((req, res) => {
  const match = req.url.match(/^\/tasks\/([1-9][0-9]{0,8})$/);
  if (match && req.method === "DELETE") {
    const index = tasks.findIndex((t) => t.id === Number(match[1]));
    if (index !== -1) {
      tasks.splice(index, 1);
      res.statusCode = 204;
      return res.end();
    }
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(0);
await once(server, "listening");
const url = `http://localhost:${server.address().port}/tasks/1`;

for (let i = 0; i < 2; i++) {
  const response = await fetch(url, { method: "DELETE" });
  console.log(response.status, JSON.stringify(await response.text()));
}
server.close();
```

Output of `node delete.js`

```ts
204 ""
404 "{\"error\":\"Not Found\"}"
```

A 204 response has an empty body: `res.end()` with nothing in it.

TRY IT YOURSELF

### Limit and offset

Write `readPaging(searchParams)` that reads `limit` (default 10, at most 50) and `offset` (default 0) from a query string, and returns an error message for anything that is not a whole number in range.

**Show a solution**

paging.js

```ts
function readPaging(searchParams) {
  const limitText = searchParams.get("limit") ?? "10";
  const offsetText = searchParams.get("offset") ?? "0";
  if (!/^[0-9]{1,6}$/.test(limitText) || !/^[0-9]{1,6}$/.test(offsetText)) {
    return { error: "limit and offset must be whole numbers" };
  }
  const limit = Number(limitText);
  if (limit < 1 || limit > 50) return { error: "limit must be between 1 and 50" };
  return { limit, offset: Number(offsetText) };
}

for (const query of ["", "?limit=5&offset=10", "?limit=500", "?offset=-1"]) {
  console.log(query || "(none)", readPaging(new URL("/tasks" + query, "http://localhost").searchParams));
}
```

Output of `node paging.js` and of the browser terminal

```ts
(none) { limit: 10, offset: 0 }
?limit=5&offset=10 { limit: 5, offset: 10 }
?limit=500 { error: 'limit must be between 1 and 50' }
?offset=-1 { error: 'limit and offset must be whole numbers' }
```

A maximum for `limit` matters: without it, one request for `?limit=10000000` makes the server build a giant response.

## Recap

- `createServer(handler)` calls your handler for every request with `req` and `res`. Set `res.statusCode` and headers, then finish with exactly one `res.end`.
- `req.method`, `req.url` and `req.headers` (lower-case names) describe the request. Parse the URL with `new URL(req.url, "http://localhost")` and route on `pathname`.
- Route and query parameters are text from strangers: match them exactly and validate them before use.
- A body is a stream of chunks. Enforce a size limit, check the `Content-Type`, and turn a failed `JSON.parse` into a 400 with your own message.
- Test a server by starting it on port 0 and calling it with `fetch`; try it by hand with `curl`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

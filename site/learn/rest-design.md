---
title: "Designing a REST API — ZudoJS Academy"
description: "Design the Task API as a REST API: resource URLs, a written contract, filtering and sorting, offset and cursor pages, versions and one error format."
source: https://zudojs.oyinlola.site/learn/rest-design
---

LEVEL 7 · LESSON 2 OF 15

HTTP and REST Core

# Designing a REST API

Design the Task API as a REST API: resource URLs, a written contract, filtering and sorting, offset and cursor pages, versions and one error format.

- **40 min** to read and try
- **You need:** The HTTP in depth lesson
- **You build:** A versioned Task API list endpoint with filtering, sorting, pagination and problem-details errors

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Name resources with plural-noun URLs and map CRUD onto HTTP methods
- Write an API contract before the code
- Validate query parameters and sort only by allow-listed fields
- Choose between offset and cursor pagination for a given screen or job
- Send every error as RFC 9457 problem details
- Tell additive changes from breaking ones and version an API in its path

## Resources, not actions

**REST** (REpresentational State Transfer) is a style for designing HTTP APIs. It is not a library or a standard you install. It is a set of habits that make an API predictable, so a developer who has used one REST API can guess how yours works.

The central idea is the **resource**: a thing your API knows about, like a task, a user or a project. Each resource has a URL. The URL is a **noun**, and the HTTP method from [the previous lesson](https://zudojs.oyinlola.site/learn/http-deep) is the **verb**. What travels in the body, usually JSON, is a **representation** of the resource.

The four basic operations on stored data are called **CRUD**: create, read, update, delete. They map onto methods like this:

| Operation | Request | Success |
| --- | --- | --- |
| List tasks | `GET /tasks` | 200 with an array |
| Create a task | `POST /tasks` | 201 with the new task and a `Location` header |
| Read one task | `GET /tasks/7` | 200 with the task |
| Replace a task | `PUT /tasks/7` | 200 with the task |
| Change part of a task | `PATCH /tasks/7` | 200 with the task |
| Delete a task | `DELETE /tasks/7` | 204 with no body |

`/tasks` is a **collection**, and `/tasks/7` is one **item** in it. Use plural nouns, lower case, and hyphens between words (`/task-lists`). Compare:

- Not REST: `POST /createTask`, `GET /getTask?id=7`, `POST /tasks/7/delete`. The verb hides in the URL, so every endpoint has to be learned one by one.
- REST: `POST /tasks`, `GET /tasks/7`, `DELETE /tasks/7`. Learn the pattern once and you know them all.

### Nesting

When one resource belongs to another, the URL can show it: `GET /projects/3/tasks` lists the tasks of project 3, and `POST /projects/3/tasks` creates a task inside it. Keep it to one level. Once a task has its own id, address it directly as `/tasks/7`, not `/projects/3/tasks/7/comments/2`. A filter such as `GET /tasks?projectId=3` is an equally good answer; pick one and use it everywhere.

## Write the contract first

An API's **contract** is the promise it makes to its clients: which URLs exist, what they accept, what they return and which status codes they use. Write it down before you write code. Clients (a web app, a mobile app, another team) build against the contract, so changing it later breaks them. Here is the Task API's contract:

| Request | Body | Responses |
| --- | --- | --- |
| `GET /v1/tasks` | none; query: `done`, `q`, `sort`, `limit`, `offset` | 200 list, 400 bad query |
| `POST /v1/tasks` | `{"title": "Buy milk"}` | 201 task, 400 invalid, 415 not JSON |
| `GET /v1/tasks/{id}` | none | 200 task, 404 |
| `PATCH /v1/tasks/{id}` | `{"done": true}` or `{"title": "…"}` | 200 task, 400, 404 |
| `DELETE /v1/tasks/{id}` | none | 204, 404 |

A task looks like `{"id": 7, "title": "Buy milk", "done": false, "createdAt": "2026-09-07"}`. A list comes wrapped in an object, `{"data": [...], "meta": {...}}`, rather than as a bare array. That leaves room to add information such as the total count later without breaking anyone. Every error has the same shape, which you will build in the [errors section](#errors).

> TIP
>
> Later you will write this contract in a machine-readable format called OpenAPI ([API contracts](https://zudojs.oyinlola.site/learn/api-contracts)), and generate it from your ZudoJS code ([OpenAPI documents](https://zudojs.oyinlola.site/learn/zudo-openapi)).

## Filtering and sorting with query parameters

A list endpoint gets its options from the **query string**, the part of the URL after `?`. `URLSearchParams` reads it for you. Every value arrives as a string (or `null` when missing), and every value comes from outside, so check each one.

REASON IT OUT

### What can a query string contain?

The list endpoint will accept `?done=false&q=milk&sort=-createdAt&limit=20&offset=40`. Before writing the parser, list what a client (or an attacker) could send instead, and what the server should do with each:

- `limit=0`, `limit=500`, `limit=-1`, `limit=abc`, `limit=2.5`
- `done=yes`
- `sort=password` or `sort=title; drop table tasks`
- Two problems in one request
- No parameters at all

**Show the reasoning**

Every value arrives as text, so each one is converted and checked. `limit` must be a whole number in a range: zero pages are useless, and `limit=500` (or a million) lets one request make the server read and send the whole table, so there is a maximum. `done` accepts exactly `true` or `false`; guessing that `yes` means true invites clients to depend on your guesses.

`sort` is the dangerous one. It names a *field*, and a field name will end up in code or in SQL, where a placeholder cannot protect it. So it is checked against an **allow-list** of sortable fields, and anything else is refused. Refusing is better than silently ignoring: a client that misspelt `createdAt` learns it at once.

When there are several problems, report all of them in one answer, so the client does not fix one, retry and hit the next. And with no parameters at all, every option has a sensible default: the first 20 tasks, in id order.

Sorting needs special care: never sort by whatever field name the client sends. Keep an **allow-list** of fields that may be sorted. A leading minus sign, `sort=-createdAt`, is the usual way to ask for descending order.

This module is the core of the list endpoint. It has no Node APIs in it, so you can run it in the browser:

tasks.js

```ts
export const tasks = [
  { id: 1, title: "Buy milk", done: true, createdAt: "2026-09-01" },
  { id: 2, title: "Write report", done: false, createdAt: "2026-09-02" },
  { id: 3, title: "Call Ada", done: false, createdAt: "2026-09-02" },
  { id: 4, title: "Book dentist", done: true, createdAt: "2026-09-04" },
  { id: 5, title: "Fix bike", done: false, createdAt: "2026-09-05" },
  { id: 6, title: "Read book", done: false, createdAt: "2026-09-06" },
  { id: 7, title: "Water plants", done: false, createdAt: "2026-09-07" },
];

const SORTABLE = ["id", "title", "createdAt"];

function wholeNumber(params, name, fallback, min, max, errors) {
  if (!params.has(name)) return fallback;
  const n = Number(params.get(name));
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push({ param: name, message: `must be a whole number from ${min} to ${max}` });
  }
  return n;
}

export function parseListQuery(params) {
  const errors = [];
  const limit = wholeNumber(params, "limit", 20, 1, 100, errors);
  const offset = wholeNumber(params, "offset", 0, 0, 1_000_000, errors);
  const done = params.get("done");
  if (done !== null && done !== "true" && done !== "false") {
    errors.push({ param: "done", message: "must be true or false" });
  }
  const sort = params.get("sort") ?? "id";
  const field = sort.replace(/^-/, "");
  if (!SORTABLE.includes(field)) {
    errors.push({ param: "sort", message: `must be one of ${SORTABLE.join(", ")}, with an optional leading -` });
  }
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const query = { limit, offset, done: done === null ? null : done === "true", q, field, desc: sort.startsWith("-") };
  return { errors, query };
}

export function listTasks(all, query) {
  const matches = all.filter(
    (t) => (query.done === null || t.done === query.done) && t.title.toLowerCase().includes(query.q),
  );
  const sorted = matches.toSorted((a, b) => {
    const order = a[query.field] < b[query.field] ? -1 : a[query.field] > b[query.field] ? 1 : 0;
    return query.desc ? -order : order;
  });
  const data = sorted.slice(query.offset, query.offset + query.limit);
  return { data, meta: { total: matches.length, limit: query.limit, offset: query.offset } };
}
```

Try it with a few query strings, the same way the server will call it:

try-list.js

```ts
import { listTasks, parseListQuery, tasks } from "./tasks.js";

function show(queryString) {
  const { errors, query } = parseListQuery(new URLSearchParams(queryString));
  if (errors.length > 0) {
    console.log(queryString, "->", errors);
    return;
  }
  const { data, meta } = listTasks(tasks, query);
  console.log(queryString, "->", data.map((t) => `${t.id} ${t.title}`), meta);
}

show("done=false&sort=-createdAt&limit=3");
show("q=BOOK");
show("limit=500&sort=password");
```

Output of `node try-list.js` and of the browser terminal

```ts
done=false&sort=-createdAt&limit=3 -> [ '7 Water plants', '6 Read book', '5 Fix bike' ] { total: 5, limit: 3, offset: 0 }
q=BOOK -> [ '4 Book dentist', '6 Read book' ] { total: 2, limit: 20, offset: 0 }
limit=500&sort=password -> [
  { param: 'limit', message: 'must be a whole number from 1 to 100' },
  {
    param: 'sort',
    message: 'must be one of id, title, createdAt, with an optional leading -'
  }
]
```

The first call asked for open tasks, newest first, three at a time. `meta.total` is 5: five tasks match, but only three were sent. The search `q=BOOK` ignored upper and lower case. The last call broke two rules, and the client hears about **both** at once instead of fixing one, retrying and hitting the next.

Tasks 2 and 3 have the same `createdAt`. `toSorted` keeps equal items in their original order, so the result is the same every time. A database gives no such promise: always add a tie-breaker, such as the id, when you sort in SQL.

## Pagination: offset and cursor

A list can grow to millions of rows. **Pagination** means sending it one page at a time. There are two common ways.

### Offset pagination

`?limit=3&offset=3` means "skip 3 items, then give me 3". It is what `listTasks` does. It is simple, and the client can jump straight to page 10. It has a weakness: if an item is added while someone is paging, everything shifts. Watch a client read the newest tasks, three per page, while a new task arrives between page 1 and page 2:

offset-problem.js

```ts
const tasks = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: `Task ${id}` }));
const newestFirst = () => tasks.toSorted((a, b) => b.id - a.id);

const page1 = newestFirst().slice(0, 3);
console.log("page 1:", page1.map((t) => t.id));

tasks.push({ id: 8, title: "Task 8" });

const page2 = newestFirst().slice(3, 6);
console.log("page 2:", page2.map((t) => t.id));
```

Output of `node offset-problem.js` and of the browser terminal

```ts
page 1: [ 7, 6, 5 ]
page 2: [ 5, 4, 3 ]
```

Task 5 appears on both pages, because the new task pushed it from position 3 to position 4. With deletes, an item can be skipped instead. On big tables, a large offset is also slow: the database still has to walk past every skipped row.

### Cursor pagination

A **cursor** remembers *where* the last page ended instead of *how many* items to skip. The server returns a `nextCursor` with each page, and the client sends it back to get the next one. Here the cursor says "continue with ids smaller than 5". It is encoded with `btoa` (Base64) so clients treat it as an opaque token and do not build their own:

cursor.js

```ts
const tasks = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: `Task ${id}` }));

function decodeCursor(cursor) {
  try {
    const { before } = JSON.parse(atob(cursor));
    return Number.isInteger(before) ? before : null;
  } catch {
    return null;
  }
}

function page(limit, cursor) {
  const before = cursor ? decodeCursor(cursor) : Infinity;
  if (before === null) throw new Error("invalid cursor");
  const rows = tasks.filter((t) => t.id < before).toSorted((a, b) => b.id - a.id).slice(0, limit + 1);
  const data = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? btoa(JSON.stringify({ before: data.at(-1).id })) : null;
  return { data: data.map((t) => t.id), nextCursor };
}

const p1 = page(3);
console.log("page 1:", p1);
tasks.push({ id: 8, title: "Task 8" });
const p2 = page(3, p1.nextCursor);
console.log("page 2:", p2);
console.log("page 3:", page(3, p2.nextCursor));
```

Output of `node cursor.js` and of the browser terminal

```ts
page 1: { data: [ 7, 6, 5 ], nextCursor: 'eyJiZWZvcmUiOjV9' }
page 2: { data: [ 4, 3, 2 ], nextCursor: 'eyJiZWZvcmUiOjJ9' }
page 3: { data: [ 1 ], nextCursor: null }
```

No duplicate this time, even though task 8 arrived in the middle. The server asks for `limit + 1` rows: if the extra row exists, there is a next page. On the last page `nextCursor` is `null`, which tells the client to stop.

|  | Offset | Cursor |
| --- | --- | --- |
| Jump to page 10 | Yes | No, only next (and sometimes previous) |
| Stable while data changes | No | Yes |
| Fast on huge tables | No | Yes, with an index on the sort column |
| Good for | Admin tables with page numbers | Feeds, infinite scroll, syncing |

A cursor on a sort column other than the id (newest first, cheapest first) must also carry the id, to break ties. [Pagination and versioning in depth](https://zudojs.oyinlola.site/learn/api-pagination-versioning), in the API engineering course, builds that cursor and measures what large offsets really cost.

## One error format: problem details

Clients handle errors in code, so every error from your API should have the same shape. You do not have to invent one: **RFC 9457**, "Problem Details for HTTP APIs", is a standard for exactly this. An RFC is an official internet specification. A problem details body is JSON with these fields:

- `type`: a URL that names the kind of problem. Clients compare it, so it never changes.
- `title`: a short summary for humans, the same for every problem of this type.
- `status`: the HTTP status code, repeated in the body.
- `detail`: what went wrong this time.
- `instance`: optional; which request or resource it was about.

You may add your own fields, such as an `errors` list. The response uses the media type `application/problem+json`, so a client knows the format from the header alone.

problem.js

```ts
export function problem(status, type, title, detail, extra = {}) {
  return { type: `https://example.com/problems/${type}`, title, status, detail, ...extra };
}

export function sendProblem(res, body) {
  res.writeHead(body.status, { "Content-Type": "application/problem+json" });
  res.end(JSON.stringify(body));
}
```

Never put a stack trace, an SQL query or an internal file path in `detail`. Log those on the server; attackers read error messages too.

## Versioning

A **breaking change** is one that can make a working client fail: removing or renaming a field, changing a field's type, adding a required input, or changing what a status code means. When you must make one, publish a new **version** of the API and keep the old one running until clients have moved.

The most common way is a version in the path: `/v1/tasks`, later `/v2/tasks`. It is visible in every log line and easy to route. Some APIs use a header instead, such as `Accept-Version: 2`.

**Additive** changes do not need a new version: a new endpoint, a new optional query parameter, or a new field in a response. That only works if clients ignore fields they do not know, which is another reason to wrap lists in `{"data": ...}` and to write your own clients that way. How to run two versions from one codebase, and how to retire an old one, is part of [Pagination and versioning in depth](https://zudojs.oyinlola.site/learn/api-pagination-versioning#breaking).

## Build it: the list endpoint

Now put the pieces together in a server. It serves `GET /v1/tasks` with the query parsing and listing from `tasks.js`, returns problem details for a bad query and for unknown routes, and adds a `Link` header pointing at the next page, which is a common convention. As before, the example calls itself with `fetch` and then stops:

server.jsNode.js only

```ts
import http from "node:http";
import { listTasks, parseListQuery, tasks } from "./tasks.js";
import { problem, sendProblem } from "./problem.js";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method !== "GET" || url.pathname !== "/v1/tasks") {
    return sendProblem(res, problem(404, "not-found", "Not Found", `No route for ${req.method} ${url.pathname}`));
  }
  const { errors, query } = parseListQuery(url.searchParams);
  if (errors.length > 0) {
    return sendProblem(res, problem(400, "invalid-query", "Invalid query", "Some query parameters are invalid.", { errors }));
  }
  const page = listTasks(tasks, query);
  const headers = { "Content-Type": "application/json" };
  if (query.offset + query.limit < page.meta.total) {
    url.searchParams.set("offset", String(query.offset + query.limit));
    headers.Link = `<${url.pathname}${url.search}>; rel="next"`;
  }
  res.writeHead(200, headers);
  res.end(JSON.stringify(page));
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  for (const path of ["/v1/tasks?done=false&sort=title&limit=2", "/v1/tasks?limit=0", "/v2/tasks"]) {
    const res = await fetch(base + path);
    console.log(res.status, res.headers.get("content-type"), res.headers.get("link"));
    console.log(JSON.stringify(await res.json(), null, 2));
  }
  server.close();
});
```

Output of `node server.js`

```ts
200 application/json </v1/tasks?done=false&sort=title&limit=2&offset=2>; rel="next"
{
  "data": [
    {
      "id": 3,
      "title": "Call Ada",
      "done": false,
      "createdAt": "2026-09-02"
    },
    {
      "id": 5,
      "title": "Fix bike",
      "done": false,
      "createdAt": "2026-09-05"
    }
  ],
  "meta": {
    "total": 5,
    "limit": 2,
    "offset": 0
  }
}
400 application/problem+json null
{
  "type": "https://example.com/problems/invalid-query",
  "title": "Invalid query",
  "status": 400,
  "detail": "Some query parameters are invalid.",
  "errors": [
    {
      "param": "limit",
      "message": "must be a whole number from 1 to 100"
    }
  ]
}
404 application/problem+json null
{
  "type": "https://example.com/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "No route for GET /v2/tasks"
}
```

Three requests, three well-formed answers:

- The list has two open tasks sorted by title, `total: 5`, and a `Link` header with the exact URL of the next page, so the client does not have to compute it.
- `limit=0` got a 400 with `application/problem+json` and the list of what was wrong.
- `/v2/tasks` does not exist, and the 404 has the very same shape. A client needs one error handler for your whole API.

Run it on your computer by saving `tasks.js`, `problem.js` and `server.js` in one folder (with `"type": "module"` in `package.json`, as in every project so far) and running `node server.js`.

## Practice

TRY IT YOURSELF

### Fix the URLs

Rewrite these endpoints in REST style: (a) `GET /getAllTasks`; (b) `POST /tasks/7/markDone`; (c) `GET /task?id=7`; (d) `POST /deleteTask` with `{"id": 7}`; (e) `GET /projects/3/tasks/7`.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

A REST URL names a resource (a noun, usually plural); the HTTP method is the verb. Look for verbs hiding inside the path or the body.

HINT 2

For (b) and (d), which method means "change part of a resource", and which means "remove it"? For (e), does the task's own id already say everything the server needs to find it?

SOLUTION

(a) `GET /tasks`. (b) `PATCH /tasks/7` with `{"done": true}`. (c) `GET /tasks/7`. (d) `DELETE /tasks/7`. (e) `GET /tasks/7`: the task has its own id, so it does not need the project in its URL.

TRY IT YOURSELF

### Filter by date

Add a `since` parameter to `parseListQuery` and `listTasks`: only tasks with `createdAt` on or after that date. Accept only the form `YYYY-MM-DD`, and report anything else as an error. Test it with `since=2026-09-05` and `since=yesterday`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Test the format with a regular expression: `/^\d{4}-\d{2}-\d{2}$/.test(since)`. Only check it when `since !== null`.

HINT 2

`YYYY-MM-DD` strings compare correctly with `>=`: `all.filter((t) => t.createdAt >= query.since)`.

SOLUTION

since.js

```ts
import { listTasks, parseListQuery, tasks } from "./tasks.js";

function parseWithSince(params) {
  const { errors, query } = parseListQuery(params);
  const since = params.get("since");
  if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    errors.push({ param: "since", message: "must be a date like 2026-09-05" });
  }
  return { errors, query: { ...query, since } };
}

function listSince(all, query) {
  const recent = query.since === null ? all : all.filter((t) => t.createdAt >= query.since);
  return listTasks(recent, query);
}

for (const qs of ["since=2026-09-05", "since=yesterday"]) {
  const { errors, query } = parseWithSince(new URLSearchParams(qs));
  console.log(qs, errors.length ? errors : listSince(tasks, query).data.map((t) => t.id));
}
```

Output of `node since.js` and of the browser terminal

```ts
since=2026-09-05 [ 5, 6, 7 ]
since=yesterday [ { param: 'since', message: 'must be a date like 2026-09-05' } ]
```

Dates in the form `YYYY-MM-DD` sort correctly as plain strings, so `>=` works. The new code wraps the existing functions instead of changing them.

TRY IT YOURSELF

### Offset or cursor?

Which pagination would you pick for: (a) an activity feed in a mobile app with infinite scroll; (b) an admin screen that shows "page 4 of 30"; (c) a job that copies every task to another system overnight?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Does the caller need to jump to an arbitrary page number, or only ever move forward one page at a time?

HINT 2

For (c), what happens if a row is inserted or deleted while the job is halfway through, and the pagination is offset-based?

SOLUTION

(a) Cursor: new activity arrives all the time, and the user only scrolls forward. (b) Offset: people want page numbers, and the table is small enough. (c) Cursor: it must not skip or repeat a task, and the table may be large.

## Recap

- REST URLs name resources with plural nouns (`/tasks`, `/tasks/7`). The method is the verb. Nest at most one level.
- Write the contract first: URLs, bodies, status codes. Wrap lists in `{"data": ..., "meta": ...}`.
- Validate every query parameter, and sort only by allow-listed fields.
- Offset pagination can jump to any page but shifts when data changes. Cursor pagination is stable and fast, but only moves forward.
- Send every error as RFC 9457 problem details (`application/problem+json`) and never leak internals.
- Put the version in the path (`/v1`). Additive changes need no new version; breaking changes do.

Next: [How databases work](https://zudojs.oyinlola.site/learn/databases), where the tasks leave the array and move into PostgreSQL.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

---
title: "OpenAPI documents — ZudoJS Academy"
description: "Describe the Task API in an OpenAPI document with @zudojs/openapi: schemas as components, OpenAPI 3.0 or 3.1, validation, JSON or YAML, a docs page."
source: https://zudojs.oyinlola.site/learn/zudo-openapi
---

LEVEL 14 · LESSON 9 OF 18

Services and contracts Advanced

# OpenAPI documents

Describe the Task API in an OpenAPI document with @zudojs/openapi: schemas as components, OpenAPI 3.0 or 3.1, validation, JSON or YAML, a docs page.

- **40 min** to read and try
- **You need:** The Task API project, and the lessons on validation, HTTP routing and @zudojs/api
- **You build:** An openapi.json and openapi.yaml for the Task API, checked by a validator and served with a documentation page at /docs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build an OpenAPI document from routes and turn @zudojs/schema schemas into shared components
- Choose OpenAPI 3.0 or 3.1 and let the manager write the right keywords for each
- Validate a document and tell a real error from a warning before it reaches your users
- Save the document as JSON or YAML and serve it with a Swagger UI docs page
- Generate the document straight from an @zudojs/http router or an @zudojs/api registry, with one source of truth

## What OpenAPI is

Other people want to use your Task API: a mobile developer, a partner company, a teammate who writes the web front end. They ask the same questions. Which paths exist? What do I send? What comes back? Which errors can happen?

**OpenAPI** is a standard way to answer those questions in one file, called an **OpenAPI document** (people also say "spec", short for specification). It is plain JSON or YAML, so both people and programs can read it. Tools use it to:

- show browsable documentation, such as **Swagger UI** or **ReDoc**,
- generate a client library for your API in another language,
- check in CI that the API did not change by accident.

Writing that file by hand goes out of date the day the code changes. `@zudojs/openapi` builds it from the schemas and routes you already have. Install it in your Task API folder:

Terminal on your computer

```bash
$ npm install @zudojs/openapi

up to date, audited 17 packages in 3s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

"up to date": `@zudojs/api` from the last lesson already brought the package along. Installing it yourself adds it to your `package.json`. Every example is a `.ts` file that you run with `npx tsx file.ts`.

## Your first document

An OpenAPI document has three main parts: `info` (the API's name and version), `paths` (every URL and what each method does there) and `components` (shared pieces, such as schemas). One method on one path is called an **operation**.

`OpenAPIManager` collects your routes and builds the document. Each route is a `method`, a `path`, and its documentation under `metadata.openapi`:

first.tsNode.js only

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({
  version: "3.1.0",
  info: { title: "Task API", version: "1.0.0" },
  branding: false,
});

manager.addRoute({
  method: "get",
  path: "/tasks/:id",
  metadata: {
    openapi: {
      operationId: "tasks.get",
      summary: "Get one task",
      tags: ["Tasks"],
      parameters: [{ name: "id", in: "path", schema: { type: "integer", minimum: 1 } }],
      responses: {
        "200": { description: "The task" },
        "404": { description: "No task with this id" },
      },
    },
  },
});

const document = manager.generate();
console.log(document.openapi, document.info);
console.log(Object.keys(document.paths));
console.log(JSON.stringify(document.paths["/tasks/{id}"]?.get?.parameters));
```

Output of `npx tsx first.ts`

```ts
3.1.0 { title: 'Task API', version: '1.0.0' }
[ '/tasks/{id}' ]
[{"name":"id","in":"path","required":true,"schema":{"type":"integer","minimum":1}}]
```

- The router style path `/tasks/:id` became `/tasks/{id}`, the way OpenAPI writes a **path parameter**.
- The `id` parameter got `required: true`. OpenAPI demands that for every path parameter. Even if you forget to declare it, the manager documents every `{…}` slot of the path, as a string. Declaring it, as here, lets you say that it is a whole number.
- `operationId` is a unique name for the operation. Client generators turn it into a method name.
- `branding: false` keeps the output short. Without it, the manager adds the ZudoJS logo to `info` as `x-logo`, a field some viewers read.

## Schemas become components

In the validation lesson you described a task with `@zudojs/schema`. OpenAPI has its own schema language, based on JSON Schema. `manager.addSchema(name, schema)` translates yours and stores it under `components.schemas`. An operation then points at it with a **reference**, `{ "$ref": "#/components/schemas/Task" }`, which `createComponentReference` builds for you.

This file describes the whole Task API. Later examples import it:

task-api.tsNode.js only

```ts
import { OpenAPIManager, createComponentReference } from "@zudojs/openapi";
import { schema } from "@zudojs/schema";

export const NewTask = schema.object({ title: schema.string().trim().min(3).max(100) });
export const Task = schema.object({ id: schema.number().int().min(1), title: schema.string(), done: schema.boolean() });

const ref = (name: string) => createComponentReference("schemas", name);
const json = (schema: object) => ({ "application/json": { schema } });

export function taskApiDocs(version = "3.1.0"): OpenAPIManager {
  const manager = new OpenAPIManager({ version, info: { title: "Task API", version: "1.0.0" }, branding: false });
  manager.addSecurityScheme("bearerAuth", { type: "http", scheme: "bearer" });
  manager.addSecurityRequirement({ bearerAuth: [] });
  manager.addSchema("NewTask", NewTask).addSchema("Task", Task);

  manager.addRoute({ method: "get", path: "/tasks", metadata: { openapi: {
    operationId: "tasks.list", tags: ["Tasks"],
    responses: { "200": { description: "All tasks of the user", content: json({ type: "array", items: ref("Task") }) } },
  } } });
  manager.addRoute({ method: "post", path: "/tasks", metadata: { openapi: {
    operationId: "tasks.create", tags: ["Tasks"],
    requestBody: { required: true, content: json(ref("NewTask")) },
    responses: {
      "201": { description: "The new task", content: json(ref("Task")) },
      "401": { description: "Not signed in" },
      "422": { description: "The body failed validation" },
    },
  } } });
  manager.addRoute({ method: "get", path: "/health", metadata: { openapi: {
    operationId: "health", security: [], responses: { "200": { description: "The server is up" } },
  } } });
  return manager;
}
```

Three new things:

- `addSecurityScheme` says how callers prove who they are: a bearer token in the `Authorization` header. `addSecurityRequirement` makes it the rule for every operation.
- `security: []` on `/health` means "no sign-in needed" for that one operation.
- The schemas are the same objects that validate requests at runtime. The document cannot drift away from them.

Look at what the schemas became:

components.tsNode.js only

```ts
import { taskApiDocs } from "./task-api.js";

const schemas = taskApiDocs().generate().components?.schemas ?? {};
for (const [name, converted] of Object.entries(schemas)) console.log(name, JSON.stringify(converted));
```

Output of `npx tsx components.ts`

```ts
NewTask {"type":"object","properties":{"title":{"type":"string","minLength":3,"maxLength":100}},"required":["title"]}
Task {"type":"object","properties":{"id":{"type":"integer","minimum":1},"title":{"type":"string","maxLength":255},"done":{"type":"boolean"}},"required":["id","title","done"]}
```

`.min(3).max(100)` became `minLength` and `maxLength`. `.int()` became `"type": "integer"`. The task's `title` has no `.max()`, yet it shows `maxLength: 255`: that is the limit `@zudojs/schema` applies to every string by default, so the document tells clients the real limit.

## OpenAPI 3.0 or 3.1?

Two versions are in use. **3.1** is the current one and matches JSON Schema. **3.0** is older, but some tools, such as older code generators and API gateways, still only read 3.0. A few rules are written differently in the two versions. `convertSchema(schema, { version })` shows the difference:

versions.tsNode.js only

```ts
import { convertSchema } from "@zudojs/openapi";
import { schema } from "@zudojs/schema";

const TaskFilter = schema.object({
  priority: schema.number().int().gt(0).lt(6),
  dueBefore: schema.nullable(schema.string().max(30)),
});

for (const version of ["3.0.3", "3.1.0"]) {
  const { schema: converted } = convertSchema(TaskFilter, { version });
  console.log(version, JSON.stringify(converted.properties));
}
```

Output of `npx tsx versions.ts`

```ts
3.0.3 {"priority":{"type":"integer","minimum":0,"exclusiveMinimum":true,"maximum":6,"exclusiveMaximum":true},"dueBefore":{"type":"string","maxLength":30,"nullable":true}}
3.1.0 {"priority":{"type":"integer","exclusiveMinimum":0,"exclusiveMaximum":6},"dueBefore":{"type":["string","null"],"maxLength":30}}
```

- `gt(0)` means "greater than 0, not equal". 3.1 writes `"exclusiveMinimum": 0`. 3.0 writes `"minimum": 0` plus `"exclusiveMinimum": true`.
- A value that may be `null` is `"nullable": true` in 3.0 and a list of types, `["string", "null"]`, in 3.1.

You never write these by hand: pass `version` to the manager and every schema uses the right spelling. Choose 3.1 unless a tool you must support only reads 3.0.

## Validate the document

REASON IT OUT

### A route forgets to declare its :id parameter. Another route names a security scheme that was never added. Should both stop the build?

Think about what each mistake actually costs a reader of the document. A missing parameter declaration means the manager still knows a `{…}` slot exists in the path (it can see the path itself), it just does not yet know the type is really an integer rather than any string. A security scheme that does not exist in `components.securitySchemes` means a client reading the document has no way at all to work out how to authenticate — there is nothing to fall back to.

**Show the reasoning**

The manager treats them differently for exactly this reason. The forgotten parameter is recoverable: it fills in a sensible default (a required string) from the path itself, documents it, and only records a warning, because a document with a slightly loose type is still usable. The unknown security scheme is not recoverable: the manager cannot invent a scheme that does not exist, so the reference stays broken and any tool trying to build a request would not know what header or token to send. That is a real error, and `generate(true)` throws rather than silently shipping a document that lies about how to call the API. The general rule: something the manager can safely fill in for you is a warning; something it cannot fill in, only flag, is an error.

A document can be valid JSON and still be wrong. `manager.validate()` checks the OpenAPI rules and returns `{ valid, errors, warnings }`. This document has two mistakes that are easy to make:

broken.tsNode.js only

```ts
import { OpenAPIManager } from "@zudojs/openapi";

const manager = new OpenAPIManager({ info: { title: "Task API", version: "1.0.0" }, branding: false });
manager.addRoute({ method: "delete", path: "/tasks/:id", metadata: { openapi: {
  operationId: "tasks.delete", security: [{ bearer: [] }],
  responses: { "204": { description: "Deleted" } },
} } });
manager.addRoute({ method: "get", path: "/tasks", metadata: { openapi: {
  operationId: "tasks.list",
  responses: { "200": { description: "All tasks", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } } },
} } });

const result = manager.validate();
console.log("valid:", result.valid);
for (const issue of result.errors) console.log("-", issue.path.join("."), ":", issue.message);
```

Output of `npx tsx broken.ts`

```ts
valid: false
- paths./tasks/{id}.delete.security : Security requirement "bearer" does not match any scheme in components.securitySchemes.
- paths./tasks.get.responses.200.content.application/json.schema : Reference "#/components/schemas/Task" does not resolve within the document.
```

- The operation asks for a security scheme called `bearer` that the document never declares. Such a document *looks* protected, but tools cannot tell how to send a token.
- The `$ref` points at a `Task` schema that was never added.

The `DELETE` route did not declare its `{id}` parameter, and that is not an error: the manager filled it in. Some gaps are only **warnings**. In a build script, `manager.generate(true)` validates and throws an `OpenAPIValidationError` for real errors. Its `format()` method prints one line per problem:

strict.tsNode.js only

```ts
import { OpenAPIManager, OpenAPIValidationError } from "@zudojs/openapi";

const manager = new OpenAPIManager({ info: { title: "Task API", version: "1.0.0" }, branding: false });
manager.addRoute({ method: "delete", path: "/tasks/:id", metadata: { openapi: {
  operationId: "tasks.delete", security: [{ bearer: [] }],
} } });

const operation = manager.generate().paths["/tasks/{id}"]?.delete;
console.log(JSON.stringify(operation?.parameters));
console.log(JSON.stringify(operation?.responses));
console.log(manager.routeWarnings());

try {
  manager.generate(true);
} catch (error) {
  if (error instanceof OpenAPIValidationError) console.log(error.format());
}
```

Output of `npx tsx strict.ts`

```json
[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}]
{"default":{"description":"Undocumented response"}}
[
  'DELETE /tasks/:id: no responses are documented; emitted "default: Undocumented response".'
]
OpenAPI validation failed with 1 error.
  error: paths./tasks/{id}.delete.security — Security requirement "bearer" does not match any scheme in components.securitySchemes.
```

- The forgotten `id` parameter was documented as a required string.
- The route documents no responses. The manager does not invent a `200 OK` (wrong for a `DELETE` that answers 204). It writes a `default` response called "Undocumented response" and records a warning in `routeWarnings()`. Pass `onRouteWarning: (message) => …` to the manager to log each one as it happens. Declare the responses and the warning goes away.
- The unknown security scheme is a real error, so `generate(true)` threw.

## Save it as JSON and YAML

`toJSON()` and `toYAML()` turn the document into text. **YAML** is another way to write the same data, with indentation instead of braces. Many people find it easier to read. Pass `true` to validate first, so a broken document is never written:

build-docs.tsNode.js only

```ts
import { writeFileSync } from "node:fs";
import { taskApiDocs } from "./task-api.js";

const manager = taskApiDocs();
writeFileSync("openapi.json", manager.toJSON(true));
writeFileSync("openapi.yaml", manager.toYAML(true));
console.log(manager.toYAML(true).split("\n").slice(0, 16).join("\n"));
```

Output of `npx tsx build-docs.ts`

```ts
openapi: 3.1.0
info:
  title: Task API
  version: 1.0.0
paths:
  /tasks:
    get:
      operationId: tasks.list
      tags:
        - Tasks
      responses:
        "200":
          description: All tasks of the user
          content:
            application/json:
              schema:
```

Run it on your computer and look at the files:

Terminal on your computer

```bash
$ npx tsx build-docs.ts
openapi: 3.1.0
info:
  title: Task API
…
$ wc -l openapi.json openapi.yaml
 125 openapi.json
  79 openapi.yaml
 204 total
$ tail -n 12 openapi.yaml
        done:
          type: boolean
      required:
        - id
        - title
        - done
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
```

Commit both files to git. When someone changes a route or a schema, the difference in `openapi.yaml` shows up in the review, and everybody sees how the API changed.

## Serve the document and a docs page

You can also serve the document from the running Task API. `manager.toResponse()` gives `{ status, headers, body }` for the JSON. `manager.toUIResponse({ specUrl })` gives a complete HTML page with Swagger UI that loads the document from `specUrl`. Both work with any HTTP server; here they go into two `@zudojs/http` routes:

serve.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";
import type { OpenAPIDocumentResponse } from "@zudojs/openapi";
import { taskApiDocs } from "./task-api.js";

const docs = taskApiDocs();
function send(answer: OpenAPIDocumentResponse) {
  const response = createResponseContext().setStatus(answer.status);
  for (const [name, value] of Object.entries(answer.headers)) response.setHeader(name, value);
  return response.setBody(answer.body);
}

const router = createRouter();
router.get("/openapi.json", async () => send(docs.toResponse({ validate: true })));
router.get("/docs", async () => send(docs.toUIResponse({ specUrl: "/openapi.json", title: "Task API" })));
const server = await createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request: HttpRequestContext) => (await router.dispatch(request)).response,
}).start();

const base = `http://127.0.0.1:${server.address?.port}`;
const spec = await fetch(`${base}/openapi.json`);
console.log(spec.status, spec.headers.get("content-type"), Object.keys((await spec.json()).paths));
const page = await fetch(`${base}/docs`);
console.log(page.status, page.headers.get("content-type"));
console.log((await page.text()).match(/<title>.*<\/title>/)?.[0]);
console.log(page.headers.get("content-security-policy")?.split("; ").slice(0, 2));
await server.stop();
```

Output of `npx tsx serve.ts`

```ts
200 application/json; charset=utf-8 [ '/tasks', '/health' ]
200 text/html; charset=utf-8
<title>Task API</title>
[
  "default-src 'none'",
  "script-src https://cdn.jsdelivr.net 'sha256-ivBYbHui56j/otciwGSwiCMOVV1Fq8rZhFfaWOWsHZ8='"
]
```

Open `/docs` in a browser and you get a page where people can read every operation and try it out. The page loads Swagger UI from a CDN, and the manager protects it:

- The script files are pinned to exact versions with **integrity hashes**. If the CDN file ever changes, the browser refuses to run it.
- The `content-security-policy` header allows scripts only from that CDN, plus the page's one known inline script.

> DOCUMENTATION IS PUBLIC INFORMATION
>
> Everything in the document is visible to anyone who can open `/docs`. Never put secrets, internal host names or real tokens into descriptions or examples. `hidden: true` in a route's metadata leaves it out of the document, but that does not protect it: an attacker can still call it. Protect every route with authentication, whether it is documented or not.

## Docs straight from your router

So far you described each route twice: once in the router that serves it, and once in the manager. Two lists drift apart. With `@zudojs/http`, a route can carry its own documentation in an `openapi` option, and `generateOpenAPIDocument(router, options)` builds the document from the routes the router really has. `mountOpenAPI(router, options)` goes one step further and serves `/openapi.json` and a `/docs` page:

router-docs.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter, generateOpenAPIDocument, mountOpenAPI } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import { NewTask, Task } from "./task-api.js";

const TaskId = schema.object({ id: schema.coerce.number().int().min(1) });
const tasks = [{ id: 1, title: "Buy milk", done: false }];

const router = createRouter();
router.get("/tasks", async () => tasks, { openapi: {
  operationId: "tasks.list", tags: ["Tasks"], summary: "List your tasks",
  responses: { "200": { schema: schema.array(Task) } },
} });
router.post("/tasks", async () => tasks[0], { openapi: {
  operationId: "tasks.create", tags: ["Tasks"], body: NewTask,
  responses: { "201": { schema: Task }, "422": { description: "The body failed validation" } },
} });
router.delete("/tasks/:id", async () => undefined, { openapi: {
  operationId: "tasks.delete", tags: ["Tasks"], params: TaskId,
  responses: { "204": { description: "Deleted" }, "404": { description: "No task with this id" } },
} });
router.get("/health", async () => ({ ok: true }), { openapi: false });

const options = {
  info: { title: "Task API", version: "1.0.0" },
  securitySchemes: { bearerAuth: { type: "http" as const, scheme: "bearer" } },
  security: [{ bearerAuth: [] }],
  validate: true,
};
const document = generateOpenAPIDocument(router, options);
for (const [path, item] of Object.entries(document.paths)) console.log(path, Object.keys(item ?? {}));
console.log(JSON.stringify(document.paths["/tasks/{id}"]?.delete?.parameters));

mountOpenAPI(router, options);
const server = await createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
}).start();
const base = `http://127.0.0.1:${server.address?.port}`;
const spec = await fetch(`${base}/openapi.json`);
console.log(spec.status, spec.headers.get("content-type"), Object.keys((await spec.json()).paths));
const page = await fetch(`${base}/docs`);
console.log(page.status, page.headers.get("content-type"));
await server.stop();
```

Output of `npx tsx router-docs.ts`

```ts
/tasks [ 'get', 'post' ]
/tasks/{id} [ 'delete' ]
[{"name":"id","in":"path","required":true,"schema":{"type":"integer","minimum":1}}]
200 application/json; charset=utf-8 [ '/tasks', '/tasks/{id}' ]
200 text/html; charset=utf-8
```

The route options use short forms that save you the OpenAPI boilerplate:

- `body: NewTask` becomes a required JSON request body. `params`, `query` and `headers` take an object schema, and each property becomes a parameter: `id` is now an integer of at least 1.
- `responses: { "201": { schema: Task } }` becomes a JSON response with that schema.
- `openapi: false` keeps `/health` out of the document. The two routes `mountOpenAPI` added, `/openapi.json` and `/docs`, stay out too.
- Add a route to the router, and it is in the document the next time someone opens `/openapi.json`. There is no second list to forget.

The same works for the operations of [the previous lesson](https://zudojs.oyinlola.site/learn/zudo-api): `toOpenAPIRouteDescriptors(registry, { basePath: "/api" })` turns them into route descriptions, and `createOpenAPIDocumentFromRoutes(routes, options)` from this package builds the document from any such list. The `middleware` option of `mountOpenAPI` can put the docs behind a sign-in when they are only for your team.

`mountOpenAPI`'s `/docs` page is on by default, at `docsPath` (`/docs` unless you change it) — except when `NODE_ENV` is `production`, where it is off unless you pass `docsPath` yourself. `/openapi.json` stays mounted either way, since a machine reading it is not the same risk as a public HTML page: pass an explicit `docsPath` if your team still wants the browsable page in production, ideally behind the `middleware` sign-in check above.

## Practice

TRY IT YOURSELF

### Document PATCH /tasks/:id

Add a route to `taskApiDocs()`'s manager for `PATCH /tasks/:id`: it takes an `id` path parameter and a body `{ done: boolean }`, and answers 200 with a `Task` or 404. Register the body schema as `TaskUpdate`. Validate the result.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

The shape is the same as the worked example: `parameters` for `id`, `requestBody` with a `createComponentReference("schemas", "TaskUpdate")`, and two entries in `responses`.

HINT 2

`manager.addRoute({ method: "patch", path: "/tasks/:id", metadata: { openapi: { operationId: "tasks.update", parameters: [{ name: "id", in: "path", schema: { type: "integer", minimum: 1 } }], requestBody: { required: true, content: { "application/json": { schema: createComponentReference("schemas", "TaskUpdate") } } }, responses: { "200": { description: "The updated task", content: { "application/json": { schema: createComponentReference("schemas", "Task") } } }, "404": { description: "No task with this id" } } } } });`.

SOLUTION

patch.tsNode.js only

```ts
import { createComponentReference } from "@zudojs/openapi";
import { schema } from "@zudojs/schema";
import { taskApiDocs } from "./task-api.js";

const manager = taskApiDocs();
manager.addSchema("TaskUpdate", schema.object({ done: schema.boolean() }));
manager.addRoute({ method: "patch", path: "/tasks/:id", metadata: { openapi: {
  operationId: "tasks.update",
  parameters: [{ name: "id", in: "path", schema: { type: "integer", minimum: 1 } }],
  requestBody: { required: true, content: { "application/json": { schema: createComponentReference("schemas", "TaskUpdate") } } },
  responses: {
    "200": { description: "The updated task", content: { "application/json": { schema: createComponentReference("schemas", "Task") } } },
    "404": { description: "No task with this id" },
  },
} } });
console.log(manager.validate().valid, Object.keys(manager.generate().paths));
```

Output of `npx tsx patch.ts`

```ts
true [ '/tasks', '/health', '/tasks/{id}' ]
```

TRY IT YOURSELF

### A check for CI

Write `check-docs.ts`: it builds the Task API document for OpenAPI 3.0.3, prints `OpenAPI document OK` when it is valid, and otherwise prints the problems and sets `process.exitCode = 1`, so a CI job fails.

Write it in the editor, run it on your computer, then press **Check** and paste what it printed. Hints and the solution open up once you have checked your output.

HINT 1

Branch on `result.valid`. In the success branch, `Object.keys(manager.generate().paths).length` gives you the number of paths to log next to `manager.generate().openapi`.

HINT 2

`if (result.valid) { console.log("OpenAPI document OK:", manager.generate().openapi, Object.keys(manager.generate().paths).length, "paths"); } else { for (const issue of result.errors) console.error(issue.path.join("."), issue.message); process.exitCode = 1; }`.

SOLUTION

check-docs.tsNode.js only

```ts
import { taskApiDocs } from "./task-api.js";

const manager = taskApiDocs("3.0.3");
const result = manager.validate();
if (result.valid) {
  console.log("OpenAPI document OK:", manager.generate().openapi, Object.keys(manager.generate().paths).length, "paths");
} else {
  for (const issue of result.errors) console.error(issue.path.join("."), issue.message);
  process.exitCode = 1;
}
```

Output of `npx tsx check-docs.ts`

```ts
OpenAPI document OK: 3.0.3 2 paths
```

Run it in CI next to your tests. A broken reference or a forgotten parameter then fails the build instead of reaching the people who use your API.

## Recap

- An OpenAPI document describes every path, method, input and response of an HTTP API, in JSON or YAML, for people and tools.
- `OpenAPIManager` builds it from routes. `/tasks/:id` becomes `/tasks/{id}`, and every path parameter is documented, declared or not.
- `addSchema` turns `@zudojs/schema` schemas into components, so the document and the runtime checks share one source.
- Pick 3.1 unless a tool needs 3.0. The converter writes the right keywords for each.
- `validate()` or `generate(true)` catches unknown security schemes and broken references. A route with no responses gets a `default` response and a warning, so declare the responses yourself.
- `toJSON` and `toYAML` save the document; `toResponse` and `toUIResponse` serve it with a docs page.
- With `@zudojs/http`, routes carry their own `openapi` option. `generateOpenAPIDocument(router)` builds the document and `mountOpenAPI(router)` serves `/openapi.json` and `/docs`.
- Documentation is public. Hiding a route from it is not security.

Next, [Testing a ZudoJS app](https://zudojs.oyinlola.site/learn/zudo-testing) tests the Task API: unit tests, fakes and integration tests with `@zudojs/testing`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

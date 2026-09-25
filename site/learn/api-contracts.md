---
title: "API contracts — ZudoJS Academy"
description: "Write an OpenAPI contract by hand, enforce it with schema validation, catch breaking changes with contract tests, and version events and serialization."
source: https://zudojs.oyinlola.site/learn/api-contracts
---

LEVEL 9 · LESSON 4 OF 4

APIs under real traffic Core

# API contracts

Write an OpenAPI contract by hand, enforce it with schema validation, catch breaking changes with contract tests, and version events and serialization.

- **55 min** to read and try
- **You need:** Rate limiting, and Pagination and versioning in depth
- **You build:** An OpenAPI 3.1 contract for the transfer API, a small JSON Schema validator, provider and consumer contract tests, a schema compatibility checker and a versioned event contract with an upcaster

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write an OpenAPI 3.1 document for a real endpoint, including errors and headers
- Validate requests and responses against the contract's JSON Schemas
- Write provider contract tests and consumer-driven contract checks
- Tell which schema changes break readers and which break writers, and detect them automatically
- Design event contracts with an envelope and version, and upcast old events
- Pin down serialization of big integers, money and dates so the contract matches the bytes

## A bug no test caught

The transfer API from the last three lessons moves to production. The team replaces PGlite with a real PostgreSQL server and the popular `pg` driver. Every test passes. The next morning a partner's payroll system rejects every response: *"amountKobo: expected number, got string"*. Their code had parsed `"amountKobo": 1000000` for months; now it receives `"amountKobo": "1000000"`.

Nobody changed the transfer code. The new driver returns PostgreSQL `bigint` columns as strings, because a JavaScript number cannot hold every 64-bit integer exactly. The team's tests checked that transfers *worked*. None of them checked that responses still had the *shape* clients depend on.

That shape is the API's **contract**: everything it promises to its clients. [Designing a REST API](https://zudojs.oyinlola.site/learn/rest-design#contract) wrote one as a table. This lesson makes it machine-readable with **OpenAPI**, then puts it to work: validating requests, testing responses, detecting breaking changes before they ship, and extending the same idea to events and to serialization, which is where this bug was hiding.

## Where the bytes come from

A contract describes JSON, but your code produces JavaScript values, and the step between them, **serialization**, has surprises. First, the driver. The `pg` package turns each PostgreSQL type into a JavaScript value with a **type parser**; you can call them directly, without a database:

pg-types.jsNode.js only

```ts
import pg from "pg";

const BIGINT = 20, INTEGER = 23, NUMERIC = 1700, TIMESTAMPTZ = 1184;
const parse = (oid, text) => pg.types.getTypeParser(oid)(text);

for (const [label, value] of [
  ["integer 5", parse(INTEGER, "5")],
  ["bigint 1000000", parse(BIGINT, "1000000")],
  ["bigint 9007199254740993", parse(BIGINT, "9007199254740993")],
  ["numeric 12.50", parse(NUMERIC, "12.50")],
  ["timestamptz", parse(TIMESTAMPTZ, "2026-09-24 10:00:00+00")],
]) {
  console.log(label.padEnd(24), typeof value, JSON.stringify(value));
}
```

Output of `node pg-types.js`

```ts
integer 5                number 5
bigint 1000000           string "1000000"
bigint 9007199254740993  string "9007199254740993"
numeric 12.50            string "12.50"
timestamptz              object "2026-09-24T10:00:00.000Z"
```

A `bigint` comes back as a string, and so does `numeric` (PostgreSQL's exact decimal type). The driver is right to do this: `9007199254740993` is larger than `Number.MAX_SAFE_INTEGER`, and as a JavaScript number it would silently become a different number. But the result is a different JSON type than the contract promised. Now the JSON side:

json-pitfalls.js

```ts
const transfer = {
  id: 9007199254740993,
  amountKobo: 1000000,
  createdAt: new Date(Date.UTC(2026, 8, 24, 10, 0, 0)),
  note: undefined,
  fee: 0 / 0,
  tags: new Set(["salary"]),
};
console.log(JSON.stringify(transfer));

const back = JSON.parse(JSON.stringify(transfer));
console.log(typeof back.createdAt, "note" in back, back.fee, back.tags);

try {
  JSON.stringify({ amountKobo: 1000000n });
} catch (error) {
  console.log(error.name, "-", error.message);
}
```

Output of `node json-pitfalls.js` and of the browser terminal

```json
{"id":9007199254740992,"amountKobo":1000000,"createdAt":"2026-09-24T10:00:00.000Z","fee":null,"tags":{}}
string false null {}
TypeError - Do not know how to serialize a BigInt
```

Every line is a way to break a contract without noticing:

- The id was printed as `9007199254740992`: it lost precision before it was even serialized. Large ids belong in the contract as **strings**.
- A `Date` becomes an ISO 8601 string, and `JSON.parse` does not turn it back: the client gets a string. The contract says `"type": "string", "format": "date-time"`, and clients parse it themselves.
- `undefined` fields disappear, `NaN` becomes `null`, and a `Set` becomes `{}`.
- A `BigInt` cannot be serialized at all: `JSON.stringify` throws.

So a contract must pin down *representation*, not just field names: money as integer kobo, ids as strings when they can exceed 253, times as `date-time` strings in UTC. And the serialization step (a mapper from database rows to response objects, as in [Type-safe API architecture](https://zudojs.oyinlola.site/learn/ts-api-layers)) must produce exactly that. [The ZudoJS serialization lesson](https://zudojs.oyinlola.site/learn/zudo-serialization) shows a library that handles these types with explicit tags.

## The contract as an OpenAPI document

**OpenAPI** is the standard format for describing an HTTP API. An OpenAPI document is JSON (or YAML) with three main parts: `info` (name and version), `paths` (each URL, and under it each method, called an **operation**) and `components` (shared pieces, mainly **schemas**). Since version 3.1, its schemas are plain **JSON Schema**, a standard vocabulary for describing JSON values: `type`, `properties`, `required`, `enum`, `minimum` and so on.

Here is the transfer API's contract, written by hand as a JavaScript module so the examples can import it. Everything the last three lessons promised is in it: the required `Idempotency-Key` header, integer kobo, the problem details error format, and `Retry-After` on 429:

contract.js

```ts
const problem = { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } };
const transfer = { "application/json": { schema: { $ref: "#/components/schemas/Transfer" } } };

export const contract = {
  openapi: "3.1.0",
  info: { title: "Transfers API", version: "2026-09-01" },
  paths: {
    "/transfers": {
      post: {
        operationId: "createTransfer",
        summary: "Move money between two accounts, once",
        parameters: [
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 64 } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TransferRequest" } } },
        },
        responses: {
          "201": { description: "The transfer was made (or replayed)", content: transfer },
          "400": { description: "The request is malformed", content: problem },
          "404": { description: "The sending account was not found", content: problem },
          "409": { description: "The same request is still in progress", content: problem },
          "422": { description: "A business rule refused the transfer", content: problem },
          "429": {
            description: "Too many requests",
            headers: { "Retry-After": { required: true, schema: { type: "integer", minimum: 1 } } },
            content: problem,
          },
        },
      },
    },
    "/transfers/{id}": {
      get: {
        operationId: "getTransfer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[0-9]+$" } }],
        responses: {
          "200": { description: "The transfer", content: transfer },
          "404": { description: "No such transfer", content: problem },
        },
      },
    },
  },
  components: {
    schemas: {
      TransferRequest: {
        type: "object",
        required: ["from", "to", "amountKobo"],
        additionalProperties: false,
        properties: {
          from: { type: "integer", minimum: 1 },
          to: { type: "integer", minimum: 1 },
          amountKobo: { type: "integer", minimum: 1, maximum: 500000000 },
          note: { type: "string", maxLength: 140 },
        },
      },
      Transfer: {
        type: "object",
        required: ["id", "from", "to", "amountKobo", "status", "createdAt"],
        properties: {
          id: { type: "string", pattern: "^[0-9]+$" },
          from: { type: "integer" },
          to: { type: "integer" },
          amountKobo: { type: "integer", minimum: 1 },
          status: { type: "string", enum: ["completed"] },
          createdAt: { type: "string", format: "date-time" },
          note: { type: ["string", "null"] },
        },
      },
      Problem: {
        type: "object",
        required: ["type", "title", "status"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          status: { type: "integer", minimum: 400, maximum: 599 },
          detail: { type: "string" },
        },
      },
    },
  },
};
```

A few decisions are worth noticing:

- `$ref` points at a shared schema by a path inside the document (`#/components/schemas/Transfer`), so `Transfer` is written once and used by both operations.
- `TransferRequest` has `additionalProperties: false`: a client that sends `amount_kobo` by mistake gets a clear 400, instead of a silent "amountKobo is required". Being strict with *input* also stops clients from setting fields they should not, such as `status`.
- `Transfer` does *not* forbid extra properties: the server may add fields later, and tolerant clients (the [tolerant reader pattern](https://zudojs.oyinlola.site/learn/api-pagination-versioning#breaking)) ignore them.
- `note` in a response is `["string", "null"]`: the field is always there, sometimes `null`. That is a different promise from "sometimes missing", and clients code differently for each.
- The transfer `id` is a string of digits, so it can grow past 253 without breaking anyone.

A contract is also data you can query. This prints a one-line summary per operation, the kind of table a client developer wants first:

summary.js

```ts
import { contract } from "./contract.js";

for (const [path, methods] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    const headers = (operation.parameters ?? []).filter((p) => p.in === "header" && p.required).map((p) => p.name);
    console.log(`${method.toUpperCase()} ${path}`.padEnd(20), operation.operationId.padEnd(15),
      Object.keys(operation.responses).join(" "), headers.length ? `| requires ${headers}` : "");
  }
}
```

Output of `node summary.js` and of the browser terminal

```ts
POST /transfers      createTransfer  201 400 404 409 422 429 | requires Idempotency-Key
GET /transfers/{id}  getTransfer     200 404
```

Writing the document by hand, as here, is called **contract-first** (or design-first): the contract is agreed with its clients before code exists. The alternative is **code-first**: generating the document from your routes and schemas, which keeps it in sync automatically. [OpenAPI documents with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-openapi) does that. Both are fine; what matters is that the document is checked against the running code, which is what the rest of this lesson does.

## Enforcing the contract

A document that only sits in a docs page drifts from the code. To make it binding, the server validates every request body against it, and tests validate every response. Real projects use a JSON Schema library such as Ajv; this small validator supports the keywords the contract uses, so you can see there is no magic in it. It returns a list of problems, each with a path such as `$.amountKobo` so the client knows which field is wrong:

validate.js

```ts
const TYPES = {
  string: (v) => typeof v === "string",
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function resolve(root, ref) {
  return ref.replace(/^#\//, "").split("/").reduce((node, part) => node[part], root);
}

export function validate(schema, value, root, path = "$") {
  if (schema.$ref) return validate(resolve(root, schema.$ref), value, root, path);
  const types = [schema.type].flat().filter(Boolean);
  if (types.length > 0 && !types.some((t) => TYPES[t](value))) {
    return [`${path}: expected ${types.join(" or ")}, got ${typeOf(value)}`];
  }
  const errors = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be at most ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: must match ${schema.pattern}`);
    if (schema.format === "date-time" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      errors.push(`${path}: must be a date-time`);
    }
  }
  if (TYPES.object(value)) {
    for (const name of schema.required ?? []) {
      if (!(name in value)) errors.push(`${path}.${name}: is required`);
    }
    for (const [name, child] of Object.entries(value)) {
      const rule = schema.properties?.[name];
      if (rule) errors.push(...validate(rule, child, root, `${path}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${name}: is not allowed`);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${path}[${i}]`)));
  }
  return errors;
}

export function schemaFor(contract, method, path, status) {
  const operation = contract.paths[path][method];
  const content = status === undefined ? operation.requestBody.content : operation.responses[status]?.content;
  return content && Object.values(content)[0].schema;
}
```

Validate some request bodies the way the server would, before any handler runs:

requests.js

```ts
import { contract } from "./contract.js";
import { schemaFor, validate } from "./validate.js";

const requestSchema = schemaFor(contract, "post", "/transfers");
const bodies = [
  { from: 1, to: 2, amountKobo: 1000000 },
  { from: 1, to: 2, amount_kobo: 1000000 },
  { from: "1", to: 2, amountKobo: 10.5 },
  { from: 1, to: 2, amountKobo: 1000000, status: "completed", note: "x".repeat(200) },
];
for (const body of bodies) {
  const errors = validate(requestSchema, body, contract);
  console.log(errors.length === 0 ? "valid" : errors);
}
```

Output of `node requests.js` and of the browser terminal

```ts
valid
[ '$.amountKobo: is required', '$.amount_kobo: is not allowed' ]
[
  '$.from: expected integer, got string',
  '$.amountKobo: expected integer, got number'
]
[
  '$.status: is not allowed',
  '$.note: must be at most 140 characters'
]
```

The typo `amount_kobo` is reported twice, as a missing field and as an unknown one, which tells the client exactly what happened. `"1"` is refused as a string, 10.5 as not an integer, and a client that tries to set `status` itself is stopped at the door. This is the validation from [the BookStore](https://zudojs.oyinlola.site/learn/bookstore-data#validation), but written once, as data, in the same document the clients read. [Validation with @zudojs/schema](https://zudojs.oyinlola.site/learn/zudo-validation) does the same with a typed schema library.

## Contract tests

### Provider tests: does the server keep its promises?

A **provider contract test** calls the real handler, the way a client would, and validates the response against the schema the contract gives for that status code. Here are two versions of the transfer handler. The first builds its response from PGlite rows. The second is the same code after the switch to the `pg` driver, whose rows carry `bigint` columns as strings, exactly as you saw at the start:

handlers.js

```ts
function toTransfer(row) {
  return {
    id: String(row.id),
    from: row.from_account,
    to: row.to_account,
    amountKobo: row.amount_kobo,
    status: "completed",
    createdAt: row.created_at.toISOString(),
    note: row.note,
  };
}

const pgliteRow = { id: 41, from_account: 1, to_account: 2, amount_kobo: 1000000, created_at: new Date(Date.UTC(2026, 8, 24, 10)), note: null };
const pgRow = { ...pgliteRow, amount_kobo: "1000000" };

function makeHandler(row) {
  return async (request) => {
    if (request.body.amountKobo > 5000000) {
      return { status: 422, body: { type: "https://example.com/problems/insufficient-funds", title: "Insufficient funds", status: 422 } };
    }
    return { status: 201, body: toTransfer({ ...row, note: request.body.note ?? null }) };
  };
}

export const handlerWithPglite = makeHandler(pgliteRow);
export const handlerWithPg = makeHandler(pgRow);
```

provider-test.js

```ts
import { contract } from "./contract.js";
import { handlerWithPg, handlerWithPglite } from "./handlers.js";
import { schemaFor, validate } from "./validate.js";

const cases = [
  { name: "a normal transfer", body: { from: 1, to: 2, amountKobo: 1000000 } },
  { name: "a transfer with a note", body: { from: 1, to: 2, amountKobo: 250000, note: "rent" } },
  { name: "too much money", body: { from: 1, to: 2, amountKobo: 9000000 } },
];

async function verify(label, handler) {
  console.log(label);
  for (const { name, body } of cases) {
    const response = await handler({ body });
    const schema = schemaFor(contract, "post", "/transfers", String(response.status));
    const errors = schema ? validate(schema, response.body, contract) : [`status ${response.status} is not in the contract`];
    console.log(`  ${errors.length === 0 ? "PASS" : "FAIL"} ${name} -> ${response.status}`, errors.length ? errors : "");
  }
}

await verify("with PGlite:", handlerWithPglite);
await verify("with pg:", handlerWithPg);
```

Output of `node provider-test.js` and of the browser terminal

```ts
with PGlite:
  PASS a normal transfer -> 201
  PASS a transfer with a note -> 201
  PASS too much money -> 422
with pg:
  FAIL a normal transfer -> 201 [ '$.amountKobo: expected integer, got string' ]
  FAIL a transfer with a note -> 201 [ '$.amountKobo: expected integer, got string' ]
  PASS too much money -> 422
```

This is the test the team was missing. It fails with the same message the partner saw, but in CI, before release. The fix belongs in the mapper, for example `amountKobo: Number(row.amount_kobo)` after checking the value is a safe integer, or a `pg` type parser registered once for `bigint`. Notice also what the test checks for each case: the status code must exist in the contract, and the body must match *that* status's schema. An undocumented 500, or a 422 with a made-up error shape, fails too.

### Consumer-driven contracts: what do clients actually use?

A provider test proves the server matches its own document. But which parts of the document do clients rely on? If nobody reads `note`, removing it is harmless; if the fraud service reads `createdAt`, changing its format is not. In **consumer-driven contract testing**, each client (consumer) writes down the interactions it depends on and the fields it reads, and the provider runs those expectations in its own test suite. The tool most teams use for this is Pact; the idea fits in a few lines:

consumer-contracts.js

```ts
import { handlerWithPg, handlerWithPglite } from "./handlers.js";

const typeOf = (v) => (v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);

const consumers = {
  "mobile-app": {
    request: { from: 1, to: 2, amountKobo: 1000000 },
    expects: { status: 201, fields: { id: "string", amountKobo: "integer", status: "string" } },
  },
  "fraud-service": {
    request: { from: 1, to: 2, amountKobo: 1000000 },
    expects: { status: 201, fields: { from: "integer", to: "integer", amountKobo: "integer", createdAt: "string" } },
  },
  "partner-payroll": {
    request: { from: 1, to: 2, amountKobo: 9000000 },
    expects: { status: 422, fields: { title: "string" } },
  },
};

async function verifyConsumers(handler) {
  for (const [consumer, { request, expects }] of Object.entries(consumers)) {
    const response = await handler({ body: request });
    const broken = Object.entries(expects.fields)
      .filter(([field, type]) => typeOf(response.body[field]) !== type)
      .map(([field, type]) => `${field} should be ${type}, is ${typeOf(response.body[field])}`);
    if (response.status !== expects.status) broken.unshift(`status ${response.status}, expected ${expects.status}`);
    console.log(`  ${consumer.padEnd(16)} ${broken.length ? "BROKEN: " + broken.join("; ") : "ok"}`);
  }
}

console.log("current release:");
await verifyConsumers(handlerWithPglite);
console.log("candidate release:");
await verifyConsumers(handlerWithPg);
```

Output of `node consumer-contracts.js` and of the browser terminal

```ts
current release:
  mobile-app       ok
  fraud-service    ok
  partner-payroll  ok
candidate release:
  mobile-app       BROKEN: amountKobo should be integer, is string
  fraud-service    BROKEN: amountKobo should be integer, is string
  partner-payroll  ok
```

Now the failure has names: the mobile app and the fraud service break, the partner's error handling does not. That tells you who to talk to and how urgent the fix is. It also works in the other direction: when a field appears in no consumer's expectations, you have evidence that changing it is safe.

> TIP
>
> Contract tests complement, not replace, the tests from [Testing strategies](https://zudojs.oyinlola.site/learn/testing-strategies). Unit tests check logic; integration tests check your code with a real database; contract tests check the boundary other teams depend on. They are fast, because they need no other team's system running.

## Schema evolution

Contracts change. The question is which changes are safe, and the answer depends on **who writes and who reads** the data.

REASON IT OUT

### Before you change the Transfer schemas

You want to make four changes. For each one, ask: who produces this data, who consumes it, and can an *unchanged* old party still work with a *changed* new one?

- Make `note` required in `TransferRequest`.
- Add the value `"reversed"` to `Transfer.status`.
- Add the value `"NGN"` as the only allowed `currency`, a new optional field of `TransferRequest`.
- Remove `note` from `Transfer` (the response).

**Show the reasoning**

**Requests** are written by clients and read by your server. A change is safe if every request an old client sends is still accepted. Making `note` required breaks old clients that never send it. Adding an optional `currency` is safe: old clients do not send it, and the server treats it as `"NGN"`.

**Responses** are written by your server and read by clients. A change is safe if every response is still something an old client can read. Adding `"reversed"` to `status` breaks clients that handle only `"completed"`. Removing `note` breaks clients that read it.

The rules are mirror images. For requests, you may *widen* what you accept (new optional fields, more enum values, looser limits) but not narrow it. For responses, you may *narrow* what you send (fewer enum values, tighter limits, new fields that tolerant readers ignore) but not widen or remove it.

Those rules can be automated. This checker compares two versions of an object schema and reports breaking changes, with the rules flipped depending on whether the schema is used for requests or responses. Tools such as oasdiff do the same for whole OpenAPI documents, in CI, on every pull request:

compat.js

```ts
function enumChange(before = [], after = []) {
  return { added: after.filter((v) => !before.includes(v)), removed: before.filter((v) => !after.includes(v)) };
}

export function breakingChanges(before, after, direction) {
  const problems = [];
  const props = new Set([...Object.keys(before.properties ?? {}), ...Object.keys(after.properties ?? {})]);
  const req = (schema, name) => (schema.required ?? []).includes(name);
  for (const name of props) {
    const old = before.properties?.[name];
    const now = after.properties?.[name];
    if (old && !now) {
      if (direction === "response") problems.push(`${name}: removed from the response`);
      continue;
    }
    if (!old && now) {
      if (direction === "request" && req(after, name)) problems.push(`${name}: new required request field`);
      continue;
    }
    if (JSON.stringify([old.type].flat()) !== JSON.stringify([now.type].flat())) problems.push(`${name}: type changed`);
    if (direction === "request" && !req(before, name) && req(after, name)) problems.push(`${name}: became required`);
    if (direction === "response" && req(before, name) && !req(after, name)) problems.push(`${name}: may now be missing`);
    const { added, removed } = enumChange(old.enum, now.enum);
    if (direction === "response" && old.enum && added.length) problems.push(`${name}: new values ${added} may surprise clients`);
    if (direction === "request" && removed.length) problems.push(`${name}: values ${removed} no longer accepted`);
    if (direction === "request" && (now.maximum ?? Infinity) < (old.maximum ?? Infinity)) problems.push(`${name}: maximum lowered`);
    if (direction === "request" && (now.maxLength ?? Infinity) < (old.maxLength ?? Infinity)) problems.push(`${name}: maxLength lowered`);
  }
  if (direction === "request" && before.additionalProperties !== false && after.additionalProperties === false) {
    problems.push("unknown fields are now rejected");
  }
  return problems;
}
```

evolve.js

```ts
import { breakingChanges } from "./compat.js";
import { contract } from "./contract.js";

const { TransferRequest, Transfer } = contract.components.schemas;

const nextRequest = structuredClone(TransferRequest);
nextRequest.properties.currency = { type: "string", enum: ["NGN"] };
nextRequest.properties.note.maxLength = 100;
nextRequest.required.push("note");

const nextTransfer = structuredClone(Transfer);
nextTransfer.properties.status.enum.push("reversed");
nextTransfer.properties.fee = { type: "integer" };
delete nextTransfer.properties.note;

console.log("request: ", breakingChanges(TransferRequest, nextRequest, "request"));
console.log("response:", breakingChanges(Transfer, nextTransfer, "response"));

const safeTransfer = structuredClone(Transfer);
safeTransfer.properties.fee = { type: "integer" };
console.log("response, only adding fee:", breakingChanges(Transfer, safeTransfer, "response"));
```

Output of `node evolve.js` and of the browser terminal

```ts
request:  [ 'note: became required', 'note: maxLength lowered' ]
response: [
  'status: new values reversed may surprise clients',
  'note: removed from the response'
]
response, only adding fee: []
```

The new optional `currency` field and the new `fee` field passed; everything else was caught, each with the reason. When a breaking change is truly needed, the tools from [Pagination and versioning](https://zudojs.oyinlola.site/learn/api-pagination-versioning#transformers) take over: a new dated version, a version change that translates old shapes, deprecation headers. The checker's job is to make sure that decision is made on purpose, never by accident.

### Expand, migrate, contract

Many changes that look breaking can be done safely in three releases. To rename `note` to `memo`: first **expand** (accept and return both fields), then **migrate** (move clients to `memo`, watching the consumer contracts and the logs until nobody reads `note`), and only then **contract** (remove `note`, in a new version if anyone might still depend on it). The same pattern is used for database columns in [Operating databases](https://zudojs.oyinlola.site/learn/db-operations).

## Event and message contracts

HTTP is not the only boundary. When a transfer completes, the API publishes an **event**, `transfer.completed`, and other services react: notifications sends an SMS, fraud scores it, accounting books it. Those services never call your API; they depend on the event's shape. That is a contract too, with two differences that make it stricter than an HTTP one:

- **You do not know all your consumers.** Anyone with access to the topic can subscribe, and they are not in your request logs.
- **Old events live on.** Events are stored and replayed: a new fraud model is trained on a year of history, and a consumer that was down for an hour catches up. A consumer must understand every version of the event that exists in the store, not just the latest one.

So every event travels in an **envelope** with the facts every consumer needs before it looks at the data: a unique `id` (for idempotent processing, exactly as in [the idempotency lesson](https://zudojs.oyinlola.site/learn/api-idempotency#exactly-once)), a `type`, a schema `version`, when it happened, and the `data`. The CloudEvents specification standardises such an envelope. The producer validates each event against its schema before publishing, and consumers **upcast** old versions to the current one as they read, the mirror image of the version changes from the previous lessons:

events.js

```ts
import { validate } from "./validate.js";

const schemas = {
  "transfer.completed@2": {
    type: "object",
    required: ["transferId", "from", "to", "amountKobo"],
    properties: {
      transferId: { type: "string" },
      from: { type: "integer" },
      to: { type: "integer" },
      amountKobo: { type: "integer", minimum: 1 },
    },
  },
};

const upcasters = {
  "transfer.completed@1": (data) => ({
    version: 2,
    data: { transferId: String(data.id), from: data.from, to: data.to, amountKobo: Math.round(data.amountNaira * 100) },
  }),
};

function publish(type, version, data, id) {
  const errors = validate(schemas[`${type}@${version}`], data, {});
  if (errors.length > 0) throw new Error(`refusing to publish ${type}@${version}: ${errors.join("; ")}`);
  return { id, type, version, occurredAt: "2026-09-24T10:00:00Z", data };
}

function readCurrent(event) {
  let { version, data } = event;
  while (version < 2) ({ version, data } = upcasters[`${event.type}@${version}`](data));
  return data;
}

const stored = [
  { id: "evt-1", type: "transfer.completed", version: 1, occurredAt: "2025-11-02T08:15:00Z", data: { id: 7, from: 1, to: 2, amountNaira: 2500.5 } },
  publish("transfer.completed", 2, { transferId: "41", from: 1, to: 2, amountKobo: 1000000 }, "evt-2"),
];
for (const event of stored) console.log(event.id, `v${event.version} ->`, readCurrent(event));

try {
  publish("transfer.completed", 2, { transferId: 41, from: 1, to: 2, amountKobo: "1000000" }, "evt-3");
} catch (error) {
  console.log(error.message);
}
```

Output of `node events.js` and of the browser terminal

```ts
evt-1 v1 -> { transferId: '7', from: 1, to: 2, amountKobo: 250050 }
evt-2 v2 -> { transferId: '41', from: 1, to: 2, amountKobo: 1000000 }
refusing to publish transfer.completed@2: $.transferId: expected string, got number; $.amountKobo: expected integer, got string
```

- The event from last November was written in version 1, with naira as a decimal and a numeric id. The consumer upcast it to version 2 and handles both events with one code path.
- The producer refused to publish an event with the `pg` driver's string amount. For events this check matters even more than for HTTP responses: a bad response affects one request, but a bad event is stored and replayed forever.
- Upcasters run in order (1 to 2, then 2 to 3 …), so adding version 3 later means writing one more function, not rewriting the old ones.

The compatibility rules for events are those of responses (the producer writes, consumers read), with one more: since old events are never rewritten, "removing a field" only applies to new events. Consumers must keep handling the old shape for as long as old events are stored. [Events with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-events) and [Messaging with ZudoJS](https://zudojs.oyinlola.site/learn/zudo-messaging) apply this with typed event definitions.

## Build it: a server that enforces its contract

Put the pieces together in a `node:http` server. It serves the contract itself at `/openapi.json`, so clients and tools always read the version that is running; it rejects requests that break the contract with a 400 that lists every problem; and in development it also validates its own responses, logging any mismatch, so contract bugs show up the first time the code runs:

server.jsNode.js only

```ts
import http from "node:http";
import { contract } from "./contract.js";
import { handlerWithPg } from "./handlers.js";
import { schemaFor, validate } from "./validate.js";

const problem = (status, title, extra) => ({ type: `https://example.com/problems/${status}`, title, status, ...extra });

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/openapi.json") return send(200, contract);
  if (req.method !== "POST" || req.url !== "/transfers") return send(404, problem(404, "Not Found"));

  let text = "";
  for await (const chunk of req) text += chunk;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return send(400, problem(400, "Invalid JSON"));
  }
  const errors = validate(schemaFor(contract, "post", "/transfers"), body, contract);
  const key = req.headers["idempotency-key"] ?? "";
  if (key.length < 16 || key.length > 64) errors.push("header Idempotency-Key: is required, 16 to 64 characters");
  if (errors.length > 0) return send(400, problem(400, "Request does not match the contract", { errors }));

  const response = await handlerWithPg({ body });
  const drift = validate(schemaFor(contract, "post", "/transfers", String(response.status)), response.body, contract);
  if (drift.length > 0) console.log("contract drift in response:", drift);
  send(response.status, response.body);
});

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const doc = await (await fetch(`${base}/openapi.json`)).json();
  console.log("serving", doc.info.title, doc.info.version);

  const post = (body, key = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d") =>
    fetch(`${base}/transfers`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });

  const bad = await post({ from: 1, to: 2, amount: 1000 }, "short");
  console.log(bad.status, (await bad.json()).errors);
  const good = await post({ from: 1, to: 2, amountKobo: 1000000 });
  console.log(good.status, (await good.json()).amountKobo);
  server.close();
});
```

Output of `node server.js`

```ts
serving Transfers API 2026-09-01
400 [
  '$.amountKobo: is required',
  '$.amount: is not allowed',
  'header Idempotency-Key: is required, 16 to 64 characters'
]
contract drift in response: [ '$.amountKobo: expected integer, got string' ]
201 1000000
```

The bad request got every problem at once: a missing field, an unknown one and a short key. The good request went through, and the server noticed its own contract drift, the `pg` string, and logged it. In production you would log and alert rather than fail the request; in tests, the provider contract test fails the build.

## Production concerns

- **One source of truth.** Either the document generates the validation (contract-first) or the code generates the document (code-first). Two hand-maintained copies always drift.
- **Check contracts in CI.** Run provider tests on every change, run consumer expectations from every known client, and diff the OpenAPI document against the last release so breaking changes need an explicit approval.
- **Publish it.** Serve the document from the running API and in your docs. Client developers generate typed clients from it, and every field you document becomes a promise, so document deliberately.
- **Validation costs time.** Validating request bodies is always worth it. Validating every *response* in production doubles the work on large lists; many teams do it in tests and development only, or on a sample of production traffic.
- **Keep event schemas in a registry.** Consumers you do not know about need a place to find the schema for `transfer.completed@2`. Never reuse a version number for a different shape.
- **Representation is part of the contract.** Decide once how money, big ids, dates and nulls are written, put it in the schemas, and put it in one mapper per resource.

## Practice

TRY IT YOURSELF

### A reference field

Partners want to attach their own payment reference to a transfer. Add an optional `reference` (string, at most 64 characters) to `TransferRequest`, and a `reference` of type `["string", "null"]` to `Transfer`. Run the compatibility checker on both. Is this safe to ship without a new version?

**Show a solution**

add-reference.js

```ts
import { breakingChanges } from "./compat.js";
import { contract } from "./contract.js";

const { TransferRequest, Transfer } = contract.components.schemas;
const request = structuredClone(TransferRequest);
request.properties.reference = { type: "string", maxLength: 64 };
const response = structuredClone(Transfer);
response.properties.reference = { type: ["string", "null"] };

console.log("request:", breakingChanges(TransferRequest, request, "request"));
console.log("response:", breakingChanges(Transfer, response, "response"));
```

Output of `node add-reference.js` and of the browser terminal

```ts
request: []
response: []
```

Both lists are empty: an optional request field widens what the server accepts, and a new response field is ignored by tolerant readers. It ships without a new version. It is still worth a changelog entry, so partners know it exists.

TRY IT YOURSELF

### The notifications service's expectations

The notifications service sends "You sent ₦10,000 to account 2". Write its consumer expectation (the request it relies on, the status, and the fields and types it reads), and verify it against both handlers.

**Show a solution**

notifications-contract.js

```ts
import { handlerWithPg, handlerWithPglite } from "./handlers.js";

const typeOf = (v) => (v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);
const expectation = {
  request: { from: 1, to: 2, amountKobo: 1000000 },
  status: 201,
  fields: { amountKobo: "integer", to: "integer" },
};

for (const [label, handler] of [["current", handlerWithPglite], ["candidate", handlerWithPg]]) {
  const response = await handler({ body: expectation.request });
  const broken = Object.entries(expectation.fields).filter(([field, type]) => typeOf(response.body[field]) !== type);
  const ok = response.status === expectation.status && broken.length === 0;
  const message = ok ? `ok: You sent ₦${(response.body.amountKobo / 100).toLocaleString("en-NG")} to account ${response.body.to}` : `BROKEN: ${broken.map(([f]) => f)}`;
  console.log(label.padEnd(10), message);
}
```

Output of `node notifications-contract.js` and of the browser terminal

```ts
current    ok: You sent ₦10,000 to account 2
candidate  BROKEN: amountKobo
```

The expectation lists only what the service reads. It does not care about `createdAt` or `note`, so those can change without breaking it, and the provider team can see that from the expectations alone.

TRY IT YOURSELF

### Safe JSON for money and ids

Write a `replacer` for `JSON.stringify` that writes `BigInt` values as strings, and a `toTransfer(row)` mapper that accepts `amount_kobo` as a number, a numeric string or a `BigInt`, and always returns a safe integer (throwing otherwise). Test it with the PGlite row, the `pg` row and an amount too large to be safe.

**Show a solution**

safe-json.js

```ts
const replacer = (key, value) => (typeof value === "bigint" ? value.toString() : value);

function toSafeInteger(value, field) {
  const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(n)) throw new Error(`${field} is not a safe integer: ${String(value)}`);
  return n;
}

function toTransfer(row) {
  return { id: String(row.id), amountKobo: toSafeInteger(row.amount_kobo, "amount_kobo") };
}

console.log(JSON.stringify({ ledgerId: 9007199254740993n }, replacer));
for (const amount of [1000000, "1000000", 1000000n, "90071992547409930"]) {
  try {
    console.log(JSON.stringify(toTransfer({ id: 41, amount_kobo: amount })));
  } catch (error) {
    console.log(error.message);
  }
}
```

Output of `node safe-json.js` and of the browser terminal

```json
{"ledgerId":"9007199254740993"}
{"id":"41","amountKobo":1000000}
{"id":"41","amountKobo":1000000}
{"id":"41","amountKobo":1000000}
amount_kobo is not a safe integer: 90071992547409930
```

All three honest representations of ₦10,000 come out as the same JSON integer. The oversized amount is refused loudly instead of being rounded to a different number, because a wrong amount of money is far worse than an error.

## Summary

- An API contract is every promise the API makes: paths, methods, request and response schemas per status, headers, error format and representation of values.
- OpenAPI 3.1 writes that contract as data, with JSON Schema for bodies, `$ref` for shared schemas and `components` for reuse.
- Serialization is part of the contract: drivers return `bigint` and `numeric` as strings, JSON cannot hold `BigInt`, dates become strings, and large numbers lose precision. Decide the representation and map to it once.
- Enforce the contract: validate every request against it, and test every response against the schema for its status code.
- Consumer-driven contracts record what each client actually uses, so you know who a change breaks, and what is safe to change.
- Requests may widen and responses may narrow. Automate the check in CI, and use expand, migrate, contract (or a new version) when a breaking change is needed.
- Events need contracts too: an envelope with id, type and version, validation before publishing, and upcasters so consumers can read every version still stored.

This completes API engineering. Next, the security course starts with [Authentication](https://zudojs.oyinlola.site/learn/sec-authentication): passwords, sessions and tokens, built from first principles.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.

# @zudojs/schema

Type-safe schema definition, parsing, and validation engine for data contracts.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-schema](https://zudojs.oyinlola.site/docs/packages-schema) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-schema.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/schema
```

## Quick Start

```typescript
import { schema, type Infer } from "@zudojs/schema";

const UserSchema = schema.object({
  id: schema.string().uuid(),
  email: schema.string().email(),
  age: schema.number().int().positive(),
});

type User = Infer<typeof UserSchema>;
```

## Parsing untrusted input

`parse` and `safeParse` both accept `unknown` — validating a value that is
not yet known to match the schema is the point of the boundary:

```typescript
const fromTheWire: unknown = await request.json();

// Throws SchemaError, carrying `issues`, if the value does not match.
const user = UserSchema.parse(fromTheWire);

// Or handle failure without exceptions.
const result = UserSchema.safeParse(fromTheWire);

if (result.success) {
  result.data.email;
} else {
  result.issues;
}
```

The two entry points always agree: any value `safeParse` reports as
invalid causes `parse` to throw, rather than being returned as a partial
result. `Infer<T>` gives a schema's output type and `SchemaInput<T>` its
declared input type, which is unaffected by `parse` accepting `unknown`.

## Limits and untrusted input

Parsing is bounded, so a hostile payload cannot exhaust the stack or the CPU:

```typescript
UserSchema.safeParse(fromTheWire, { maxDepth: 32, maxIssues: 20 });
```

`maxDepth` (default 100) is enforced by every composite schema, and a circular
structure is reported as a `circular_reference` issue rather than recursing
forever. Strings default to a 255-character ceiling and arrays to 1000 items
before any pattern or item schema runs — raise either with `.max()`. Records,
and objects in `.strict()` or `.passthrough()` mode, default to 100 keys
(`SCHEMA_DEFAULT_MAX_OBJECT_KEYS`, never fewer than the object's own shape) —
raise it with `.maxKeys()`:

```typescript
schema.record(schema.string()).maxKeys(5000);
UserSchema.passthrough().maxKeys(500);
```

`maxIssues` caps how many issues are *collected*, never whether parsing fails:
the first issue is always kept (so `maxIssues: 0` behaves like `1`), and any
issue past the cap still fails the parse.

A `.refine()` or `.transform()` callback only ever sees data its inner schema
accepted: when the inner schema recorded an issue, the callback is skipped. A
callback that throws is reported as a
`refine_failed` / `transform_failed` issue carrying the original message.
Anything else thrown during parsing — a genuine defect — propagates out of
`safeParse` instead of being flattened into "invalid input".

## Strings: URLs, dates and times

`string().url()` accepts absolute `http:` and `https:` URLs only, so a
`javascript:` or `data:` URL is never valid by default. For other schemes,
list them (case-insensitive, parsed with the WHATWG `URL` parser):

```typescript
const Env = schema.object({
  DATABASE_URL: schema.string().url({ protocols: ["postgres", "postgresql"] }),
  REDIS_URL: schema.string().url({ protocols: ["redis", "rediss"] }),
  // Any scheme, including javascript: and data:. Only for values that are
  // never rendered as a link or followed.
  WEBHOOK: schema.string().url({ protocols: "any" }),
});
```

`date()` (`YYYY-MM-DD`), `datetime()` (`YYYY-MM-DDTHH:mm:ss[.fff]` with an
optional `Z` or `±hh:mm` offset) and `time()` (`HH:mm[:ss]`) check real
values, not only the shape: the month is 01-12, the day exists in that
month (29 February only in leap years), hours are 00-23, minutes and
seconds 00-59, and an offset is at most `±23:59`. `"2026-02-30"` and
`"2026-02-28T25:61:00Z"` are rejected.

## Optional fields, `partial()` and defaults

A key the input leaves out stays out of the parsed object; it does not
come back as an own property set to `undefined` (which a repository or a
spread would read as "clear this column"). A key the input sends as
`undefined` is kept. The inferred type matches: an optional field is an
optional property, so it works with `exactOptionalPropertyTypes`.

```typescript
const User = schema.object({ name: schema.string(), bio: schema.string().optional() });
User.parse({ name: "Ada" });   // { name: "Ada" }, no `bio` key
type U = Infer<typeof User>;   // { name: string; bio?: string | undefined }
```

`partial()` makes every field optional and does **not** apply `.default()`
to a key the input leaves out, so an update schema built from a create
schema never resets the fields the caller did not send:

```typescript
const Task = schema.object({
  title: schema.string(),
  done: schema.boolean().default(false),
});
Task.parse({ title: "t" });      // { title: "t", done: false }
Task.partial().parse({});        // {}
```

Every primitive (`string`, `number`, `boolean`, `bigint`, `symbol`,
`literal`, `enum`, the sentinel schemas and the `coerce` schemas) has the
same chainable modifiers: `.optional()`, `.nullable()`, `.default()`,
`.refine()` and `.transform()`. `SchemaInput<typeof s>` of
`schema.string().transform(Number)` is `string`, its input.

## Coercion

For query parameters and form data, where everything arrives as a string:

```typescript
const Query = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  verbose: schema.coerce.boolean().default(false),
});
```

Stricter than the JavaScript built-ins it wraps: `""` and `"   "` are rejected
rather than becoming `0`, `"1e999"` is rejected rather than becoming `Infinity`,
and `"1"`/`"0"`/`"yes"`/`"on"` are accepted as booleans.

## Features

- Type-safe schema definitions
- Runtime validation with detailed errors
- Schema composition: object, union, discriminated union, intersection (nested
  object results are deep-merged), lazy
- Transformations, refinements and defaults
- Explicit coercion for string-typed input
- Depth, cycle, length, key-count and issue-count limits
- Prototype-pollution protection on object and record keys

## Use Cases

- API request/response validation
- Configuration validation
- Form data validation
- Data contract enforcement

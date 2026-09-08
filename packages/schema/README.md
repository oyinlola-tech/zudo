# @zudojs/schema

Type-safe schema definition, parsing, and validation engine for data contracts.

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
before any pattern or item schema runs — raise either with `.max()`.

A `.refine()` or `.transform()` callback that throws is reported as a
`refine_failed` / `transform_failed` issue carrying the original message.
Anything else thrown during parsing — a genuine defect — propagates out of
`safeParse` instead of being flattened into "invalid input".

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
- Schema composition: object, union, discriminated union, intersection, lazy
- Transformations, refinements and defaults
- Explicit coercion for string-typed input
- Depth, cycle, length and issue-count limits
- Prototype-pollution protection on object and record keys

## Use Cases

- API request/response validation
- Configuration validation
- Form data validation
- Data contract enforcement

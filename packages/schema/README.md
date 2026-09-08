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

## Features

- Type-safe schema definitions
- Runtime validation with detailed errors
- Schema composition and inheritance
- Transformations and defaults
- Circular reference support
- JSON Schema generation

## Use Cases

- API request/response validation
- Configuration validation
- Form data validation
- Data contract enforcement

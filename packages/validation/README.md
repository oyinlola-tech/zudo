# @zudojs/validation

Schema validation with Zod integration, constraints, parsers, composers, circular detection, and depth/size checks.

## Installation

```bash
npm install @zudojs/validation
```

## Quick Start

```typescript
import { validate, z } from "@zudojs/validation";

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

const result = validate(schema, input);
if (!result.success) {
  console.error(result.issues);
}
```

Structural guards for untrusted payloads:

```typescript
import {
  assertDepthWithinLimit,
  assertSizeWithinLimit,
  assertNoCircularReference,
} from "@zudojs/validation";

// Each aborts as soon as its bound is passed, so the cost is bounded by the
// limit rather than by the size of the input.
assertDepthWithinLimit(body, 32);
assertSizeWithinLimit(body, 1_000_000);
assertNoCircularReference(body);
```

## Safety Notes

- Constraint failures do **not** carry the rejected value. `ValidationError` is
  exposed with a 400, so echoing it would return rejected passwords and tokens
  to the caller and write them to any log that serializes the error.
- `parseRecord` and `toFieldErrors` build on null-prototype objects, so a
  `__proto__` key cannot hijack a validated result.
- `matches()` strips `g` and `y` from the pattern, which otherwise make
  `test()` stateful and flip the answer on alternate calls.
- Constraints carry an optional type guard, so wrong-typed input at a trust
  boundary reports as a validation failure rather than a `TypeError`.
- The depth and size guards count a shared subtree once per occurrence, the way
  a serializer expands it, and walk iteratively so deeply nested input cannot
  exhaust the stack inside the check.

## Features

- Zod schema integration
- Constraint validation
- Composable validators
- Circular reference detection
- Depth and size limits
- Async validation support

## Use Cases

- Form validation
- API input validation
- Configuration validation
- Data contract enforcement

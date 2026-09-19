# @zudojs/validation

Schema validation with Zod integration, constraints, parsers, composers, circular detection, and depth/size checks.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-validation](https://zudojs.oyinlola.site/docs/packages-validation) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-validation.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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
- The size guard counts a shared subtree once per occurrence, the way a
  serializer expands it, and measures what `toJSON()` returns when a value has
  one. The cycle and depth guards walk a shared subtree once, so a small graph
  of shared nodes cannot cost exponential time. All guards walk iteratively, so
  deeply nested input cannot exhaust the stack inside the check, and handle
  sparse arrays (a hole counts as `undefined`).
- `ValidationError` and `ValidationResultError` extend `@zudojs/errors`'
  `ValidationError`, so `instanceof` and `isValidationError()` from either
  package catch them. Their `toJSON()` keeps the base class's redaction:
  submitted issue values and sensitive `context` keys never reach the JSON.
- `not(constraint)` fails closed: a wrong-typed value, or one that makes the
  inner constraint throw, fails. `everyItem`/`someItem` read every index,
  holes included.
- A registry rule that declares both `schema` and `constraints` runs the schema,
  then the constraints on the parsed value.

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

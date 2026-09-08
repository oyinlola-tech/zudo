---
"@zudojs/schema": minor
---

Fix a silent validation bypass in `parse`, and widen `parse`/`safeParse` to accept `unknown`.

**`parse` now actually throws on invalid input.** Composite schemas report
failures by collecting issues on the parse context and returning a partial
value. `parse` never inspected `ctx.issues`, so it handed that partial value
back as if validation had succeeded — `schema.object({ name: schema.string() }).parse({ name: 42 })`
returned `{}` instead of throwing, while `safeParse` correctly reported the
issue. Any invalid input that previously slipped through `parse` will now throw.
This is a security-relevant fix: `parse` is the trust boundary and it was not
enforcing one.

**`parse` and `safeParse` now accept `unknown`.** Both were typed
`(input: TInput)` with `TInput` defaulting to `TOutput`, so they could not be
called on an `unknown` value — exactly the value you have at a trust boundary —
without a cast. The parameter is widened to `unknown`. This is a type-level
widening only, with no runtime change; inference at call sites is unaffected
because `SchemaInput<T>` still reads the type parameter. Existing call sites
continue to compile.

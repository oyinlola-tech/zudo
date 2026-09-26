/**
 * Round 12 regression for @zudojs/middleware (academy finding #63): how
 * `withTiming` infers its result type.
 */

import { describe, expectTypeOf, it } from "vitest";

import { withTiming } from "../src/index.js";
import type { Middleware } from "../src/index.js";

interface Ctx {
  readonly n: number;
}

describe("#63 withTiming result inference", () => {
  it("infers the result from a typed middleware", () => {
    const inner: Middleware<Ctx, string> = async (_ctx, next) => next();
    expectTypeOf(withTiming("typed", inner).handler).returns.resolves.toEqualTypeOf<string>();
  });

  it("infers the result when the context parameter is annotated", () => {
    const timed = withTiming("annotated", async (ctx: Ctx) => `n=${ctx.n}`);
    expectTypeOf(timed.handler).returns.resolves.toEqualTypeOf<string>();
  });

  it("uses the void default when only the context type is given", () => {
    // @ts-expect-error TResult defaults to void; pass <Ctx, string> instead.
    withTiming<Ctx>("partial", async (ctx) => `n=${ctx.n}`);
    const explicit = withTiming<Ctx, string>("explicit", async (ctx) => `n=${ctx.n}`);
    expectTypeOf(explicit.handler).returns.resolves.toEqualTypeOf<string>();
  });
});

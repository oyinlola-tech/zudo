/**
 * Handlers always receive an `AbortSignal`: the executor derives one from
 * the deadline and the caller's signal. The handler's context type says
 * so, while contexts built by callers may still omit it.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import { schema } from "@zudojs/schema";

import {
  APIExecutor,
  createAPIContext,
  defineOperation,
  type APIContext,
  type APIHandler,
  type APIHandlerContext,
} from "../src/index.js";

describe("handler context signal (types)", () => {
  it("types the handler's context.signal as a non-optional AbortSignal", () => {
    const op = defineOperation({
      name: "types.signal",
      handler: async (_input: unknown, context) => {
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        await sleep(1, undefined, { signal: context.signal });
        return context.signal.aborted;
      },
    });
    expectTypeOf(op.handler).parameter(1).toEqualTypeOf<APIHandlerContext>();
  });

  it("types the signal for schema-inferred handlers too", () => {
    defineOperation({
      name: "types.signal.schema",
      input: schema.object({ ms: schema.number() }),
      handler: async (input, context) => {
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        await sleep(input.ms, undefined, { signal: context.signal });
      },
    });
  });

  it("types APIHandler's context as APIHandlerContext", () => {
    expectTypeOf<Parameters<APIHandler>[1]>().toEqualTypeOf<APIHandlerContext>();
    expectTypeOf<APIHandlerContext["signal"]>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<APIHandlerContext>().toExtend<APIContext>();
  });

  it("still accepts a handler annotated with the plain APIContext", () => {
    const handler = async (_input: unknown, context: APIContext) =>
      context.requestId;
    const op = defineOperation({ name: "types.legacy", handler });
    expectTypeOf(op.handler).toExtend<APIHandler<unknown, string>>();
  });

  it("lets callers build and pass contexts without a signal", () => {
    expectTypeOf<APIContext["signal"]>().toEqualTypeOf<
      AbortSignal | undefined
    >();
    const context = createAPIContext("req-1", {});
    expectTypeOf(context).toEqualTypeOf<APIContext<{}>>();
    expectTypeOf<APIExecutor["execute"]>()
      .parameter(2)
      .toEqualTypeOf<APIContext>();
  });
});

describe("handler context signal (runtime)", () => {
  it("hands the handler a signal when the caller supplied none", async () => {
    let received: unknown;
    const op = defineOperation({
      name: "runtime.signal",
      handler: async (_input: unknown, context) => {
        received = context.signal;
        return "ok";
      },
    });
    const result = await new APIExecutor().execute(
      op,
      undefined,
      createAPIContext("req-2", {}),
    );
    expect(result.ok).toBe(true);
    expect(received).toBeInstanceOf(AbortSignal);
  });
});

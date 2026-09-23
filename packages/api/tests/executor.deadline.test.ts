/**
 * The handler's `context.signal` aborts when the operation times out or
 * the caller aborts, so a cooperative handler stops its work.
 */
import { describe, expect, it } from "vitest";

import {
  APIExecutor,
  APITimeoutError,
  createAPIContext,
  defineOperation,
  ErrorCode,
  isAPIError,
  UserIdContextKey,
  type APIContext,
  type APIInterceptor,
} from "../src/index.js";

/** Resolves with the signal's reason once it aborts. */
const abortReason = (signal: AbortSignal | undefined): Promise<unknown> =>
  new Promise((resolve) => {
    signal?.addEventListener("abort", () => resolve(signal.reason), { once: true });
  });

describe("APIExecutor aborts the handler's signal", () => {
  it("aborts context.signal with the APITimeoutError on timeout", async () => {
    let observed: Promise<unknown> | undefined;
    let sideEffects = 0;
    const slow = defineOperation({
      name: "work.slow",
      timeout: 20,
      handler: async (_input: unknown, context) => {
        observed = abortReason(context.signal);
        await observed;
        if (!context.signal?.aborted) sideEffects += 1;
        return "done";
      },
    });

    const result = await new APIExecutor().execute(slow, {}, createAPIContext("req-1", {}));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(APITimeoutError);
    expect(result.error.statusCode).toBe(504);

    const reason = await observed;
    expect(reason).toBe(result.error);
    expect(sideEffects).toBe(0);
  });

  it("gives a handler a signal even when the caller supplied none", async () => {
    let seen: AbortSignal | undefined;
    const op = defineOperation({
      name: "work.signal",
      handler: async (_input: unknown, context) => {
        seen = context.signal;
        return 1;
      },
    });

    await new APIExecutor().execute(op, {}, createAPIContext("req-1", {}));

    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
  });

  it("aborts context.signal with the cancellation error when the caller aborts", async () => {
    const controller = new AbortController();
    let observed: Promise<unknown> | undefined;
    const op = defineOperation({
      name: "work.cancel",
      timeout: 5_000,
      handler: async (_input: unknown, context) => {
        observed = abortReason(context.signal);
        await observed;
        return "late";
      },
    });

    const pending = new APIExecutor().execute(
      op,
      {},
      createAPIContext("req-1", {}, controller.signal),
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.OPERATION_CANCELLED);
    const reason = await observed;
    expect(isAPIError(reason)).toBe(true);
    expect(reason).toBe(result.error);
  });

  it("does not abort the signal when the handler completes", async () => {
    let seen: AbortSignal | undefined;
    const op = defineOperation({
      name: "work.ok",
      timeout: 20,
      handler: async (_input: unknown, context) => {
        seen = context.signal;
        return 1;
      },
    });

    await new APIExecutor().execute(op, {}, createAPIContext("req-1", {}));
    await new Promise((r) => setTimeout(r, 40));

    expect(seen?.aborted).toBe(false);
  });

  it("shares values, state and request id between interceptors and the handler", async () => {
    let handlerContext: APIContext | undefined;
    const auth: APIInterceptor = {
      async intercept(call, next) {
        call.context.set(UserIdContextKey, "u1");
        return next();
      },
    };
    const op = defineOperation({
      name: "work.ctx",
      handler: async (_input: unknown, context) => {
        handlerContext = context;
        const fromInterceptor = context.get(UserIdContextKey);
        context.set(UserIdContextKey, "u2");
        return fromInterceptor;
      },
    });
    const context = createAPIContext("req-9", { tenant: "t1" });

    const result = await new APIExecutor([auth]).execute(op, {}, context);

    expect(result).toEqual({ ok: true, data: "u1" });
    expect(context.get(UserIdContextKey)).toBe("u2");
    expect(handlerContext?.requestId).toBe("req-9");
    expect(handlerContext?.state).toEqual({ tenant: "t1" });
    expect(handlerContext?.metadata.get("userId")).toBe("u2");
    expect(Object.isFrozen(handlerContext)).toBe(true);
  });
});

/**
 * @zudojs/middleware — Round 10 regression tests.
 */

import { afterEach, describe, it, expect, vi } from "vitest";

import * as SharedErrors from "@zudojs/errors";

import {
  MiddlewareError,
  MiddlewareRateLimitError,
  MiddlewareTimeoutError,
  compose,
  loggingMiddleware,
  rateLimitMiddleware,
  timeoutMiddleware,
  withTiming,
} from "../src/index.js";

describe("MW-01", () => {
  it("does not evict a throttled key ahead of idle keys", async () => {
    const rl = rateLimitMiddleware<{ key?: string }, string>(2, 60_000, {
      maxKeys: 2,
    });
    const call = async (key: string): Promise<string> => {
      try {
        await rl.handler({ key }, async () => "ok");
        return "allowed";
      } catch (error) {
        return (error as Error).constructor.name;
      }
    };

    await call("attacker");
    await call("attacker");
    await call("bob");
    expect(await call("attacker")).toBe("MiddlewareRateLimitError");
    expect(await call("carol")).toBe("allowed");

    expect(await call("attacker")).toBe("MiddlewareRateLimitError");
    expect(rl.inspect("attacker")?.count).toBe(2);
    expect(rl.inspect("bob")).toBeUndefined();
  });
});

describe("XP-01", () => {
  it("throws errors that match the @zudojs/errors classes", async () => {
    const mw = timeoutMiddleware<Record<string, never>, string>(5);
    const error = await mw
      .handler({}, () => new Promise<string>((r) => setTimeout(() => r("late"), 50)))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SharedErrors.MiddlewareTimeoutError);
    expect(error).toBeInstanceOf(SharedErrors.MiddlewareError);
    expect(error).toBeInstanceOf(MiddlewareTimeoutError);
    expect(error).toBeInstanceOf(MiddlewareError);
  });

  it("reports a double next() with the shared class", async () => {
    const run = compose<Record<string, never>, void>(
      [
        async (_ctx, next) => {
          await next();
          await next();
        },
      ],
      async () => undefined,
    );
    await expect(run({})).rejects.toBeInstanceOf(
      SharedErrors.MiddlewareNextCalledMultipleTimesError,
    );
  });

  it("keeps the package-only classes under the shared base", () => {
    expect(new MiddlewareRateLimitError(1, 1000, 10)).toBeInstanceOf(
      SharedErrors.MiddlewareError,
    );
  });
});

describe("CONV-02", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never writes to the console by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const logging = loggingMiddleware<string>();
    await logging.handler({ method: "GET", path: "/" }, async () => "ok");
    const timed = withTiming("slow", async (_ctx: unknown, next) => next(), {
      thresholdMs: 0,
    });
    await timed.handler({}, async () => undefined);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("still writes to an injected sink", async () => {
    const lines: string[] = [];
    const logging = loggingMiddleware<string>((line) => lines.push(line));
    await logging.handler({ method: "GET", path: "/" }, async () => "ok");
    expect(lines).toHaveLength(2);
  });
});

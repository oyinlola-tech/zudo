/**
 * Audit round 9 regressions.
 */
import { describe, expect, it } from "vitest";

import {
  APIExecutor,
  createAPIContext,
  defineOperation,
  type APIOperation,
} from "../src/index.js";

describe("API-R9-01 a synchronous handler runs like an asynchronous one", () => {
  const executor = new APIExecutor();
  const context = createAPIContext("req-1", {});

  it("returns the handler's value for a hand-rolled operation", async () => {
    // A JavaScript caller can hand the executor a plain function; the type
    // says `Promise`, the runtime used to say "promise.then is not a
    // function" and report it as an internal error of the operation.
    const operation = {
      name: "sync.echo",
      handler: (input: unknown) => input,
      timeout: 1_000,
    } as unknown as APIOperation<{ readonly a: number }, { readonly a: number }>;

    const result = await executor.execute(operation, { a: 1 }, context);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("still enforces the deadline and validates output for such handlers", async () => {
    const outputSchema = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value: unknown) =>
          typeof value === "number"
            ? { value }
            : { issues: [{ message: "not a number", path: ["root"] }] },
      },
    };
    const operation = defineOperation<undefined, number>({
      name: "sync.out",
      output: outputSchema,
      handler: (() => "text") as unknown as () => Promise<number>,
    });

    const result = await executor.execute(operation, undefined, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe("APIInternalError");
      expect(result.error.message).toContain('Invalid output for operation "sync.out"');
    }
  });

  it("does not disturb a handler that throws synchronously", async () => {
    const operation = {
      name: "sync.throw",
      handler: () => {
        throw new Error("boom");
      },
      timeout: 1_000,
    } as unknown as APIOperation<undefined, never>;

    const result = await executor.execute(operation, undefined, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error.cause as Error).message).toBe("boom");
      expect(result.error.message).not.toContain("boom");
    }
  });
});

/**
 * Round 10 regressions: cause-chain redaction, depth and metadata redaction.
 */

import { describe, expect, it } from "vitest";

import {
  BaseError,
  ErrorHandler,
  ErrorSerializer,
  createErrorSerializer,
} from "../src/index.js";

const serializer = createErrorSerializer({
  includeCause: true,
  redactSensitiveData: true,
});

describe("LEAF-02", () => {
  it("redacts array causes", () => {
    const error = new BaseError("x", {
      cause: [{ password: "hunter2", apiKey: "sk_live_1" }],
    });
    const out = JSON.stringify(serializer.serialize(error));
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk_live_1");
    const handled = JSON.stringify(new ErrorHandler().toLogObject(error));
    expect(handled).not.toContain("hunter2");
  });

  it("redacts every field of a cause that only looks like a serialized BaseError", () => {
    const lookalike = {
      code: "X",
      category: "c",
      severity: "s",
      statusCode: 500,
      password: "hunter2",
      metadata: {},
    };
    const error = new BaseError("x", { cause: lookalike });
    const cause = serializer.serialize(error).cause as Record<string, unknown>;
    expect(cause.password).toBe("[REDACTED]");
  });

  it("still treats genuine BaseError causes as errors", () => {
    const inner = new BaseError("inner", { metadata: { token: "t", ok: 1 } });
    const error = new BaseError("outer", { cause: inner });
    const cause = serializer.serialize(error).cause as Record<string, unknown>;
    expect(cause.message).toBe("inner");
    expect(cause.metadata).toEqual({ token: "[REDACTED]", ok: 1 });
  });

  it("keeps raw values when redaction is off", () => {
    const error = new BaseError("x", {
      metadata: { password: "p" },
      cause: [{ password: "hunter2" }],
    });
    const raw = new ErrorSerializer({
      includeCause: true,
      redactSensitiveData: false,
    }).serialize(error);
    expect(raw.metadata).toEqual({ password: "p" });
    expect(JSON.stringify(raw.cause)).toContain("hunter2");
  });
});

function chain(length: number): BaseError {
  let error = new BaseError("level 0");
  for (let i = 1; i < length; i++) {
    error = new BaseError(`level ${i}`, { cause: error });
  }
  return error;
}

function causeDepth(value: unknown): number {
  let depth = 0;
  let current = value as { cause?: unknown } | undefined;
  while (current?.cause !== undefined && typeof current.cause === "object") {
    depth++;
    current = current.cause as { cause?: unknown };
  }
  return depth;
}

describe("LEAF-03", () => {
  it("applies the depth limit across a BaseError chain", () => {
    const json = chain(20).toJSON();
    expect(causeDepth(json)).toBe(8);
    expect(JSON.stringify(json)).toContain("[MaxDepth]");
  });

  it("does not overflow the stack on a very deep chain", () => {
    const deep = chain(20_000);
    expect(() => deep.toJSON()).not.toThrow();
    expect(() => deep.toLogObject()).not.toThrow();
    expect(() => serializer.serialize(deep)).not.toThrow();
    expect(() => new ErrorHandler().toLogObject(deep)).not.toThrow();
    expect(causeDepth(serializer.serialize(deep))).toBeLessThanOrEqual(8);
  });

  it("counts native and BaseError causes together", () => {
    let error: Error = new Error("root");
    for (let i = 0; i < 6; i++) error = new Error(`n${i}`, { cause: error });
    for (let i = 0; i < 6; i++) error = new BaseError(`b${i}`, { cause: error });
    expect(causeDepth((error as BaseError).toJSON())).toBe(8);
  });
});

describe("LEAF-09", () => {
  it("redacts sensitive metadata in toJSON, toLogObject and JSON.stringify", () => {
    const error = new BaseError("x", {
      metadata: { password: "hunter2", authorization: "Bearer abc", id: 7 },
    });
    expect(error.toLogObject().metadata).toEqual({
      password: "[REDACTED]",
      authorization: "[REDACTED]",
      id: 7,
    });
    expect(JSON.stringify(error)).not.toContain("hunter2");
    expect(JSON.stringify(error)).not.toContain("Bearer abc");
    expect(error.metadata.password).toBe("hunter2");
  });

  it("redacts plain-object causes in toJSON", () => {
    const error = new BaseError("x", { cause: { apiKey: "sk_live_1" } });
    expect(JSON.stringify(error)).not.toContain("sk_live_1");
  });
});

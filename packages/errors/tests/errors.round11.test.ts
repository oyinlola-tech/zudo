import { describe, it, expect } from "vitest";
import {
  BaseError,
  ErrorCode,
  ErrorHandler,
  serializeError,
} from "../src/index.js";

class RoundElevenError extends BaseError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
  }
}

/** Builds `{nested:{nested:…{leaf:1}}}` `levels` deep. */
function deepObject(levels: number): unknown {
  let value: unknown = { leaf: 1 };
  for (let index = 0; index < levels; index++) value = { nested: value };
  return value;
}

/** Builds `[[[…[1]]]]` `levels` deep. */
function deepArray(levels: number): unknown {
  let value: unknown = [1];
  for (let index = 0; index < levels; index++) value = [value];
  return value;
}

/** Walks a serialized cause down its `nested` chain, counting levels. */
function depthOf(value: unknown, key: string): number {
  let current = value;
  let depth = 0;
  while (
    current !== null &&
    typeof current === "object" &&
    key in (current as Record<string, unknown>)
  ) {
    current = (current as Record<string, unknown>)[key];
    depth++;
  }
  return depth;
}

describe("TYPE-01 — cause redaction is depth-bounded", () => {
  const levels = 6000;

  it("JSON.stringify truncates a deeply nested object cause", () => {
    const error = new RoundElevenError("boom", {
      cause: { body: deepObject(levels) },
    });

    const json = JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    const cause = json["cause"] as Record<string, unknown>;

    expect(depthOf(cause["body"], "nested")).toBeLessThan(levels);
    expect(JSON.stringify(json)).toContain("[MaxDepth]");
  });

  it("JSON.stringify truncates a deeply nested array cause", () => {
    const error = new RoundElevenError("boom", {
      cause: { body: deepArray(levels) },
    });

    const json = JSON.stringify(error);

    expect(json).toContain("[MaxDepth]");
  });

  it("serializeError truncates a deeply nested object cause", () => {
    const error = new RoundElevenError("boom", {
      cause: { body: deepObject(levels) },
    });

    const serialized = serializeError(error, { includeCause: true });

    expect(JSON.stringify(serialized)).toContain("[MaxDepth]");
  });

  it("ErrorHandler.toLogObject truncates a deeply nested object cause", () => {
    const error = new RoundElevenError("boom", {
      cause: { body: deepObject(levels) },
    });

    const logged = new ErrorHandler().toLogObject(error);

    expect(JSON.stringify(logged)).toContain("[MaxDepth]");
  });

  it("keeps shallow causes intact and still redacts sensitive keys", () => {
    const error = new RoundElevenError("boom", {
      cause: { password: "hunter2", nested: { token: "abc", keep: 1 } },
    });

    const json = JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    const cause = json["cause"] as Record<string, unknown>;
    const nested = cause["nested"] as Record<string, unknown>;

    expect(cause["password"]).toBe("[REDACTED]");
    expect(nested["token"]).toBe("[REDACTED]");
    expect(nested["keep"]).toBe(1);
  });
});

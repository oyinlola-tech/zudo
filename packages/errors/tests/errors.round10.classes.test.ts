/**
 * Round 10: error classes moved into @zudojs/errors from consuming packages
 * (cross/CV-02, events/XP-01, data/VAL-05, infra/INF-16, security/CONV-02,
 * edge/CONV-02). Names, codes and defaults must match the consumers' classes.
 */

import { describe, expect, it } from "vitest";

import {
  BaseError,
  ErrorCode,
  HttpMiddlewareError,
  HttpMiddlewarePipelineError,
  HttpRequestGuardError,
  MiddlewareAbortedError,
  MiddlewareError,
  MiddlewareRateLimitError,
  OAuthError,
  ObservabilityError,
  SavepointError,
  TransactionError,
  TraversalLimitError,
} from "../src/index.js";

describe("CV-02 / XP-01 / VAL-05 / INF-16 / CONV-02", () => {
  it("middleware variants extend the shared MiddlewareError", () => {
    const rate = new MiddlewareRateLimitError(10, 1000, 250);
    expect(rate).toBeInstanceOf(MiddlewareError);
    expect(rate.retryAfterMs).toBe(250);
    expect(rate.middlewareName).toBe("rate-limit");
    const cause = new Error("stop");
    expect(new MiddlewareAbortedError(cause).cause).toBe(cause);
  });

  it("transaction family shares TransactionError", () => {
    const err = new SavepointError("sp", new Error("x"));
    expect(err).toBeInstanceOf(TransactionError);
    expect(err.code).toBe(ErrorCode.OPERATION_FAILED);
  });

  it("HTTP pipeline errors keep the consumer's string codes", () => {
    const one = new HttpMiddlewareError("m", { middlewareId: "a" });
    expect(one.code).toBe("HTTP_MIDDLEWARE_ERROR");
    expect(new HttpMiddlewarePipelineError([one]).code).toBe(
      "MIDDLEWARE_PIPELINE_ERROR",
    );
    const guard = new HttpRequestGuardError({ statusCode: 413, errors: ["big"] });
    expect(guard).toBeInstanceOf(BaseError);
    expect(guard.statusCode).toBe(413);
    expect(guard.expose).toBe(false);
  });

  it("OAuthError is a BaseError with the OAuth string codes", () => {
    const err = new OAuthError("m", { code: ErrorCode.OAUTH_STATE_MISMATCH });
    expect(err).toBeInstanceOf(BaseError);
    expect(err.code).toBe("OAUTH_STATE_MISMATCH");
    expect(err.statusCode).toBe(400);
  });

  it("TraversalLimitError and ObservabilityError are BaseErrors", () => {
    const t = new TraversalLimitError("cycle", "$.a", 2);
    expect(t.toJSON()).toMatchObject({ halt: "cycle", path: "$.a", observed: 2 });
    expect(new ObservabilityError("m").statusCode).toBe(500);
  });
});

describe("tooling/CONV-01: CLI error classes", () => {
  it("are ApplicationErrors with the CLI's constructors", async () => {
    const mod = await import("../src/index.js");
    const cause = new Error("disk");
    const gen = new mod.CLIGenerationError("failed", cause);
    expect(gen).toBeInstanceOf(mod.ApplicationError);
    expect(gen.cause).toBe(cause);
    expect(gen.name).toBe("CLIGenerationError");
    expect(new mod.CLIValidationError("bad").isOperational).toBe(true);
    expect(new mod.CLINotInProjectError().message).toMatch(/inside a Zudojs project/);
    expect(new mod.CLITemplateError("t")).toBeInstanceOf(BaseError);
  });

  it("mapErrorType accepts constructors with required parameters", async () => {
    const mod = await import("../src/index.js");
    const rule = mod.mapErrorType("cli", mod.CLIGenerationError, () => new mod.ApplicationError("x"));
    expect(rule).toBeDefined();
  });
});

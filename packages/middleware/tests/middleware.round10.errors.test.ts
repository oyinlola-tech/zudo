import { describe, it, expect } from "vitest";

import * as shared from "@zudojs/errors";

import * as mw from "../src/index.js";

describe("XP-01 / CV-02: every middleware error is the @zudojs/errors class", () => {
  it("re-exports the shared classes", () => {
    expect(mw.MiddlewareError).toBe(shared.MiddlewareError);
    expect(mw.MiddlewareTimeoutError).toBe(shared.MiddlewareTimeoutError);
    expect(mw.MiddlewareNextCalledMultipleTimesError).toBe(
      shared.MiddlewareNextCalledMultipleTimesError,
    );
    expect(mw.MiddlewareLimitExceededError).toBe(shared.MiddlewareLimitExceededError);
    expect(mw.MiddlewareDepthExceededError).toBe(shared.MiddlewareDepthExceededError);
    expect(mw.MiddlewareRateLimitError).toBe(shared.MiddlewareRateLimitError);
    expect(mw.MiddlewareAbortedError).toBe(shared.MiddlewareAbortedError);
  });

  it("errors thrown by compose match the shared class", () => {
    expect(() => mw.compose([async (_c, n) => n(), async (_c, n) => n()], async () => 1, { maxDepth: 1 }))
      .toThrow(shared.MiddlewareDepthExceededError);
  });
});

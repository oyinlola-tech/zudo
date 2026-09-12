/**
 * @zudojs/middleware — Round 9 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  createPipeline,
  loggingMiddleware,
  sanitizeLogValue,
} from "../src/index.js";

/* ─── MIDDLEWARE-R9-01: Unicode line terminators bypassed log sanitising ── */

describe("MIDDLEWARE-R9-01", () => {
  const LINE_SEPARATOR = "\u2028";
  const PARAGRAPH_SEPARATOR = "\u2029";
  const NEXT_LINE = "\u0085";

  it("escapes U+2028, U+2029 and NEL as it does CR and LF", () => {
    expect(sanitizeLogValue(`a${LINE_SEPARATOR}b`)).toBe("a\\u2028b");
    expect(sanitizeLogValue(`a${PARAGRAPH_SEPARATOR}b`)).toBe("a\\u2029b");
    expect(sanitizeLogValue(`a${NEXT_LINE}b`)).toBe("a\\x85b");
    // C1 controls are escaped too; existing C0 behaviour is unchanged.
    expect(sanitizeLogValue("a\u009bb")).toBe("a\\x9bb");
    expect(sanitizeLogValue("a\nb\rc\td")).toBe("a\\nb\\rc\\td");
  });

  it("keeps a forged path on one line in the logging middleware", async () => {
    const lines: string[] = [];
    const pipeline = createPipeline<{ readonly path?: string }, void>(
      [loggingMiddleware((message) => lines.push(message))],
      async () => undefined,
    );

    await pipeline({
      path: `/users${LINE_SEPARATOR}[middleware] -> GET /forged`,
    });

    const lineTerminators = /\r\n|[\n\r\u2028\u2029\u0085]/;
    expect(lines[0]!.split(lineTerminators)).toHaveLength(1);
    expect(lines[0]).toContain("\\u2028[middleware]");
  });
});

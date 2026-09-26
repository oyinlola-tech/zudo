/**
 * Round 12 regressions for @zudojs/constants (academy findings #36, #37, #40).
 */

import { describe, expect, it } from "vitest";

import {
  InvalidConstantError,
  assertIdentifier,
  createCorrelationId,
  createEventId,
  createMessageCausationId,
  createMessageId,
  createRequestId,
  createSessionId,
  createTokenId,
  createUserId,
  formatDuration,
} from "../src/index.js";

const factories = [
  ["createUserId", createUserId],
  ["createEventId", createEventId],
  ["createRequestId", createRequestId],
  ["createCorrelationId", createCorrelationId],
  ["createSessionId", createSessionId],
  ["createMessageId", createMessageId],
  ["createMessageCausationId", createMessageCausationId],
  ["createTokenId", createTokenId],
] as const;

describe("#36/#40 identifier factories validate their input", () => {
  it.each(factories)("%s rejects an empty string", (_name, create) => {
    expect(() => create("")).toThrow(InvalidConstantError);
  });

  it.each(factories)("%s rejects a non-string", (_name, create) => {
    expect(() => create(123 as never)).toThrow(InvalidConstantError);
    expect(() => create(undefined as never)).toThrow(InvalidConstantError);
    expect(() => create(null as never)).toThrow(InvalidConstantError);
  });

  it.each(factories)("%s still accepts a real id", (_name, create) => {
    expect(create("usr_01HZX")).toBe("usr_01HZX");
    expect(create(" ")).toBe(" ");
  });

  it("never echoes the rejected value", () => {
    expect(() => createTokenId(4242 as never)).toThrow(/received number/);
    expect(() => createTokenId(4242 as never)).not.toThrow(/4242/);
  });

  it("assertIdentifier narrows to string", () => {
    const raw: unknown = "abc";
    assertIdentifier(raw, "Thing");
    expect(raw.length).toBe(3);
    expect(() => assertIdentifier(null, "Thing")).toThrow(/received null/);
  });
});

describe("#37 formatDuration", () => {
  it("formats negative durations with a sign instead of raw milliseconds", () => {
    expect(formatDuration(-5)).toBe("-5ms");
    expect(formatDuration(-90_000)).toBe("-1m 30s");
    expect(formatDuration(-3_600_000)).toBe("-1h");
  });

  it("keeps the documented two-unit truncation", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(90_500)).toBe("1m 30s");
    expect(formatDuration(3_599_999)).toBe("59m 59s");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });
});

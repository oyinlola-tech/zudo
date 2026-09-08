import { describe, it, expect } from "vitest";
import {
  createMessage,
  createMessageId,
  toMessageId,
  toCorrelationId,
  toCausationId,
  createDerivedMessage,
  isMessage,
  getMessageType,
  getMessagePayload,
  describeMessage,
} from "../src/message/index.js";

describe("message", () => {
  describe("createMessageId", () => {
    it("returns a string with msg: prefix", () => {
      const id = createMessageId();
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^msg:/);
    });

    it("generates unique IDs", () => {
      const id1 = createMessageId();
      const id2 = createMessageId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("createMessage", () => {
    it("creates a message with required fields", () => {
      const message = createMessage({
        type: "test.message",
        payload: { value: 42 },
      });

      expect(message.type).toBe("test.message");
      expect(message.payload).toEqual({ value: 42 });
      expect(typeof message.id).toBe("string");
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it("freezes the message", () => {
      const message = createMessage({
        type: "test.message",
        payload: {},
      });

      expect(Object.isFrozen(message)).toBe(true);
    });

    it("uses provided ID", () => {
      const message = createMessage({
        id: toMessageId("custom-id"),
        type: "test.message",
        payload: {},
      });

      expect(message.id).toBe("custom-id");
    });

    it("includes optional fields", () => {
      const message = createMessage({
        type: "test.message",
        payload: {},
        source: "test-service",
        correlationId: toCorrelationId("corr-123"),
        causationId: toCausationId("cause-456"),
        metadata: { key: "value" },
      });

      expect(message.source).toBe("test-service");
      expect(message.correlationId).toBe("corr-123");
      expect(message.causationId).toBe("cause-456");
      expect(message.metadata).toEqual({ key: "value" });
    });

    it("freezes metadata", () => {
      const metadata = { key: "value" };
      const message = createMessage({
        type: "test.message",
        payload: {},
        metadata,
      });

      expect(Object.isFrozen(message.metadata)).toBe(true);
    });

    it("throws on empty type", () => {
      expect(() => createMessage({ type: "", payload: {} })).toThrow(
        "Message type must be a non-empty string.",
      );
    });

    it("throws on whitespace-only type", () => {
      expect(() => createMessage({ type: "   ", payload: {} })).toThrow(
        "Message type must be a non-empty string.",
      );
    });
  });

  describe("createDerivedMessage", () => {
    it("preserves correlation from source", () => {
      const source = createMessage({
        type: "source.event",
        payload: {},
        correlationId: toCorrelationId("corr-123"),
      });

      const derived = createDerivedMessage(source, {
        type: "derived.event",
        payload: {},
      });

      expect(derived.correlationId).toBe("corr-123");
      expect(derived.causationId).toBe(source.id);
    });

    it("allows overriding correlation", () => {
      const source = createMessage({
        type: "source.event",
        payload: {},
        correlationId: toCorrelationId("corr-123"),
      });

      const derived = createDerivedMessage(source, {
        type: "derived.event",
        payload: {},
        correlationId: toCorrelationId("custom-corr"),
      });

      expect(derived.correlationId).toBe("custom-corr");
    });
  });

  describe("isMessage", () => {
    it("returns true for valid messages", () => {
      const message = createMessage({
        type: "test.message",
        payload: {},
      });

      expect(isMessage(message)).toBe(true);
    });

    it("returns false for non-objects", () => {
      expect(isMessage(null)).toBe(false);
      expect(isMessage(undefined)).toBe(false);
      expect(isMessage("string")).toBe(false);
      expect(isMessage(42)).toBe(false);
    });

    it("returns false for objects missing required fields", () => {
      expect(isMessage({})).toBe(false);
      expect(isMessage({ id: toMessageId("1"), type: "test" })).toBe(false);
      expect(
        isMessage({
          id: toMessageId("1"),
          type: "test",
          timestamp: new Date(),
        }),
      ).toBe(false);
    });
  });

  describe("getMessageType and getMessagePayload", () => {
    it("returns the message type", () => {
      const message = createMessage({
        type: "test.message",
        payload: { value: 42 },
      });

      expect(getMessageType(message)).toBe("test.message");
    });

    it("returns the message payload", () => {
      const message = createMessage({
        type: "test.message",
        payload: { value: 42 },
      });

      expect(getMessagePayload(message)).toEqual({ value: 42 });
    });
  });

  describe("describeMessage", () => {
    it("returns a human-readable description", () => {
      const message = createMessage({
        id: toMessageId("msg-123"),
        type: "test.message",
        payload: {},
      });

      expect(describeMessage(message)).toBe("test.message (msg-123)");
    });
  });
});

describe("identifier branding", () => {
  it("brands existing strings so deserialized ids keep their type", () => {
    const message = createMessage({
      id: toMessageId("msg:from-the-wire"),
      type: "test.message",
      payload: {},
      correlationId: toCorrelationId("corr-1"),
      causationId: toCausationId("cause-1"),
    });

    expect(message.id).toBe("msg:from-the-wire");
    expect(message.correlationId).toBe("corr-1");
    expect(message.causationId).toBe("cause-1");
  });

  it("rejects blank identifiers", () => {
    expect(() => toMessageId("")).toThrow(TypeError);
    expect(() => toCorrelationId("   ")).toThrow(TypeError);
    expect(() => toCausationId("")).toThrow(TypeError);
  });
});

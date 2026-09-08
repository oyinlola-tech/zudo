import { describe, expect, it } from "vitest";

import {
  createAPIContext,
  createContextKey,
  isValidRequestId,
  normalizeRequestId,
  RequestIdContextKey,
  TenantIdContextKey,
} from "../src/api/context/context.type.js";

import { MAX_REQUEST_ID_LENGTH } from "../src/api/constants.js";

describe("createAPIContext", () => {
  it("creates a context with the given requestId and state", () => {
    const context = createAPIContext("req-1", { userId: "user-1" });

    expect(context.requestId).toBe("req-1");
    expect(context.state).toEqual({ userId: "user-1" });
    expect(context.signal).toBeUndefined();
  });

  it("stores and retrieves typed values via typed keys", () => {
    const context = createAPIContext<{ tenantId: string }>("req-2", {
      tenantId: "tenant-1",
    });

    context.set(TenantIdContextKey, "tenant-2");

    expect(context.get(TenantIdContextKey)).toBe("tenant-2");
  });

  it("returns undefined for unset keys", () => {
    const context = createAPIContext("req-3", {});

    expect(context.get(TenantIdContextKey)).toBeUndefined();
  });

  it("freezes its own properties", () => {
    const context = createAPIContext("req-4", {});

    expect(() => {
      (context as unknown as Record<string, unknown>).requestId = "hacked";
    }).toThrow();
  });

  it("does not hand out a mutable view of its backing store", () => {
    const context = createAPIContext("req-5", {});
    context.set(TenantIdContextKey, "tenant-1");

    const escaped = context.metadata as Map<string, unknown>;

    // The metadata view has no mutating methods at all, so there is no
    // cast that recovers write access to the context.
    expect(() => escaped.set("injected", 1)).toThrow();
    expect(() => escaped.delete("tenantId")).toThrow();
    expect(() => escaped.clear()).toThrow();

    expect(context.get(createContextKey<number>("injected"))).toBeUndefined();
    expect(context.get(TenantIdContextKey)).toBe("tenant-1");
    expect(context.metadata.get("tenantId")).toBe("tenant-1");
  });

  it("exposes an up-to-date read-only metadata view", () => {
    const context = createAPIContext("req-6", {});

    expect(context.metadata.get("requestId")).toBe("req-6");
    expect(context.metadata.has("tenantId")).toBe(false);

    context.set(TenantIdContextKey, "tenant-9");

    expect(context.metadata.has("tenantId")).toBe(true);
    expect(context.metadata.size).toBe(2);
    expect([...context.metadata.keys()].sort()).toEqual([
      "requestId",
      "tenantId",
    ]);
    expect(Object.fromEntries(context.metadata)).toEqual({
      requestId: "req-6",
      tenantId: "tenant-9",
    });
  });

  it("rejects an attempt to reassign the requestId through its key", () => {
    const context = createAPIContext("req-7", {});

    expect(() => context.set(RequestIdContextKey, "other")).toThrow(TypeError);
    expect(context.get(RequestIdContextKey)).toBe("req-7");
    expect(context.requestId).toBe("req-7");
  });

  it("rejects an invalid requestId", () => {
    expect(() => createAPIContext("", {})).toThrow(TypeError);
    expect(() => createAPIContext("req 1\r\nX-Evil: 1", {})).toThrow(TypeError);
    expect(() =>
      createAPIContext("a".repeat(MAX_REQUEST_ID_LENGTH + 1), {}),
    ).toThrow(TypeError);
    expect(() =>
      createAPIContext(undefined as unknown as string, {}),
    ).toThrow(TypeError);
  });
});

describe("createContextKey", () => {
  it("supports custom keys end to end", () => {
    const FeatureFlagsKey = createContextKey<readonly string[]>("featureFlags");
    const context = createAPIContext("req-8", {});

    context.set(FeatureFlagsKey, ["beta"]);

    expect(context.get(FeatureFlagsKey)).toEqual(["beta"]);
  });

  it("gives keys identity, so same-named keys never collide", () => {
    const mine = createContextKey<Date>("startTime");
    const theirs = createContextKey<number>("startTime");
    const context = createAPIContext("req-9", {});

    context.set(theirs, 1234);

    expect(mine.id).not.toBe(theirs.id);
    expect(context.get(mine)).toBeUndefined();
    expect(context.get(theirs)).toBe(1234);
  });

  it("rejects an empty key name", () => {
    expect(() => createContextKey("")).toThrow(TypeError);
  });
});

describe("normalizeRequestId", () => {
  it("passes valid ids through", () => {
    expect(normalizeRequestId("req-1")).toBe("req-1");
    expect(isValidRequestId("req-1")).toBe(true);
  });

  it("replaces unsafe or missing ids with a generated one", () => {
    for (const bad of [
      undefined,
      "",
      "has space",
      "line\r\ninjection",
      "a".repeat(MAX_REQUEST_ID_LENGTH + 1),
      42,
    ]) {
      const normalized = normalizeRequestId(bad);
      expect(isValidRequestId(normalized)).toBe(true);
      expect(normalized).not.toBe(bad);
      // Usable as a context id without throwing.
      expect(createAPIContext(normalized, {}).requestId).toBe(normalized);
    }
  });
});

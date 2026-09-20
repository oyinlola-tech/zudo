/**
 * Round 11 regression tests for @zudojs/testing.
 */

import { describe, it, expect } from "vitest";

import { InMemoryTestStorage } from "../src/testStorage/testStorageMemory.core.js";
import { createStub } from "../src/mocking/stub.core.js";

describe("TOOL-07 — zero TTL is a real deadline, not 'no expiry'", () => {
  it("treats ttlMs 0 as already expired", () => {
    const storage = new InMemoryTestStorage();
    storage.set("k", "v", 0);

    expect(storage.has("k")).toBe(false);
    expect(storage.get("k")).toBeNull();
    expect(storage.keys()).toEqual([]);
    expect(storage.size).toBe(0);
  });

  it("still treats an omitted ttl as no expiry", () => {
    const storage = new InMemoryTestStorage();
    storage.set("k", "v");

    expect(storage.has("k")).toBe(true);
    expect(storage.get("k")).toBe("v");
  });

  it("still honours a positive ttl", () => {
    const storage = new InMemoryTestStorage();
    storage.set("k", "v", 60_000);

    expect(storage.get("k")).toBe("v");
  });
});

describe("TOOL-08 — createStub memoizes the no-op per property", () => {
  it("returns the identical function on repeated access", () => {
    const stub = createStub<{ handler(): void; other(): void }>();

    expect(stub.handler).toBe(stub.handler);
    expect(stub.handler).not.toBe(stub.other);
  });

  it("supports a register/unregister pair keyed on identity", () => {
    const stub = createStub<{ handler(event: string): void }>();
    const listeners = new Set<unknown>();

    listeners.add(stub.handler);
    listeners.delete(stub.handler);

    expect(listeners.size).toBe(0);
  });

  it("keeps overrides winning over the memoized no-op", () => {
    const impl = (): string => "real";
    const stub = createStub<{ find(): string; missing(): void }>({
      find: impl,
    });

    expect(stub.find).toBe(impl);
    expect(stub.find()).toBe("real");
    expect(stub.missing()).toBeUndefined();
  });
});

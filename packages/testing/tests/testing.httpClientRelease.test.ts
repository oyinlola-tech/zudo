/**
 * Regression tests for defects fixed alongside the HTTP test client.
 */

import { describe, expect, it } from "vitest";

import { createHTTPRequest } from "../src/httpTesting/index.js";
import { InMemoryTestStorage } from "../src/testStorage/index.js";

describe("InMemoryTestStorage TTL edge cases", () => {
  it("rejects a NaN TTL instead of storing an entry that never expires", () => {
    const storage = new InMemoryTestStorage();
    expect(() => storage.set("k", 1, Number.NaN)).toThrow(RangeError);
    expect(storage.has("k")).toBe(false);
  });

  it("treats Infinity as never expiring and -Infinity as already expired", () => {
    const storage = new InMemoryTestStorage();
    storage.set("forever", 1, Infinity);
    storage.set("gone", 1, -Infinity);
    expect(storage.get("forever")).toBe(1);
    expect(storage.has("gone")).toBe(false);
  });

  it("delete() reports false for an entry that has already expired", () => {
    const storage = new InMemoryTestStorage();
    storage.set("stale", 1, 0);
    expect(storage.has("stale")).toBe(false);
    expect(storage.delete("stale")).toBe(false);
    storage.set("fresh", 1);
    expect(storage.delete("fresh")).toBe(true);
  });
});

describe("createHTTPRequest", () => {
  it("copies query and params instead of aliasing the caller's objects", () => {
    const query: Record<string, string> = { page: "1" };
    const params: Record<string, string> = { id: "7" };
    const request = createHTTPRequest("GET", "/users/:id", { query, params });

    query.page = "2";
    params.id = "8";

    expect(request.query).toEqual({ page: "1" });
    expect(request.params).toEqual({ id: "7" });
  });
});

/**
 * @zudojs/cache — Round 10 phase 2 regressions (cross-package handoffs).
 */

import { describe, it, expect } from "vitest";
import { SCHEMA_FORBIDDEN_KEYS } from "@zudojs/constants";

import { JsonCacheSerializer } from "../src/index.js";

describe("SER-02 residual (shared SCHEMA_FORBIDDEN_KEYS)", () => {
  it("drops every shared forbidden key on the plain-JSON path", () => {
    const serializer = new JsonCacheSerializer({ preserveTypes: false });
    for (const key of SCHEMA_FORBIDDEN_KEYS) {
      const raw = `{"nested":{${JSON.stringify(key)}:{"isAdmin":true},"ok":1}}`;
      const value = serializer.deserialize(raw) as {
        nested: Record<string, unknown>;
      };
      expect(Object.hasOwn(value.nested, key)).toBe(false);
      expect(value.nested["ok"]).toBe(1);
      expect(Object.getPrototypeOf(value.nested)).toBe(Object.prototype);
    }
  });
});

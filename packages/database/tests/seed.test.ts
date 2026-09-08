import { describe, it, expect } from "vitest";
import {
  normalizeSeeds,
  validateSeed,
  DEFAULT_SEED_TABLE,
  DEFAULT_SEED_LOCK,
} from "../src/index.js";
import type { Seed } from "../src/index.js";

describe("Seed utilities", () => {
  describe("normalizeSeeds", () => {
    it("should normalize seeds sorted by order (undefined defaults to 0)", () => {
      const seeds: Seed[] = [
        { name: "roles", run: async () => {} },
        { name: "users", order: 10, run: async () => {} },
        { name: "admin", order: 1, run: async () => {} },
      ];

      const normalized = normalizeSeeds(seeds);
      expect(normalized[0]?.name).toBe("roles");
      expect(normalized[1]?.name).toBe("admin");
      expect(normalized[2]?.name).toBe("users");
    });

    it("should handle empty seeds", () => {
      const normalized = normalizeSeeds([]);
      expect(normalized).toHaveLength(0);
    });
  });

  describe("validateSeed", () => {
    it("should validate a correct seed", () => {
      const seed: Seed = {
        name: "create_admin",
        run: async () => {},
      };
      expect(() => validateSeed(seed)).not.toThrow();
    });

    it("should throw for seed without name", () => {
      const seed = { run: async () => {} } as unknown as Seed;
      expect(() => validateSeed(seed)).toThrow();
    });

    it("should throw for seed without run function", () => {
      const seed = { name: "test" } as unknown as Seed;
      expect(() => validateSeed(seed)).toThrow();
    });
  });

  describe("constants", () => {
    it("should have correct default seed table", () => {
      expect(DEFAULT_SEED_TABLE).toBe("_seeds");
    });

    it("should have correct default seed lock", () => {
      expect(DEFAULT_SEED_LOCK).toBe("database:seeds");
    });
  });
});

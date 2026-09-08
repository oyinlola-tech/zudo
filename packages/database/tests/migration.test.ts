import { describe, it, expect } from "vitest";
import {
  normalizeMigrations,
  validateMigration,
  getLatestVersion,
  getCurrentVersion,
  DEFAULT_MIGRATION_TABLE,
  DEFAULT_MIGRATION_LOCK,
} from "../src/index.js";
import type { Migration, MigrationRecord } from "../src/index.js";

describe("Migration utilities", () => {
  describe("normalizeMigrations", () => {
    it("should normalize migrations sorted by version", () => {
      const migrations: Migration[] = [
        { version: 2, name: "second", up: async () => {} },
        { version: 1, name: "first", up: async () => {} },
      ];

      const normalized = normalizeMigrations(migrations);
      expect(normalized[0]?.version).toBe(1);
      expect(normalized[1]?.version).toBe(2);
    });

    it("should handle empty migrations", () => {
      const normalized = normalizeMigrations([]);
      expect(normalized).toHaveLength(0);
    });
  });

  describe("validateMigration", () => {
    it("should validate a correct migration", () => {
      const migration: Migration = {
        version: 1,
        name: "create_users",
        up: async () => {},
      };
      expect(() => validateMigration(migration)).not.toThrow();
    });

    it("should throw for migration without name", () => {
      const migration = { version: 1, up: async () => {} } as unknown as Migration;
      expect(() => validateMigration(migration)).toThrow();
    });

    it("should throw for migration without version", () => {
      const migration = { name: "test", up: async () => {} } as unknown as Migration;
      expect(() => validateMigration(migration)).toThrow();
    });

    it("should throw for migration without up function", () => {
      const migration = { version: 1, name: "test" } as unknown as Migration;
      expect(() => validateMigration(migration)).toThrow();
    });

    it("accepts timestamp-style versions but rejects unsafe integers", () => {
      expect(() =>
        validateMigration({ version: 20260908120000, name: "ts", up: async () => {} }),
      ).not.toThrow();
      expect(() =>
        validateMigration({ version: 2 ** 53, name: "big", up: async () => {} }),
      ).toThrow(TypeError);
    });
  });

  describe("getLatestVersion", () => {
    it("should return the highest version regardless of order", () => {
      const migrations: Migration[] = [
        { version: 1, name: "first", up: async () => {} },
        { version: 3, name: "third", up: async () => {} },
        { version: 2, name: "second", up: async () => {} },
      ];

      expect(getLatestVersion(migrations)).toBe(3);
    });

    it("should return 0 for empty migrations", () => {
      expect(getLatestVersion([])).toBe(0);
    });
  });

  describe("getCurrentVersion", () => {
    it("should return the current version from records", () => {
      const records: MigrationRecord[] = [
        { version: 1, name: "first", appliedAt: new Date() },
        { version: 2, name: "second", appliedAt: new Date() },
      ];

      expect(getCurrentVersion(records)).toBe(2);
    });

    it("should return 0 for empty records", () => {
      expect(getCurrentVersion([])).toBe(0);
    });
  });

  describe("constants", () => {
    it("should have correct default migration table", () => {
      expect(DEFAULT_MIGRATION_TABLE).toBe("_migrations");
    });

    it("should have correct default migration lock", () => {
      expect(DEFAULT_MIGRATION_LOCK).toBe("database:migrations");
    });
  });
});

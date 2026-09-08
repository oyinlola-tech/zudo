import { describe, it, expect } from "vitest";
import {
  normalizePagination,
  normalizePage,
  normalizeLimit,
  calculateOffset,
  calculateTotalPages,
  createPaginationMeta,
  createPaginatedResult,
  getNextPage,
  getPreviousPage,
  isValidPage,
  getItemRange,
  validateCursorPayload,
  buildKeysetWhere,
  createKeysetPage,
  createKeysetCursor,
  decodeKeysetCursor,
  paginateCollection,
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "../src/index.js";

describe("Pagination", () => {
  describe("normalizePage", () => {
    it("should return DEFAULT_PAGE for undefined", () => {
      expect(normalizePage(undefined)).toBe(DEFAULT_PAGE);
    });

    it("should return DEFAULT_PAGE for zero", () => {
      expect(normalizePage(0)).toBe(DEFAULT_PAGE);
    });

    it("should return DEFAULT_PAGE for negative values", () => {
      expect(normalizePage(-1)).toBe(DEFAULT_PAGE);
    });

    it("should return the page for valid positive values", () => {
      expect(normalizePage(3)).toBe(3);
    });
  });

  describe("normalizeLimit", () => {
    it("should return DEFAULT_LIMIT for undefined", () => {
      expect(normalizeLimit(undefined)).toBe(DEFAULT_LIMIT);
    });

    it("should cap at MAX_LIMIT", () => {
      expect(normalizeLimit(200)).toBe(MAX_LIMIT);
    });

    it("should return 1 for zero", () => {
      expect(normalizeLimit(0)).toBe(1);
    });

    it("should return the limit for valid values", () => {
      expect(normalizeLimit(50)).toBe(50);
    });
  });

  describe("normalizePagination", () => {
    it("should return defaults for empty input", () => {
      const result = normalizePagination();
      expect(result.page).toBe(DEFAULT_PAGE);
      expect(result.limit).toBe(DEFAULT_LIMIT);
      expect(result.offset).toBe(0);
    });

    it("should calculate offset correctly", () => {
      const result = normalizePagination({ page: 3, limit: 10 });
      expect(result.offset).toBe(20);
    });
  });

  describe("calculateOffset", () => {
    it("should calculate offset correctly", () => {
      expect(calculateOffset(1, 10)).toBe(0);
      expect(calculateOffset(2, 10)).toBe(10);
      expect(calculateOffset(3, 20)).toBe(40);
    });
  });

  describe("calculateTotalPages", () => {
    it("should calculate total pages", () => {
      expect(calculateTotalPages(100, 10)).toBe(10);
      expect(calculateTotalPages(101, 10)).toBe(11);
      expect(calculateTotalPages(0, 10)).toBe(0);
    });
  });

  describe("createPaginationMeta", () => {
    it("should create pagination metadata", () => {
      const meta = createPaginationMeta(2, 10, 55);
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(10);
      expect(meta.total).toBe(55);
      expect(meta.totalPages).toBe(6);
      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPreviousPage).toBe(true);
    });

    it("should handle first page", () => {
      const meta = createPaginationMeta(1, 10, 55);
      expect(meta.hasPreviousPage).toBe(false);
      expect(meta.hasNextPage).toBe(true);
    });

    it("should handle last page", () => {
      const meta = createPaginationMeta(6, 10, 55);
      expect(meta.hasPreviousPage).toBe(true);
      expect(meta.hasNextPage).toBe(false);
    });
  });

  describe("createPaginatedResult", () => {
    it("should create paginated result", () => {
      const items = ["a", "b", "c"];
      const result = createPaginatedResult(items, 1, 10, 30);
      expect(result.data).toEqual(items);
      expect(result.meta.total).toBe(30);
    });
  });

  describe("getNextPage / getPreviousPage", () => {
    it("should return next page number", () => {
      const meta = createPaginationMeta(2, 10, 55);
      expect(getNextPage(meta)).toBe(3);
    });

    it("should return null when on last page", () => {
      const meta = createPaginationMeta(6, 10, 55);
      expect(getNextPage(meta)).toBeNull();
    });

    it("should return previous page number", () => {
      const meta = createPaginationMeta(3, 10, 55);
      expect(getPreviousPage(meta)).toBe(2);
    });

    it("should return null when on first page", () => {
      const meta = createPaginationMeta(1, 10, 55);
      expect(getPreviousPage(meta)).toBeNull();
    });
  });

  describe("isValidPage", () => {
    it("should validate page numbers", () => {
      expect(isValidPage(1, 10)).toBe(true);
      expect(isValidPage(10, 10)).toBe(true);
      expect(isValidPage(0, 10)).toBe(false);
      expect(isValidPage(11, 10)).toBe(false);
    });

    it("should handle zero total pages (page 1 is valid)", () => {
      expect(isValidPage(1, 0)).toBe(true);
      expect(isValidPage(2, 0)).toBe(false);
    });
  });

  describe("getItemRange", () => {
    it("should calculate item range", () => {
      const range = getItemRange(2, 10, 55);
      expect(range.start).toBe(11);
      expect(range.end).toBe(20);
    });

    it("should clamp end to total", () => {
      const range = getItemRange(6, 10, 55);
      expect(range.start).toBe(51);
      expect(range.end).toBe(55);
    });

    it("should return an empty range past the end", () => {
      expect(getItemRange(10, 10, 55)).toEqual({ start: 0, end: 0 });
    });
  });

  describe("paginateCollection", () => {
    it("should paginate an array", () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const result = paginateCollection(items, { page: 2, limit: 10 });
      expect(result.data).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
    });

    it("should handle empty array", () => {
      const result = paginateCollection([], { page: 1, limit: 10 });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe("cursor pagination", () => {
    it("should encode and decode cursors", () => {
      const cursor = encodeCursor({ id: "abc", timestamp: 123 });
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual({ id: "abc", timestamp: 123 });
    });

    it("should handle string cursors", () => {
      const cursor = encodeCursor("hello-world");
      const decoded = decodeCursor<string>(cursor);
      expect(decoded).toBe("hello-world");
    });

    it("rejects malformed cursors", () => {
      expect(() => decodeCursor("")).toThrow(TypeError);
      expect(() => decodeCursor("not-json!!")).toThrow(/Invalid pagination cursor/);
    });

    it("signs and verifies cursors with a secret", () => {
      const cursor = encodeCursor({ id: "x" }, { secret: "k" });

      expect(cursor).toContain(".");
      expect(decodeCursor(cursor, { secret: "k" })).toEqual({ id: "x" });
      expect(() => decodeCursor(cursor, { secret: "other" })).toThrow(
        /signature/,
      );
      expect(() => decodeCursor(encodeCursor({ id: "x" }), { secret: "k" })).toThrow(
        /signature/,
      );

      const [payload, signature] = cursor.split(".");
      const forged = `${Buffer.from(JSON.stringify({ id: "y" })).toString("base64url")}.${signature}`;
      expect(forged).not.toBe(cursor);
      expect(payload).toBeDefined();
      expect(() => decodeCursor(forged, { secret: "k" })).toThrow(/signature/);

      expect(() => encodeCursor({}, { secret: "" })).toThrow(TypeError);
    });

    it("validates payload shape against allowed fields", () => {
      const forged = encodeCursor({ id: "x", passwordHash: { not: null } });

      expect(() =>
        decodeCursor(forged, { allowedFields: ["id"] }),
      ).toThrow(/unexpected field "passwordHash"/);

      expect(() =>
        decodeCursor(encodeCursor(null), { allowedFields: ["id"] }),
      ).toThrow(/must be an object/);

      expect(() =>
        decodeCursor(encodeCursor({ id: { nested: 1 } }), {
          allowedFields: ["id"],
        }),
      ).toThrow(/primitive/);

      expect(() =>
        validateCursorPayload(JSON.parse('{"__proto__": 1}'), ["__proto__"]),
      ).toThrow(/unexpected field/);

      expect(decodeCursor(encodeCursor({ id: "x" }), { allowedFields: ["id"] })).toEqual({ id: "x" });
    });
  });

  describe("keyset helpers", () => {
    const sort = [
      { field: "createdAt", direction: "desc" as const },
      { field: "id", direction: "asc" as const },
    ];

    it("buildKeysetWhere produces a multi-column comparison", () => {
      expect(
        buildKeysetWhere({ createdAt: "2024-01-01T00:00:00.000Z", id: "b" }, sort),
      ).toEqual({
        OR: [
          { createdAt: { lt: "2024-01-01T00:00:00.000Z" } },
          {
            AND: [
              { createdAt: { equals: "2024-01-01T00:00:00.000Z" } },
              { id: { gt: "b" } },
            ],
          },
        ],
      });

      expect(buildKeysetWhere({ id: 1 }, [{ field: "id", direction: "asc" }])).toEqual({
        id: { gt: 1 },
      });

      expect(() => buildKeysetWhere({ id: 1 }, [])).toThrow(TypeError);
      expect(() =>
        buildKeysetWhere({ id: 1 }, [
          { field: "id", direction: "asc" },
          { field: "id", direction: "asc" },
        ]),
      ).toThrow(/duplicated/);
    });

    it("createKeysetPage drops the extra row and derives the cursor", () => {
      const rows = [
        { id: "a", createdAt: new Date("2024-01-03T00:00:00Z") },
        { id: "b", createdAt: new Date("2024-01-02T00:00:00Z") },
        { id: "c", createdAt: new Date("2024-01-01T00:00:00Z") },
      ];

      const page = createKeysetPage(rows, { sort, limit: 2, secret: "k" });

      expect(page.data.map((row) => row.id)).toEqual(["a", "b"]);
      expect(page.meta.hasNextPage).toBe(true);
      expect(page.meta.hasPreviousPage).toBe(false);
      expect(decodeKeysetCursor(page.meta.nextCursor!, sort, "k")).toEqual({
        createdAt: "2024-01-02T00:00:00.000Z",
        id: "b",
      });

      const last = createKeysetPage(rows.slice(2), {
        sort,
        limit: 2,
        cursor: page.meta.nextCursor,
      });
      expect(last.meta.hasNextPage).toBe(false);
      expect(last.meta.hasPreviousPage).toBe(true);
      expect(last.meta.nextCursor).toBeUndefined();

      expect(() =>
        createKeysetCursor({ id: { nested: true } }, [{ field: "id", direction: "asc" }]),
      ).toThrow(/unsupported value type/);
    });

    it("decodeKeysetCursor requires every sort field", () => {
      expect(() =>
        decodeKeysetCursor(encodeCursor({ id: "a" }), sort),
      ).toThrow(/missing sort field "createdAt"/);
    });
  });
});

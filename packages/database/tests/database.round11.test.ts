/**
 * @zudojs/database — Round 11 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect } from "vitest";

import {
  MemoryDatabaseCache,
  createRelationRegistry,
  getOrSet,
  oneToMany,
  toPrismaInclude,
} from "../src/index.js";
import type { RelationInclude } from "../src/index.js";

/* ─── DATA-02: the depth guard was bypassed by an unbounded pre-validation ─ */

describe("DATA-02", () => {
  /** Builds an `a -> a -> a …` include chain `levels` deep, iteratively. */
  function deepInclude(levels: number): RelationInclude {
    let node: RelationInclude = { relation: "a" };
    for (let i = 1; i < levels; i += 1) {
      node = { relation: "a", include: [node] };
    }
    return node;
  }

  it("refuses a very deep include with the documented RangeError", () => {
    expect(() => toPrismaInclude([deepInclude(20_000)], { depth: 2 })).toThrow(
      /Relation include depth exceeds the maximum of 2/,
    );
  });

  it("still reports the depth error for a shallow over-deep include", () => {
    expect(() => toPrismaInclude([deepInclude(4)], { depth: 2 })).toThrow(
      /Relation include depth exceeds the maximum of 2/,
    );
  });

  it("still rejects an invalid relation name nested within the allowed depth", () => {
    const include: RelationInclude = {
      relation: "a",
      include: [{ relation: "not a name" }],
    };
    expect(() => toPrismaInclude([include], { depth: 3 })).toThrow(
      /Invalid relation field name/,
    );
  });
});

/* ─── DATA-03: a synchronously throwing loader poisoned the key forever ─── */

describe("DATA-03", () => {
  it("retries after a loader that throws synchronously", async () => {
    const cache = new MemoryDatabaseCache<number>();
    let calls = 0;
    const failing = (): Promise<number> => {
      calls += 1;
      throw new Error("boom");
    };

    await expect(getOrSet(cache, "k", failing)).rejects.toThrow("boom");
    await expect(getOrSet(cache, "k", failing)).rejects.toThrow("boom");
    expect(calls).toBe(2);

    expect(await getOrSet(cache, "k", async () => 7)).toBe(7);
    expect(cache.get("k")).toBe(7);
  });

  it("still shares one loader call across concurrent misses", async () => {
    const cache = new MemoryDatabaseCache<number>();
    let loads = 0;
    const loader = async (): Promise<number> => {
      loads += 1;
      await Promise.resolve();
      return 7;
    };
    const results = await Promise.all([
      getOrSet(cache, "k", loader),
      getOrSet(cache, "k", loader),
      getOrSet(cache, "k", loader),
    ]);
    expect(results).toEqual([7, 7, 7]);
    expect(loads).toBe(1);
  });
});

/* ─── DATA-04: prototype members could never be included ────────────────── */

describe("DATA-04", () => {
  it("includes a relation whose name is an Object.prototype member", () => {
    const registry = createRelationRegistry();
    registry.register(
      oneToMany({
        name: "toString",
        parent: "A",
        child: "B",
        foreignKey: "aId",
        referencedKey: "id",
      }),
    );

    expect(toPrismaInclude([{ relation: "toString" }], { registry, parent: "A" })).toEqual({
      toString: true,
    });
  });

  it("still reports a genuine duplicate prototype-named relation", () => {
    expect(() =>
      toPrismaInclude([{ relation: "valueOf" }, { relation: "valueOf" }]),
    ).toThrow(/included more than once/);
  });

  it("keeps a select field named like a prototype member", () => {
    // Note: `{ __proto__: true }` as a literal would set the prototype, not a
    // key — so the assertion reads own properties directly.
    const result = toPrismaInclude([{ relation: "posts", select: ["__proto__", "id"] }]);
    const select = (result["posts"] as { readonly select: Record<string, boolean> })
      .select;
    expect(Object.keys(select).sort()).toEqual(["__proto__", "id"]);
    expect(Object.getOwnPropertyDescriptor(select, "__proto__")?.value).toBe(true);
  });

  it("includes a relation literally named __proto__", () => {
    const result = toPrismaInclude([{ relation: "__proto__" }]);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result["__proto__"]).toBe(true);
  });
});

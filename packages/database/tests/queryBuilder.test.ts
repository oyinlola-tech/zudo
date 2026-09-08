import { describe, it, expect } from "vitest";
import {
  createQueryBuilder,
  equals,
  notEquals,
  inList,
  notInList,
  lessThan,
  lessThanOrEqual,
  greaterThan,
  greaterThanOrEqual,
  contains,
  startsWith,
  endsWith,
  isNull,
  isNotNull,
  and,
  or,
  not,
  condition,
  allOf,
  anyOf,
  fromObject,
  hasConditions,
  flattenAnd,
  cloneFilter,
  between,
  matchesPattern,
  isEmpty,
  isNotEmpty,
  dateOnly,
  isBefore,
  isAfter,
  isBetween,
  notCondition,
  relational,
  dateRange,
  optionalEquals,
  toPrismaWhere,
  toPrismaArgs,
  includeRelation,
  type QueryFilter,
} from "../src/index.js";

type TestField = "name" | "age" | "email" | "status";

describe("QueryBuilder", () => {
  it("should create an empty query builder", () => {
    const builder = createQueryBuilder<TestField>();
    const state = builder.build();
    expect(state.filter).toBeUndefined();
    expect(state.pagination).toBeUndefined();
    expect(state.sort).toBeUndefined();
    expect(state.select).toBeUndefined();
  });

  it("should add where conditions", () => {
    const state = createQueryBuilder<TestField>()
      .where("name", "John")
      .where("age", 30)
      .build();

    expect(state.filter).toBeDefined();
    expect(state.filter?.conditions).toHaveLength(2);
  });

  it("should add whereOperator conditions", () => {
    const state = createQueryBuilder<TestField>()
      .whereOperator("age", "gte", 18)
      .build();

    expect(state.filter?.conditions).toHaveLength(1);
    expect(state.filter?.conditions?.[0]?.operator).toBe("gte");
  });

  it("should chain multiple conditions", () => {
    const state = createQueryBuilder<TestField>()
      .where("status", "active")
      .whereOperator("age", "gte", 18)
      .whereOperator("age", "lte", 65)
      .build();

    expect(state.filter?.conditions).toHaveLength(3);
  });

  it("should set pagination", () => {
    const state = createQueryBuilder<TestField>().page(2).limit(20).build();

    expect(state.pagination).toEqual({ page: 2, limit: 20 });
  });

  it("should set sort order", () => {
    const state = createQueryBuilder<TestField>().orderByAsc("name").build();

    expect(state.sort).toHaveLength(1);
    expect(state.sort?.[0]).toEqual({ field: "name", direction: "asc" });
  });

  it("should set descending sort", () => {
    const state = createQueryBuilder<TestField>().orderByDesc("age").build();

    expect(state.sort?.[0]?.direction).toBe("desc");
  });

  it("should select specific fields", () => {
    const state = createQueryBuilder<TestField>()
      .select("name", "email")
      .build();

    expect(state.select).toEqual(["name", "email"]);
  });

  it("should clone a builder", () => {
    const original = createQueryBuilder<TestField>()
      .where("name", "John")
      .page(1);

    const cloned = original.clone().where("age", 30);
    const originalState = original.build();
    const clonedState = cloned.build();

    expect(originalState.filter?.conditions).toHaveLength(1);
    expect(clonedState.filter?.conditions).toHaveLength(2);
  });

  it("should convert to QueryOptions", () => {
    const options = createQueryBuilder<TestField>()
      .where("status", "active")
      .page(1)
      .limit(10)
      .orderByAsc("name")
      .toQueryOptions();

    expect(options.pagination).toBeDefined();
    expect(options.sort).toBeDefined();
  });

  it("should clear filters", () => {
    const state = createQueryBuilder<TestField>()
      .where("name", "John")
      .clearFilters()
      .build();

    expect(state.filter).toBeUndefined();
  });

  it("should clear pagination", () => {
    const state = createQueryBuilder<TestField>()
      .page(2)
      .limit(10)
      .clearPagination()
      .build();

    expect(state.pagination).toBeUndefined();
  });

  it("should clear sort", () => {
    const state = createQueryBuilder<TestField>()
      .orderByAsc("name")
      .clearSort()
      .build();

    expect(state.sort).toBeUndefined();
  });

  it("should clear select", () => {
    const state = createQueryBuilder<TestField>()
      .select("name")
      .clearSelect()
      .build();

    expect(state.select).toBeUndefined();
  });
});

describe("Query filter helpers", () => {
  it("equals should create an equals condition", () => {
    const filter = equals("name", "John");
    expect(filter.conditions).toHaveLength(1);
    expect(filter.conditions?.[0]?.operator).toBe("equals");
  });

  it("notEquals should create a not condition", () => {
    const filter = notEquals("status", "deleted");
    expect(filter.conditions).toHaveLength(1);
    expect(filter.conditions?.[0]?.operator).toBe("not");
  });

  it("inList should create an in condition", () => {
    const filter = inList("status", ["active", "pending"]);
    expect(filter.conditions).toHaveLength(1);
    expect(filter.conditions?.[0]?.operator).toBe("in");
  });

  it("notInList should create a notIn condition", () => {
    const filter = notInList("status", ["deleted"]);
    expect(filter.conditions).toHaveLength(1);
    expect(filter.conditions?.[0]?.operator).toBe("notIn");
  });

  it("lessThan should create a lt condition", () => {
    const filter = lessThan("age", 18);
    expect(filter.conditions?.[0]?.operator).toBe("lt");
  });

  it("lessThanOrEqual should create a lte condition", () => {
    const filter = lessThanOrEqual("age", 18);
    expect(filter.conditions?.[0]?.operator).toBe("lte");
  });

  it("greaterThan should create a gt condition", () => {
    const filter = greaterThan("age", 65);
    expect(filter.conditions?.[0]?.operator).toBe("gt");
  });

  it("greaterThanOrEqual should create a gte condition", () => {
    const filter = greaterThanOrEqual("age", 65);
    expect(filter.conditions?.[0]?.operator).toBe("gte");
  });

  it("contains should create a contains condition", () => {
    const filter = contains("name", "oh");
    expect(filter.conditions?.[0]?.operator).toBe("contains");
  });

  it("startsWith should create a startsWith condition", () => {
    const filter = startsWith("name", "Jo");
    expect(filter.conditions?.[0]?.operator).toBe("startsWith");
  });

  it("endsWith should create an endsWith condition", () => {
    const filter = endsWith("name", "hn");
    expect(filter.conditions?.[0]?.operator).toBe("endsWith");
  });

  it("isNull should create an isNull condition", () => {
    const filter = isNull("email");
    expect(filter.conditions?.[0]?.operator).toBe("isNull");
  });

  it("isNotNull should create an isNotNull condition", () => {
    const filter = isNotNull("email");
    expect(filter.conditions?.[0]?.operator).toBe("isNotNull");
  });

  it("and should combine filters with AND", () => {
    const filter = and(equals("name", "John"), equals("age", 30));
    expect(filter.and).toHaveLength(2);
  });

  it("or should combine filters with OR", () => {
    const filter = or(equals("name", "John"), equals("name", "Jane"));
    expect(filter.or).toHaveLength(2);
  });

  it("not should negate a filter", () => {
    const filter = not(equals("status", "deleted"));
    expect(filter.not).toBeDefined();
  });

  it("condition should create a raw condition", () => {
    const filter = condition("name", "equals", "John");
    expect(filter.conditions).toHaveLength(1);
    expect(filter.conditions?.[0]?.field).toBe("name");
  });

  it("allOf should create an AND filter", () => {
    const filter = allOf([equals("a", 1), equals("b", 2)]);
    expect(filter.and).toHaveLength(2);
  });

  it("anyOf should create an OR filter", () => {
    const filter = anyOf([equals("a", 1), equals("b", 2)]);
    expect(filter.or).toHaveLength(2);
  });

  it("fromObject should create filter from key-value pairs", () => {
    const filter = fromObject({ name: "John", age: 30 });
    expect(filter.conditions).toHaveLength(2);
  });

  it("hasConditions should check if filter has conditions", () => {
    expect(hasConditions(equals("name", "John"))).toBe(true);
    expect(hasConditions({})).toBe(false);
  });

  it("flattenAnd should flatten nested AND filters into conditions", () => {
    const nested = and(and(equals("a", 1), equals("b", 2)), equals("c", 3));
    const flat = flattenAnd(nested);
    expect(Array.isArray(flat)).toBe(true);
    expect(flat).toHaveLength(3);
  });

  it("cloneFilter should deep clone a filter", () => {
    const original = equals("name", "John");
    const cloned = cloneFilter(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it("allOf/anyOf collapse empty filters", () => {
    expect(allOf([optionalEquals("a", undefined), equals("b", 1)])).toEqual(
      equals("b", 1),
    );
    expect(anyOf([optionalEquals("a", undefined)])).toEqual({
      conditions: [],
    });
  });

  it("fromObject validates keys and rejects prototype keys", () => {
    expect(() => fromObject({ "": 1 })).toThrow(TypeError);
    expect(() => fromObject({ "  ": 1 })).toThrow(TypeError);
    expect(() =>
      fromObject(JSON.parse('{"__proto__": {"polluted": true}}')),
    ).toThrow(/Invalid filter field/);
    expect(() => fromObject([] as unknown as Record<string, unknown>)).toThrow(
      TypeError,
    );
  });

  it("cloneValue skips __proto__ keys inside values", () => {
    const filter = fromObject(
      JSON.parse('{"meta":{"__proto__":{"polluted":true},"x":1}}'),
    );

    const value = filter.conditions?.[0]?.value as Record<string, unknown>;

    expect(Object.keys(value)).toEqual(["x"]);
    expect((value as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("dateRange validates ordering and returns a flat conditions filter", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2024-02-01T00:00:00Z");

    expect(dateRange("createdAt", { from, to })).toEqual({
      conditions: [
        { field: "createdAt", operator: "gte", value: from },
        { field: "createdAt", operator: "lte", value: to },
      ],
    });

    expect(() => dateRange("createdAt", { from: to, to: from })).toThrow(
      RangeError,
    );
  });

  it("new filter helpers build the documented conditions", () => {
    expect(between("age", 18, 65).conditions?.map((c) => c.operator)).toEqual([
      "gte",
      "lte",
    ]);
    expect(() => between("age", 65, 18)).toThrow(RangeError);

    expect(matchesPattern("name", "%jo%").conditions?.[0]).toEqual({
      field: "name",
      operator: "like",
      value: "%jo%",
    });
    expect(() => matchesPattern("name", "a%b")).toThrow(TypeError);

    expect(isEmpty("name").or).toHaveLength(2);
    expect(isNotEmpty("name").and).toHaveLength(2);

    const day = dateOnly("createdAt", new Date("2024-03-05T13:45:00Z"));
    expect(day.conditions?.[0]?.value).toEqual(new Date("2024-03-05T00:00:00Z"));
    expect(day.conditions?.[1]).toMatchObject({
      operator: "lt",
      value: new Date("2024-03-06T00:00:00Z"),
    });

    const d = new Date("2024-01-01T00:00:00Z");
    expect(isBefore("createdAt", d).conditions?.[0]?.operator).toBe("lt");
    expect(isAfter("createdAt", d).conditions?.[0]?.operator).toBe("gt");
    expect(isBetween("createdAt", d, new Date("2024-01-02T00:00:00Z")).conditions).toHaveLength(2);
    expect(() => isBetween("createdAt", d, new Date("invalid"))).toThrow(
      TypeError,
    );

    expect(notCondition("status", "equals", "x")).toEqual({
      not: equals("status", "x"),
    });

    const rel = relational("posts", equals("published", true), "every");
    expect(rel.conditions?.[0]).toMatchObject({
      field: "posts",
      operator: "every",
    });
    expect(() =>
      relational("posts", equals("a", 1), "bogus" as "some"),
    ).toThrow(TypeError);
  });

  it("flattenAnd rejects OR and NOT branches instead of dropping them", () => {
    const widened = and(
      equals("tenantId", "t1"),
      or(equals("role", "admin"), equals("role", "owner")),
    );

    expect(() => flattenAnd(widened)).toThrow(/OR\/NOT/);
    expect(() => flattenAnd(and(equals("a", 1), not(equals("b", 2))))).toThrow(
      TypeError,
    );
  });

  it("cloneFilter deep clones Date and object values", () => {
    const date = new Date("2024-01-01T00:00:00Z");
    const original = and(equals("d", date), equals("o", { nested: [1] }));
    const cloned = cloneFilter(original);

    const clonedDate = cloned.and?.[0]?.conditions?.[0]?.value as Date;
    expect(clonedDate).toEqual(date);
    expect(clonedDate).not.toBe(date);

    const clonedObject = cloned.and?.[1]?.conditions?.[0]?.value as {
      nested: number[];
    };
    clonedObject.nested.push(2);
    expect(
      (original.and?.[1]?.conditions?.[0]?.value as { nested: number[] })
        .nested,
    ).toEqual([1]);

    expect(cloneFilter(undefined)).toBeUndefined();
  });
});

describe("QueryBuilder groups, include, offset and immutability", () => {
  it("supports and/or/not groups on the builder", () => {
    const state = createQueryBuilder<TestField>()
      .where("status", "active")
      .or(equals("age", 1), equals("age", 2))
      .not(equals("email", ""))
      .and(equals("name", "x"))
      .build();

    expect(state.filter?.and).toHaveLength(2);
    expect(toPrismaWhere(state.filter)).toEqual({
      AND: [
        {
          AND: [
            {
              AND: [
                { status: { equals: "active" } },
                { OR: [{ age: { equals: 1 } }, { age: { equals: 2 } }] },
              ],
            },
            { NOT: { email: { equals: "" } } },
          ],
        },
        { AND: [{ name: { equals: "x" } }] },
      ],
    });
  });

  it("whereIn copies values and paginate/sort replace state", () => {
    const values = [1, 2];
    const builder = createQueryBuilder<TestField>()
      .whereIn("age", values)
      .paginate({ page: 3, limit: 5 })
      .sort([{ field: "age", direction: "desc" }]);

    values.push(3);

    const state = builder.build();

    expect(state.filter?.conditions?.[0]?.value).toEqual([1, 2]);
    expect(state.pagination).toEqual({ page: 3, limit: 5 });
    expect(state.sort).toEqual([{ field: "age", direction: "desc" }]);
  });

  it("offset, include and reset", () => {
    const builder = createQueryBuilder<TestField>()
      .where("name", "x")
      .offset(7)
      .limit(3)
      .include("posts", includeRelation("profile", { select: ["bio"] }));

    const state = builder.build();

    expect(state.offset).toBe(7);
    expect(state.include?.map((i) => i.relation)).toEqual([
      "posts",
      "profile",
    ]);
    expect(toPrismaArgs(state)).toEqual({
      where: { name: { equals: "x" } },
      skip: 7,
      take: 3,
      include: { posts: true, profile: { select: { bio: true } } },
    });

    expect(() => builder.offset(-1)).toThrow(TypeError);

    expect(builder.reset().build()).toEqual({
      filter: undefined,
      pagination: undefined,
      offset: undefined,
      sort: undefined,
      select: undefined,
      include: undefined,
    });
  });

  it("build() returns a deeply frozen state that later builds do not share", () => {
    const builder = createQueryBuilder<TestField>().where("name", "x");

    const first = builder.build();

    expect(Object.isFrozen(first.filter)).toBe(true);
    expect(Object.isFrozen(first.filter?.conditions)).toBe(true);
    expect(Object.isFrozen(first.filter?.conditions?.[0])).toBe(true);

    expect(() =>
      (first.filter!.conditions as unknown[]).push({ field: "age" }),
    ).toThrow(TypeError);

    expect(builder.build().filter?.conditions).toHaveLength(1);

    expect(first).toBe(builder.build());
  });

  it("toQueryOptions carries the filter", () => {
    const options = createQueryBuilder<TestField>()
      .where("status", "active")
      .toQueryOptions();

    expect(options.filter?.conditions).toHaveLength(1);
  });
});

describe("toPrismaWhere", () => {
  it("translates every operator", () => {
    const filter: QueryFilter = {
      conditions: [
        { field: "a", operator: "equals", value: 1 },
        { field: "b", operator: "not", value: 1 },
        { field: "c", operator: "in", value: [1] },
        { field: "d", operator: "notIn", value: [1] },
        { field: "e", operator: "lt", value: 1 },
        { field: "e", operator: "gt", value: 0 },
        { field: "f", operator: "contains", value: "x" },
        { field: "g", operator: "startsWith", value: "x" },
        { field: "h", operator: "endsWith", value: "x" },
        { field: "i", operator: "isNull" },
        { field: "j", operator: "isNotNull" },
        { field: "k", operator: "like", value: "%x" },
        { field: "l", operator: "like", value: "x%" },
        { field: "m", operator: "like", value: "%x%" },
        { field: "n", operator: "like", value: "x" },
        { field: "posts", operator: "some", value: equals("published", true) },
      ],
    };

    expect(toPrismaWhere(filter)).toEqual({
      a: { equals: 1 },
      b: { not: 1 },
      c: { in: [1] },
      d: { notIn: [1] },
      e: { lt: 1, gt: 0 },
      f: { contains: "x" },
      g: { startsWith: "x" },
      h: { endsWith: "x" },
      i: { equals: null },
      j: { not: null },
      k: { endsWith: "x" },
      l: { startsWith: "x" },
      m: { contains: "x" },
      n: { equals: "x" },
      posts: { some: { published: { equals: true } } },
    });
  });

  it("moves repeated operators on one field into AND", () => {
    expect(
      toPrismaWhere({
        conditions: [
          { field: "a", operator: "equals", value: 1 },
          { field: "a", operator: "equals", value: 2 },
        ],
      }),
    ).toEqual({ a: { equals: 1 }, AND: [{ a: { equals: 2 } }] });
  });

  it("returns undefined for empty filters and rejects bad input", () => {
    expect(toPrismaWhere(undefined)).toBeUndefined();
    expect(toPrismaWhere({ conditions: [] })).toBeUndefined();
    expect(toPrismaWhere(and(optionalEquals("a", undefined)))).toBeUndefined();

    expect(() =>
      toPrismaWhere({
        conditions: [{ field: "a", operator: "bogus" as "equals", value: 1 }],
      }),
    ).toThrow(/Unsupported query operator/);

    expect(() =>
      toPrismaWhere({
        conditions: [{ field: "__proto__", operator: "equals", value: 1 }],
      }),
    ).toThrow(/Invalid query field name/);

    expect(() =>
      toPrismaWhere({ conditions: [{ field: "a", operator: "in", value: 1 }] }),
    ).toThrow(/requires an array/);

    expect(() =>
      toPrismaWhere({
        conditions: [{ field: "a", operator: "like", value: "a_b" }],
      }),
    ).toThrow(/not supported/);
  });
});

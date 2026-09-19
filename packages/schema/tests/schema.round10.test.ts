import { describe, expect, it } from "vitest";
import { schema, TransformSchema } from "../src/index.js";

const User = schema.object({
  id: schema.number().int(),
  name: schema.string(),
});

describe("SCHEMA-01", () => {
  it("maxIssues: 0 still reports failure and keeps the first issue", () => {
    const result = User.safeParse({ id: "x", name: 5 }, { maxIssues: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues).toHaveLength(1);
    expect(() => User.parse({ id: "x" }, { maxIssues: 0 })).toThrow();
  });

  it("a union under maxIssues: 0 does not accept a failing branch", () => {
    const union = schema.union([User, schema.string()]);
    expect(union.safeParse({ id: "evil" }, { maxIssues: 0 }).success).toBe(
      false,
    );
  });
});

describe("SCHEMA-02", () => {
  it("transform and refine never see a partially valid object", () => {
    const seen: unknown[] = [];
    const transformed = schema.transform(User, (u) => {
      seen.push(u);
      return u;
    });
    const refined = schema.refine(
      User,
      (u) => {
        seen.push(u);
        return true;
      },
      "x",
    );
    expect(transformed.safeParse({ id: "nope" }).success).toBe(false);
    expect(refined.safeParse({ id: "nope" }).success).toBe(false);
    const direct = new TransformSchema(User, (u) => seen.push(u));
    expect(direct.safeParse({}).success).toBe(false);
    expect(seen).toEqual([]);
  });

  it("still runs callbacks on valid data", () => {
    const refined = schema.refine(User, (u) => u.id > 0, "positive");
    expect(refined.safeParse({ id: 1, name: "a" }).success).toBe(true);
  });
});

describe("SCHEMA-03", () => {
  const big: Record<string, number> = {};
  for (let i = 0; i < 101; i++) big[`k${i}`] = i;

  it("record enforces SCHEMA_DEFAULT_MAX_OBJECT_KEYS and .maxKeys() raises it", () => {
    const rec = schema.record(schema.number());
    expect(rec.safeParse(big).success).toBe(false);
    expect(rec.maxKeys(200).safeParse(big).success).toBe(true);
  });

  it("passthrough and strict objects are bounded; strip is not", () => {
    const input = { id: 1, name: "a", ...big };
    expect(User.passthrough().safeParse(input).success).toBe(false);
    expect(User.passthrough().maxKeys(500).safeParse(input).success).toBe(true);
    expect(User.safeParse(input).success).toBe(true);
  });
});

describe("SCHEMA-04", () => {
  it("intersection deep-merges nested object results", () => {
    const left = schema.object({ db: schema.object({ host: schema.string() }) });
    const right = schema.object({ db: schema.object({ port: schema.number() }) });
    const result = schema
      .intersection(left, right)
      .safeParse({ db: { host: "h", port: 5432 } });
    expect(result).toEqual({
      success: true,
      data: { db: { host: "h", port: 5432 } },
    });
  });
});

describe("SCHEMA-05", () => {
  it("array().max(n) reports TOO_LARGE once", () => {
    const result = schema.array(schema.number()).max(2).safeParse([1, 2, 3]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues).toHaveLength(1);
  });
});

/**
 * @zudojs/schema tests
 *
 * Comprehensive tests for the schema definition and parsing engine.
 */

import { describe, it, expect } from "vitest";
import {
  schema,
  stringSchema,
  numberSchema,
  booleanSchema,
  literalSchema,
  nullSchema,
  undefinedSchema,
  anySchema,
  unknownSchema,
  neverSchema,
  objectSchema,
  arraySchema,
  tupleSchema,
  recordSchema,
  mapSchema,
  setSchema,
  unionSchema,
  intersectionSchema,
  lazySchema,
  enumSchema,
  optionalSchema,
  nullableSchema,
  defaultSchema,
  refineSchema,
  transformSchema,
  coerceNumberSchema,
  coerceBooleanSchema,
  coerceStringSchema,
  coerceBigIntSchema,
} from "../src/index.js";
import type { Infer, SchemaInput } from "../src/index.js";

describe("StringSchema", () => {
  it("accepts valid strings", () => {
    const s = stringSchema();
    expect(s.parse("hello")).toBe("hello");
  });

  it("rejects non-strings", () => {
    const s = stringSchema();
    expect(() => s.parse(123)).toThrow();
  });

  it("validates min length", () => {
    const s = stringSchema().min(3);
    expect(() => s.parse("ab")).toThrow();
    expect(s.parse("abc")).toBe("abc");
  });

  it("validates max length", () => {
    const s = stringSchema().max(5);
    expect(s.parse("hello")).toBe("hello");
    expect(() => s.parse("toolong")).toThrow();
  });

  it("validates exact length", () => {
    const s = stringSchema().length(3);
    expect(s.parse("abc")).toBe("abc");
    expect(() => s.parse("ab")).toThrow();
  });

  it("validates email format", () => {
    const s = stringSchema().email();
    expect(s.parse("user@example.com")).toBe("user@example.com");
    expect(() => s.parse("not-an-email")).toThrow();
  });

  it("validates uuid format", () => {
    const s = stringSchema().uuid();
    expect(s.parse("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(() => s.parse("not-a-uuid")).toThrow();
  });

  it("validates url format", () => {
    const s = stringSchema().url();
    expect(s.parse("https://example.com")).toBe("https://example.com");
    expect(() => s.parse("not-a-url")).toThrow();
  });

  it("validates regex pattern", () => {
    const s = stringSchema().regex(/^[A-Z]+$/);
    expect(s.parse("ABC")).toBe("ABC");
    expect(() => s.parse("abc")).toThrow();
  });

  it("trims whitespace", () => {
    const s = stringSchema().trim();
    expect(s.parse("  hello  ")).toBe("hello");
  });

  it("converts to lowercase", () => {
    const s = stringSchema().toLowerCase();
    expect(s.parse("HELLO")).toBe("hello");
  });

  it("converts to uppercase", () => {
    const s = stringSchema().toUpperCase();
    expect(s.parse("hello")).toBe("HELLO");
  });

  it("transforms value", () => {
    const s = stringSchema().transform((v) => v.length);
    expect(s.parse("hello")).toBe(5);
  });

  it("safeParse returns success result", () => {
    const s = stringSchema();
    const result = s.safeParse("hello");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("safeParse returns failure result", () => {
    const s = stringSchema();
    const result = s.safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("NumberSchema", () => {
  it("accepts valid numbers", () => {
    const s = numberSchema();
    expect(s.parse(42)).toBe(42);
  });

  it("rejects non-numbers", () => {
    const s = numberSchema();
    expect(() => s.parse("42")).toThrow();
  });

  it("rejects NaN", () => {
    const s = numberSchema();
    expect(() => s.parse(NaN)).toThrow();
  });

  it("validates min", () => {
    const s = numberSchema().min(0);
    expect(s.parse(0)).toBe(0);
    expect(() => s.parse(-1)).toThrow();
  });

  it("validates max", () => {
    const s = numberSchema().max(100);
    expect(s.parse(100)).toBe(100);
    expect(() => s.parse(101)).toThrow();
  });

  it("validates int", () => {
    const s = numberSchema().int();
    expect(s.parse(42)).toBe(42);
    expect(() => s.parse(4.5)).toThrow();
  });

  it("validates positive", () => {
    const s = numberSchema().positive();
    expect(s.parse(1)).toBe(1);
    expect(() => s.parse(0)).toThrow();
  });

  it("validates negative", () => {
    const s = numberSchema().negative();
    expect(s.parse(-1)).toBe(-1);
    expect(() => s.parse(0)).toThrow();
  });

  it("validates finite", () => {
    const s = numberSchema().finite();
    expect(s.parse(42)).toBe(42);
    expect(() => s.parse(Infinity)).toThrow();
  });

  it("validates multipleOf", () => {
    const s = numberSchema().multipleOf(5);
    expect(s.parse(10)).toBe(10);
    expect(() => s.parse(7)).toThrow();
  });
});

describe("BooleanSchema", () => {
  it("accepts booleans", () => {
    const s = booleanSchema();
    expect(s.parse(true)).toBe(true);
    expect(s.parse(false)).toBe(false);
  });

  it("rejects non-booleans", () => {
    const s = booleanSchema();
    expect(() => s.parse(1)).toThrow();
  });

  it("coerces strings when enabled", () => {
    const s = booleanSchema().coerce();
    expect(s.parse("true")).toBe(true);
    expect(s.parse("false")).toBe(false);
    expect(s.parse(1)).toBe(true);
    expect(s.parse(0)).toBe(false);
  });
});

describe("LiteralSchema", () => {
  it("accepts matching literal", () => {
    const s = literalSchema("hello");
    expect(s.parse("hello")).toBe("hello");
  });

  it("rejects non-matching literal", () => {
    const s = literalSchema("hello");
    expect(() => s.parse("world")).toThrow();
  });

  it("works with numbers", () => {
    const s = literalSchema(42);
    expect(s.parse(42)).toBe(42);
    expect(() => s.parse(43)).toThrow();
  });
});

describe("SentinelSchemas", () => {
  it("null schema accepts null", () => {
    const s = nullSchema();
    expect(s.parse(null)).toBe(null);
    expect(() => s.parse(undefined)).toThrow();
  });

  it("undefined schema accepts undefined", () => {
    const s = undefinedSchema();
    expect(s.parse(undefined)).toBe(undefined);
    expect(() => s.parse(null)).toThrow();
  });

  it("any schema accepts anything", () => {
    const s = anySchema();
    expect(s.parse("hello")).toBe("hello");
    expect(s.parse(42)).toBe(42);
    expect(s.parse(null)).toBe(null);
  });

  it("unknown schema accepts anything", () => {
    const s = unknownSchema();
    expect(s.parse("hello")).toBe("hello");
  });

  it("never schema rejects everything", () => {
    const s = neverSchema();
    expect(() => s.parse("hello")).toThrow();
    expect(() => s.parse(42)).toThrow();
  });
});

describe("ObjectSchema", () => {
  it("accepts valid objects", () => {
    const s = objectSchema({
      name: stringSchema(),
      age: numberSchema(),
    });
    expect(s.parse({ name: "John", age: 30 })).toEqual({
      name: "John",
      age: 30,
    });
  });

  it("rejects non-objects", () => {
    const s = objectSchema({ name: stringSchema() });
    expect(() => s.parse("not an object")).toThrow();
  });

  it("rejects arrays", () => {
    const s = objectSchema({ name: stringSchema() });
    expect(() => s.parse([1, 2, 3])).toThrow();
  });

  it("validates nested objects", () => {
    const s = objectSchema({
      user: objectSchema({
        name: stringSchema(),
      }),
    });
    expect(s.parse({ user: { name: "John" } })).toEqual({
      user: { name: "John" },
    });
  });

  it("strips unknown keys by default", () => {
    const s = objectSchema({ name: stringSchema() });
    expect(s.parse({ name: "John", extra: true })).toEqual({ name: "John" });
  });

  it("rejects unknown keys in strict mode", () => {
    const s = objectSchema({ name: stringSchema() }).strict();
    expect(() => s.parse({ name: "John", extra: true })).toThrow();
  });

  it("supports pick", () => {
    const s = objectSchema({
      name: stringSchema(),
      age: numberSchema(),
      email: stringSchema(),
    });
    const picked = s.pick(["name", "email"]);
    expect(picked.parse({ name: "John", age: 30, email: "a@b.com" })).toEqual({
      name: "John",
      email: "a@b.com",
    });
  });

  it("supports omit", () => {
    const s = objectSchema({
      name: stringSchema(),
      password: stringSchema(),
    });
    const omitted = s.omit(["password"]);
    expect(omitted.parse({ name: "John", password: "secret" })).toEqual({
      name: "John",
    });
  });

  it("supports partial", () => {
    const s = objectSchema({
      name: stringSchema(),
      age: numberSchema(),
    });
    const partial = s.partial();
    expect(partial.parse({})).toEqual({});
    expect(partial.parse({ name: "John" })).toEqual({ name: "John" });
  });

  it("supports extend", () => {
    const base = objectSchema({ name: stringSchema() });
    const extended = base.extend(objectSchema({ age: numberSchema() }));
    expect(extended.parse({ name: "John", age: 30 })).toEqual({
      name: "John",
      age: 30,
    });
  });

  it("rejects prototype pollution keys", () => {
    const s = objectSchema({ name: stringSchema() });
    expect(() =>
      s.parse({ constructor: { prototype: { admin: true } } }),
    ).toThrow();
  });
});

describe("ArraySchema", () => {
  it("accepts valid arrays", () => {
    const s = arraySchema(stringSchema());
    expect(s.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("rejects non-arrays", () => {
    const s = arraySchema(stringSchema());
    expect(() => s.parse("not an array")).toThrow();
  });

  it("validates items", () => {
    const s = arraySchema(numberSchema());
    expect(() => s.parse([1, "not a number"])).toThrow();
  });

  it("validates min length", () => {
    const s = arraySchema(stringSchema()).min(2);
    expect(() => s.parse(["a"])).toThrow();
    expect(s.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("validates max length", () => {
    const s = arraySchema(stringSchema()).max(2);
    expect(s.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => s.parse(["a", "b", "c"])).toThrow();
  });

  it("validates nonempty", () => {
    const s = arraySchema(stringSchema()).nonempty();
    expect(() => s.parse([])).toThrow();
  });

  it("validates exact length", () => {
    const s = arraySchema(stringSchema()).length(3);
    expect(s.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(() => s.parse(["a", "b"])).toThrow();
  });
});

describe("TupleSchema", () => {
  it("accepts valid tuples", () => {
    const s = tupleSchema([stringSchema(), numberSchema(), booleanSchema()]);
    expect(s.parse(["hello", 42, true])).toEqual(["hello", 42, true]);
  });

  it("rejects wrong length", () => {
    const s = tupleSchema([stringSchema(), numberSchema()]);
    expect(() => s.parse(["hello"])).toThrow();
    expect(() => s.parse(["hello", 42, true])).toThrow();
  });

  it("rejects non-arrays", () => {
    const s = tupleSchema([stringSchema()]);
    expect(() => s.parse("not an array")).toThrow();
  });
});

describe("RecordSchema", () => {
  it("accepts valid records", () => {
    const s = recordSchema(numberSchema());
    expect(s.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("validates values", () => {
    const s = recordSchema(numberSchema());
    expect(() => s.parse({ a: 1, b: "not a number" })).toThrow();
  });

  it("rejects non-objects", () => {
    const s = recordSchema(numberSchema());
    expect(() => s.parse("not an object")).toThrow();
  });

  it("rejects prototype pollution keys", () => {
    const s = recordSchema(numberSchema());
    expect(() =>
      s.parse({ constructor: { prototype: { admin: true } } }),
    ).toThrow();
  });
});

describe("MapSchema", () => {
  it("accepts valid Maps", () => {
    const s = mapSchema(stringSchema(), numberSchema());
    const map = new Map([["a", 1]]);
    expect(s.parse(map)).toEqual(map);
  });

  it("rejects non-Maps", () => {
    const s = mapSchema(stringSchema(), numberSchema());
    expect(() => s.parse({ a: 1 })).toThrow();
  });
});

describe("SetSchema", () => {
  it("accepts valid Sets", () => {
    const s = setSchema(stringSchema());
    const set = new Set(["a", "b"]);
    expect(s.parse(set)).toEqual(set);
  });

  it("rejects non-Sets", () => {
    const s = setSchema(stringSchema());
    expect(() => s.parse(["a", "b"])).toThrow();
  });
});

describe("EnumSchema", () => {
  it("accepts valid enum values", () => {
    const s = enumSchema(["admin", "user", "moderator"] as const);
    expect(s.parse("admin")).toBe("admin");
    expect(s.parse("user")).toBe("user");
  });

  it("rejects invalid enum values", () => {
    const s = enumSchema(["admin", "user"] as const);
    expect(() => s.parse("unknown")).toThrow();
  });
});

describe("UnionSchema", () => {
  it("accepts values matching any schema", () => {
    const s = unionSchema([stringSchema(), numberSchema()]);
    expect(s.parse("hello")).toBe("hello");
    expect(s.parse(42)).toBe(42);
  });

  it("rejects values not matching any schema", () => {
    const s = unionSchema([stringSchema(), numberSchema()]);
    expect(() => s.parse(true)).toThrow();
  });
});

describe("IntersectionSchema", () => {
  it("merges two object schemas", () => {
    const a = objectSchema({ name: stringSchema() });
    const b = objectSchema({ age: numberSchema() });
    const s = intersectionSchema(a, b);
    expect(s.parse({ name: "John", age: 30 })).toEqual({
      name: "John",
      age: 30,
    });
  });
});

describe("LazySchema", () => {
  it("supports recursive structures", () => {
    type TreeNode = { name: string; children: TreeNode[] };

    const TreeSchema: ReturnType<typeof lazySchema<TreeNode>> = lazySchema(() =>
      objectSchema({
        name: stringSchema(),
        children: arraySchema(TreeSchema),
      }),
    );

    const input: TreeNode = {
      name: "root",
      children: [
        { name: "child1", children: [] },
        {
          name: "child2",
          children: [{ name: "grandchild", children: [] }],
        },
      ],
    };

    expect(TreeSchema.parse(input)).toEqual(input);
  });
});

describe("OptionalModifierSchema", () => {
  it("accepts undefined", () => {
    const s = optionalSchema(stringSchema());
    expect(s.parse(undefined)).toBeUndefined();
  });

  it("validates present values", () => {
    const s = optionalSchema(stringSchema());
    expect(s.parse("hello")).toBe("hello");
  });
});

describe("NullableModifierSchema", () => {
  it("accepts null", () => {
    const s = nullableSchema(stringSchema());
    expect(s.parse(null)).toBeNull();
  });

  it("validates present values", () => {
    const s = nullableSchema(stringSchema());
    expect(s.parse("hello")).toBe("hello");
  });
});

describe("DefaultSchema", () => {
  it("applies default when undefined", () => {
    const s = defaultSchema(stringSchema(), "default");
    expect(s.parse(undefined)).toBe("default");
  });

  it("validates present values", () => {
    const s = defaultSchema(stringSchema(), "default");
    expect(s.parse("custom")).toBe("custom");
  });

  it("supports lazy defaults", () => {
    const s = defaultSchema(stringSchema(), () => "computed");
    expect(s.parse(undefined)).toBe("computed");
  });
});

describe("RefineSchema", () => {
  it("passes when refinement succeeds", () => {
    const s = refineSchema(
      stringSchema(),
      (v) => v.startsWith("USR_"),
      "Must start with USR_",
    );
    expect(s.parse("USR_123")).toBe("USR_123");
  });

  it("fails when refinement fails", () => {
    const s = refineSchema(
      stringSchema(),
      (v) => v.startsWith("USR_"),
      "Must start with USR_",
    );
    expect(() => s.parse("INVALID")).toThrow();
  });
});

describe("TransformModifierSchema", () => {
  it("transforms validated output", () => {
    const s = transformSchema(stringSchema(), (v) => v.toUpperCase());
    expect(s.parse("hello")).toBe("HELLO");
  });
});

describe("CoercionSchemas", () => {
  it("coerces string to number", () => {
    const s = coerceNumberSchema();
    expect(s.parse("42")).toBe(42);
    expect(s.parse("3.14")).toBe(3.14);
  });

  it("rejects non-coercible values", () => {
    const s = coerceNumberSchema();
    expect(() => s.parse("not a number")).toThrow();
  });

  it("coerces string to boolean", () => {
    const s = coerceBooleanSchema();
    expect(s.parse("true")).toBe(true);
    expect(s.parse("false")).toBe(false);
    expect(s.parse(1)).toBe(true);
    expect(s.parse(0)).toBe(false);
  });

  it("coerces to string", () => {
    const s = coerceStringSchema();
    expect(s.parse(42)).toBe("42");
    expect(s.parse(true)).toBe("true");
  });

  it("coerces to bigint", () => {
    const s = coerceBigIntSchema();
    expect(s.parse(42)).toBe(42n);
    expect(s.parse("42")).toBe(42n);
  });
});

describe("Schema namespace API", () => {
  it("works with the schema namespace", () => {
    const UserSchema = schema.object({
      name: schema.string().min(2),
      email: schema.string().email(),
      age: schema.number().int().min(0).optional(),
      role: schema.enum(["admin", "user"] as const),
    });

    type User = Infer<typeof UserSchema>;

    const user: User = UserSchema.parse({
      name: "John",
      email: "john@example.com",
      role: "admin",
    });

    expect(user.name).toBe("John");
    expect(user.email).toBe("john@example.com");
    expect(user.role).toBe("admin");
  });

  it("nested objects work", () => {
    const s = schema.object({
      user: schema.object({
        profile: schema.object({
          name: schema.string(),
        }),
      }),
    });

    expect(
      s.parse({
        user: { profile: { name: "John" } },
      }),
    ).toEqual({
      user: { profile: { name: "John" } },
    });
  });

  it("arrays work", () => {
    const s = schema.array(schema.string());
    expect(s.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("unions work", () => {
    const s = schema.union([schema.string(), schema.number()]);
    expect(s.parse("hello")).toBe("hello");
    expect(s.parse(42)).toBe(42);
  });

  it("optional works", () => {
    const s = schema.object({
      name: schema.string(),
      age: schema.number().optional(),
    });
    expect(s.parse({ name: "John" })).toEqual({ name: "John" });
  });

  it("nullable works", () => {
    const s = schema.nullable(schema.string());
    expect(s.parse(null)).toBeNull();
    expect(s.parse("hello")).toBe("hello");
  });

  it("default works", () => {
    const s = schema.default(schema.number(), 10);
    expect(s.parse(undefined)).toBe(10);
    expect(s.parse(5)).toBe(5);
  });

  it("refine works", () => {
    const s = schema.refine(
      schema.string(),
      (v) => v.length > 0,
      "Must not be empty",
    );
    expect(s.parse("hello")).toBe("hello");
    expect(() => s.parse("")).toThrow();
  });

  it("transform works", () => {
    const s = schema.transform(schema.string(), (v) => v.toUpperCase());
    expect(s.parse("hello")).toBe("HELLO");
  });

  it("coerce works", () => {
    expect(schema.coerce.number().parse("42")).toBe(42);
    expect(schema.coerce.boolean().parse("true")).toBe(true);
  });

  it("tuple works", () => {
    const s = schema.tuple([schema.string(), schema.number()]);
    expect(s.parse(["hello", 42])).toEqual(["hello", 42]);
  });

  it("record works", () => {
    const s = schema.record(schema.number());
    expect(s.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe("Metadata", () => {
  it("attaches description", () => {
    const s = stringSchema().describe("User name");
    expect(s.getMetadata()).toEqual({ description: "User name" });
  });

  it("attaches example", () => {
    const s = stringSchema().example("John");
    expect(s.getMetadata()).toEqual({ example: "John" });
  });

  it("attaches title", () => {
    const s = stringSchema().title("Name");
    expect(s.getMetadata()).toEqual({ title: "Name" });
  });
});

describe("Error handling", () => {
  it("safeParse never throws", () => {
    const s = objectSchema({
      name: stringSchema(),
      age: numberSchema(),
    });

    const result = s.safeParse({ name: 123, age: "not a number" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("issues have correct path", () => {
    const s = objectSchema({
      user: objectSchema({
        email: stringSchema().email(),
      }),
    });

    const result = s.safeParse({
      user: { email: "not-an-email" },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.path).toContain("user");
      expect(result.issues[0]?.path).toContain("email");
    }
  });

  it("issues have machine-readable codes", () => {
    const s = stringSchema();
    const result = s.safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.code).toBeDefined();
    }
  });

  it("abortEarly stops at first error", () => {
    const s = objectSchema({
      name: stringSchema(),
      age: numberSchema(),
    });

    const result = s.safeParse({ name: 123, age: "bad" }, { abortEarly: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBe(1);
    }
  });
});

/* ─── Untrusted input ─────────────────────────────────────────────────────── */

describe("parsing untrusted input", () => {
  it("accepts unknown, which is the point of validating at a boundary", () => {
    const s = schema.object({
      name: schema.string(),
      age: schema.number().int().min(0),
    });

    // The value a real caller has at a trust boundary: typed `unknown`.
    const fromTheWire: unknown = JSON.parse('{"name":"Ada","age":36}');

    const parsed = s.parse(fromTheWire);

    expect(parsed.name).toBe("Ada");
    expect(parsed.age).toBe(36);
  });

  it("rejects unknown input that does not match", () => {
    const s = schema.object({ name: schema.string() });
    const fromTheWire: unknown = JSON.parse('{"name":42}');

    expect(() => s.parse(fromTheWire)).toThrow();
  });

  it("safeParse also accepts unknown", () => {
    const s = schema.string();
    const fromTheWire: unknown = 42;

    const result = s.safeParse(fromTheWire);

    expect(result.success).toBe(false);
  });

  it("still infers the declared input type through SchemaInput", () => {
    const s = schema.string();

    // Compile-time check: SchemaInput is unaffected by parse accepting unknown.
    const declared: SchemaInput<typeof s> = "hello";

    expect(s.parse(declared)).toBe("hello");
  });
});

describe("parse and safeParse agree", () => {
  const cases: ReadonlyArray<readonly [string, () => unknown, unknown]> = [
    [
      "object field",
      () => schema.object({ name: schema.string() }),
      { name: 42 },
    ],
    [
      "nested object field",
      () => schema.object({ user: schema.object({ name: schema.string() }) }),
      { user: { name: 42 } },
    ],
    ["array element", () => schema.array(schema.string()), [1, 2]],
    ["record value", () => schema.record(schema.number()), { a: "no" }],
    ["primitive", () => schema.string(), 42],
  ];

  for (const [label, build, input] of cases) {
    it(`rejects an invalid ${label} in both entry points`, () => {
      const s = build() as ReturnType<typeof schema.string>;

      expect(s.safeParse(input).success).toBe(false);

      // A value safeParse calls invalid must never be returned by parse.
      expect(() => s.parse(input)).toThrow();
    });
  }
});

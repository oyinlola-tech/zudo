/**
 * Batch-7 (second report): prefix normalisation, typed required
 * accessors, typed resolve() schemas, and transform/validate ordering.
 */

import { describe, it, expect, expectTypeOf } from "vitest";

import {
  ConfigValueType,
  createConfigManager,
  createConfigResolver,
  createConfigStore,
  createEnvironmentConfigSource,
  validateConfigValue,
} from "../src/index.js";

describe("BATCH7-CONFIG-3: prefixes accept a trailing dot", () => {
  const store = createConfigStore({
    initialValues: { "db.host": "h", "db.port": 5432, dbx: 1 },
  });

  it("getByPrefix('db.') matches getByPrefix('db')", () => {
    const keys = (prefix: string) =>
      store
        .getByPrefix(prefix)
        .map((entry) => entry.key)
        .sort();

    expect(keys("db.")).toEqual(["db.host", "db.port"]);
    expect(keys("db.")).toEqual(keys("db"));
  });

  it("getObjectByPrefix('db.') matches getObjectByPrefix('db')", () => {
    expect(store.getObjectByPrefix("db.")).toEqual({ host: "h", port: 5432 });
    expect(store.getObjectByPrefix("db.")).toEqual(
      store.getObjectByPrefix("db"),
    );
  });
});

describe("BATCH7-CONFIG-4: typed required accessors", () => {
  async function manager() {
    const m = createConfigManager({
      sources: [
        createEnvironmentConfigSource({
          env: { DB__PORT: "5432", DB__SSL: "true", DB__HOST: "db" },
        }),
      ],
    });
    await m.load();
    return m;
  }

  it("scoped requiredNumber converts the env string", async () => {
    const db = (await manager()).scoped("db");

    expect(db.requiredNumber("port")).toBe(5432);
    expect(db.requiredBoolean("ssl")).toBe(true);
    expect(db.requiredString("host")).toBe("db");
    expectTypeOf(db.requiredNumber("port")).toEqualTypeOf<number>();
  });

  it("the manager has the typed required accessors too", async () => {
    const m = await manager();

    expect(m.requiredNumber("db.port")).toBe(5432);
    expect(m.requiredBoolean("db.ssl")).toBe(true);
    expect(m.requiredString("db.host")).toBe("db");
    expect(() => m.requiredNumber("db.missing")).toThrow(/missing/);
  });

  it("rejects a value that does not parse", async () => {
    const db = (await manager()).scoped("db");

    expect(() => db.requiredNumber("host")).toThrow();
  });
});

describe("BATCH7-CONFIG-5: resolve() accepts the constraints it enforces", () => {
  const store = createConfigStore({ initialValues: { port: "0", name: "x" } });
  const resolver = createConfigResolver(store, { strict: true });

  it("types min/max on a NUMBER schema and enforces them", () => {
    expect(() =>
      resolver.resolve("port", { type: ConfigValueType.NUMBER, min: 1 }),
    ).toThrow();
    expect(
      resolver.resolve("name", { type: ConfigValueType.STRING, minLength: 1 }),
    ).toBe("x");
  });

  it("still rejects a constraint that belongs to another type", () => {
    // Compile-time only: at runtime a string constraint is ignored for a
    // number, so "0" still resolves.
    expect(
      resolver.resolve("port", {
        type: ConfigValueType.NUMBER,
        // @ts-expect-error — minLength is a STRING constraint.
        minLength: 1,
      }),
    ).toBe(0);
  });
});

describe("BATCH7-CONFIG-6: validate sees the final, transformed value", () => {
  it("passes the transformed value to validate", () => {
    const seen: unknown[] = [];
    const result = validateConfigValue("a,b", {
      type: ConfigValueType.STRING,
      transform: (value) => String(value).toUpperCase(),
      validate: (value: unknown) => {
        seen.push(value);
        return true;
      },
    });

    expect(result.value).toBe("A,B");
    expect(seen).toEqual(["A,B"]);
  });

  it("type-checks and constrains a transform's output", () => {
    const hex = {
      type: ConfigValueType.NUMBER,
      max: 65535,
      transform: (value: unknown) => Number.parseInt(String(value), 16),
    } as const;

    expect(validateConfigValue("1F90", hex).value).toBe(8080);
    expect(validateConfigValue("FFFFF", hex).valid).toBe(false);
    expect(validateConfigValue("zz", hex).valid).toBe(false);
  });

  it("lets an ARRAY schema parse a comma-separated env string", () => {
    const result = validateConfigValue("a, b", {
      type: ConfigValueType.ARRAY,
      minItems: 2,
      transform: (value) =>
        String(value)
          .split(",")
          .map((s) => s.trim()),
    });

    expect(result.value).toEqual(["a", "b"]);
  });

  it("validate rejects a transformed value", () => {
    const result = validateConfigValue("3", {
      type: ConfigValueType.NUMBER,
      transform: (value) => (value as number) * 10,
      validate: (value: number) => value < 10 || "too big",
    });

    expect(result.valid).toBe(false);
  });
});

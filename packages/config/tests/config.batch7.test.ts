/**
 * Regression tests for the batch-7 lesson-writer findings.
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

async function envManager(env: Record<string, string>) {
  const manager = createConfigManager({
    sources: [createEnvironmentConfigSource({ env })],
  });

  await manager.load();

  return manager;
}

describe("BATCH7-CONFIG-1: NUMBER and BOOLEAN schemas accept env strings", () => {
  it("validates a numeric env string against a NUMBER schema", async () => {
    const manager = await envManager({ PORT: "8080", DEBUG: "true" });

    const result = manager.validate<{ port: number; debug: boolean }>({
      properties: {
        port: { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
        debug: { type: ConfigValueType.BOOLEAN },
      },
    });

    expect(result.port).toBe(8080);
    expect(result.debug).toBe(true);
  });

  it("still works when the schema also has a transform", async () => {
    const manager = await envManager({ PORT: "8080" });

    const result = manager.validate<{ port: number }>({
      properties: {
        port: {
          type: ConfigValueType.NUMBER,
          transform: (value) => (value as number) + 1,
        },
      },
    });

    expect(result.port).toBe(8081);
  });

  it("rejects a string that is not strictly numeric", async () => {
    const manager = await envManager({ PORT: "80a" });

    expect(() =>
      manager.validate({
        properties: { port: { type: ConfigValueType.NUMBER } },
      }),
    ).toThrow();
  });

  it("uses the existing boolean conventions", () => {
    const bool = { type: ConfigValueType.BOOLEAN } as const;

    expect(validateConfigValue("true", bool).value).toBe(true);
    expect(validateConfigValue("false", bool).value).toBe(false);
    expect(validateConfigValue("1", bool).value).toBe(true);
    expect(validateConfigValue("0", bool).value).toBe(false);
    expect(validateConfigValue("maybe", bool).valid).toBe(false);
  });

  it("rejects hex and empty strings for NUMBER", () => {
    const num = { type: ConfigValueType.NUMBER } as const;

    expect(validateConfigValue("0x1F90", num).valid).toBe(false);
    expect(validateConfigValue("", num).valid).toBe(false);
    expect(validateConfigValue(" 42 ", num).value).toBe(42);
  });

  it("does not coerce when the schema also accepts strings", () => {
    const result = validateConfigValue("8080", {
      type: [ConfigValueType.STRING, ConfigValueType.NUMBER],
    });

    expect(result.value).toBe("8080");
  });

  it("can be turned off per schema with coerce: false", () => {
    const result = validateConfigValue("8080", {
      type: ConfigValueType.NUMBER,
      coerce: false,
    });

    expect(result.valid).toBe(false);
  });

  it("coerces through resolver.resolve()", () => {
    const store = createConfigStore({ initialValues: { port: "3000" } });
    const resolver = createConfigResolver(store);

    expect(resolver.resolve("port", { type: ConfigValueType.NUMBER })).toBe(
      3000,
    );
  });
});

describe("BATCH7-CONFIG-2: accessors with a fallback return T", () => {
  it("narrows the return type when a fallback is supplied", async () => {
    const manager = await envManager({});

    const port = manager.number("port", 3000);
    const host = manager.string("host", "localhost");
    const debug = manager.boolean("debug", false);
    const raw = manager.get("missing", "x");

    expectTypeOf(port).toEqualTypeOf<number>();
    expectTypeOf(host).toEqualTypeOf<string>();
    expectTypeOf(debug).toEqualTypeOf<boolean>();
    expectTypeOf(raw).toEqualTypeOf<string>();
    expectTypeOf(manager.number("port")).toEqualTypeOf<number | undefined>();

    expect(port).toBe(3000);
    expect(host).toBe("localhost");
    expect(debug).toBe(false);
    expect(raw).toBe("x");
  });

  it("narrows on the resolver and scoped resolver too", () => {
    const store = createConfigStore({ initialValues: { "db.port": "5432" } });
    const resolver = createConfigResolver(store);
    const scoped = resolver.scoped("db");

    expectTypeOf(resolver.number("db.port", 1)).toEqualTypeOf<number>();
    expectTypeOf(scoped.number("port", 1)).toEqualTypeOf<number>();
    expectTypeOf(scoped.get("host", "h")).toEqualTypeOf<string>();

    expect(scoped.number("port", 1)).toBe(5432);
    expect(scoped.get("host", "h")).toBe("h");
  });

  it("still accepts an optional fallback variable", () => {
    const resolver = createConfigResolver(createConfigStore());
    const maybe: number | undefined = undefined;

    expectTypeOf(resolver.number("x", maybe)).toEqualTypeOf<
      number | undefined
    >();
  });
});

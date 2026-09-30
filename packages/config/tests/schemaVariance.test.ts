/**
 * Regression: typed property schemas must be expressible.
 *
 * `ConfigSchema<T>` is contravariant in `T` through `validate(value: T, ...)`,
 * so `ConfigNumberSchema` (which extends `ConfigSchema<number>`) is not
 * assignable to `ConfigSchema<ConfigValue>`. While the schema containers
 * declared their members as plain `ConfigSchema`, an object schema with
 * typed properties could not be written at all — not even through a typed
 * intermediate constant, so there was no workaround short of a cast.
 *
 * These assertions are mostly about compilation: if the containers narrow
 * again, this file stops typechecking, which `pnpm typecheck` runs.
 */

import { describe, expect, it } from "vitest";

import { ConfigValueType } from "../src/configSchema/configSchema.type.js";
import type {
  ConfigObjectSchema,
  ConfigNumberSchema,
} from "../src/configSchema/configSchema.type.js";
import {
  validateConfigObject,
  validateConfigValue,
} from "../src/configSchema/configSchema.validator.js";

describe("schema variance", () => {
  it("accepts variant-specific fields on inline property literals", () => {
    const schema: ConfigObjectSchema = {
      type: ConfigValueType.OBJECT,
      properties: {
        port: { type: ConfigValueType.NUMBER, min: 1, max: 65535 },
        name: { type: ConfigValueType.STRING, minLength: 1 },
        debug: { type: ConfigValueType.BOOLEAN },
      },
    };

    expect(validateConfigObject({ port: 8080, name: "a", debug: true }, schema).valid).toBe(true);
  });

  it("accepts a typed intermediate constant as a property", () => {
    const port: ConfigNumberSchema = {
      type: ConfigValueType.NUMBER,
      min: 1,
      max: 65535,
    };

    const schema: ConfigObjectSchema = {
      type: ConfigValueType.OBJECT,
      properties: { port },
    };

    expect(validateConfigObject({ port: 8080 }, schema).valid).toBe(true);
  });

  it("keeps the narrow parameter type on a variant's validate callback", () => {
    const schema: ConfigObjectSchema = {
      type: ConfigValueType.OBJECT,
      properties: {
        port: {
          type: ConfigValueType.NUMBER,
          // `value` is number here, not ConfigValue.
          validate: (value: number) => value % 2 === 0 || "port must be even",
        },
      },
    };

    expect(validateConfigObject({ port: 8080 }, schema).valid).toBe(true);
    expect(validateConfigObject({ port: 8081 }, schema).valid).toBe(false);
  });

  it("accepts typed item schemas on arrays", () => {
    const schema: ConfigObjectSchema = {
      type: ConfigValueType.OBJECT,
      properties: {
        tags: {
          type: ConfigValueType.ARRAY,
          items: { type: ConfigValueType.STRING, minLength: 1 },
        },
      },
    };

    expect(validateConfigObject({ tags: ["a", "b"] }, schema).valid).toBe(true);
    expect(validateConfigObject({ tags: [""] }, schema).valid).toBe(false);
  });

  it("accepts a typed additionalProperties schema", () => {
    const schema: ConfigObjectSchema = {
      type: ConfigValueType.OBJECT,
      properties: {},
      additionalProperties: { type: ConfigValueType.STRING, minLength: 1 },
    };

    expect(validateConfigValue({ anything: "x" }, schema).valid).toBe(true);
  });
});

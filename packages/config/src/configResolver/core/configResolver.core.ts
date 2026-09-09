import type { ConfigValue } from "../../configValue/configValue.core.js";

import {
  defineConfigProperty,
  parseConfigBigInt,
  parseConfigBoolean,
  parseConfigDate,
  parseConfigNumber,
} from "../../configValue/configValue.core.js";

import type { ConfigSchema } from "../../configSchema/index.js";

import { validateConfigValue } from "../../configSchema/index.js";

import type { ConfigStore } from "../../configStore/configStore.core.js";

import type {
  ConfigResolverOptions,
  ConfigResolutionResult,
} from "./configResolver.type.js";

import { ScopedConfigResolver } from "../accessors/configResolver.scoped.js";

/**
 * Resolves typed configuration values from a ConfigStore.
 *
 * This class is intentionally separate from ConfigStore. The store
 * owns values, while the resolver owns interpretation and validation.
 */
export class ConfigResolver {
  private readonly store: ConfigStore;

  private readonly options: Required<ConfigResolverOptions>;

  constructor(store: ConfigStore, options: ConfigResolverOptions = {}) {
    this.store = store;

    this.options = {
      strict: options.strict ?? true,
      allowUndefined: options.allowUndefined ?? true,
      clone: options.clone ?? false,
    };
  }

  /**
   * Returns the raw configuration value.
   */
  get<T extends ConfigValue = ConfigValue>(key: string): T | undefined {
    const value = this.store.get<T>(key);

    return this.prepareValue(value) as T | undefined;
  }

  /**
   * Resolves a value using a schema.
   */
  resolve<T extends ConfigValue>(
    key: string,
    schema: ConfigSchema<T>,
  ): T | undefined {
    const value = this.store.get(key);

    const result = validateConfigValue(
      value,
      schema as unknown as ConfigSchema,
      {
        path: key,
        root: value,
      },
    );

    if (!result.valid) {
      if (this.options.strict) {
        throw new ConfigResolutionError(key, result.issues);
      }

      // Non-strict mode: never return an invalid value. Fall back to
      // the schema default when present, otherwise undefined.
      const fallback =
        typeof schema.default === "function"
          ? (schema.default as () => T)()
          : schema.default;

      if (fallback === undefined && !this.options.allowUndefined) {
        throw new ConfigResolutionError(key, result.issues);
      }

      return this.prepareValue(fallback) as T | undefined;
    }

    if (result.value === undefined && !this.options.allowUndefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Configuration value "${key}" is undefined.`,
          code: "UNDEFINED_VALUE",
        },
      ]);
    }

    return this.prepareValue(result.value) as T | undefined;
  }

  /**
   * Resolves a value and returns diagnostic information.
   */
  resolveResult<T extends ConfigValue>(
    key: string,
    schema: ConfigSchema<T>,
  ): ConfigResolutionResult<T> {
    const value = this.store.get(key);

    const result = validateConfigValue(
      value,
      schema as unknown as ConfigSchema,
      {
        path: key,
        root: value,
      },
    );

    return {
      key,
      value: this.prepareValue(result.value) as T | undefined,
      found: value !== undefined,
      valid: result.valid,
      issues: result.issues,
    };
  }

  /**
   * Returns a required configuration value.
   */
  required<T extends ConfigValue = ConfigValue>(key: string): T {
    const value = this.store.get<T>(key);

    if (value === undefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Required configuration value "${key}" is missing.`,
          code: "REQUIRED",
        },
      ]);
    }

    return this.prepareValue(value) as T;
  }

  /**
   * Returns a string configuration value.
   */
  string(key: string, fallback?: string): string | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== "string") {
      return this.invalidType(key, "string", value, fallback);
    }

    return value;
  }

  /**
   * Returns a required string.
   */
  requiredString(key: string): string {
    const value = this.string(key);

    if (value === undefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Required string configuration "${key}" is missing.`,
          code: "REQUIRED_STRING",
        },
      ]);
    }

    return value;
  }

  /**
   * Returns a number configuration value.
   */
  number(key: string, fallback?: number): number | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (typeof value === "number") {
      if (Number.isFinite(value)) {
        return value;
      }

      return this.invalidType(key, "number", value, fallback);
    }

    if (typeof value === "string") {
      const parsed = parseConfigNumber(value);

      if (parsed !== undefined) {
        return parsed;
      }
    }

    return this.invalidType(key, "number", value, fallback);
  }

  /**
   * Returns a required number.
   */
  requiredNumber(key: string): number {
    const value = this.number(key);

    if (value === undefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Required number configuration "${key}" is missing.`,
          code: "REQUIRED_NUMBER",
        },
      ]);
    }

    return value;
  }

  /**
   * Returns a boolean configuration value.
   */
  boolean(key: string, fallback?: boolean): boolean | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = parseConfigBoolean(value);

      if (parsed !== undefined) {
        return parsed;
      }
    }

    return this.invalidType(key, "boolean", value, fallback);
  }

  /**
   * Returns a required boolean.
   */
  requiredBoolean(key: string): boolean {
    const value = this.boolean(key);

    if (value === undefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Required boolean configuration "${key}" is missing.`,
          code: "REQUIRED_BOOLEAN",
        },
      ]);
    }

    return value;
  }

  /**
   * Returns a bigint configuration value.
   */
  bigint(key: string, fallback?: bigint): bigint | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (typeof value === "bigint") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = parseConfigBigInt(value);

      if (parsed !== undefined) {
        return parsed;
      }
    }

    return this.invalidType(key, "bigint", value, fallback);
  }

  /**
   * Returns a Date configuration value.
   */
  date(key: string, fallback?: Date): Date | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (value instanceof Date) {
      const parsed = parseConfigDate(value);

      if (parsed !== undefined) {
        return parsed;
      }

      // Invalid Date instances route through the same strict/fallback
      // handling as any other invalid type.
      return this.invalidType(key, "date", value, fallback);
    }

    if (typeof value === "string") {
      const parsed = parseConfigDate(value);

      if (parsed !== undefined) {
        return parsed;
      }
    }

    return this.invalidType(key, "date", value, fallback);
  }

  /**
   * Returns a required Date.
   */
  requiredDate(key: string): Date {
    const value = this.date(key);

    if (value === undefined) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Required date configuration "${key}" is missing.`,
          code: "REQUIRED_DATE",
        },
      ]);
    }

    return value;
  }

  /**
   * Returns an object configuration value.
   */
  object<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: T,
  ): T | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      value instanceof Date
    ) {
      return this.invalidType(key, "object", value, fallback);
    }

    return this.prepareValue(value) as T;
  }

  /**
   * Returns an array configuration value.
   */
  array<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: readonly T[],
  ): readonly T[] | undefined {
    const value = this.store.get(key);

    if (value === undefined) {
      return fallback;
    }

    if (!Array.isArray(value)) {
      return this.invalidType(key, "array", value, fallback);
    }

    return this.prepareValue(value) as unknown as readonly T[];
  }

  /**
   * Resolves a group of configuration keys.
   */
  pick(keys: readonly string[]): Readonly<Record<string, ConfigValue>> {
    const result: Record<string, ConfigValue> = {};

    for (const key of keys) {
      const value = this.get(key);

      if (value !== undefined) {
        defineConfigProperty(result, key, value);
      }
    }

    return Object.freeze(result);
  }

  /**
   * Creates a resolver for a nested key prefix.
   */
  scoped(prefix: string): ScopedConfigResolver {
    return new ScopedConfigResolver(this, prefix);
  }

  /**
   * Returns the underlying store.
   */
  getStore(): ConfigStore {
    return this.store;
  }

  private prepareValue(
    value: ConfigValue | undefined,
  ): ConfigValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!this.options.clone) {
      return value;
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.prepareValue(item) as ConfigValue);
    }

    const result: Record<string, ConfigValue> = {};

    for (const [key, child] of Object.entries(value)) {
      defineConfigProperty(
        result,
        key,
        this.prepareValue(child) as ConfigValue,
      );
    }

    return result;
  }

  private invalidType<T>(
    key: string,
    expected: string,
    received: unknown,
    fallback: T | undefined,
  ): T | undefined {
    if (this.options.strict) {
      throw new ConfigResolutionError(key, [
        {
          path: key,
          message: `Expected configuration "${key}" to be ${expected}.`,
          code: "TYPE_MISMATCH",
          expected,
          received: typeof received,
        },
      ]);
    }

    return fallback;
  }
}
import { ConfigurationError } from "@zudojs/errors";

/**
 * Error thrown when configuration resolution fails.
 */
export class ConfigResolutionError extends ConfigurationError {
  readonly key: string;

  readonly issues: readonly unknown[];

  constructor(key: string, issues: readonly unknown[]) {
    super(`Failed to resolve configuration "${key}".`, {
      configKey: key,
      component: "ConfigurationResolver",
    });

    this.key = key;

    this.issues = Object.freeze([...issues]);
  }
}

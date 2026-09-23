import type { ConfigValue } from "../configValue/configValue.core.js";

import {
  defineConfigProperty,
  readOwnConfigProperty,
} from "../configValue/configValue.core.js";

import type {
  AnyConfigSchema,
  ConfigArraySchema,
  ConfigNumberSchema,
  ConfigStringSchema,
  ConfigValidationContext,
  ConfigValidationIssue,
  ConfigValidationResult,
} from "./configSchema.type.js";

import {
  ConfigValidationSeverity,
  ConfigValueType,
} from "./configSchema.type.js";

import type { ConfigObjectSchema } from "./configSchema.type.js";

import { coerceConfigInput } from "./configSchema.coerce.js";

/**
 * Returns the runtime configuration value type.
 */
export function getConfigValueType(value: unknown): ConfigValueType {
  if (value === null) {
    return ConfigValueType.NULL;
  }

  if (value === undefined) {
    return ConfigValueType.ANY;
  }

  if (value instanceof Date) {
    return ConfigValueType.DATE;
  }

  if (Array.isArray(value)) {
    return ConfigValueType.ARRAY;
  }

  switch (typeof value) {
    case "string":
      return ConfigValueType.STRING;

    case "number":
      return ConfigValueType.NUMBER;

    case "boolean":
      return ConfigValueType.BOOLEAN;

    case "bigint":
      return ConfigValueType.BIGINT;

    case "object":
      return ConfigValueType.OBJECT;

    default:
      return ConfigValueType.ANY;
  }
}

/**
 * Checks whether a runtime value matches a schema type.
 */
export function matchesConfigType(
  value: unknown,
  type: ConfigValueType | readonly ConfigValueType[],
): boolean {
  if (Array.isArray(type)) {
    return type.some((candidate) => matchesConfigType(value, candidate));
  }

  if (value === null) {
    return type === ConfigValueType.NULL;
  }

  if (value === undefined) {
    return false;
  }

  switch (type) {
    case ConfigValueType.ANY:
      return true;

    case ConfigValueType.STRING:
      return typeof value === "string";

    case ConfigValueType.NUMBER:
      return typeof value === "number" && Number.isFinite(value);

    case ConfigValueType.BOOLEAN:
      return typeof value === "boolean";

    case ConfigValueType.BIGINT:
      return typeof value === "bigint";

    case ConfigValueType.DATE:
      return value instanceof Date && !Number.isNaN(value.getTime());

    case ConfigValueType.ARRAY:
      return Array.isArray(value);

    case ConfigValueType.OBJECT:
      return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      );

    case ConfigValueType.NULL:
      return value === null;

    default:
      return false;
  }
}

/**
 * Creates a validation issue.
 */
export function createConfigValidationIssue(
  path: string,
  message: string,
  code: string,
  options: Partial<
    Pick<ConfigValidationIssue, "expected" | "received" | "severity">
  > = {},
): ConfigValidationIssue {
  return {
    path,
    message,
    code,
    severity: options.severity ?? ConfigValidationSeverity.ERROR,
    expected: options.expected,
    received: options.received,
  };
}

/**
 * Formats expected schema types.
 */
function formatExpectedType(
  type: ConfigValueType | readonly ConfigValueType[],
): string {
  if (Array.isArray(type)) {
    return type.join(" | ");
  }

  return String(type);
}

/**
 * Resolves a schema default.
 */
function resolveDefaultValue(
  schema: AnyConfigSchema,
): ConfigValue | undefined {
  if (schema.default === undefined) {
    return undefined;
  }

  return typeof schema.default === "function"
    ? (schema.default as () => ConfigValue)()
    : schema.default;
}

/**
 * Adds custom validation output to the issue list.
 */
function appendCustomValidationResult(
  result:
    boolean | string | ConfigValidationIssue | readonly ConfigValidationIssue[],
  path: string,
  issues: ConfigValidationIssue[],
): void {
  if (result === true) {
    return;
  }

  if (result === false) {
    issues.push(
      createConfigValidationIssue(
        path,
        "Configuration value failed validation.",
        "CUSTOM_VALIDATION",
      ),
    );

    return;
  }

  if (typeof result === "string") {
    issues.push(createConfigValidationIssue(path, result, "CUSTOM_VALIDATION"));

    return;
  }

  if (Array.isArray(result)) {
    issues.push(...(result as readonly ConfigValidationIssue[]));

    return;
  }

  issues.push(result as ConfigValidationIssue);
}

/**
 * Compiles a string schema pattern for a one-shot `test`.
 *
 * A RegExp carrying the `g` or `y` flag keeps `lastIndex` between calls, so
 * the same schema object alternated between accepting and rejecting an
 * identical value on successive validations. Both flags are dropped; they
 * have no meaning for a whole-value match.
 */
function compilePattern(pattern: string | RegExp): RegExp {
  if (typeof pattern === "string") {
    return new RegExp(pattern);
  }

  const flags = pattern.flags.replace(/[gy]/g, "");

  return flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
}

/**
 * Built-in schema validation rules.
 *
 * Returns a replacement value when a rule rewrote it (an array whose item
 * schema applied `transform` or `default`), otherwise undefined.
 */
function validateBuiltInRules(
  value: unknown,
  schema: AnyConfigSchema,
  context: ConfigValidationContext,
  issues: ConfigValidationIssue[],
): ConfigValue | undefined {
  if (typeof value === "string") {
    const stringSchema = schema as ConfigStringSchema;

    if (
      stringSchema.minLength !== undefined &&
      value.length < stringSchema.minLength
    ) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Value must contain at least ${stringSchema.minLength} characters.`,
          "MIN_LENGTH",
        ),
      );
    }

    if (
      stringSchema.maxLength !== undefined &&
      value.length > stringSchema.maxLength
    ) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Value must contain at most ${stringSchema.maxLength} characters.`,
          "MAX_LENGTH",
        ),
      );
    }

    if (stringSchema.pattern) {
      const pattern = compilePattern(stringSchema.pattern);

      if (!pattern.test(value)) {
        issues.push(
          createConfigValidationIssue(
            context.path,
            "Value does not match the required pattern.",
            "PATTERN",
          ),
        );
      }
    }

    if (stringSchema.enum && !stringSchema.enum.includes(value)) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Value must be one of: ${stringSchema.enum.join(", ")}.`,
          "ENUM",
        ),
      );
    }
  }

  if (typeof value === "number") {
    const numberSchema = schema as ConfigNumberSchema;

    if (numberSchema.min !== undefined && value < numberSchema.min) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Value must be greater than or equal to ${numberSchema.min}.`,
          "MIN",
        ),
      );
    }

    if (numberSchema.max !== undefined && value > numberSchema.max) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Value must be less than or equal to ${numberSchema.max}.`,
          "MAX",
        ),
      );
    }

    if (numberSchema.integer && !Number.isInteger(value)) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          "Value must be an integer.",
          "INTEGER",
        ),
      );
    }

    if (numberSchema.positive && value <= 0) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          "Value must be positive.",
          "POSITIVE",
        ),
      );
    }
  }

  if (Array.isArray(value)) {
    const arraySchema = schema as ConfigArraySchema;

    if (
      arraySchema.minItems !== undefined &&
      value.length < arraySchema.minItems
    ) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Array must contain at least ${arraySchema.minItems} items.`,
          "MIN_ITEMS",
        ),
      );
    }

    if (
      arraySchema.maxItems !== undefined &&
      value.length > arraySchema.maxItems
    ) {
      issues.push(
        createConfigValidationIssue(
          context.path,
          `Array must contain at most ${arraySchema.maxItems} items.`,
          "MAX_ITEMS",
        ),
      );
    }

    if (arraySchema.items) {
      // Item results used to be consulted for issues only, so an item
      // schema's `transform` (or `default`) ran and its output was thrown
      // away: the caller got the untransformed array back as "valid".
      const rebuilt: ConfigValue[] = [];

      let allValid = true;

      value.forEach((item, index) => {
        const result = validateConfigValue(item, arraySchema.items!, {
          path: `${context.path}[${index}]`,
          root: context.root,
          parent: value,
          key: index,
        });

        issues.push(...result.issues);

        if (!result.valid) {
          allValid = false;
        }

        rebuilt.push(
          result.value === undefined ? (item as ConfigValue) : result.value,
        );
      });

      return allValid ? rebuilt : undefined;
    }
  }

  return undefined;
}

/**
 * Validates a value against a schema.
 */
export function validateConfigValue(
  input: unknown,
  schema: AnyConfigSchema,
  context?: Partial<ConfigValidationContext>,
): ConfigValidationResult {
  const path = context?.path ?? "$";

  // Env-style strings are parsed for NUMBER/BOOLEAN schemas before the
  // type check; otherwise "8080" could never satisfy a NUMBER schema.
  const value = coerceConfigInput(input, schema);

  const validationContext: ConfigValidationContext = {
    path,
    root: context?.root ?? value,
    parent: context?.parent,
    key: context?.key,
  };

  const issues: ConfigValidationIssue[] = [];

  if (value === undefined) {
    if (schema.required) {
      issues.push(
        createConfigValidationIssue(
          path,
          `Configuration value at "${path}" is required.`,
          "REQUIRED",
          {
            expected: schema.type,
          },
        ),
      );

      return {
        valid: false,
        issues,
      };
    }

    const defaultValue = resolveDefaultValue(schema);

    if (defaultValue === undefined) {
      return {
        valid: true,
        issues,
      };
    }

    // Applied defaults run through the same validation and transform
    // pipeline as supplied values (defaultValue is defined here, so
    // this recursion terminates immediately).
    return validateConfigValue(defaultValue, schema, context);
  }

  if (value === null && schema.nullable) {
    return {
      valid: true,
      value: value as ConfigValue,
      issues,
    };
  }

  const hasErrors = (): boolean =>
    issues.some((issue) => issue.severity === ConfigValidationSeverity.ERROR);

  // Order: coerce -> (transform) -> type check -> constraints -> validate.
  // A value that already has the schema's type is constrained first and
  // transformed afterwards (so a type-changing transform such as
  // `STRING -> Number(v)` keeps working). A string that does NOT have the
  // type is handed to `transform` as a parser, and its OUTPUT must have
  // the type and satisfy the constraints. Either way `validate` receives
  // the final value, matching its `(value: T)` signature.
  let base: ConfigValue;

  let transformed = false;

  if (matchesConfigType(value, schema.type)) {
    base = checkConstraints(value, schema, validationContext, issues);
  } else {
    const parsed = parseWithTransform(value, schema, validationContext);

    if (parsed === NOT_PARSED || !matchesConfigType(parsed, schema.type)) {
      issues.push(
        createConfigValidationIssue(
          path,
          `Expected ${formatExpectedType(schema.type)} but received ${getConfigValueType(value)}.`,
          "TYPE_MISMATCH",
          {
            expected: schema.type,
            received: getConfigValueType(value),
          },
        ),
      );

      return {
        valid: false,
        issues,
      };
    }

    transformed = true;

    base = checkConstraints(parsed, schema, validationContext, issues);
  }

  let final: ConfigValue = base;

  // Transforms only run on values that passed their constraints; running
  // them on invalid input would surface invalid values to callers.
  if (!transformed && schema.transform && !hasErrors()) {
    try {
      final = schema.transform(base, validationContext);
      transformed = true;
    } catch (error) {
      issues.push(
        createConfigValidationIssue(
          path,
          error instanceof Error ? error.message : String(error),
          "TRANSFORM_FAILED",
        ),
      );
    }
  }

  // `validate` sees the final value. It is skipped only when a transform
  // should have produced that value but did not run.
  if (schema.validate && (transformed || schema.transform === undefined)) {
    const result = schema.validate(final, validationContext);

    appendCustomValidationResult(result, path, issues);
  }

  const valid = !hasErrors();

  return {
    valid,
    // Invalid values are never returned; callers fall back to the
    // schema default or undefined instead.
    value: valid ? final : undefined,
    issues,
  };
}

/** Marks a transform that threw, or a schema without one. */
const NOT_PARSED: unique symbol = Symbol("NOT_PARSED");

/**
 * Runs `schema.transform` as a parser on a STRING that failed the type
 * check (environment variables, `.env` files and CLI flags only produce
 * strings). Returns {@link NOT_PARSED} for any other value, when there is
 * no transform, or when it threw; the caller then reports the original
 * type mismatch. A non-string of the wrong type is a real type error and
 * is never handed to `transform`.
 */
function parseWithTransform(
  value: unknown,
  schema: AnyConfigSchema,
  context: ConfigValidationContext,
): ConfigValue | typeof NOT_PARSED {
  if (schema.transform === undefined || typeof value !== "string") {
    return NOT_PARSED;
  }

  try {
    return schema.transform(value as ConfigValue, context);
  } catch {
    return NOT_PARSED;
  }
}

/**
 * Applies the built-in constraints and, for object schemas, the nested
 * property schemas. Returns the value to continue with (rebuilt when an
 * item or property schema rewrote part of it).
 */
function checkConstraints(
  value: unknown,
  schema: AnyConfigSchema,
  context: ConfigValidationContext,
  issues: ConfigValidationIssue[],
): ConfigValue {
  const rewritten = validateBuiltInRules(value, schema, context, issues);

  // An object schema carries `properties` / `additionalProperties`;
  // delegate to validateConfigObject so nested constraints are enforced.
  const objectSchema = schema as Partial<ConfigObjectSchema>;

  if (
    matchesConfigType(value, ConfigValueType.OBJECT) &&
    (objectSchema.properties !== undefined ||
      objectSchema.additionalProperties !== undefined)
  ) {
    const nested = validateConfigObject(
      value as Readonly<Record<string, unknown>>,
      {
        type: ConfigValueType.OBJECT,
        properties: objectSchema.properties ?? {},
        additionalProperties: objectSchema.additionalProperties,
      },
      context.path,
    );

    issues.push(...nested.issues);

    if (nested.value !== undefined) {
      return nested.value;
    }
  }

  return rewritten ?? (value as ConfigValue);
}

/**
 * Validates an entire configuration object.
 */
export function validateConfigObject(
  value: Readonly<Record<string, unknown>>,
  schema: ConfigObjectSchema,
  path = "$",
): ConfigValidationResult {
  const issues: ConfigValidationIssue[] = [];

  if (!matchesConfigType(value, ConfigValueType.OBJECT)) {
    return {
      valid: false,
      issues: [
        createConfigValidationIssue(
          path,
          `Expected object but received ${getConfigValueType(value)}.`,
          "TYPE_MISMATCH",
          {
            expected: ConfigValueType.OBJECT,
            received: getConfigValueType(value),
          },
        ),
      ],
    };
  }

  const result: Record<string, ConfigValue> = {};

  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    const propertyPath = `${path}.${key}`;

    // Own-property read only: bracket access would walk the prototype
    // chain, so a schema property named "constructor" or "toString"
    // would validate an inherited function instead of reporting a
    // missing value.
    const propertyResult = validateConfigValue(
      readOwnConfigProperty(value, key),
      propertySchema,
      {
        path: propertyPath,
        root: value,
        parent: value,
        key,
      },
    );

    issues.push(...propertyResult.issues);

    if (propertyResult.value !== undefined) {
      defineConfigProperty(result, key, propertyResult.value);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(schema.properties, key)) {
      continue;
    }

    if (schema.additionalProperties === false) {
      issues.push(
        createConfigValidationIssue(
          `${path}.${key}`,
          `Unknown configuration property "${key}".`,
          "UNKNOWN_PROPERTY",
        ),
      );

      continue;
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    ) {
      const propertyResult = validateConfigValue(
        child,
        schema.additionalProperties,
        {
          path: `${path}.${key}`,
          root: value,
          parent: value,
          key,
        },
      );

      issues.push(...propertyResult.issues);

      if (propertyResult.value !== undefined) {
        defineConfigProperty(result, key, propertyResult.value);
      }
    } else {
      // Own "__proto__"/"constructor"/"prototype" keys (e.g. from
      // JSON.parse of untrusted input) are kept as own data
      // properties: plain assignment would reach the inherited
      // "__proto__" setter and mutate the result's prototype.
      defineConfigProperty(result, key, child as ConfigValue);
    }
  }

  return {
    valid: !issues.some(
      (issue) => issue.severity === ConfigValidationSeverity.ERROR,
    ),
    value: result,
    issues,
  };
}

/**
 * Validates an object against a schema and throws when invalid.
 */
export function assertValidConfig(
  value: unknown,
  schema: AnyConfigSchema,
): ConfigValue {
  const result = validateConfigValue(value, schema);

  if (!result.valid) {
    throw new ConfigSchemaValidationError(result.issues);
  }

  return result.value as ConfigValue;
}

import { ConfigurationError } from "@zudojs/errors";

/**
 * Error thrown when schema validation fails.
 */
export class ConfigSchemaValidationError extends ConfigurationError {
  readonly issues: readonly ConfigValidationIssue[];

  constructor(issues: readonly ConfigValidationIssue[]) {
    super(
      `Configuration validation failed with ${issues.length} issue${
        issues.length === 1 ? "" : "s"
      }.`,
      {
        configKey: "schema",
        component: "ConfigSchemaValidator",
      },
    );

    this.issues = Object.freeze([...issues]);
  }
}

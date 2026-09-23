/**
 * @zudojs/schema/coerce
 *
 * Explicit coercion schemas — convert string/number inputs to the expected type.
 * Useful for HTTP query parameters and form data.
 *
 * These are deliberately stricter than the JavaScript built-ins they wrap.
 * `Number("")` is `0` and `Number("1e999")` is `Infinity`; neither is a
 * plausible reading of a query parameter, and both used to be accepted.
 */

import type { SchemaParseContext } from "../schemaBase/index.js";
import { describeType } from "../schemaBase/schemaBase.describe.js";
import { ModifiableSchema } from "../schemaModifiers/schemaModifiable.core.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode, SerializationLimits } from "@zudojs/constants";
import { NumberSchema } from "../schemaPrimitives/schemaNumber.core.js";
import { StringSchema } from "../schemaPrimitives/schemaString.core.js";

/**
 * Longest digit run accepted by BigInt coercion (shared with
 * `@zudojs/serialization` through `SerializationLimits.MAX_BIGINT_DIGITS`).
 */
const BIGINT_TEXT_PATTERN = new RegExp(
  `^[+-]?\\d{1,${SerializationLimits.MAX_BIGINT_DIGITS}}$`,
);

/**
 * Coerces input to a number before validating.
 */
export class CoerceNumberSchema extends ModifiableSchema<number> {
  public readonly _type = "coerce.number";

  constructor(
    private readonly _constraints: NumberSchema = new NumberSchema(),
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): number {
    return this._constraints._parse(ctx, this._coerce(ctx, input));
  }

  private _coerce(ctx: SchemaParseContext, input: unknown): number {
    if (typeof input === "number" && Number.isFinite(input)) {
      return input;
    }

    if (typeof input === "string") {
      const trimmed = input.trim();

      // `Number("")` and `Number(" ")` are both 0 — an omitted query parameter
      // would silently become a real value.
      if (trimmed.length > 0) {
        const num = Number(trimmed);
        // Finite only: "1e999" parses to Infinity, and "0x10" to 16, neither
        // of which a caller sending a decimal parameter intended.
        if (
          Number.isFinite(num) &&
          /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)
        ) {
          return num;
        }
      }
    }

    addIssue(ctx, {
      code: SchemaIssueCode.COERCION_FAILED,
      path: [...ctx.path],
      message: `Cannot coerce ${describeType(input)} to number`,
      expected: "number",
      received: describeType(input),
    });
    failValidation();
  }

  /** Applies further numeric constraints to the coerced value. */
  public pipe(schema: NumberSchema): CoerceNumberSchema {
    return new CoerceNumberSchema(schema);
  }

  /** Minimum value (inclusive). */
  public min(min: number): CoerceNumberSchema {
    return new CoerceNumberSchema(this._constraints.min(min));
  }

  /** Maximum value (inclusive). */
  public max(max: number): CoerceNumberSchema {
    return new CoerceNumberSchema(this._constraints.max(max));
  }

  /** Must be an integer. */
  public int(): CoerceNumberSchema {
    return new CoerceNumberSchema(this._constraints.int());
  }

  /** Must be positive (> 0). */
  public positive(): CoerceNumberSchema {
    return new CoerceNumberSchema(this._constraints.positive());
  }
}

/**
 * Coerces input to a boolean before validating.
 *
 * Truthy: `"true"`, `"1"`, `"yes"`, `"on"`, `1`, `true`
 * Falsy: `"false"`, `"0"`, `"no"`, `"off"`, `""`, `0`, `false`
 *
 * String comparisons are case-insensitive and ignore surrounding whitespace.
 */
export class CoerceBooleanSchema extends ModifiableSchema<boolean> {
  public readonly _type = "coerce.boolean";

  private static readonly TRUE = new Set(["true", "1", "yes", "on"]);
  private static readonly FALSE = new Set(["false", "0", "no", "off", ""]);

  public _parse(ctx: SchemaParseContext, input: unknown): boolean {
    if (typeof input === "boolean") return input;

    if (input === 1) return true;
    if (input === 0) return false;

    if (typeof input === "string") {
      const normalized = input.trim().toLowerCase();
      // The documented "1" and "0" string forms were never implemented: the
      // old check compared against the *numbers* 1 and 0 only.
      if (CoerceBooleanSchema.TRUE.has(normalized)) return true;
      if (CoerceBooleanSchema.FALSE.has(normalized)) return false;
    }

    addIssue(ctx, {
      code: SchemaIssueCode.COERCION_FAILED,
      path: [...ctx.path],
      message: `Cannot coerce ${describeType(input)} to boolean`,
      expected: "boolean",
      received: describeType(input),
    });
    failValidation();
  }
}

/**
 * Coerces input to a string before validating.
 *
 * Only values with an unambiguous textual form are accepted. An object would
 * stringify to `"[object Object]"` and a symbol throws outright, so both are
 * rejected rather than silently producing nonsense.
 */
export class CoerceStringSchema extends ModifiableSchema<string> {
  public readonly _type = "coerce.string";

  constructor(
    private readonly _constraints: StringSchema = new StringSchema(),
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): string {
    return this._constraints._parse(ctx, this._coerce(ctx, input));
  }

  private _coerce(ctx: SchemaParseContext, input: unknown): string {
    if (typeof input === "string") return input;

    if (
      typeof input === "number" ||
      typeof input === "boolean" ||
      typeof input === "bigint"
    ) {
      if (typeof input === "number" && !Number.isFinite(input)) {
        // "NaN" and "Infinity" are not useful string values.
        addIssue(ctx, {
          code: SchemaIssueCode.COERCION_FAILED,
          path: [...ctx.path],
          message: `Cannot coerce ${String(input)} to string`,
          expected: "string",
          received: "number",
        });
        failValidation();
      }
      return String(input);
    }

    if (input instanceof Date) {
      if (Number.isNaN(input.getTime())) {
        addIssue(ctx, {
          code: SchemaIssueCode.COERCION_FAILED,
          path: [...ctx.path],
          message: "Cannot coerce an invalid Date to string",
          expected: "string",
          received: "object",
        });
        failValidation();
      }
      return input.toISOString();
    }

    addIssue(ctx, {
      code: SchemaIssueCode.COERCION_FAILED,
      path: [...ctx.path],
      message: `Cannot coerce ${describeType(input)} to string`,
      expected: "string",
      received: describeType(input),
    });
    failValidation();
  }

  /** Applies further string constraints to the coerced value. */
  public pipe(schema: StringSchema): CoerceStringSchema {
    return new CoerceStringSchema(schema);
  }

  /** Minimum character length. */
  public min(min: number): CoerceStringSchema {
    return new CoerceStringSchema(this._constraints.min(min));
  }

  /** Maximum character length. */
  public max(max: number): CoerceStringSchema {
    return new CoerceStringSchema(this._constraints.max(max));
  }

  /** Matches a regex pattern. */
  public regex(pattern: RegExp): CoerceStringSchema {
    return new CoerceStringSchema(this._constraints.regex(pattern));
  }
}

/**
 * Coerces input to a BigInt before validating.
 */
export class CoerceBigIntSchema extends ModifiableSchema<bigint> {
  public readonly _type = "coerce.bigint";

  public _parse(ctx: SchemaParseContext, input: unknown): bigint {
    if (typeof input === "bigint") return input;

    if (typeof input === "number" && Number.isSafeInteger(input)) {
      return BigInt(input);
    }

    if (typeof input === "string") {
      const trimmed = input.trim();
      // Bound the digit count: BigInt parsing is superlinear, so an
      // attacker-supplied million-digit string is a CPU denial of service.
      if (BIGINT_TEXT_PATTERN.test(trimmed)) {
        try {
          return BigInt(trimmed);
        } catch {
          // Fall through
        }
      }
    }

    addIssue(ctx, {
      code: SchemaIssueCode.COERCION_FAILED,
      path: [...ctx.path],
      message: `Cannot coerce ${describeType(input)} to bigint`,
      expected: "bigint",
      received: describeType(input),
    });
    failValidation();
  }
}

/** Creates a coercion number schema. */
export function coerceNumberSchema(): CoerceNumberSchema {
  return new CoerceNumberSchema();
}

/** Creates a coercion boolean schema. */
export function coerceBooleanSchema(): CoerceBooleanSchema {
  return new CoerceBooleanSchema();
}

/** Creates a coercion string schema. */
export function coerceStringSchema(): CoerceStringSchema {
  return new CoerceStringSchema();
}

/** Creates a coercion bigint schema. */
export function coerceBigIntSchema(): CoerceBigIntSchema {
  return new CoerceBigIntSchema();
}

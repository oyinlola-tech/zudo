/**
 * @zudojs/schema/primitives/string
 *
 * String schema with constraints, format validation, and transformations.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { describeType } from "../schemaBase/schemaBase.describe.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import {
  SchemaIssueCode,
  SCHEMA_STRING_FORMATS,
  SCHEMA_DEFAULT_MAX_STRING_LENGTH,
} from "@zudojs/constants";
import { formatCount } from "@zudojs/types";

import { OptionalModifierSchema } from "../schemaModifiers/schemaOptionalNullable.core.js";
import { NullableModifierSchema } from "../schemaModifiers/schemaOptionalNullable.core.js";
import { DefaultSchema } from "../schemaModifiers/schemaDefault.core.js";
import { RefineSchema } from "../schemaModifiers/schemaRefine.core.js";
import { TransformSchema } from "./schemaTransform.core.js";
import {
  isCalendarDate,
  isCalendarDateTime,
  isClockTime,
  isUrlWithProtocol,
  normalizeUrlProtocols,
  type StringUrlOptions,
  type UrlProtocolPolicy,
} from "./schemaStringFormat/index.js";

/** Range checks run after a format's pattern matched. */
const FORMAT_RANGE_CHECKS: Readonly<Record<string, (value: string) => boolean>> =
  { date: isCalendarDate, datetime: isCalendarDateTime, time: isClockTime };

/** Messages for a value with the right shape that fails its range check. */
const RANGE_MESSAGES: Readonly<Record<string, string>> = {
  date: "Not a real calendar date",
  datetime: "Not a real date and time",
  time: "Not a real time of day",
};

/** Configuration for string schema constraints. */
interface StringSchemaConfig {
  readonly min?: number;
  readonly max?: number;
  readonly length?: number;
  readonly pattern?: RegExp;
  readonly format?: string;
  /** Scheme policy set by `url({ protocols })`; parsed with WHATWG URL. */
  readonly urlProtocols?: UrlProtocolPolicy;
  readonly trim?: boolean;
  readonly toLowerCase?: boolean;
  readonly toUpperCase?: boolean;
}

/**
 * Schema for string values with optional constraints.
 */
export class StringSchema extends Schema<string> {
  public readonly _type = "string";
  private readonly _config: StringSchemaConfig;

  constructor(config: StringSchemaConfig = {}) {
    super();
    this._config = config;
  }

  public _parse(ctx: SchemaParseContext, input: unknown): string {
    if (typeof input !== "string") {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected string, received ${describeType(input)}`,
        expected: "string",
        received: describeType(input),
      });
      failValidation();
    }

    // Bound the input before any pattern runs against it. Without a ceiling a
    // caller-supplied regex is handed unbounded attacker input, which is how a
    // format check becomes a CPU denial of service.
    const hardMax = this._config.max ?? SCHEMA_DEFAULT_MAX_STRING_LENGTH;
    if (input.length > hardMax) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `String must be at most ${formatCount(hardMax, "character")}`,
        expected: `<= ${hardMax}`,
        received: String(input.length),
      });
      failValidation();
    }

    let value = input;

    if (this._config.trim) {
      value = value.trim();
    }
    if (this._config.toLowerCase) {
      value = value.toLowerCase();
    }
    if (this._config.toUpperCase) {
      value = value.toUpperCase();
    }

    this._validateConstraints(ctx, value);
    return value;
  }

  private _validateConstraints(ctx: SchemaParseContext, value: string): void {
    const c = this._config;
    let failed = false;

    if (c.min !== undefined && value.length < c.min) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_SMALL,
        path: [...ctx.path],
        message: `String must be at least ${formatCount(c.min, "character")}`,
        expected: `>= ${c.min}`,
        received: String(value.length),
      });
      failed = true;
    }
    if (c.max !== undefined && value.length > c.max) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `String must be at most ${formatCount(c.max, "character")}`,
        expected: `<= ${c.max}`,
        received: String(value.length),
      });
      failed = true;
    }
    if (c.length !== undefined && value.length !== c.length) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_LENGTH,
        path: [...ctx.path],
        message: `String must be exactly ${formatCount(c.length, "character")}`,
        expected: String(c.length),
        received: String(value.length),
      });
      failed = true;
    }
    if (c.pattern !== undefined && !c.pattern.test(value)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_FORMAT,
        path: [...ctx.path],
        message: `String does not match pattern`,
        expected: c.pattern.source,
      });
      failed = true;
    }
    if (c.format !== undefined) {
      const fmtFailed = this._validateFormat(ctx, value, c.format);
      if (fmtFailed) failed = true;
    }
    if (failed) {
      failValidation();
    }
  }

  private _validateFormat(
    ctx: SchemaParseContext,
    value: string,
    format: string,
  ): boolean {
    const formats: Record<string, RegExp> = {
      email: SCHEMA_STRING_FORMATS.EMAIL,
      url: SCHEMA_STRING_FORMATS.URL,
      uuid: SCHEMA_STRING_FORMATS.UUID,
      "uuid-v4": SCHEMA_STRING_FORMATS.UUID_V4,
      datetime: SCHEMA_STRING_FORMATS.DATETIME,
      date: SCHEMA_STRING_FORMATS.DATE,
      time: SCHEMA_STRING_FORMATS.TIME,
      ipv4: SCHEMA_STRING_FORMATS.IPV4,
      ipv6: SCHEMA_STRING_FORMATS.IPV6,
      hexColor: SCHEMA_STRING_FORMATS.HEX_COLOR,
      phone: SCHEMA_STRING_FORMATS.PHONE,
    };
    const pattern = formats[format];
    if (!pattern) {
      // An unrecognised format used to mean "no check at all", so a typo
      // silently turned the constraint off.
      throw new Error(
        `Unknown string format "${format}". Known formats: ${Object.keys(formats).sort().join(", ")}`,
      );
    }
    const protocols = format === "url" ? this._config.urlProtocols : undefined;
    const shapeOk = protocols === undefined && pattern.test(value);
    const valid =
      protocols === undefined
        ? shapeOk && (FORMAT_RANGE_CHECKS[format]?.(value) ?? true)
        : isUrlWithProtocol(value, protocols);
    if (!valid) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_FORMAT,
        path: [...ctx.path],
        // "2026-02-30" has the right shape; calling it an invalid format
        // sent people looking for a typo that is not there.
        message:
          shapeOk && RANGE_MESSAGES[format] !== undefined
            ? RANGE_MESSAGES[format]
            : `Invalid ${format} format`,
        expected: format,
      });
      return true;
    }
    return false;
  }

  /** Minimum character length. */
  public min(min: number): StringSchema {
    return new StringSchema({ ...this._config, min });
  }

  /** Maximum character length. */
  public max(max: number): StringSchema {
    return new StringSchema({ ...this._config, max });
  }

  /** Exact character length. */
  public length(length: number): StringSchema {
    return new StringSchema({ ...this._config, length });
  }

  /**
   * Matches a regex pattern.
   *
   * The `g` and `y` flags are stripped: both make `RegExp.test` stateful via
   * `lastIndex`, so a schema built once and reused per request would alternate
   * between accepting and rejecting the same value.
   */
  public regex(pattern: RegExp): StringSchema {
    const flags = pattern.flags.replace(/[gy]/g, "");
    const normalized =
      flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
    return new StringSchema({ ...this._config, pattern: normalized });
  }

  /** Validates email format. */
  public email(): StringSchema {
    return new StringSchema({ ...this._config, format: "email" });
  }

  /**
   * Validates a URL. By default only absolute `http:` and `https:` URLs
   * pass, so `javascript:` and `data:` URLs are refused. Pass `protocols`
   * to accept other schemes (parsed with the WHATWG `URL` parser), e.g.
   * `url({ protocols: ["postgres", "postgresql"] })` for a database URL, or
   * `{ protocols: "any" }` for any scheme.
   */
  public url(options: StringUrlOptions = {}): StringSchema {
    const urlProtocols = normalizeUrlProtocols(options.protocols);
    return new StringSchema({ ...this._config, format: "url", urlProtocols });
  }

  /** Validates UUID format. */
  public uuid(): StringSchema {
    return new StringSchema({ ...this._config, format: "uuid" });
  }

  /** Validates UUID v4 format. */
  public uuidv4(): StringSchema {
    return new StringSchema({ ...this._config, format: "uuid-v4" });
  }

  /**
   * Validates an ISO 8601 date-time (`YYYY-MM-DDTHH:mm:ss[.fff][Z|±hh:mm]`)
   * that names a real instant: calendar date, 00-23 hours, 00-59 minutes and
   * seconds, and a valid offset.
   */
  public datetime(): StringSchema {
    return new StringSchema({ ...this._config, format: "datetime" });
  }

  /** Validates a real `YYYY-MM-DD` calendar date (leap years included). */
  public date(): StringSchema {
    return new StringSchema({ ...this._config, format: "date" });
  }

  /** Validates IPv4 format. */
  public ipv4(): StringSchema {
    return new StringSchema({ ...this._config, format: "ipv4" });
  }

  /** Validates IPv6 format. */
  public ipv6(): StringSchema {
    return new StringSchema({ ...this._config, format: "ipv6" });
  }

  /** Validates a `HH:mm` or `HH:mm:ss` time of day (00-23, 00-59). */
  public time(): StringSchema {
    return new StringSchema({ ...this._config, format: "time" });
  }

  /** Validates phone number format. */
  public phone(): StringSchema {
    return new StringSchema({ ...this._config, format: "phone" });
  }

  /** Validates hex color format. */
  public hexColor(): StringSchema {
    return new StringSchema({ ...this._config, format: "hexColor" });
  }

  /** Trims whitespace. */
  public trim(): StringSchema {
    return new StringSchema({ ...this._config, trim: true });
  }

  /** Converts to lowercase. */
  public toLowerCase(): StringSchema {
    return new StringSchema({ ...this._config, toLowerCase: true });
  }

  /** Converts to uppercase. */
  public toUpperCase(): StringSchema {
    return new StringSchema({ ...this._config, toUpperCase: true });
  }

  /** Makes this schema optional (accepts undefined). */
  public optional(): Schema<string | undefined> {
    return new OptionalModifierSchema(this);
  }

  /** Makes this schema nullable (accepts null). */
  public nullable(): Schema<string | null> {
    return new NullableModifierSchema(this);
  }

  /** Adds a default value when input is undefined. */
  public default(defaultValue: string | (() => string)): Schema<string> {
    return new DefaultSchema(this, defaultValue);
  }

  /** Adds a custom refinement check. */
  public refine(
    check: (value: string) => boolean,
    message: string,
  ): Schema<string> {
    return new RefineSchema(this, check, message);
  }

  /** Transforms the string value. */
  public transform<TOutput>(
    fn: (value: string) => TOutput,
  ): TransformSchema<string, TOutput> {
    return new TransformSchema(this, fn);
  }
}

/** Creates a string schema. */
export function stringSchema(): StringSchema {
  return new StringSchema();
}

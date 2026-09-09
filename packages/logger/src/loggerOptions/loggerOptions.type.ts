import { LoggerLevel } from "../loggerLevel/loggerLevel.type.js";
import type { LoggerContextData } from "../loggerContext/loggerContext.core.js";
import type { LoggerFormatterLike } from "../loggerFormatter/loggerFormatter.type.js";
import type { LoggerTransportLike } from "../loggerTransport/loggerTransport.type.js";
import type { LoggerRedactionOptions } from "../loggerEntry/loggerEntryHelpers/loggerEntryHelpers.sanitize.js";

/** Options used to configure a Zudojs logger. */
export interface LoggerOptions {
  readonly name?: string;
  readonly level?: LoggerLevel;
  readonly environment?: string;
  readonly metadata?: LoggerContextData;
  readonly formatter?: LoggerFormatterLike;
  readonly transports?: readonly LoggerTransportLike[];
  readonly enabled?: boolean;
  readonly throwTransportErrors?: boolean;
  readonly asynchronous?: boolean;
  readonly transportTimeout?: number;
  readonly inheritContext?: boolean;
  readonly mutable?: boolean;

  /**
   * Secret redaction for metadata and context.
   *
   * Redaction is ON by default: fields whose NAME looks like a secret
   * (password, token, api key, credential, authorization, cookie) are
   * replaced with "[REDACTED]" before an entry reaches a formatter.
   * Pass `{ enabled: false }` to opt out.
   */
  readonly redact?: LoggerRedactionOptions;
}

/** Options used when creating a child logger. */
export interface ChildLoggerOptions {
  readonly name?: string;
  readonly metadata?: LoggerContextData;
  readonly level?: LoggerLevel;
}

/** Options for a single log operation. */
export interface LogOptions {
  readonly metadata?: LoggerContextData;
  readonly context?: LoggerContextData;
  readonly error?: Error;
  readonly source?: {
    readonly service?: string;
    readonly component?: string;
    readonly module?: string;
    readonly file?: string;
    readonly function?: string;
    readonly line?: number;
  };
  readonly logger?: string;
  readonly timestamp?: Date;
}

/** Runtime logger configuration. */
export interface LoggerConfiguration {
  readonly name: string;
  readonly level: LoggerLevel;
  readonly environment?: string;
  readonly metadata: LoggerContextData;
  readonly formatter: LoggerFormatterLike;
  readonly transports: readonly LoggerTransportLike[];
  readonly enabled: boolean;
  readonly throwTransportErrors: boolean;
  readonly asynchronous: boolean;
  readonly transportTimeout: number;
  readonly inheritContext: boolean;
  readonly mutable: boolean;
  readonly redact: LoggerRedactionOptions;
}

/** Default logger configuration values. */
export const DEFAULT_LOGGER_OPTIONS: Required<
  Pick<
    LoggerOptions,
    | "enabled"
    | "throwTransportErrors"
    | "asynchronous"
    | "transportTimeout"
    | "inheritContext"
    | "mutable"
  >
> = {
  enabled: true,
  throwTransportErrors: false,
  asynchronous: false,
  transportTimeout: 10_000,
  inheritContext: true,
  mutable: true,
};

/** Validates logger options. */
export function validateLoggerOptions(options: LoggerOptions): void {
  if (
    options.name !== undefined &&
    (typeof options.name !== "string" || options.name.trim().length === 0)
  ) {
    throw new TypeError("Logger name must be a non-empty string.");
  }
  if (
    options.environment !== undefined &&
    (typeof options.environment !== "string" ||
      options.environment.trim().length === 0)
  ) {
    throw new TypeError("Logger environment must be a non-empty string.");
  }
  if (
    options.transportTimeout !== undefined &&
    (!Number.isFinite(options.transportTimeout) || options.transportTimeout < 0)
  ) {
    throw new RangeError(
      "Logger transport timeout must be a non-negative finite number.",
    );
  }
}

/** Resolves partial logger options into a normalized configuration. */
export function resolveLoggerOptions(
  options: LoggerOptions = {},
): LoggerConfiguration {
  validateLoggerOptions(options);

  return Object.freeze({
    name: options.name ?? "zudojs",
    level: options.level ?? LoggerLevel.INFO,
    environment: options.environment,
    metadata: Object.freeze({ ...(options.metadata ?? {}) }),
    formatter: options.formatter ?? "text",
    transports: Object.freeze([...(options.transports ?? [])]),
    enabled: options.enabled ?? DEFAULT_LOGGER_OPTIONS.enabled,
    throwTransportErrors:
      options.throwTransportErrors ??
      DEFAULT_LOGGER_OPTIONS.throwTransportErrors,
    asynchronous: options.asynchronous ?? DEFAULT_LOGGER_OPTIONS.asynchronous,
    transportTimeout:
      options.transportTimeout ?? DEFAULT_LOGGER_OPTIONS.transportTimeout,
    inheritContext:
      options.inheritContext ?? DEFAULT_LOGGER_OPTIONS.inheritContext,
    mutable: options.mutable ?? DEFAULT_LOGGER_OPTIONS.mutable,
    redact: Object.freeze({ ...(options.redact ?? {}) }),
  });
}

/** Merges two logger option objects. Values from `override` take precedence. */
export function mergeLoggerOptions(
  base: LoggerOptions,
  override: LoggerOptions,
): LoggerOptions {
  return {
    ...base,
    ...override,
    metadata: { ...(base.metadata ?? {}), ...(override.metadata ?? {}) },
    transports: override.transports ?? base.transports,
  };
}

/** Creates options for a child logger. */
export function createChildLoggerOptions(
  parent: LoggerConfiguration,
  options: ChildLoggerOptions = {},
): LoggerOptions {
  return {
    name: options.name ?? parent.name,
    level: options.level ?? parent.level,
    environment: parent.environment,
    metadata: { ...parent.metadata, ...(options.metadata ?? {}) },
    formatter: parent.formatter,
    transports: parent.transports,
    enabled: parent.enabled,
    throwTransportErrors: parent.throwTransportErrors,
    asynchronous: parent.asynchronous,
    transportTimeout: parent.transportTimeout,
    inheritContext: parent.inheritContext,
    mutable: parent.mutable,
    redact: parent.redact,
  };
}

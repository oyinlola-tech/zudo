import type { LogRedactionHook } from "./logRedaction.redaction.js";
import type { ContextStorage } from "../../context/provider/contextStorage.storage.js";

/**
 * Configuration options for the Zudojs logging system.
 *
 * These options describe logger behavior without coupling the core
 * to a specific logging implementation.
 */
export interface LoggerOptions {
  /**
   * Minimum severity level that should be emitted.
   *
   * Example:
   *
   * "info" means trace and debug messages are ignored.
   */
  readonly level?: LogLevelOption;

  /**
   * Name of the application or service producing the logs.
   */
  readonly service?: string;

  /**
   * Version of the application or service.
   */
  readonly version?: string;

  /**
   * Runtime environment.
   *
   * Examples:
   *
   * development
   * test
   * staging
   * production
   */
  readonly environment?: string;

  /**
   * Whether timestamps should be included in log entries.
   *
   * Defaults to true.
   */
  readonly timestamps?: boolean;

  /**
   * Whether log output should use structured JSON.
   *
   * Defaults to true.
   */
  readonly structured?: boolean;

  /**
   * Whether stack traces should be included for errors.
   *
   * Defaults to true.
   */
  readonly includeStackTrace?: boolean;

  /**
   * Additional default context attached to every log entry.
   */
  readonly context?: Record<string, unknown>;

  /**
   * Redaction hook applied to structured log data (entry context
   * and error details) before it is written.
   *
   * See createLogRedactor for a key-based implementation.
   */
  readonly redact?: LogRedactionHook;

  /**
   * ContextStorage consulted on every write. When an execution
   * context is active, its `executionId`, `correlationId`,
   * `traceId`, `spanId`, and `metadata.runtimeId` are merged into
   * the entry context beneath the logger's persistent and per-call
   * context (explicit values win). Child loggers inherit it.
   */
  readonly contextStorage?: ContextStorage;
}

/**
 * Logging levels accepted by LoggerOptions.
 *
 * Kept as a string union here so configuration can be loaded
 * directly from environment variables or configuration files.
 */
export type LogLevelOption =
  "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Default logging configuration.
 */
export const DEFAULT_LOGGER_OPTIONS: Required<
  Pick<
    LoggerOptions,
    "level" | "timestamps" | "structured" | "includeStackTrace"
  >
> = {
  level: "info",
  timestamps: true,
  structured: true,
  includeStackTrace: true,
};

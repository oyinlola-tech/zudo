/**
 * Logger entry interfaces.
 */

import type {
  LoggerLevel,
  LoggerLevelName,
} from "../../loggerLevel/loggerLevel.type.js";

import type {
  LogMetadata,
  LoggerEntryContext,
  LoggerSource,
} from "./loggerEntryHelpers.types.js";

/**
 * Complete structured log entry.
 */
export interface LoggerEntry {
  /**
   * Unique identifier for this log entry.
   */
  readonly id: string;

  /**
   * Numeric severity.
   */
  readonly level: LoggerLevel;

  /**
   * Canonical severity name.
   */
  readonly levelName: LoggerLevelName;

  /**
   * The message as the caller logged it. A transport receives it unchanged;
   * the formatter's rendering of the whole record is in `formatted`.
   */
  readonly message: string;

  /**
   * The record rendered as one line by the logger's formatter: the string a
   * text or JSON formatter returned, or the JSON line of the record an
   * object formatter (`createStructuredLoggerFormatter`) returned. Set on
   * entries a logger hands to its transports. Line-oriented transports
   * print `entry.formatted ?? entry.message`; `message` is always the raw
   * message the caller logged.
   */
  readonly formatted?: string;

  /**
   * Structured metadata.
   */
  readonly metadata: LogMetadata;

  /**
   * Execution context.
   */
  readonly context?: LoggerEntryContext;

  /**
   * Source information.
   */
  readonly source?: LoggerSource;

  /**
   * Error associated with the entry.
   */
  readonly error?: Error;

  /**
   * Logger name.
   */
  readonly logger?: string;

  /**
   * Timestamp of the log event.
   */
  readonly timestamp: Date;

  /**
   * Unix timestamp in milliseconds.
   */
  readonly timestampMs: number;

  /**
   * Process identifier where available.
   */
  readonly pid?: number;

  /**
   * Hostname where available.
   */
  readonly hostname?: string;

  /**
   * Environment name.
   */
  readonly environment?: string;
}

/**
 * Input used to create a log entry.
 */
export interface LoggerEntryInput {
  readonly id?: string;

  readonly level: LoggerLevel;

  readonly levelName?: LoggerLevelName;

  readonly message: string;

  readonly metadata?: LogMetadata;

  readonly context?: LoggerEntryContext;

  readonly source?: LoggerSource;

  readonly error?: Error;

  readonly logger?: string;

  readonly timestamp?: Date;

  readonly pid?: number;

  readonly hostname?: string;

  readonly environment?: string;
}

/**
 * Logger entry value and metadata types.
 */

/**
 * Values that can safely be attached to a log entry.
 */
export type LogValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Date
  | Error
  | readonly unknown[]
  | {
      readonly [key: string]: unknown;
    };

/**
 * Structured logging metadata.
 */
export type LogMetadata = Readonly<Record<string, LogValue>>;

/**
 * Information about the source of a log entry.
 */
export interface LoggerSource {
  /**
   * Application or service name.
   */
  readonly service?: string;

  /**
   * Application component.
   */
  readonly component?: string;

  /**
   * Module that produced the log.
   */
  readonly module?: string;

  /**
   * Source file.
   */
  readonly file?: string;

  /**
   * Source function.
   */
  readonly function?: string;

  /**
   * Source line.
   */
  readonly line?: number;
}

/**
 * Context information associated with a log entry.
 */
export interface LoggerEntryContext {
  /**
   * Correlation identifier.
   */
  readonly correlationId?: string;

  /**
   * Request identifier.
   */
  readonly requestId?: string;

  /**
   * Trace identifier.
   */
  readonly traceId?: string;

  /**
   * Span identifier.
   */
  readonly spanId?: string;

  /**
   * User identifier.
   */
  readonly userId?: string;

  /**
   * Tenant identifier.
   */
  readonly tenantId?: string;

  /**
   * Additional context.
   */
  readonly metadata?: LogMetadata;
}

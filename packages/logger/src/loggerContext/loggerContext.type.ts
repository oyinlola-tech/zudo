/**
 * Logger context types.
 */

/**
 * Logger context.
 */
export interface LoggerContext {
  readonly identifiers: LoggerContextIdentifiers;
  readonly metadata: LoggerContextData;
}

/**
 * Logger context identifiers.
 */
export interface LoggerContextIdentifiers {
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly jobId?: string;
  readonly moduleId?: string;
  readonly operationId?: string;
}

/**
 * Logger context data.
 */
export interface LoggerContextData {
  readonly custom?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Logger context options.
 */
export interface LoggerContextOptions {
  readonly parent?: LoggerContext;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly jobId?: string;
  readonly moduleId?: string;
  readonly operationId?: string;
  readonly metadata?: LoggerContextData;
}

/**
 * Logger context value.
 */
export type LoggerContextValue = string | number | boolean | null | undefined;

/**
 * Logger context storage.
 */
export interface LoggerContextStorage {
  get(): LoggerContext | undefined;
  set(context: LoggerContext): void;
  run<T>(context: LoggerContext, callback: () => T): T;
  with<T>(context: LoggerContext, callback: () => T): T;
  clear(): void;
}

/**
 * Logger error context.
 */
export interface LoggerErrorContext {
  readonly error: Error;
  readonly logger?: string;
  readonly operation?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly requestId?: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: Date;
}

/**
 * Logger source information.
 */
export interface LoggerSource {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly function?: string;
}

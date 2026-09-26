import type { ErrorCategory } from "./errorCategory.type.js";
import type { ErrorCode } from "./errorCode.type.js";
import type { ErrorSeverity } from "./errorSeverity.type.js";
import type { ErrorMetadata } from "../core/errorMetadata.type.js";

/**
 * Options used to construct a Zudojs application error.
 */
export interface BaseErrorOptions {
  /**
   * Machine-readable code. `ErrorCode` lists the codes this package knows,
   * but the set is deliberately open so applications can mint their own
   * (`"PAYMENT_CARD_DECLINED"`); use `isErrorCode()` to narrow a value back
   * to the enum before an exhaustive `switch`.
   */
  readonly code?: ErrorCode | string;
  readonly category?: ErrorCategory;
  readonly severity?: ErrorSeverity;
  readonly message?: string;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
  readonly statusCode?: number;
  readonly expose?: boolean;
  readonly isOperational?: boolean;
}

/**
 * Serializable representation of a BaseError.
 */
export interface SerializedBaseError {
  readonly name: string;
  readonly message: string;
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly isOperational: boolean;
  readonly metadata: Readonly<ErrorMetadata>;
  readonly stack?: string;
  readonly cause?: SerializedBaseError | unknown;
}

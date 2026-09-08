import { ErrorCode } from "../../errors/errorCode.code.js";
import type { SerializedBaseError } from "@zudojs/errors";

/**
 * Runtime lifecycle operations.
 */
export type RuntimeOperation =
  | "create"
  | "start"
  | "bootstrap"
  | "load"
  | "initialize"
  | "run"
  | "stop"
  | "shutdown"
  | "destroy"
  | "restart"
  | "dispose";

/**
 * Runtime lifecycle phases.
 */
export type RuntimeErrorPhase =
  | "created"
  | "bootstrapping"
  | "loading"
  | "loaded"
  | "initializing"
  | "initialized"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "destroying"
  | "destroyed"
  | "failed";

/**
 * Stable runtime error codes.
 */
export const RuntimeErrorCode = {
  RUNTIME_FAILURE: ErrorCode.RUNTIME_FAILURE,
  RUNTIME_ALREADY_STARTED: ErrorCode.RUNTIME_ALREADY_STARTED,
  RUNTIME_ALREADY_STOPPED: ErrorCode.RUNTIME_ALREADY_STOPPED,
  RUNTIME_FAILED: ErrorCode.RUNTIME_FAILED,
  INVALID_STATE_TRANSITION: ErrorCode.RUNTIME_INVALID_TRANSITION,
  BOOTSTRAP_FAILED: ErrorCode.RUNTIME_BOOTSTRAP_FAILED,
  BOOTSTRAP_TIMEOUT: ErrorCode.RUNTIME_BOOTSTRAP_TIMEOUT,
  MODULE_LOAD_FAILED: ErrorCode.MODULE_LOAD_FAILED,
  MODULE_INITIALIZATION_FAILED: ErrorCode.MODULE_INITIALIZATION_FAILED,
  MODULE_START_FAILED: ErrorCode.MODULE_START_FAILED,
  SHUTDOWN_FAILED: ErrorCode.RUNTIME_SHUTDOWN_FAILED,
  SHUTDOWN_TIMEOUT: ErrorCode.RUNTIME_SHUTDOWN_TIMEOUT,
  MODULE_STOP_FAILED: ErrorCode.MODULE_STOP_FAILED,
  MODULE_DESTROY_FAILED: ErrorCode.MODULE_DESTROY_FAILED,
  OPERATION_TIMEOUT: ErrorCode.RUNTIME_OPERATION_TIMEOUT,
  INVALID_CONFIGURATION: ErrorCode.RUNTIME_INVALID_CONFIGURATION,
  MISSING_DEPENDENCY: ErrorCode.RUNTIME_MISSING_DEPENDENCY,
  INVALID_ENVIRONMENT: ErrorCode.RUNTIME_INVALID_ENVIRONMENT,
  RUNTIME_NOT_READY: ErrorCode.RUNTIME_NOT_READY,
  UNSUPPORTED_OPERATION: ErrorCode.RUNTIME_UNSUPPORTED_OPERATION,
  OPERATION_CANCELLED: ErrorCode.RUNTIME_OPERATION_CANCELLED,
} as const;

/**
 * Union type of all runtime error code values.
 */
export type RuntimeErrorCode =
  (typeof RuntimeErrorCode)[keyof typeof RuntimeErrorCode];

/**
 * Metadata attached to a runtime error.
 */
export type RuntimeErrorMetadata = Readonly<Record<string, unknown>>;

/**
 * Options for constructing a RuntimeError.
 */
export interface RuntimeErrorOptions {
  readonly code?: RuntimeErrorCode;
  readonly operation?: RuntimeOperation;
  readonly phase?: RuntimeErrorPhase;
  readonly runtimeId?: string;
  readonly runtimeName?: string;
  readonly moduleName?: string;
  readonly metadata?: RuntimeErrorMetadata;
  readonly cause?: unknown;
  readonly recoverable?: boolean;
}

/**
 * Serializable representation of RuntimeError.
 */
export type RuntimeErrorJSON = SerializedBaseError & {
  readonly operation?: string;
  readonly phase?: string;
  readonly runtimeId?: string;
  readonly runtimeName?: string;
  readonly moduleName?: string;
  readonly errorMetadata: RuntimeErrorMetadata;
  readonly recoverable: boolean;
};

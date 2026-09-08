import { RuntimeError as BaseRuntimeError } from "@zudojs/errors";

import type {
  RuntimeErrorOptions,
  RuntimeErrorJSON,
  RuntimeErrorMetadata,
  RuntimeOperation,
  RuntimeErrorPhase,
} from "./runtimeError.type.js";

import { RuntimeErrorCode } from "./runtimeError.type.js";

/**
 * Base error for all runtime failures raised by @zudojs/core.
 *
 * Extends RuntimeError from @zudojs/errors so runtime failures are
 * recognised across packages (`instanceof RuntimeError` and
 * `isRuntimeError()` from either package agree), while carrying the
 * core-specific runtime context (operation, phase, identity, module).
 */
export class RuntimeError extends BaseRuntimeError {
  /**
   * The runtime lifecycle phase during which the error occurred.
   * Narrows the base `phase: string` to the known runtime phases.
   */
  declare public readonly phase?: RuntimeErrorPhase;
  public readonly operation?: RuntimeOperation;
  public readonly runtimeId?: string;
  public readonly runtimeName?: string;
  public readonly moduleName?: string;
  public readonly errorMetadata: RuntimeErrorMetadata;
  public readonly recoverable: boolean;

  public constructor(message: string, options: RuntimeErrorOptions = {}) {
    super(message, {
      code: options.code ?? RuntimeErrorCode.RUNTIME_FAILURE,
      phase: options.phase,
      component: options.moduleName,
      cause: options.cause,
      isOperational: false,
      metadata: serializableMetadata({
        ...(options.operation !== undefined && {
          operation: options.operation,
        }),
        ...(options.runtimeId !== undefined && {
          runtimeId: options.runtimeId,
        }),
        ...(options.runtimeName !== undefined && {
          runtimeName: options.runtimeName,
        }),
        ...(options.moduleName !== undefined && {
          moduleName: options.moduleName,
        }),
        ...(options.metadata ?? {}),
      }),
    });

    this.name = "RuntimeError";
    this.operation = options.operation;
    this.runtimeId = options.runtimeId;
    this.runtimeName = options.runtimeName;
    this.moduleName = options.moduleName;
    this.errorMetadata = Object.freeze({
      ...(options.metadata ?? {}),
    });
    this.recoverable = options.recoverable ?? false;
  }

  public getCause(): Error | undefined {
    return this.cause instanceof Error ? this.cause : undefined;
  }

  public override toJSON(): RuntimeErrorJSON {
    return {
      ...super.toJSON(),
      operation: this.operation,
      phase: this.phase,
      runtimeId: this.runtimeId,
      runtimeName: this.runtimeName,
      moduleName: this.moduleName,
      errorMetadata: this.errorMetadata,
      recoverable: this.recoverable,
    };
  }
}

/**
 * Keeps only JSON-safe metadata values so BaseError metadata stays
 * transportable; richer values remain on `errorMetadata`.
 */
function serializableMetadata(
  metadata: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Error raised when a bounded object-graph traversal stops early.
 */

import { BaseError } from "../../base/core/baseError.core.js";
import { ErrorCategory } from "../../base/types/errorCategory.type.js";
import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ErrorSeverity } from "../../base/types/errorSeverity.type.js";
import type { ErrorMetadata } from "../../base/core/errorMetadata.type.js";

/** Why a traversal stopped early. */
export type TraversalHalt = "depth" | "budget" | "cycle";

/**
 * Signals that a traversal hit one of its bounds (depth, cost budget or a
 * cycle). Constructor matches the class `@zudojs/validation` defined
 * locally; not exposed, because `path` can contain submitted keys.
 */
export class TraversalLimitError extends BaseError {
  public readonly halt: TraversalHalt;
  public readonly path: string;
  public readonly observed: number;

  constructor(halt: TraversalHalt, path: string, observed: number) {
    super(`Traversal halted (${halt}) at ${path}`, {
      code: ErrorCode.VALIDATION_FAILED,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.WARNING,
      statusCode: 400,
      expose: false,
      metadata: { halt, observed } satisfies ErrorMetadata,
    });
    this.halt = halt;
    this.path = path;
    this.observed = observed;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      halt: this.halt,
      path: this.path,
      observed: this.observed,
    };
  }
}

import { FrameworkError } from "./frameworkError.error.js";
import { ErrorCode } from "./errorCode.code.js";

/**
 * Thrown by `ContextValues.require()` when no value is stored under
 * the requested context key.
 *
 * A plain `Error` used to be thrown here, so callers could neither
 * catch it by type nor read a code from it.
 */
export class ContextValueNotFoundError extends FrameworkError {
  /**
   * Human-readable name of the missing key.
   */
  public readonly key: string;

  public constructor(keyName: string) {
    super(`Required context value "${keyName}" is not available.`, {
      code: ErrorCode.CONTEXT_VALUE_NOT_FOUND,
      details: { key: keyName },
    });

    this.name = "ContextValueNotFoundError";
    this.key = keyName;
  }
}

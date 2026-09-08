import { FrameworkError } from "./frameworkError.error.js";
import { ErrorCode } from "./errorCode.code.js";

/**
 * Thrown when an invalid argument is supplied to a framework operation.
 */
export class InvalidArgumentError extends FrameworkError {
  public constructor(message: string, details?: unknown) {
    super(message, {
      code: ErrorCode.INVALID_ARGUMENT,
      details,
    });

    this.name = "InvalidArgumentError";
  }
}

/**
 * Thrown when an operation is attempted while the application
 * is in an incompatible lifecycle state.
 */
export class InvalidStateError extends FrameworkError {
  public constructor(message: string, details?: unknown) {
    super(message, {
      code: ErrorCode.INVALID_STATE,
      details,
    });

    this.name = "InvalidStateError";
  }
}

/**
 * Thrown when a requested dependency provider cannot be found.
 */
export class ProviderNotFoundError extends FrameworkError {
  public constructor(token: unknown) {
    super(`No provider registered for token "${describeToken(token)}".`, {
      code: ErrorCode.PROVIDER_NOT_FOUND,
      details: {
        token: describeToken(token),
      },
    });

    this.name = "ProviderNotFoundError";
  }
}

/**
 * Thrown when attempting to register a provider for an already
 * registered token.
 */
export class ProviderAlreadyRegisteredError extends FrameworkError {
  public constructor(token: unknown) {
    super(
      `A provider is already registered for token "${describeToken(token)}".`,
      {
        code: ErrorCode.PROVIDER_ALREADY_REGISTERED,
        details: {
          token: describeToken(token),
        },
      },
    );

    this.name = "ProviderAlreadyRegisteredError";
  }
}

/**
 * Thrown when a provider definition is not one of the supported
 * shapes (useValue, useFactory, useClass).
 */
export class InvalidProviderError extends FrameworkError {
  public constructor(token: unknown) {
    super(`Invalid provider definition for token "${describeToken(token)}".`, {
      code: ErrorCode.INVALID_PROVIDER,
      details: {
        token: describeToken(token),
      },
    });

    this.name = "InvalidProviderError";
  }
}

/**
 * Thrown when a dependency cannot be resolved, for example because
 * the resolution chain contains a cycle or a factory failed.
 */
export class DependencyResolutionError extends FrameworkError {
  /**
   * Tokens in resolution order, ending with the token that failed.
   */
  public readonly chain: readonly string[];

  public constructor(
    message: string,
    chain: readonly unknown[],
    cause?: unknown,
  ) {
    const describedChain = chain.map(describeToken);

    super(message, {
      code: ErrorCode.DEPENDENCY_RESOLUTION_FAILED,
      details: {
        chain: describedChain,
      },
      cause,
    });

    this.name = "DependencyResolutionError";
    this.chain = Object.freeze(describedChain);
  }
}

/**
 * Thrown when configuration is required but cannot be found.
 */
export class ConfigurationNotFoundError extends FrameworkError {
  public constructor(path: string) {
    super(`Required configuration "${path}" was not found.`, {
      code: ErrorCode.CONFIGURATION_NOT_FOUND,
      details: {
        path,
      },
    });

    this.name = "ConfigurationNotFoundError";
  }
}

/**
 * Thrown when no execution context is available.
 */
export class ExecutionContextNotFoundError extends FrameworkError {
  public constructor() {
    super("No active execution context is available.", {
      code: ErrorCode.EXECUTION_CONTEXT_NOT_FOUND,
    });

    this.name = "ExecutionContextNotFoundError";
  }
}

/**
 * Thrown when a requested module cannot be found.
 */
export class ModuleNotFoundError extends FrameworkError {
  public constructor(moduleName: string) {
    super(`Module "${moduleName}" is not registered.`, {
      code: ErrorCode.MODULE_NOT_FOUND,
      details: {
        module: moduleName,
      },
    });

    this.name = "ModuleNotFoundError";
  }
}

/**
 * Thrown when an adapter cannot be found.
 */
export class AdapterNotFoundError extends FrameworkError {
  public constructor(adapterName: string) {
    super(`Adapter "${adapterName}" is not registered.`, {
      code: ErrorCode.ADAPTER_NOT_FOUND,
      details: {
        adapter: adapterName,
      },
    });

    this.name = "AdapterNotFoundError";
  }
}

/**
 * Creates a readable representation of a dependency token.
 */
export function describeToken(token: unknown): string {
  if (typeof token === "string") {
    return token;
  }

  if (typeof token === "symbol") {
    return token.description ?? token.toString();
  }

  if (typeof token === "function") {
    return token.name || "anonymous class";
  }

  return String(token);
}
